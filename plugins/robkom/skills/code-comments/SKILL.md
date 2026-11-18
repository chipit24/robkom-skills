---
name: code-comments
description: Write, revise, or review comments in code. Use for any edit that adds or changes a comment, even one comment inside a larger change, in any file type, including YAML, shell scripts, and config files. Also use when documenting APIs or deciding whether code needs a comment.
---

# Code comments

Write a comment only when it adds durable information that the code can't express. Before adding one, try to make the code explain itself with a better name, a focused function, or a named constant.

## Replace comments that do the job of a check or a decision

A comment cannot stop the next change from breaking a rule, and it hides decisions from the people who should make them. When a comment exists to guard or excuse code, remove it and use the mechanism that does the job:

- A rule that must always hold, such as `start <= end` or two maps holding the same keys: enforce it with a type, an assertion, a database constraint, or a test.
- A rule about how code may be written or called, such as "only call this from the worker": enforce it with a lint rule, a module boundary, or a hook.
- A departure from the project's usual approach, or a suppressed check such as `@ts-expect-error` or `eslint-disable`: do not justify it in a comment. Fix the underlying problem, or raise it with the user so they can decide. If they approve, record the decision somewhere durable, such as an ADR, a feature spec, or the project's decisions log.

Sometimes the check cannot be added, for example because the project lacks the tooling or the change reaches beyond what the user asked for. Do not quietly leave the comment as the only guard. Tell the user what rule the comment protects and why you could not enforce it, so they can decide what to do.

## Write the comment

- Prefer one or two precise lines. Use a longer block only when the scope justifies it, such as a protocol or a non-trivial algorithm.
- State concrete conditions and values. For example, write `Falls back to "unknown" when PUBLIC_DEPLOY_ENV is missing`, not `Uses a sentinel on failure`.
- Reference an issue, specification, or another file only when the reader needs it to understand or safely change the code.
- Explain a non-trivial or surprising regular expression in plain language, with an example of what it matches: `Matches slugs such as "weekly-notes-2026": lowercase words separated by hyphens, followed by a four-digit year.`
- One idea per sentence. Do not chain unrelated clauses with a semicolon ("connect from the admin page; the worker refreshes tokens itself" reads as one confusing thought). Split them, and make the sequence explicit with words like "then" and "from that point".
- Never use "->" or "=>" as shorthand in prose. An arrow saves a few words, and the reader then has to work out which relationship it stands for. The one exception is a UI navigation path, where the real arrow character is fine: `Settings → Billing`.

## File-level and script comments

- When a file needs a comment about the file as a whole, write it as a block comment at the top, after any shebang and before the imports. Line comments directly above the first declaration read as if they describe only that declaration.
- Describe what the file is in plain words. Avoid jargon a reader could not work out from the surrounding code.
- People usually run a script through a package script or build tool without reading it. For when they do open it, say at the top which files it reads, what it changes, and when it fails, such as `Reads every *.md file under docs/, rewrites broken links in place, and exits 1 if any link cannot be fixed`.
- When a script has distinct invocation modes, show literal command examples with a short outcome under each one.
