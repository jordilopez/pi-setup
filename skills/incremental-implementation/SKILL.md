---
name: incremental-implementation
description: >-
  Delivers changes in thin, verifiable slices. Use when implementing any
  multi-file change, building a new feature from a task breakdown, or when
  you're about to write more than ~100 lines before testing.
---

# Incremental Implementation

## Overview

Build in thin vertical slices — implement one piece, test it, verify it, then
expand. Avoid implementing an entire feature in one pass. Each increment should
leave the system in a working, testable state.

## When to Use

- Implementing any multi-file change
- Building a new feature from a task breakdown
- Refactoring existing code
- Any time you're tempted to write more than ~100 lines before testing

**When NOT to use:** Single-file, single-function changes where the scope is
already minimal.

## The Increment Cycle

```
┌──────────────────────────────────────┐
│                                      │
│   Implement ──→ Test ──→ Verify ──┐  │
│       ▲                           │  │
│       └───── Commit ◄─────────────┘  │
│              │                       │
│              ▼                       │
│          Next slice                  │
│                                      │
└──────────────────────────────────────┘
```

For each slice:

1. **Implement** the smallest complete piece of functionality
2. **Test** — run the test suite (or write a test if none exists)
3. **Verify** — confirm the slice works as expected
4. **Commit** — save your progress with a descriptive message
5. **Move to the next slice** — carry forward, don't restart

## Slicing Strategies

### Vertical Slices (Preferred)

Build one complete path through the stack:

```
Slice 1: Create a task (DB + API + basic UI)
    → Tests pass, user can create a task

Slice 2: List tasks (query + API + UI)
    → Tests pass, user can see their tasks

Slice 3: Edit a task (update + API + UI)
    → Tests pass, user can modify a task

Slice 4: Delete a task (delete + API + UI + confirmation)
    → Tests pass, full CRUD complete
```

Each slice delivers working end-to-end functionality.

### Risk-First Slicing

Tackle the riskiest or most uncertain piece first:

```
Slice 1: Core algorithm (the hard part)
    → Tests pass, algorithm works in isolation

Slice 2: Integration with existing code
    → Tests pass, algorithm works in context

Slice 3: UI and polish
    → Tests pass, full feature complete
```

## Rules

- **Each increment leaves the system working.** Never break the build.
- **Commit per slice.** Atomic, revertible save points.
- **Test every slice.** No untested code ships.
- **Small slices.** If a slice takes more than ~30 minutes, split it.
- **Don't restart.** Carry context forward between slices.
- **Stage only what changed.** Never `git add -A` blindly.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll implement everything then test" | You'll have no idea what broke. Test as you go. |
| "These slices are too small, it's overhead" | Small slices are cheap to verify and easy to revert |
| "I know this all works together" | You don't until you test it. Prove it. |
| "I'll commit at the end" | If something breaks, you need to know which slice caused it. |

## Verification

Before declaring a task complete:

- [ ] Every slice was tested before moving to the next
- [ ] Each slice got its own commit
- [ ] The system was never in a broken state
- [ ] The full test suite passes
- [ ] The build succeeds
