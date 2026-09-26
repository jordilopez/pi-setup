---
name: git-quick-commit
description: Analyze staged changes and commit. No push, no cleanup, no tests.
---

# Commit Quick Skill

Quickly analyzes staged changes, determines single vs. multiple commits, and commits. **No push, no code cleanup, no test changes.**

## Steps

### 1. Analyze Changes

Call the `git_classify_changes` tool. It inspects the working tree and
returns `{ mode, packageSet, inferredTypes, commitGroups, rationale,
recommendation }`. **Trust its `recommendation` field:**

- `mode: "single"` → one commit covering all changes.
- `mode: "split"` or `"split_by_type"` → split into the commit groups the
  tool returns (one commit per group, in the order given).
- `mode: "ambiguous"` or `"empty"` → ask the user before deciding.

If unsure despite the tool's output, split anyway — smaller commits are
easier to review.

#### Splitting into multiple commits

1. `git restore --staged .` to unstage everything.
2. Use `git add -p` to stage logical groups one at a time.
3. Commit each group with a conventional message.

### 2. Check for Unstaged and Untracked Changes

Run `git status --short` and look at two things:

- **Files with unstaged changes** (second column is non-blank — ` M`, ` D`, `MM`, `DD`, etc.): for each, run `git diff <file>` and, if the first column is also non-blank (`MM`, `MD`, …), also `git diff --cached <file>` to see the staged side. **Ask the user** whether to include (stage now), commit separately, or leave them.
- **Untracked files** (`??`): for each, **ask the user** whether to include (stage and commit), commit separately, or leave them.

Never silently skip either category — they may be forgotten work or related fixes.

### 3. Commit

- Write a **conventional commit message**: `<type>(<scope>): <summary>`
  - Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `style`
- Verify with `git log -1` after committing.
- Repeat for each commit group if splitting.

## Rules

- **No push.** Never push in this workflow.
- **No code changes.** Do not strip console.logs, add comments, or modify code.
- Warn if there are unstaged changes after committing.
