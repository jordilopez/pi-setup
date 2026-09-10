---
name: planning-and-task-breakdown
description: >-
  Breaks work into ordered tasks with acceptance criteria. Use when you
  have a spec or clear requirements and need to break work into implementable
  tasks. Use when a task feels too large to start, or when parallel work
  is possible.
---

# Planning and Task Breakdown

## Overview

Decompose work into small, verifiable tasks with explicit acceptance criteria.
Good task breakdown is the difference between an agent that completes work
reliably and one that produces a tangled mess. Every task should be small enough
to implement, test, and verify in a single focused session.

## When to Use

- You have a spec and need to break it into implementable units
- A task feels too large or vague to start
- Work needs to be parallelized
- The implementation order isn't obvious

**When NOT to use:** Single-file changes with obvious scope, or when the spec
already contains well-defined tasks.

## The Planning Process

### Step 1: Enter Plan Mode

Before writing any code, operate in **read-only mode**:

- Read the spec and relevant codebase sections
- Identify existing patterns and conventions
- Map dependencies between components
- Note risks and unknowns

**Do NOT write code during planning.** The output is a plan document and a task
list, not implementation.

### Step 2: Identify the Dependency Graph

Map what depends on what:

```
Database schema
    │
    ├── API models/types
    │       │
    │       ├── API endpoints
    │       │       │
    │       │       └── Frontend API client
    │       │               │
    │       │               └── UI components
    │       │
    │       └── Validation logic
    │
    └── Seed data / migrations
```

Implementation order follows the dependency graph bottom-up: build foundations
first.

### Step 3: Slice Vertically

Instead of building all the database, then all the API, then all the UI — build
one complete feature path at a time:

**Bad (horizontal slicing):**
```
Task 1: Build entire database schema
Task 2: Build all API endpoints
Task 3: Build all UI components
Task 4: Connect everything
```

**Good (vertical slicing):**
```
Task 1: User can create an account (schema + API + UI for registration)
Task 2: User can log in (auth schema + API + UI for login)
Task 3: User can create a task (task schema + API + UI for creation)
```

Each vertical slice delivers working, testable functionality.

### Step 4: Write Tasks

For every task, write:

```markdown
- [ ] Task: [Description]
  - Acceptance: [What must be true when done]
  - Verify: [How to confirm — test command, build, manual check]
  - Files: [Which files will be touched]
  - Depends on: [Other tasks, if any]
```

**Task sizing rules:**
- Completable in a single focused session (~30 minutes)
- Touches no more than ~5 files
- Has explicit acceptance criteria
- Includes a verification step
- Leaves the system in a working state

### Step 5: Save the Plan

Save to `tasks/plan.md` (the plan document) and `tasks/todo.md` (the task
list). Create `tasks/` if it does not exist.

## Rules

- **No code during planning.** Read-only mode until the plan is approved.
- **Vertical slices, not horizontal layers.** Each task delivers a complete
  feature path.
- **Order by dependency.** Build foundations before consumers.
- **One task = one commit.** Atomic, revertible.
- **Tasks are small.** If it feels too big, split it.
- **Every task has acceptance criteria.** "Done" must be definable.
- **Every task has a verification step.** How do we know it works?

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I know what to do, I'll just start" | If you can't write acceptance criteria, you don't know what "done" means |
| "These tasks are too small, it's overhead" | Small tasks are cheap to verify and easy to revert |
| "I'll figure out the order as I go" | You'll waste time on prerequisites. Map dependencies first. |
| "The spec already has the tasks" | Then validate them against these rules. Specs describe *what*; plans describe *how*. |

## Verification

Before proceeding to implementation:

- [ ] All tasks have acceptance criteria
- [ ] Tasks are ordered by dependency
- [ ] Each task is small enough for a single session
- [ ] Each task includes a verification step
- [ ] Plan is saved to `tasks/plan.md` and `tasks/todo.md`
