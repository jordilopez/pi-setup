---
description: Interview about an idea and produce a structured spec (SPEC.md)
argument-hint: "<idea>"
agents: scout, planner
---
Execute this workflow with the subagent tool. This command interviews the user
about an idea, then produces a structured specification saved as `SPEC.md`.
Never write code during this workflow — spec only.

## Phase 1 — Reconnaissance

Use the subagent tool with the "scout" agent (`agentScope: "both"`, bg agent)
to check what already exists:

```
Task: "Check if the current project has a SPEC.md, README.md, or any
existing specification documents. Report what exists, what the project
does (if anything), and what tech stack is in use. Be brief."
```

On wake, note whether a spec already exists and what the project structure
looks like.

## Phase 2 — Interview (Interactive)

Interview the user **one question at a time** in the main conversation. Do NOT
dispatch this to an agent — it requires live interaction.

**Start with your hypothesis:**

```
HYPOTHESIS: <your best read of what the user wants, one sentence>
CONFIDENCE: <0-100%>
```

**Ask these questions in order** (skip if the scout already found the answer):

1. **What are you building?** — The core idea, refined from their input.
2. **For whom?** — Target user or use case.
3. **What does success look like?** — Concrete, testable outcomes.
4. **What is out of scope?** — Boundaries prevent scope creep.
5. **Any constraints?** — Tech stack, time, team, existing systems.

After each answer, update your hypothesis and confidence. Stop when you can
predict what the user would say to the next three questions.

## Phase 3 — Spec Generation

Use the subagent tool with the "planner" agent (`agentScope: "both"`, bg
agent) to generate the spec. Interpolate the finalized intent and all
interview context into the task:

```
Task: "Write a structured specification for the following project. Save it
as SPEC.md in the project root.

PROJECT INTENT:
<intent paragraph from the interview>

EXISTING CONTEXT:
<scout findings if any>

Cover these six areas:
1. Objective — what we're building and why, who is the user, success criteria
2. Tech Stack — framework, language, key dependencies
3. Commands — build, test, lint, dev (full commands)
4. Project Structure — directory layout with descriptions
5. Code Style — example snippet and key conventions
6. Testing Strategy — framework, test locations, coverage requirements
7. Boundaries — Always do / Ask first / Never do
8. Success Criteria — specific, testable conditions for done

Do NOT write code. This is a specification document only."
```

## Phase 4 — Approval

Present the spec to the user for review. Show the full SPEC.md content. Wait
for explicit approval before committing. If the user requests changes, revise
the spec and re-present.

After approval, commit SPEC.md:

```bash
git add SPEC.md
git commit -m "docs: add SPEC.md"
```

Report the file path and suggest the next command: `/plan`.

## Failure behavior

If the scout or planner fails, report the failure and partial output to the
user. Do not continue the chain. Do not generate a spec from incomplete context.
