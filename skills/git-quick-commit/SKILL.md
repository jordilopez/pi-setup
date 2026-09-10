---
name: git-quick-commit
description: Analyze staged changes and commit. No push, no cleanup, no tests.
---

# Commit Quick Skill

Quickly analyzes staged changes, determines single vs. multiple commits, and commits. **No push, no code cleanup, no test changes.**

## Steps

### 1. Analyze Changes

Run `git diff --staged` to inspect staged changes. Then decide.

#### Quick decision checklist

| Signal | Likely action |
|---|---|
| Only 1–3 files, all same package & concern | Single commit |
| 2+ packages touched | Multiple commits |
| 2+ commit types mixed (feat + refactor, fix + style, etc.) | Multiple commits |
| Same package but different functional areas | Consider splitting |
| 15+ files with no clear cohesion | Multiple commits |
| Unrelated changes in the same file (e.g. fix bug + add feature) | Use `git add -p` to split |

**Default to single commit** when all changes are tightly related (same package, same purpose, no mixed types).

**Split** when the diff touches multiple packages, mixes change types, or contains unrelated changes in the same file.

If unsure, split anyway — smaller commits are easier to review.

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
