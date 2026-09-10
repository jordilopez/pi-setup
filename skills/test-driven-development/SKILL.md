---
name: test-driven-development
description: >-
  Drives development with tests using red-green-refactor. Use when
  implementing any logic, fixing any bug, or changing any behavior.
  Use when you need to prove that code works, when a bug report arrives,
  or when you're about to modify existing functionality.
---

# Test-Driven Development

## Overview

Write a failing test before writing the code that makes it pass. For bug fixes,
reproduce the bug with a test before attempting a fix. Tests are proof — "seems
right" is not done. A codebase with good tests is an AI agent's superpower; a
codebase without tests is a liability.

## When to Use

- Implementing any new logic or behavior
- Fixing any bug (the Prove-It Pattern)
- Modifying existing functionality
- Adding edge case handling
- Any change that could break existing behavior

**When NOT to use:** Pure configuration changes, documentation updates, or
static content changes that have no behavioral impact.

## Discover the Stack First

The TDD cycle is universal; the commands are not. Before writing the first test,
discover how *this* repository tests, and use its commands for every RED, GREEN,
and verification step:

- **Language and build system** — `package.json`, `pom.xml`/`build.gradle`,
  `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`
- **Test framework and configuration** — and how to run a single focused test
  vs the full suite
- **Existing conventions** — where tests live, how files are named, what
  patterns neighboring tests follow
- **Documented commands** — README, CONTRIBUTING, and CI workflows show the
  commands that actually gate merges

Run the repository's focused-test command during the loop and its full-suite
command before completion. Never assume a default like `npm test` — a Gradle,
Cargo, or pytest project has its own equivalent.

## The TDD Cycle

```
    RED                GREEN              REFACTOR
 Write a test    Write minimal code    Clean up the
 that fails  ──→  to make it pass  ──→  implementation  ──→  (repeat)
      │                  │                    │
      ▼                  ▼                    ▼
   Test FAILS        Test PASSES         Tests still PASS
```

### Step 1: RED — Write a Failing Test

Write the test first. It must fail. A test that passes immediately proves
nothing.

```typescript
// RED: This test fails because createTask doesn't exist yet
describe('TaskService', () => {
  it('creates a task with title and default status', async () => {
    const task = await taskService.createTask({ title: 'Buy groceries' });

    expect(task.id).toBeDefined();
    expect(task.title).toBe('Buy groceries');
    expect(task.status).toBe('pending');
  });
});
```

### Step 2: GREEN — Make It Pass

Write the minimum code to make the test pass. Don't over-engineer:

```typescript
// GREEN: Minimal implementation
export async function createTask(input: { title: string }): Promise<Task> {
  const task = {
    id: generateId(),
    title: input.title,
    status: 'pending' as const,
    createdAt: new Date(),
  };
  await db.tasks.insert(task);
  return task;
}
```

### Step 3: REFACTOR — Clean Up

Improve the code while keeping tests green:

- Extract duplicated logic
- Improve naming
- Remove dead code
- Simplify conditionals

Run the full test suite after refactoring to confirm nothing broke.

### Step 4: Repeat

Each cycle should be small — a few minutes, not hours. If a cycle takes longer,
the task is too big. Split it.

## The Prove-It Pattern (for Bugs)

When a bug arrives, reproduce it before fixing:

1. Write a test that fails because of the bug
2. Confirm the test fails
3. Implement the fix
4. Confirm the test passes
5. Run the full suite for regressions

```typescript
// Prove the bug exists
it('does not crash on empty input', () => {
  expect(() => parseInput('')).not.toThrow();
});

// Now fix it
function parseInput(input: string): ParsedData {
  if (!input) return DEFAULT_PARSED; // the fix
  // ...
}
```

## Rules

- **Test must fail first.** A test that passes immediately proves nothing.
- **Minimal implementation.** Write the simplest code to pass the test.
- **Run the full suite before completion.** Catch regressions early.
- **One test cycle per increment.** Don't batch RED-GREEN-REFACTOR across
  multiple features.
- **Never skip RED.** "I'll add tests after" is technical debt, not TDD.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Tests are obvious, I'll add them after" | TDD is non-negotiable. Red-Green-Refactor. No exceptions. |
| "I know this works, no need for a test" | Untested code is not done. Prove it works. |
| "This function is too simple to test" | Simple functions have edge cases. Test them. |
| "I'll write tests later" | Later never comes. Write them now. |
| "The test framework is too slow" | Use focused test commands for the loop, full suite for verification. |

## Verification

Before declaring a task complete:

- [ ] Every new behavior has a test that failed first
- [ ] Every bug fix has a regression test
- [ ] All tests pass
- [ ] Full test suite passes (no regressions)
- [ ] Tests cover happy path, edge cases, and error paths
