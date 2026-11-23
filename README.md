# robkom-skills

My personal Claude Code plugin marketplace, which ships one plugin (`robkom`). I run its skills (and output style) in the Claude Code desktop app, usually with Fable 5.2 or Opus 5.5 at Medium or higher effort level.

## Installation

### Claude Code plugin

```bash
claude plugin marketplace add chipit24/robkom-skills
claude plugin install robkom@robkom-skills
```

Skills are namespaced by the plugin, e.g. `/robkom:code-comments`.

Auto-update is off by default for marketplaces outside of Anthropic's. You can turn it on in `/plugin` → Marketplaces → robkom-skills → Enable auto-update.

### Other agents or individual skills

To install individual skills, or to use them in another agent such as Cursor, Codex, or OpenCode, use the [`skills`](https://github.com/vercel-labs/skills) CLI:

```bash
# List available skills
npx skills add chipit24/robkom-skills --list

# Choose skills, agents, and project or global scope interactively
npx skills add chipit24/robkom-skills

# Install one skill globally for a specific agent
npx skills add chipit24/robkom-skills --skill code-comments -a cursor -g
```

`npx skills` installs only the skills, without the `/robkom:` prefix or the [Clear](plugins/robkom/output-styles/clear.md) output style. Run `npx skills update` to pull updates to installed skills, and run `npx skills add` again to pick up newly added skills. In Claude Code, use either the plugin or `npx skills`, not both, or each skill will load twice.

## Skills

| Skill | What it does |
| --- | --- |
| [code-comments](plugins/robkom/skills/code-comments/SKILL.md) | Makes sure comments explain why, not what. A comment that states a rule becomes a type, assertion, or test instead. |
| [full-review](plugins/robkom/skills/full-review/SKILL.md) | Reviews the current branch in a new subagent, verifies each finding by running the code, fixes the findings worth fixing in one commit each, and re-reviews, for at most three reviews. It commits its fixes, so it is configured to run only when you invoke it explicitly (such as `/robkom:full-review` or `$full-review`). |
| [parallel-worktree-setup](plugins/robkom/skills/parallel-worktree-setup/SKILL.md) | Sets a project up so its app can run from several git worktrees at the same time, each with its own ports, sign-in and data. Adds commands or scripts to provision a worktree, tear it down, and clean up after deleted worktrees. It changes the project, so it is configured to run only when you invoke it explicitly (such as `/robkom:parallel-worktree-setup` or `$parallel-worktree-setup`). |

## Output style

[Clear](plugins/robkom/output-styles/clear.md) leads with the result, like the built-in Concise style, but never cuts the words a reader needs. Replies, PR descriptions, commit messages, docs and comments use full sentences that someone new to the work can follow.

To use it, set `outputStyle` in `~/.claude/settings.json`:

```json
{
  "outputStyle": "robkom:Clear"
}
```

The value is case-sensitive. A value that doesn't match exactly gives the Default style, with no error. Claude Code reads style files when it starts, so restart it after you edit the style.

## Layout

```text
.claude-plugin/marketplace.json     Marketplace catalog
plugins/robkom/
  .claude-plugin/plugin.json        Plugin manifest
  skills/<name>/SKILL.md            One folder per skill
  skills/<name>/agents/openai.yaml  Optional Codex invocation policy
  output-styles/<name>.md           One file per output style
scripts/validate.ts                 Validation run locally and in CI
.githooks/pre-push                  Runs the validation before every push
sbxenv.yaml                         Optional Docker Sandbox environment
drafts/                             Skills under review (gitignored)
```

## Development

On the machine with this clone, register the clone itself instead of GitHub. Skills then load straight from the working tree, and `/reload-plugins` picks up edits without a push:

```bash
claude plugin marketplace add ~/Code/robkom-skills
claude plugin install robkom@robkom-skills
```

A machine can register the marketplace from only one place, since the GitHub copy and the local clone both use the name `robkom-skills`. Remove one before adding the other, which also uninstalls its plugin.

To try the plugin in a single session without installing it:

```bash
claude --plugin-dir ./plugins/robkom
```

Install the dependencies with [Bun](https://bun.com):

```bash
bun install
```

CI validates the marketplace, plugin, skills, and output styles on pull requests and pushes to `main`. The checks also confirm that the Skills table lists every skill. To run them locally:

```bash
bun run validate
```

A pre-push hook runs the same checks before every push. Turn it on once per clone:

```bash
git config core.hooksPath .githooks
```

`git push --no-verify` skips it for one push.

### Docker sandbox (optional)

[sbxenv.yaml](sbxenv.yaml) defines an optional [Docker Sandbox](https://docs.docker.com/ai/sandboxes/) (`sbx`) environment for this repo. It creates a `shell` Linux microVM mounting this clone, includes `t3code-kit` so T3 Code can connect without downloading `t3` on first launch, installs the Bun version pinned in [package.json](package.json), runs `bun ci`, and configures Git to authenticate over HTTPS through `gh`.

From the root of this clone, create the sandbox and approve the plan when prompted:

```bash
sbx env create
```

Connect from T3 Code (or another SSH client) to `robkom-skills.sbx` and open the same folder path this clone uses on your host, or run `sbx env run` to open a shell in the sandbox. To give `gh` and Git access to GitHub, store a token on your host with `sbx secret set github --sandbox robkom-skills` rather than logging in inside the VM. To avoid re-entering that token after recreating the sandbox, put a `secrets.github` entry (for example referencing 1Password or macOS Keychain) in a `*.local.sbxenv.yaml` file at the repo root and pass both files to `sbx env create sbxenv.yaml <name>.local.sbxenv.yaml`. See the [Docker Sandboxes docs](https://docs.docker.com/ai/sandboxes/) for one-time SSH setup and other sandbox options.

## Skill philosophy

Every skill in this repo follows these rules:

- **A skill holds what the model doesn't know or doesn't consistently choose on its own.** It leaves out what a capable model reliably does right without being told. Instead, it covers your preferences and any standards the model only applies some of the time.
- **A skill describes the outcome and leaves the method to the model.** Saying what must be true when the work is done, and where to stop and ask instead of guessing, keeps the skill useful as models improve, rather than constraining a stronger model with rigid steps. The exception is a method the model doesn't reliably follow on its own: how to call a tool it keeps using wrongly, a step that prevents a mistake the model tends to make, or a process you want followed consistently.
- **A skill informs the model's judgment and doesn't replace it.** An instruction comes with its reason when the reason isn't obvious, so the model can tell where the instruction applies and where it doesn't. A technique that has worked before is offered as an option, for the model to use where it fits.

Not everything belongs in a skill. Facts about a specific project (its setup, decisions, and architecture) belong in the project's docs, where the model can find them on its own. Instructions that nearly every session needs belong in `CLAUDE.md`.

## Adding a skill

1. Draft it in `drafts/<name>/SKILL.md`, following the [skill philosophy](#skill-philosophy).
2. Once it's reviewed, move the folder to `plugins/robkom/skills/<name>/` and add it to the Skills table.
3. Commit and push. The pre-push hook and CI validate it.

## Versioning

Neither manifest sets `version` yet. A marketplace added from a local path ignores `version` anyway and loads the working tree at every session start. An install from GitHub without a `version` uses the commit SHA instead, so every push is an update.

To pin releases later, add `version` to `plugin.json` and bump it on every release. GitHub installs ignore new commits until it changes.
