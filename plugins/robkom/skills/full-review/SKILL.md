---
name: full-review
description: Reviews the current branch in a new subagent, verifies each finding and each fix by running the code, and repeats for at most three reviews.
disable-model-invocation: true
---

# Full review

Review the current branch's changes in rounds. In each round, review, verify each finding, and fix the ones worth fixing. Repeat until a review finds nothing new worth fixing. Don't stop between rounds to ask whether to keep going. Report once, at the end.

Run three reviews at most. A well-scoped change settles within three. If the third review still finds new problems worth fixing, fix them and stop there. More rounds won't settle it, because the change or the review is not well scoped or not well documented. Lead the report with this, and say what the reviews kept having to guess at, such as a missing goal, an unstated scope limit, or undocumented behavior.

## Before starting

- Stop and ask the user if the current branch is the default branch or the working tree has uncommitted changes. Either one is most likely a mistake.
- Look for docs on what the branch changes, such as an ADR, a feature spec, or review notes. If there are none, tell the user, then continue. Without docs, the review rests on assumptions the user may not share, so it can churn or fix things the user would have left alone. The user may want to look more closely at what it changes.
- Run the project's own checks, such as its tests, linter, and build, when it has them. Stop and ask the user if any fail, and say which ones. A review of a branch with failing checks spends its effort on problems the checks already report.

## Review

Run each review in a new subagent that doesn't inherit this conversation, so it reads the code without the assumptions made while writing it. Give it the goal of the change. It reports problems and leaves the fixing to you. The review covers what the branch changed since its merge base. A stacked branch's base is its parent branch, not main.

Keep one findings file for the whole run, in a temporary location outside the repo, so a fix commit can't include it. After each review, add its findings to the file, each with its verdict and a one-line reason. Give the file to every later review, so it sees everything found so far and looks for other problems.

## Evidence

Every finding needs evidence from exercising the code. Drop a finding that rests only on an assumption about what the code does. For example, an option that looks redundant may be there for a case the code doesn't show.

- Exercise the change in the built-in browser against the running app whenever the app's UI can reach it. Test an API or backend change through the UI too, the way a real user would reach it. Backend tests can pass while UI wiring, auth, or client state breaks.
- Tests and scripts are further evidence. They matter most for an API or backend change, because a caller can skip the UI. When a finding says the code behaves wrongly and the project has tests, make sure a test fails because of the finding before you fix it. Otherwise you can fix a bug that wasn't real, or write a test that passes by accident. When the project has no tests, write a throwaway one.

Verify each fix the same way.

Being blocked from gathering evidence is not the same as finding none. When something is in the way, such as an app that isn't running or a login, get past it yourself: start the app, or log in. If you can't, and the project's docs don't say how, stop and tell the user what you need. Never drop a finding because you were blocked.

## Fix

Fix a verified finding when this branch caused it or made it worse, and the fix fits the goal of the change. Leave a finding that is outside the goal or needs a product decision for the report.

Weigh each finding against what the app is. A PoC, prototype, or internal tool needs a working first version more than it needs edge cases handled. An app with no real users doesn't need hardening against attackers or traffic it doesn't have. A real hole in who can get in or change data still gets fixed.

Commit each fix on its own, so the user can review or revert one fix without the others. Don't push unless the user asked for it.

## Report

When the reviews are done, read the findings file again, including the findings that were dropped. The file is temporary, so write anything in it worth keeping, such as a deliberate choice not to fix something, into the feature's ADR, spec, or review notes. Report what was fixed and what was left, each with its evidence.
