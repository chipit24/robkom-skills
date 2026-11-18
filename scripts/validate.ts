/**
 * Validates the marketplace, each plugin it lists from this repo, and each
 * skill and output style in those plugins. Changes no files. Prints every
 * problem it finds and exits 1 if there are any.
 *
 *     bun run validate
 *
 * What it checks:
 *
 * - `claude plugin validate --strict` passes for the marketplace and each
 *   plugin, apart from its warning that `version` is missing.
 * - Each skills/<name>/SKILL.md stays under 500 lines and has frontmatter that
 *   matches SkillFrontmatter. The CLI passes invalid YAML and misspelled keys,
 *   and Claude Code silently ignores both, so this script parses the
 *   frontmatter itself.
 * - Each .md file in output-styles/ has frontmatter that matches
 *   OutputStyleFrontmatter. The CLI doesn't read style files at all.
 * - The Skills table in README.md links every SKILL.md and nothing else.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { toString } from 'mdast-util-to-string'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { z } from 'zod'

const ROOT = resolve(import.meta.dirname, '..')
const README = join(ROOT, 'README.md')
const MARKETPLACE_JSON = join(ROOT, '.claude-plugin', 'marketplace.json')
// The version pinned in package.json, not whichever `claude` is first on PATH.
const CLAUDE = join(ROOT, 'node_modules', '.bin', 'claude')

const markdown = unified().use(remarkParse).use(remarkFrontmatter).use(remarkGfm)

// The fields this script reads to find plugins. `claude plugin validate`
// checks the rest of the file.
const Marketplace = z.looseObject({
  plugins: z.array(z.looseObject({ source: z.union([z.string(), z.looseObject({})]) })),
})

// Claude Code reads these spellings as booleans, in any letter case.
const Bool = z.preprocess(
  (value) => String(value).toLowerCase(),
  z.enum(['true', 'false', 'yes', 'no', 'on', 'off', '1', '0']),
)
const StringOrList = z.union([z.string(), z.array(z.string())])

const SkillName = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'use lowercase letters and digits in hyphen-separated groups, such as "code-comments"')
  .refine((name) => !/anthropic|claude/.test(name), 'must not contain "anthropic" or "claude"')

// The fields in https://code.claude.com/docs/en/skills#frontmatter-reference.
// `name` and `description` follow the stricter rules of the Agent Skills spec
// (https://agentskills.io/specification) and of the Claude API and claude.ai
// (https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview).
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

// The fields in https://code.claude.com/docs/en/output-styles#frontmatter-reference.
// Claude Code names a plugin's style "<plugin>:<name>", and the user's
// `outputStyle` setting has to match that exactly. Without `name`, or when the
// YAML doesn't parse, the style falls back to its file name, and a setting
// written for `name` silently selects the Default style instead.
const OutputStyleFrontmatter = z.strictObject({
  name: z.string().min(1),
  description: z.string().min(1),
  'keep-coding-instructions': Bool.optional(),
  // This field applies the style to everyone who enables the plugin and
  // overrides their own `outputStyle` setting. People enable this plugin for
  // its skills, so it must not choose their style for them.
  'force-for-plugin': z
    .never({ error: "remove it: it overrides the outputStyle setting of everyone who enables the plugin" })
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

// The parts of the `--json` report this script reads. See
// https://code.claude.com/docs/en/plugins/cli-reference#output-and-exit-codes.
const CliIssue = z.object({ path: z.string(), message: z.string() })
const CliFileResult = z.object({ file: z.string(), errors: z.array(CliIssue), warnings: z.array(CliIssue) })
const CliReport = z.object({ manifest: CliFileResult.nullable(), contents: z.array(CliFileResult) })

// The plugin leaves `version` unset for now, which `--strict` would otherwise
// fail on. The warning stops once a version is set.
const IGNORED_CLI_WARNING = 'No version specified'

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

function claudePluginValidate(target: string): void {
  const result = spawnSync(CLAUDE, ['plugin', 'validate', target, '--strict', '--json'], { encoding: 'utf8' })
  let json: unknown
  try {
    json = JSON.parse(result.stdout)
  } catch {
    const output = result.error?.message ?? (result.stderr.trim() || result.stdout.trim())
    report(target, `claude plugin validate failed: ${output}`)
    return
  }
  const parsed = check(target, CliReport, json)
  if (!parsed) return
  const { manifest, contents } = parsed
  for (const fileResult of manifest ? [manifest, ...contents] : contents) {
    const warnings = fileResult.warnings.filter((warning) => !warning.message.startsWith(IGNORED_CLI_WARNING))
    for (const issue of [...fileResult.errors, ...warnings]) {
      report(fileResult.file, `${issue.path}: ${issue.message}`)
    }
  }
}

function check<T extends z.ZodType>(file: string, schema: T, value: unknown): z.output<T> | undefined {
  const result = schema.safeParse(value)
  if (!result.success) reportIssues(file, result.error)
  return result.data
}

function checkJsonFile<T extends z.ZodType>(file: string, schema: T): z.output<T> | undefined {
  let json: unknown
  try {
    json = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    report(file, (error as Error).message)
    return undefined
  }
  return check(file, schema, json)
}

/** Returns the file's text and parsed frontmatter, or reports a problem and returns undefined. */
function readFrontmatter(file: string): { text: string; frontmatter: unknown } | undefined {
  const text = readFileSync(file, 'utf8')
  // Like Claude Code, remark reads frontmatter only from a --- block that opens on line 1.
  const [first] = markdown.parse(text).children
  if (first?.type !== 'yaml') {
    report(file, 'needs a frontmatter block that opens with --- on line 1 and closes with ---')
    return undefined
  }
  try {
    // Claude Code parses frontmatter with Bun.YAML too, so both read it the same way.
    return { text, frontmatter: Bun.YAML.parse(first.value) }
  } catch (error) {
    report(file, `frontmatter: ${(error as Error).message}`)
    return undefined
  }
}

function validateSkill(skillDir: string): void {
  const skillMd = join(skillDir, 'SKILL.md')
  if (!existsSync(skillMd)) {
    report(skillDir, 'missing SKILL.md')
    return
  }
  const parsed = readFrontmatter(skillMd)
  if (!parsed) return
  const { text, frontmatter } = parsed
  check(skillMd, skillFile(basename(skillDir)), { frontmatter, lines: text.trimEnd().split('\n').length })
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
  claudePluginValidate(ROOT)
  const marketplace = checkJsonFile(MARKETPLACE_JSON, Marketplace)
  if (!marketplace) return

  const skillFiles = new Set<string>()
  for (const plugin of marketplace.plugins) {
    // Other source types fetch the plugin from outside this repo.
    if (typeof plugin.source !== 'string') continue
    const pluginDir = resolve(ROOT, plugin.source)
    claudePluginValidate(pluginDir)

    // A plugin needs no skills/ or output-styles/ folder. The CLI run above
    // reports a missing plugin folder.
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

    // Claude Code loads .md files from subfolders of output-styles/ too. This
    // reads the default folder only, so it misses styles if plugin.json ever
    // sets `outputStyles`, which replaces that folder.
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
