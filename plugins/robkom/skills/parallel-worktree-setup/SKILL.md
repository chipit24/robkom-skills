---
name: parallel-worktree-setup
description: Sets a project up so its app can run from several git worktrees at the same time, each with its own ports, sign-in and data, with commands or scripts to provision a worktree and tear it down.
disable-model-invocation: true
---

# Parallel worktree setup

Set this project up so that its app can run from several git worktrees at the same time.

First survey how the app runs today and what worktree support the project already has. If it has none, build the setup from scratch. If it has some, update it or build on it.

## The outcome

- **A provisioned worktree is isolated and has what it needs to run the app by itself.** Whatever a running copy of the app needs for itself, the worktree gets its own, such as its own ports, its own sign-in session and its own copy of each database. It can't accidentally change anything it shares with the main checkout or another worktree.
- **The main checkout behaves as it did before.**
- **Provisioning is opt-in.** A person or tool that only needs a copy of the code creates a plain worktree and never has to provision it.
- **Commands or scripts provision a worktree, tear it down, and clean up after worktrees that were deleted without teardown.** All three operations are easy to run, fit the project's existing conventions, and are safe. A mistake, such as running one in the wrong place, twice, or at the same time as another, can't damage the main checkout's data or another worktree's.

## Patterns that have worked

These are hints. Use the ones that fit this project.

- A `<name>.localhost` host for each worktree, which gives each copy its own sign-in cookie.
- Ports offset from the main checkout's by a number each worktree claims.
- A worktree's databases on the main checkout's database server, under names that can't collide with the main checkout's. This includes the test database, so worktrees can run the tests at the same time.
- A `.worktreeinclude` file, which Claude Code uses to copy gitignored files, such as a local env file, into each new worktree.
- An owner recorded on each worktree database, such as a Postgres comment that names the repository and the worktree's folder. Teardown and cleanup read it to tell which databases are safe to drop.

## Verify

Confirm that every outcome above holds, for example by running the app from several worktrees at the same time for real.
