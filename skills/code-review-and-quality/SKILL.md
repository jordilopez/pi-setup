---
name: code-review-and-quality
description: >-
  Multi-axis code review with quality gates. Use before merging any change.
  Use when reviewing code written by yourself, another agent, or a human.
  Covers correctness, readability, architecture, security, and performance.
---

# Code Review and Quality

## Overview

Multi-dimensional code review with quality gates. Every change gets reviewed
before merge — no exceptions. Review covers five axes: correctness, readability,
architecture, security, and performance.

**The approval standard:** Approve a change when it definitely improves overall
code health, even if it isn't perfect. Perfect code doesn't exist — the goal is
continuous improvement. Don't block a change because it isn't exactly how you
would have written it.

## When to Use

- Before merging any PR or change
- After completing a feature implementation
- When another agent or model produced code you need to evaluate
- When refactoring existing code
- After any bug fix (review both the fix and the regression test)

## The Five-Axis Review

### 1. Correctness

Does the code do what it claims to do?

- Does it match the spec or task requirements?
- Are edge cases handled (null, empty, boundary values)?
- Are error paths handled (not just the happy path)?
- Does it pass all tests? Are the tests actually testing the right things?
- Are there off-by-one errors, race conditions, or state inconsistencies?

### 2. Readability & Simplicity

Can another engineer understand this code without the author explaining?

- Are names descriptive and consistent with project conventions?
- Is the control flow straightforward?
- Is the code organized logically?
- Are there any "clever" tricks that should be simplified?
- Could this be done in fewer lines?
- Are abstractions earning their complexity?

### 3. Architecture

Does the change fit the system's design?

- Does it follow existing patterns or introduce a new one? If new, is it justified?
- Does it maintain clean module boundaries?
- Is there code duplication that should be shared?
- Are dependencies flowing in the right direction (no circular dependencies)?
- Is the abstraction level appropriate?

### 4. Security

Does the change introduce vulnerabilities?

- Is user input validated and sanitized?
- Are secrets kept out of code, logs, and version control?
- Is authentication/authorization checked where needed?
- Are SQL queries parameterized (no string concatenation)?
- Are outputs encoded to prevent XSS?
- Are dependencies from trusted sources?

### 5. Performance

Does the change introduce performance problems?

- Are there N+1 queries?
- Are expensive computations cached?
- Are large data structures paginated?
- Are there memory leaks (event listeners, timers, closures)?
- Is lazy loading used where appropriate?

## Output Format

```markdown
## Critical
1. `path/file.ts:42` — description of the bug + suggested fix

## Warnings
1. ...

## Suggestions
1. ...

## Looks Good
- ...
```

## Rules

- **Specific and actionable.** "This is bad" is not feedback. "This has an
  off-by-one on line 42" is.
- **Severity ranking.** Critical = must fix. Warning = should fix. Suggestion =
  nice to have.
- **Acknowledge good work.** Review isn't just criticism.
- **Five-axis minimum.** Check all five dimensions, even if most are clean.

## Verification

Before approving a change:

- [ ] All five axes reviewed
- [ ] Critical findings addressed
- [ ] Tests pass
- [ ] No regressions introduced
