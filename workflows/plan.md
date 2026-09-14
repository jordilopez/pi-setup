---
description: Break a spec into ordered tasks with acceptance criteria
argument-hint: "[--spec <path>]"
agents: scout, planner
---
Execute this workflow with the subagent tool. It reads a project specification
and produces an ordered task list. Never write code during this workflow.

## Phase 1: Load the spec

Read `SPEC.md` from the project root, or the path supplied by `--spec <path>`.
If no spec exists, stop and tell the user to run `/spec` first. Do not invent
requirements.

Verify the spec covers the six core areas: objective, tech stack, commands,
structure, code style, testing strategy, and boundaries. If the spec is
incomplete, stop and ask the user to complete it via `/spec`.

## Phase 2: Reconnaissance

Dispatch the `scout` agent (`agentScope: "both"`, background mode) with a
read-only request to report:

1. Project files and directories
2. Language and framework
3. Existing patterns and conventions
4. Existing tests
5. Available build and test commands

## Phase 3: Task breakdown

Dispatch the `planner` agent (`agentScope: "both"`, background mode),
interpolating the complete spec and scout findings. Tell the planner to invoke
`/skill:planning-and-task-breakdown` and follow it as the canonical procedure.
The planner must not write files directly.

The planner must produce dependency-ordered vertical slices. Every task must
have explicit acceptance criteria, a verification step, a file list, and its
dependencies. TDD/test-first is required only for risky changes — public
interfaces, persisted data, security, or core logic. For simple, clear changes,
the verification step is the narrowest relevant check, not a new test. Include a
separate documentation task when a change alters public APIs, CLI, config, or
user-facing behavior, unless the task's own deliverable is documentation. The
planner must not write implementation code.

The planner may recommend parallel implementation lanes only when file
ownership is disjoint and each lane can be validated independently.

The planner must return exactly one labeled fenced block for each artifact:

````markdown
```text:path=tasks/plan.md
<complete plan document>
```

```text:path=tasks/todo.md
<complete task list>
```
````

If either block is missing or duplicated, stop and report the incomplete planner
result. After both blocks are received, the parent session writes the files,
creating `tasks/` if necessary, and reads them back before presenting the plan
for approval.

## Phase 4: Approval

Present the complete plan and task list to the user. Wait for explicit approval.
If the user requests changes, re-dispatch the planner with the original plan,
spec, scout findings, and requested amendments; then present the revised plan.

After approval, commit only the plan artifacts:

```bash
git add tasks/plan.md tasks/todo.md
git commit -m "docs: add implementation plan"
```

Report the task count and suggest `/build` as the next command.

## Failure behavior

If the scout or planner fails or returns incomplete output, report the failure
and partial output. Do not continue or generate a plan from incomplete context.
