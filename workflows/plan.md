---
description: Break a spec into ordered tasks with acceptance criteria
argument-hint: "[--spec <path>]"
agents: scout, planner
---
Execute this workflow with the subagent tool. This command reads the project
spec and produces an ordered task list. Never write code — plan only.

## Phase 1 — Load Spec

Read `SPEC.md` from the project root. If `--spec <path>` is given in $@,
read that file instead. If no spec exists, stop and tell the user to run
`/spec` first — do not invent requirements.

Confirm the spec covers the six core areas (objective, tech stack, commands,
structure, code style, testing strategy, boundaries). If the spec is incomplete,
stop and ask the user to complete it via `/spec`.

## Phase 2 — Reconnaissance

Use the subagent tool with the "scout" agent (`agentScope: "both"`, bg agent)
to examine the codebase:

```
Task: "Examine the current project structure. Report:
1. What files and directories exist
2. What language/framework is in use
3. What patterns and conventions are followed
4. What tests exist (if any)
5. What build/test commands are available

Do NOT modify anything. Read-only reconnaissance."
```

## Phase 3 — Task Breakdown

Use the subagent tool with the "planner" agent (`agentScope: "both"`, bg
agent) to break the spec into tasks. Interpolate the full spec content and
scout findings into the task:

```
Task: "Break this spec into ordered, implementable tasks. Save the plan to
tasks/plan.md and the task list to tasks/todo.md. Create tasks/ if it
does not exist.

SPEC:
<full SPEC.md content>

SCOUT FINDINGS:
<scout output>

Rules:
- Vertical slices, not horizontal layers (each task = one complete feature path)
- Each task must be completable in a single focused session (~30 min)
- Each task has explicit acceptance criteria and a verification step
- Each task touches no more than ~5 files
- Order by dependency (foundations first)
- TDD is mandatory: every task assumes tests come first
- No code during planning — read-only analysis only

Task format:
- [ ] Task: [Description]
  - Acceptance: [What must be true when done]
  - Verify: [How to confirm — test command, build, manual check]
  - Files: [Which files will be touched]
  - Depends on: [Other tasks, if any]"
```

## Phase 4 — Approval

Present the full plan to the user. Show the task list from tasks/todo.md. Wait
for explicit approval before committing. If the user requests changes, re-run
the planner with the amendments and present the revised plan.

After approval, commit the plan artifacts:

```bash
git add tasks/plan.md tasks/todo.md
git commit -m "docs: add implementation plan"
```

Report the task count and suggest the next command: `/build`.

## Failure behavior

If the scout or planner fails, report the failure and partial output to the
user. Do not continue the chain. Do not generate a plan from incomplete context.
