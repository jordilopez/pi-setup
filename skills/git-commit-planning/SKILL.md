---
name: git-commit-planning
description: Analyze the current changes and produce an executable local-commit plan with groups, cleanup, tests, validation, and no-push safeguards. Use with a strong model before switching to a cheaper model for execution.
---

# Commit Plan

Produce a concrete plan for creating one or more high-quality local commits.
This skill is planning-only: do not edit files, stage or unstage changes, run
cleanup, add tests, run tests, commit, push, or open a pull request.

The plan is intended to be handed to the same conversation after the user
switches to a cheaper model. The execution model should be able to follow it
without repeating the analysis.

## 1. Inspect the current state

Run:

```bash
git status --short
git diff --stat
git diff --staged --stat
git branch --show-current
```

Read the relevant staged and unstaged diffs, surrounding source, existing tests,
and applicable project documentation. Do not assume that all current changes
belong together, and do not discard or alter any changes while inspecting them.

Treat untracked files as part of the review. Explicitly call out changes that
were already staged or present before this workflow if that can be determined.

## 2. Define commit groups

Decide whether the changes belong in one or several independently revertible
commits. Group by package, functional area, or commit type. Split mixed
feature/refactor/docs changes when they are not cohesive; keep a single group
when configuration and documentation are necessary parts of one change.

For every group, specify:

- exact tracked and untracked file paths;
- conventional commit type and scope;
- proposed commit message;
- dependencies on earlier groups, if any;
- files or changes that must remain outside the group.

Do not hide unrelated or pre-existing changes. Mark them as `leave untouched`
or assign them to a separate group.

## 3. Plan cleanup and tests

For each group, identify only relevant work:

- remove debug `console.log`, `console.debug`, and `debugger` statements while
  preserving meaningful error/warning logging;
- add brief comments only where the reason is non-obvious;
- check changed HTML, JSX, TSX, or Vue markup against the companion
  `a11y-checklist.md` in this skill directory — if unavailable, verify:
  alt text on images, form labels, semantic HTML, valid ARIA roles, visible
  focus indicators, and keyboard navigation (Tab, Enter, Space, Escape);
- use existing design tokens and project i18n conventions where applicable;
- add JSDoc only for changed or new exported APIs and non-trivial logic;
- update READMEs or other docs for behavior-changing or user-facing changes;
- update TypeScript types and signatures for changed APIs;
- check diffs for leaked secrets, credentials, or hardcoded tokens;
- remove screenshots or other debug artifacts;
- identify focused unit or E2E tests that should be added or updated.

Do not propose unrelated cleanup. Distinguish required fixes from optional
follow-up suggestions.

## 4. Specify execution and validation

Write an execution checklist for the cheap-model handoff. It must include:

1. the exact files to stage for each group;
2. any edits or tests to make, in dependency order;
3. the narrowest relevant test commands;
4. `npm run validate`, `npm run typecheck`, `npm run lint`, and
   `npm run format:check` when relevant;
5. the expected result or acceptance condition for each check;
6. a reminder to inspect `git diff` and `git status --short` after edits;
7. a reminder to stop and report failures rather than committing unresolved
   failures;
8. a reminder to run `git commit` only after approval and validation, and never
   to run `git push` or `gh pr create`.

If tests or tooling are unavailable, state that explicitly and describe the
validation that is still possible.

## 5. Present the plan

Return these sections:

- `## Summary`
- `## Risks and assumptions`
- `## Non-goals`
- `## Commit groups` — a dependency-ordered table with exact files and messages
- `## Cleanup and tests`
- `## Execution checklist`
- `## Definition of done`

End by asking the user to approve or modify the plan. Do not begin execution in
this skill. After approval, the user can switch to the cheaper model and say:

> Execute the approved commit plan above. Follow it exactly, ask before making
> scope changes, run the listed checks, and do not push.
