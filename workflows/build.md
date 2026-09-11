---
description: Implement tasks incrementally with TDD. Add "auto" to run the whole plan in one approved pass.
argument-hint: "[auto]"
agents: scout, worker, tester
---
Execute this workflow with the subagent tool. It implements tasks from the
approved plan using the `/skill:test-driven-development` and
`/skill:incremental-implementation` skills. The worker agent invokes those skills;
this workflow owns dispatch, approval, commit, and stop behavior.

Modes:

- **`/build`** (default) — implement the next pending task, then stop.
- **`/build auto`** — implement every task in one approved pass.

## Mode selection

Parse `$ARGUMENTS`:
- If it contains `auto` or `all` → **autonomous mode** (whole plan).
- Otherwise (empty or anything else) → **single-task mode** (next pending task).

This is the only difference between the two modes. Everything else — pre-checks,
scout dispatch, worker dispatch, validation, commit — is identical. Branch here,
then follow the shared steps below.

## Pre-checks (both modes)

1. Require `tasks/todo.md`. If it does not exist, stop and tell the user to
   run `/plan` first.
2. Run `git status --porcelain`. If there are uncommitted changes, stop and ask
   the user to commit, stash, or confirm how to handle them. Autonomous commits
   must not absorb unrelated local work.

## Default: single task (`/build`)

Pick the first unchecked task in `tasks/todo.md` and dispatch the `scout` agent
to examine its relevant code. Then dispatch the `worker` agent with the task,
acceptance criteria, scout findings, and verification command.

The worker must:

1. Invoke `/skill:test-driven-development` for behavior or logic changes.
2. Invoke `/skill:incremental-implementation` for multi-file work.
3. Implement the smallest complete slice, validate it, and report concrete
   results.
4. Never push or open a pull request.

For behavior or logic changes, a usable test runner is required. If the
repository has no test runner configured, stop and report that as a blocker.
For documentation or configuration-only changes, report unavailable test or
build commands as not applicable. For compiled projects, treat a missing build
command as a blocker for code changes.

After a successful worker result:

1. Run the full test suite and build when available.
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

Process tasks in dependency order. For each task, dispatch scout context and a
worker, require the worker to use the applicable skills, run the full test suite
and build when available, stage only that task's files, inspect the staged patch,
commit it, and mark the task complete. Give every task its own atomic commit.

Stop immediately and ask the user when a test or build fails, requirements are
ambiguous, a task needs an uncovered decision, or the task is high-risk or
irreversible. Resume only after the user re-invokes `/build auto`.

## Summary

At completion, report tasks completed, tests added or run, commits made, and
anything skipped or left for the user. Never push; pushing is a separate step.
