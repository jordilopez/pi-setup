---
description: Implement the next task from tasks/todo.md, using TDD only for risky changes. Add "auto" to run the whole plan in one approved pass.
argument-hint: "[auto]"
agents: scout, worker
---
Execute this workflow with the subagent tool. It implements tasks from the
approved plan. The worker applies `/skill:test-driven-development` only to risky
changes and `/skill:incremental-implementation` to multi-file work; this
workflow owns dispatch, approval, validation, commit, and stop behavior.

Modes:

- **`/build`** (default) — implement the next pending task, then stop.
- **`/build auto`** — implement every task in one approved pass.

## Mode selection

Parse `$ARGUMENTS`:
- If it contains `auto` or `all` → **autonomous mode** (whole plan).
- Otherwise (empty or anything else) → **single-task mode** (next pending task).

This is the only difference between the two modes. Everything else — pre-checks,
worker dispatch, validation, commit — is identical. Branch here, then follow
the shared steps below.

## Pre-checks (both modes)

1. Require `tasks/todo.md`. If it does not exist, stop and tell the user to
   run `/plan` first.
2. Run `git status --porcelain`. If there are uncommitted changes, stop and ask
   the user to commit, stash, or confirm how to handle them. Autonomous commits
   must not absorb unrelated local work.

## Default: single task (`/build`)

Pick the first unchecked task in `tasks/todo.md` and dispatch the `worker` agent
with the task, its acceptance criteria, its file list, and the verification
command. Do not dispatch a scout: the plan already lists the files, and the
worker reads them itself. Dispatch a scout only when the task's files are
missing or genuinely unclear.

The worker must:

1. Invoke `/skill:test-driven-development` only for risky changes — public
   interfaces, persisted data, security, or core logic.
2. Invoke `/skill:incremental-implementation` for multi-file work.
3. Implement the smallest complete slice, validate it, and report concrete
   results.
4. Never push or open a pull request.

For risky changes, a usable test runner is required. If the repository has no
test runner configured, stop and report that as a blocker.
For documentation or configuration-only changes, report unavailable test or
build commands as not applicable. For compiled projects, treat a missing build
command as a blocker for code changes.

After a successful worker result:

1. Run the focused validation command for the files this task touched. Run the
   full test suite before committing a risky change; otherwise reserve it for
   the end of the run.
2. Stage only files touched by this task; never use `git add -A` blindly.
3. Inspect the staged patch.
4. Commit with a descriptive message.
5. Mark the task complete in `tasks/todo.md`.
6. Stop; do not continue to the next task.

Stop and report if any worker, test, build, or commit step fails.

## Autonomous: the whole plan (`/build auto`)

Before dispatching work, present the complete task list and wait for an
explicit affirmative response such as "approve", "go", or "yes". Treat
hedged responses as not approved. This is the only human gate; verification
still happens for every task.

Process tasks in dependency order. For each task, dispatch the worker with the
task, file list, and verification command — no per-task scout unless the files
are genuinely unclear. Require the worker to use the applicable skills, run
focused validation, stage only that task's files, inspect the staged patch,
commit it, and mark the task complete. Give every task its own atomic commit.
Run the full test suite and build once when the run finishes.

Stop immediately and ask the user when a test or build fails, requirements are
ambiguous, a task needs an uncovered decision, or the task is high-risk or
irreversible. Resume only after the user re-invokes `/build auto`.

## Summary

At completion, report tasks completed, tests added or run, commits made, and
anything skipped or left for the user. Never push; pushing is a separate step.
