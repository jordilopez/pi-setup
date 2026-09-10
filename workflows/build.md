---
description: Implement tasks incrementally with TDD. Add "auto" to run the whole plan in one approved pass.
argument-hint: "[auto]"
agents: scout, worker, tester
---
Execute this workflow with the subagent tool. This command implements tasks
from the plan using test-driven development. It has two modes:

- **`/build`** (default) — implement the *next* pending task, then stop.
- **`/build auto`** — implement *every* task in one approved pass.

`$ARGUMENTS` selects the mode. Treat `auto` or `all` as autonomous mode;
anything else (or empty) is single-task mode.

## Pre-checks (both modes)

1. **Require a plan.** Look for `tasks/todo.md` (or `tasks/plan.md`). If
   neither exists, stop and tell the user to run `/plan` first.
2. **Require a clean tree.** Run `git status --porcelain`. If there are
   uncommitted changes, stop and ask the user to commit, stash, or confirm
   how to handle them. Autonomous per-task commits must not absorb unrelated
   local work.

## Default: single task (`/build`)

Pick the **next** pending task (first unchecked `- [ ]` in `tasks/todo.md`).
Then:

1. Read the task's acceptance criteria and verification step
2. Load context: the scout agent examines relevant code
3. **RED** — Write a failing test for the expected behavior
4. **GREEN** — Implement the minimum code to make it pass
5. **REFACTOR** — Clean up while keeping tests green
6. Run the full test suite to check for regressions
7. Run the build to verify compilation
8. Commit with a descriptive message (stage only files this task touched)
9. Mark the task complete in `tasks/todo.md`
10. **Stop** — do not continue to the next task

If any step fails, stop and report the failure with the partial output.

## Autonomous: the whole plan (`/build auto`)

This removes the manual stepping between tasks — **not** the verification.
Every task still earns a passing test and its own commit.

### Step 1 — Single checkpoint

Present the full task list from `tasks/todo.md` and wait for an **explicit
affirmative** (e.g. "approve", "go", "yes"). Treat hedged responses
("looks reasonable", "I guess") as **not** approved. This is the only
human gate — after approval, run autonomously.

### Step 2 — Execute every task

Process tasks in the order the plan lists them (dependency order). For each
task:

1. Read the task's acceptance criteria
2. **RED** — Write a failing test
3. **GREEN** — Implement minimum code to pass
4. **REFACTOR** — Clean up while green
5. Run the full test suite
6. Run the build
7. Stage only files this task touched (never `git add -A`)
8. Inspect the staged patch (`git status`, `git diff --cached`)
9. Commit with a descriptive message
10. Mark the task complete in `tasks/todo.md`

### Step 3 — Stop on failure

**Stop and ask the user** (do not push through) when:

- A test can't be made to pass without an obvious fix
- The build breaks
- The spec is ambiguous
- A task needs a decision the spec doesn't cover
- A task is high-risk or irreversible (auth, payments, data migrations,
  anything touching secrets, or anything you can't undo with `git revert`)

After the user resolves the blocker, they re-invoke `/build auto` — it
resumes from the next pending task.

### Step 4 — Summary

At the end, report:

- Tasks completed (count / total)
- Tests added
- Commits made
- Anything skipped, flagged, or left for the user

## TDD requirement (both modes)

Every task **must** follow red-green-refactor:

1. Write a failing test that describes the expected behavior
2. Implement the minimum code to pass
3. Refactor while keeping tests green
4. Run the full test suite

Never implement logic without a failing test first. If the project has no
test runner configured, report that as a blocker and stop.

## Rules

- **One commit per task.** Atomic, revertible.
- **Stage only what changed.** Never `git add -A` blindly.
- **Never skip verification.** Tests + build before every commit.
- **Never chain past a failure.** Stop, report, ask.
- **Never push.** Local commits only. Push is a separate step.

## Failure behavior

If any task fails during autonomous mode, stop immediately and report:
- Which task failed
- What went wrong
- Partial output and any commits made so far
- The next pending task (for resume)

Do not retry without asking. Do not skip failed tasks.
