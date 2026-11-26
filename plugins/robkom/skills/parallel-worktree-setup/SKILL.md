---
name: parallel-worktree-setup
description: Sets a project up so its app can run from several git worktrees at the same time, each with its own ports, sign-in and data, with commands or scripts to provision a worktree and tear it down. Use only when the user explicitly invokes or asks to run parallel-worktree-setup, because this skill modifies the project setup. Do not trigger automatically.
disable-model-invocation: true
---

# Parallel worktree setup

Set this project up so that its app can run from several git worktrees at the same time. If the user did not explicitly invoke or ask to run this skill, stop and ask them to confirm they want to proceed.

First survey how the app runs today and what worktree support the project already has. If it has none, build the setup from scratch. If it has some, update it or build on it.

## The outcome

- **A provisioned worktree is isolated and has what it needs to run the app by itself.** Whatever a running copy of the app needs for itself, the worktree gets its own, such as its own ports, its own sign-in session, and its own databases. It can't accidentally change anything it shares with the main checkout or another worktree.
- **The main checkout behaves as it did before.**
- **Provisioning is opt-in.** A person or tool that only needs a copy of the code creates a plain worktree and never has to provision it.
- **Commands or scripts provision a worktree, tear it down, and clean up after worktrees that were deleted without teardown.** All three operations are easy to run, fit the project's existing conventions, work on the happy path, and are safe: normal use and ordinary mistakes, such as running a command in the wrong place, twice, or at the same time as another, can't damage the main checkout's data or another worktree's. Keep those guards reasonable. An agent following the project skill below runs these commands far more often than a person does, so document rare mistakes a careful agent won't make rather than adding code guards for them. Document the workflow the tool assumes and what it leaves out in the same docs, so later reviews judge the tool against that scope. Examples to leave to the docs include moving or copying a worktree, linking an env file from another checkout, editing a marker file, provisioning one worktree twice at once, and passing an npm option without `--`.
- **Provisioning recovers when an agent interrupts a long run.** Agent tools often stop long commands (for example, Claude Code's Bash tool stops a foreground command after two minutes by default, and time-limit wrappers send `SIGALRM`). Running provisioning again finishes the job. Decide whether dependency installation finished from a file the package manager writes at the end, such as npm's `node_modules/.package-lock.json`, not from whether the install directory (such as `node_modules`) exists. Any servers that provisioning starts are stopped on `SIGINT`, `SIGTERM`, `SIGHUP`, and `SIGALRM`.
- **A project agent skill teaches agents to use the tool, with a one-line pointer in `CLAUDE.md` or `AGENTS.md`.** Put the skill where the project's agent loads project skills (for Claude Code, `.claude/skills/<name>/SKILL.md`), and name trigger phrases such as "do this work in a parallel worktree" and "in a provisioned worktree" in its description so agents create, use, and remove worktrees with the tool. Its body covers when to provision and when a plain worktree is enough, how to tell whether the session is already in a provisioned worktree, creating a worktree with the tool (running the slow step with a long timeout or in the background), using the URLs the tool prints, and running tests with no extra environment variables. It also covers what stays shared and must not be restarted or wiped, checks before removing a worktree (uncommitted work, unpushed commits, and data the developer made by hand), cleanup, and a short "when something is wrong" list that points to the tool's docs.

## Patterns that have worked

These are hints. Use the ones that fit this project.

- Worktree creation handled by the tool when the project lands work on a branch other than the default branch. Built-in agent worktrees, such as Claude Code's, are cut from the default branch.
- A `<name>.localhost` host for each worktree, which gives each copy its own sign-in cookie.
- Ports offset from the main checkout's by a number each worktree claims.
- A worktree's own env file written by the tool, not copied from the main checkout. Don't list env files in `.worktreeinclude`: copying an env file that points at the main checkout's database is the exact bug this setup exists to prevent.
- A worktree's databases on the main checkout's database server, under names that can't collide with the main checkout's, including the test database so worktrees can run tests at the same time. Fill each worktree's dev database with the project's existing seed instead of offering to copy the main checkout's dev database. Copying would be the only code path that reads the main checkout's data. A copy also brings the main checkout's IDs, which may name files or external resources the two checkouts then share, and can carry a schema newer than the branch's code.
- An owner recorded on each worktree database, such as a Postgres comment that names the repository and the worktree's folder. Teardown and cleanup read it to tell which databases are safe to drop.
- A small module with unit tests for the decisions that can lead to dropped data: names, ports, and which databases cleanup may drop.
- If the project has a local CI runner, make concurrent runs safe too, including cleaning up after a run killed by `SIGALRM` or `SIGKILL`.

## Verify

Confirm that every outcome above holds, for example by running the app from several worktrees at the same time for real. Check these happy-path cases too:

- If the dev server opens a browser, it opens the worktree's own host, not `localhost`, which the worktree's API may refuse as an origin.
- An option that names a starting point, such as `--from HEAD`, resolves in the checkout where the command is run, not in the main checkout.
- A branch that exists only on the remote is fetched and checked out tracking the remote branch, not created again from the default branch.
- Every instruction the tool prints still works when followed from inside a worktree. For example, Docker Compose names its project after the folder, so starting the shared database from a worktree starts a second, empty one.
- The tool's tests run in the command CI actually uses, which may not be the root test command.
- Any tracked file the tool edits per worktree, such as `.claude/launch.json` hidden with `skip-worktree`, has a documented way to merge a change to it without tearing the worktree down.
- Provisioning works when the package manager blocks lifecycle scripts, such as npm with `ignore-scripts`.
- If the worktrees share a database server, its connection limit is measured with several worktrees running tests at once, and documented.
