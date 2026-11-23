/**
 * Validates the marketplace manifest, each local plugin manifest it lists,
 * each skill and output style in those plugins, and the Skills table in
 * README.md. Changes no files. Prints every problem it finds and exits 1 if
 * there are any.
 *
 *     bun run validate
 *
 * What it checks:
 *
 * - `.claude-plugin/marketplace.json` and each local plugin's
 *   `.claude-plugin/plugin.json` are valid JSON with required fields.
 * - Each `skills/<name>/SKILL.md` stays under 500 lines and has YAML
 *   frontmatter matching `SkillFrontmatter`.
 * - Each skill's optional `agents/openai.yaml` is valid YAML matching
 *   `OpenAiSkillMetadata`, and manual-only skills disable automatic
 *   invocation in both `SKILL.md` and `agents/openai.yaml`.
 * - Each `.md` file in `output-styles/` has YAML frontmatter matching
 *   `OutputStyleFrontmatter`.
 * - The Skills table in `README.md` links every `SKILL.md` and nothing else.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { toString } from 'mdast-util-to-string'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { parseDocument } from 'yaml'
import { z } from 'zod'

const ROOT = resolve(import.meta.dirname, '..')
const README = join(ROOT, 'README.md')
const MARKETPLACE_JSON = join(ROOT, '.claude-plugin', 'marketplace.json')

const markdown = unified().use(remarkParse).use(remarkFrontmatter).use(remarkGfm)

const Marketplace = z.looseObject({
  name: z.string().min(1),
  plugins: z.array(
    z.looseObject({
      name: z.string().min(1),
      source: z.union([z.string(), z.looseObject({})]),
    }),
  ),
})

const PluginManifest = z.looseObject({
  name: z.string().min(1),
  description: z.string().min(1),
})

// Accepts YAML 1.1 boolean spellings alongside true and false.
const Bool = z.preprocess(
  (value) => String(value).toLowerCase(),
  z.enum(['true', 'false', 'yes', 'no', 'on', 'off', '1', '0']),
)
const TRUTHY_BOOLS = new Set(['true', 'yes', 'on', '1'])
const StringOrList = z.union([z.string(), z.array(z.string())])

function isTruthyBool(value: z.output<typeof Bool> | undefined): boolean {
  return value !== undefined && TRUTHY_BOOLS.has(value)
}

// Enforces the Agent Skills naming rules: https://agentskills.io/specification.
const SkillName = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'use lowercase letters and digits in hyphen-separated groups, such as "code-comments"')

const SkillFrontmatter = z.strictObject({
  name: SkillName,
  description: z.string().min(1).max(1024),
  when_to_use: z.string().optional(),
  'argument-hint': z.string().optional(),
  arguments: StringOrList.optional(),
  'disable-model-invocation': Bool.optional(),
  'user-invocable': Bool.optional(),
  'allowed-tools': StringOrList.optional(),
  'disallowed-tools': StringOrList.optional(),
  model: z.string().optional(),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  context: z.literal('fork').optional(),
  agent: z.string().optional(),
  background: Bool.optional(),
  hooks: z.record(z.string(), z.unknown()).optional(),
  paths: StringOrList.optional(),
  shell: z.enum(['bash', 'powershell']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  license: z.string().optional(),
  compatibility: z.string().max(500).optional(),
})

// Codex parses agents/openai.yaml with serde_yaml, which only accepts true and false for booleans.
const OpenAiSkillMetadata = z.strictObject({
  interface: z
    .strictObject({
      display_name: z.string().min(1).optional(),
      short_description: z.string().min(1).optional(),
      icon_small: z.string().min(1).optional(),
      icon_large: z.string().min(1).optional(),
      brand_color: z.string().min(1).optional(),
      default_prompt: z.string().min(1).optional(),
    })
    .optional(),
  policy: z
    .strictObject({
      allow_implicit_invocation: z.boolean().optional(),
      products: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  dependencies: z
    .strictObject({
      tools: z
        .array(
          z.looseObject({
            type: z.string().min(1),
            value: z.string().min(1),
          }),
        )
        .optional(),
    })
    .optional(),
})

const OutputStyleFrontmatter = z.strictObject({
  name: z.string().min(1),
  description: z.string().min(1),
  'keep-coding-instructions': Bool.optional(),
  // This field applies the style to everyone who enables the plugin and
  // overrides their own `outputStyle` setting. People enable this plugin for
  // its skills, so it must not choose their style for them.
  'force-for-plugin': z
    .never({ error: 'remove it: it overrides the outputStyle setting of everyone who enables the plugin' })
    .optional(),
})

function skillFile(folder: string) {
  return z.object({
    frontmatter: SkillFrontmatter.extend({
      name: SkillName.refine((name) => name === folder, `must match the folder name "${folder}"`),
    }),
    lines: z.number().lt(500, { error: (issue) => `${issue.input} is too many. Keep SKILL.md under 500 and move detail into separate files` }),
  })
}

const problems: string[] = []

function report(file: string, message: string): void {
  problems.push(`${relative(ROOT, file) || '.'}: ${message}`)
}

function reportIssues(file: string, error: z.ZodError): void {
  for (const issue of error.issues) {
    const path = issue.path.join('.')
    report(file, path ? `${path}: ${issue.message}` : issue.message)
  }
}

function check<T extends z.ZodType>(file: string, schema: T, value: unknown): z.output<T> | undefined {
  const result = schema.safeParse(value)
  if (!result.success) reportIssues(file, result.error)
  return result.data
}

function checkJsonFile<T extends z.ZodType>(file: string, schema: T): z.output<T> | undefined {
  if (!existsSync(file)) {
    report(file, 'file not found')
    return undefined
  }
  let json: unknown
  try {
    json = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    report(file, (error as Error).message)
    return undefined
  }
  return check(file, schema, json)
}

function parseStrictYaml(file: string, source: string, prefix = ''): { value: unknown } | undefined {
  // Uses yaml with uniqueKeys because Bun.YAML.parse silently overwrites duplicate keys.
  const doc = parseDocument(source, { strict: true, uniqueKeys: true })
  if (doc.errors.length > 0) {
    for (const error of doc.errors) {
      report(file, `${prefix}${error.message.split('\n')[0]}`)
    }
    return undefined
  }
  return { value: doc.toJS() }
}

function checkYamlFile<T extends z.ZodType>(file: string, schema: T): z.output<T> | undefined {
  const parsed = parseStrictYaml(file, readFileSync(file, 'utf8'))
  if (!parsed) return undefined
  return check(file, schema, parsed.value)
}

/** Returns the file's text and parsed frontmatter, or reports a problem and returns undefined. */
function readFrontmatter(file: string): { text: string; frontmatter: unknown } | undefined {
  const text = readFileSync(file, 'utf8')
  const [first] = markdown.parse(text).children
  if (first?.type !== 'yaml') {
    report(file, 'needs a frontmatter block that opens with --- on line 1 and closes with ---')
    return undefined
  }
  const parsed = parseStrictYaml(file, first.value, 'frontmatter: ')
  if (!parsed) return undefined
  return { text, frontmatter: parsed.value }
}

