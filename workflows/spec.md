---
description: Interview about an idea and produce a structured spec (SPEC.md)
argument-hint: "<idea>"
agents: scout, planner
---
Execute this workflow with the subagent tool. It interviews the user about an
idea, then produces `SPEC.md`. Never write implementation code during this
workflow.

## Phase 1: Reconnaissance

Dispatch the `scout` agent (`agentScope: "both"`, background mode) to check for
existing `SPEC.md`, `README.md`, and other specification documents. Ask it to
report what exists, what the project does, and its technology stack.

## Phase 2: Interview

Conduct the interview in the main session, one question at a time. Do not
delegate this interaction. Start by restating the user's original idea verbatim:

```
ORIGINAL REQUEST: <the user's exact prompt/idea, quoted verbatim>
```

Then state your interpretation:

```
HYPOTHESIS: <best current interpretation of the request>
CONFIDENCE: <0-100%>
```

Ask, skipping questions already answered by reconnaissance. Before each
question, briefly reference the part of the original request it clarifies:

1. What are you building and why?
2. Who is the target user?
3. What does success look like?
4. What is out of scope?
5. What constraints apply?

Update the hypothesis and confidence after each answer. After every answer,
check: does this change my reading of the original request? If the user
contradicts their own original wording, flag it explicitly. Stop when the
intent is specific enough to write testable success criteria.

## Phase 3: Spec generation

Dispatch the `planner` agent (`agentScope: "both"`, background mode) with the
finalized intent, interview answers, and scout findings. Include the original
request verbatim so the planner can validate the spec against the user's actual
words. Tell the planner to invoke `/skill:spec-driven-development` and follow it
as the canonical specification procedure.

The planner must return exactly one labeled fenced block for the artifact:

````markdown
```text:path=SPEC.md
<complete specification>
```
````

It must cover the skill's required objective, stack, commands, structure, style,
testing strategy, boundaries, and success criteria. It must not write files
directly. If the block is missing or duplicated, stop and report the incomplete
planner result.

After the planner returns, the parent session writes `SPEC.md` from the
validated block and reads it back before presenting it for approval.

## Phase 4: Approval

Present the complete `SPEC.md` to the user. Wait for explicit approval. If the
user requests changes, re-dispatch the planner with the original context and
amendments, then present the revised spec.

After approval, commit only `SPEC.md`:

```bash
git add SPEC.md
git commit -m "docs: add SPEC.md"
```

Report the path and suggest `/plan` as the next command.

## Failure behavior

If the scout or planner fails or returns incomplete output, report the failure
and partial output. Do not continue or generate a spec from incomplete context.
