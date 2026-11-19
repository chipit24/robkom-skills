# robkom-skills

My personal Claude Code plugin marketplace, which ships one plugin (`robkom`). I run its skills (and output style) in the Claude Code desktop app, usually with Fable 5.2 or Opus 5.5 at Medium or higher effort level.

## Installation

```bash
claude plugin marketplace add chipit24/robkom-skills
claude plugin install robkom@robkom-skills
```

Skills are namespaced by the plugin, e.g. `/robkom:code-comments`.

Auto-update is off by default for marketplaces outside of Anthropic's. You can turn it on in `/plugin` → Marketplaces → robkom-skills → Enable auto-update.

## Skills

| Skill | What it does |
| --- | --- |
| [code-comments](plugins/robkom/skills/code-comments/SKILL.md) | Makes sure comments explain why, not what. A comment that states a rule becomes a type, assertion, or test instead. |
| [full-review](plugins/robkom/skills/full-review/SKILL.md) | Reviews the current branch in a new subagent, verifies each finding by running the code, fixes the findings worth fixing in one commit each, and re-reviews, for at most three reviews. It commits its fixes, so it runs only when you type `/robkom:full-review`. |
| [parallel-worktree-setup](plugins/robkom/skills/parallel-worktree-setup/SKILL.md) | Sets a project up so its app can run from several git worktrees at the same time, each with its own ports, sign-in and data. Adds commands or scripts to provision a worktree, tear it down, and clean up after deleted worktrees. It changes the project, so it runs only when you type `/robkom:parallel-worktree-setup`. |

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
  output-styles/<name>.md           One file per output style
scripts/validate.ts                 Validation run locally and in CI
.githooks/pre-push                  Runs the validation before every push
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

Install the dependencies with [Bun](https://bun.com). They include a pinned Claude Code:

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

To run the pinned Claude Code, use `bun run claude <args>`.

## Skill philosophy

Every skill in this repo follows these rules:

- **A skill holds what the model won't reliably know or choose on its own.** That means your preferences for a task and its result, including standards a capable model knows in theory but only applies inconsistently (for example, only when the surrounding code already does). It leaves out what a capable model reliably does right without being told.
- **A skill describes the outcome and leaves the method to the model.** Saying what must be true when the work is done, and where to stop and ask instead of guessing, keeps the skill useful as models improve, rather than constraining a stronger model with rigid steps. The exception is a method the model won't reliably do on its own: a tool it keeps calling wrongly, a guardrail against a model blind spot (such as reviewing in a fresh context), or a process you want followed consistently. When a skill prescribes a method, it says what goes wrong without it, so the model can adapt when the situation differs and you know when a newer model makes the step safe to drop.
- **A skill informs the model's judgment and doesn't replace it.** An instruction comes with its reason where the reason isn't obvious, so the model can tell where the instruction applies and where it doesn't. A technique that has worked before is offered as an option, for the model to use where it fits.

Not everything belongs in a skill. Facts about a specific project (its setup, decisions, and architecture) belong in the project's docs, where the model can find them on its own. Instructions that nearly every session needs belong in `CLAUDE.md`.

## Adding a skill

1. Draft it in `drafts/<name>/SKILL.md`, following the [skill philosophy](#skill-philosophy).
2. Once it's reviewed, move the folder to `plugins/robkom/skills/<name>/` and add it to the Skills table.
3. Commit and push. The pre-push hook and CI validate it.

## Versioning

Neither manifest sets `version` yet. A marketplace added from a local path ignores `version` anyway and loads the working tree at every session start. An install from GitHub without a `version` uses the commit SHA instead, so every push is an update.

To pin releases later, add `version` to `plugin.json` and bump it on every release. GitHub installs ignore new commits until it changes.
