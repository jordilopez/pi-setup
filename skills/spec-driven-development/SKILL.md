---
name: spec-driven-development
description: >-
  Creates specs before coding. Use when starting a new project, feature,
  or significant change and no specification exists yet. Use when drafting
  a PRD or requirements document with objectives and scope, or when
  requirements are unclear, ambiguous, or only exist as a vague idea.
---

# Spec-Driven Development

## Overview

Write a structured specification before writing any code. The spec is the shared
source of truth — it defines what we're building, why, and how we'll know it's
done. Code without a spec is guessing.

## When to Use

- Starting a new project or feature
- Requirements are ambiguous or incomplete
- The change touches multiple files or modules
- You're about to make an architectural decision
- The task would take more than 30 minutes to implement

**When NOT to use:** Single-line fixes, typo corrections, or changes where
requirements are unambiguous and self-contained.

## The Workflow

```
INTERVIEW ──→ SPECIFY ──→ APPROVE
     │            │           │
     ▼            ▼           ▼
  Clarify      Write       Human
  requirements  spec.md    reviews
```

### Step 1: Interview (Clarify Requirements)

Ask the human clarifying questions until requirements are concrete. One question
at a time. Surface assumptions immediately:

```
ASSUMPTIONS I'M MAKING:
1. This is a CLI tool (not a web app)
2. Python is the target language
3. No external dependencies preferred
→ Correct me now or I'll proceed with these.
```

Key questions to resolve:
- What are we building and why?
- Who is the user?
- What does success look like?
- What is out of scope?
- Any constraints? (tech stack, time, team)

### Step 2: Specify (Write the Spec)

Write a spec document covering these six core areas:

1. **Objective** — What are we building and why? Who is the user? What does
   success look like?

2. **Commands** — Full executable commands with flags:
   ```
   Build: npm run build
   Test: npm test -- --coverage
   Lint: npm run lint --fix
   Dev: npm run dev
   ```

3. **Project Structure** — Where source code lives, where tests go:
   ```
   src/           → Application source code
   src/components → UI components
   src/lib        → Shared utilities
   tests/         → Unit and integration tests
   ```

4. **Code Style** — One real code snippet showing the style. Include naming
   conventions and formatting rules.

5. **Testing Strategy** — What framework, where tests live, coverage expectations.

6. **Boundaries** — Three-tier system:
   - **Always do:** Run tests before commits, follow naming conventions
   - **Ask first:** Database schema changes, adding dependencies
   - **Never do:** Commit secrets, edit vendor directories, remove failing tests

**Spec template:**

```markdown
# Spec: [Project/Feature Name]

## Objective
[What we're building and why. Acceptance criteria.]

## Tech Stack
[Framework, language, key dependencies]

## Commands
[Build, test, lint, dev — full commands]

## Project Structure
[Directory layout with descriptions]

## Code Style
[Example snippet + key conventions]

## Testing Strategy
[Framework, test locations, coverage requirements]

## Boundaries
- Always: [...]
- Ask first: [...]
- Never: [...]

## Success Criteria
[Specific, testable conditions for "done"]
```

### Step 3: Approve

Present the spec to the human for review. Do not proceed to implementation
until the spec is approved. If the human requests changes, revise and
re-present.

Save the approved spec as `SPEC.md` in the project root.

## Rules

- **No code during spec phase.** The spec is documentation, not implementation.
- **Surface assumptions.** Never silently fill in ambiguous requirements.
- **Save the spec.** `SPEC.md` belongs in version control alongside the code.
- **Keep it alive.** Update the spec when decisions or scope change.
- **Two-line specs are fine** for simple tasks. The overhead matches the risk.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "This is simple, I don't need a spec" | Simple tasks don't need long specs, but they still need acceptance criteria |
| "I'll write the spec after I code it" | That's documentation, not specification. The value is forcing clarity before code |
| "The spec will slow us down" | A 15-minute spec prevents hours of rework |
| "Requirements will change anyway" | That's why the spec is a living document |
| "The user knows what they want" | Even clear requests have implicit assumptions |

## Verification

Before proceeding to implementation:

- [ ] Spec covers all six core areas
- [ ] Human has reviewed and approved the spec
- [ ] Success criteria are specific and testable
- [ ] Boundaries (Always/Ask First/Never) are defined
- [ ] Spec is saved as `SPEC.md` in the repository