function validateSkill(skillDir: string): void {
  const skillMd = join(skillDir, 'SKILL.md')
  const openaiYaml = join(skillDir, 'agents', 'openai.yaml')
  const hasOpenaiYaml = existsSync(openaiYaml)
  const openaiMetadata = hasOpenaiYaml ? checkYamlFile(openaiYaml, OpenAiSkillMetadata) : undefined

  if (!existsSync(skillMd)) {
    report(skillDir, 'missing SKILL.md')
    return
  }
  const parsed = readFrontmatter(skillMd)
  if (!parsed) return
  const { text, frontmatter } = parsed
  const validSkill = check(skillMd, skillFile(basename(skillDir)), {
    frontmatter,
    lines: text.trimEnd().split('\n').length,
  })
  if (!validSkill) return

  const modelInvocationDisabled = isTruthyBool(validSkill.frontmatter['disable-model-invocation'])
  const implicitInvocationDisabled = openaiMetadata?.policy?.allow_implicit_invocation === false

  if (modelInvocationDisabled && !hasOpenaiYaml) {
    report(skillMd, 'sets disable-model-invocation, so add agents/openai.yaml with policy.allow_implicit_invocation: false for Codex')
  } else if (modelInvocationDisabled && openaiMetadata && !implicitInvocationDisabled) {
    report(openaiYaml, 'policy.allow_implicit_invocation must be false to match disable-model-invocation in SKILL.md')
  } else if (!modelInvocationDisabled && implicitInvocationDisabled) {
    report(openaiYaml, 'policy.allow_implicit_invocation is false, but SKILL.md does not set disable-model-invocation: true')
  }
}

function validateOutputStyle(file: string): void {
  const parsed = readFrontmatter(file)
  if (parsed) check(file, OutputStyleFrontmatter, parsed.frontmatter)
}

/** Returns each path linked from the first cell of a row in the table under the README heading `section`, relative to the repo root. */
function readmeTableLinks(section: string): Set<string> {
  const links = new Set<string>()
  let inSection = false
  for (const node of markdown.parse(readFileSync(README, 'utf8')).children) {
    if (node.type === 'heading' && node.depth <= 2) {
      inSection = toString(node) === section
    } else if (inSection && node.type === 'table') {
      const [_header, ...rows] = node.children
      for (const row of rows) {
        const link = row.children[0]?.children.find((child) => child.type === 'link')
        if (link) links.add(relative(ROOT, resolve(ROOT, link.url)))
      }
    }
  }
  return links
}

function checkReadmeTable(section: string, files: Set<string>, kind: string): void {
  const linked = readmeTableLinks(section)
  for (const path of files.difference(linked)) report(README, `${section} table has no row linking ${path}`)
  for (const path of linked.difference(files)) report(README, `${section} table links ${path}, which is not ${kind}`)
}

function validateRepo(): void {
  const marketplace = checkJsonFile(MARKETPLACE_JSON, Marketplace)
  if (!marketplace) return

  const skillFiles = new Set<string>()
  for (const plugin of marketplace.plugins) {
    // Other source types fetch the plugin from outside this repo.
    if (typeof plugin.source !== 'string') continue
    const pluginDir = resolve(ROOT, plugin.source)
    if (!existsSync(pluginDir)) {
      report(pluginDir, 'plugin directory not found')
      continue
    }
    checkJsonFile(join(pluginDir, '.claude-plugin', 'plugin.json'), PluginManifest)

    const skillsDir = join(pluginDir, 'skills')
    if (existsSync(skillsDir)) {
      const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(skillsDir, entry.name))
        .sort()
      for (const skillDir of skillDirs) {
        validateSkill(skillDir)
        skillFiles.add(relative(ROOT, join(skillDir, 'SKILL.md')))
      }
    }

    // Misses styles if plugin.json sets a custom outputStyles path, which replaces output-styles/.
    const stylesDir = join(pluginDir, 'output-styles')
    if (existsSync(stylesDir)) {
      const styles = readdirSync(stylesDir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => join(entry.parentPath, entry.name))
        .sort()
      for (const style of styles) validateOutputStyle(style)
    }
  }

  checkReadmeTable('Skills', skillFiles, 'a skill')
}

validateRepo()
for (const problem of problems) console.log(`✘ ${problem}`)
if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s) found.`)
  process.exit(1)
}
console.log('✔ Marketplace, plugins, skills, and output styles are valid.')
