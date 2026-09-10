---
name: create-skill
description: >-
  Creates new pi skills by interviewing the user about what they need,
  then generating a valid SKILL.md with proper frontmatter, workflow,
  and examples. Use when the user wants to create a new skill, automate
  a recurring workflow, or codify a methodology.
---

# Create Skill

## Overview

Generate new pi skills by interviewing the user about what they need, then
producing a valid `SKILL.md` with proper frontmatter, clear workflow, and
concrete examples. This is a meta-skill — it creates other skills.

## When to Use

- User wants to create a new skill
- User wants to automate a recurring workflow
- User wants to codify a methodology or pattern
- User says "I keep doing X, let's make it a skill"

**When NOT to use:** When the user wants to run an existing skill. When the
request is a one-off task, not a reusable process.

## The Interview

Ask one question at a time. Wait for each answer before asking the next.

### Question 1: What problem does this skill solve?

```
Q: What problem will this skill solve?
GUESS: <your hypothesis based on what the user mentioned>
```

Listen for:
- The core pain point
- How often it happens
- What goes wrong without it

### Question 2: When should it activate?

```
Q: When should this skill be used? What triggers it?
GUESS: <your hypothesis>
```

Listen for:
- Explicit triggers ("when I say /foo")
- Implicit triggers ("when the code has no tests")
- Anti-triggers ("NOT for simple changes")

### Question 3: What's the workflow?

```
Q: What steps should this skill follow?
GUESS: <your hypothesis>
```

Listen for:
- Ordered steps
- Decision points
- Validation checkpoints

### Question 4: What rules apply?

```
Q: What hard rules or constraints should this skill enforce?
GUESS: <your hypothesis>
```

Listen for:
- Never-do's
- Always-do's
- Guardrails

### Question 5: What's the output?

```
Q: What should this skill produce?
GUESS: <your hypothesis>
```

Listen for:
- Files to create/modify
- Reports to generate
- State to update

### Question 6: Any examples?

```
Q: Can you give me a concrete example of this skill in action?
GUESS: <your hypothesis>
```

Listen for:
- Before/after scenarios
- Expected behavior
- Edge cases

## Generate the Skill

After the interview, produce a `SKILL.md` with this structure:

```markdown
---
name: <kebab-case-name>
description: >-
  <One-line description with activation triggers. Include "Use when..."
  to make activation explicit.>
---

# <Skill Title>

## Overview
<2-3 sentences: what this does and why>

## When to Use
- <trigger condition 1>
- <trigger condition 2>

**When NOT to use:**
- <anti-condition 1>

## The Workflow

### Step 1: <First step>
<What happens>

### Step 2: <Second step>
<What happens>

## Rules
- <hard constraint 1>
- <hard constraint 2>

## Examples

### Example 1: <Scenario>
<Concrete before/after or usage pattern>

## Verification
- [ ] <Check 1>
- [ ] <Check 2>
```

## Validate the Generated Skill

Before saving, verify:

1. **Name is kebab-case** — matches the directory name
2. **Description includes triggers** — "Use when..." is present
3. **No runtime behavior** — this is instructions, not code
4. **Markdown is well-structured** — has H1, sections, clear flow
5. **No duplicates** — check existing skills first

Save to `skills/<name>/SKILL.md`.

## Rules

- **One concern per skill.** If the skill does two things, make two skills.
- **Interview before generating.** Don't guess what the user needs.
- **Validate before saving.** Check frontmatter, structure, no duplicates.
- **Keep it concise.** A skill is a reference, not a novel.
- **No runtime behavior.** Skills are instructions, not code.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I know what they need, skip the interview" | You don't. Ask. |
| "This skill can do multiple things" | One concern per skill. Split it. |
| "I'll just write it quickly" | Quick skills have vague descriptions and no activation triggers. |
| "It's too small to be a skill" | If it's reusable, it's a skill. Small is fine. |

## Verification

Before declaring the skill complete:

- [ ] Interview completed (all questions answered)
- [ ] Existing skills checked for duplicates
- [ ] SKILL.md has valid frontmatter (name, description)
- [ ] Name matches directory name
- [ ] Description includes activation triggers
- [ ] Workflow has clear, ordered steps
- [ ] Rules are explicit and enforceable
- [ ] At least one concrete example
- [ ] No runtime behavior (instructions only)
- [ ] `npm run validate` passes
