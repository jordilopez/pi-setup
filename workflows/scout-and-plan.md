---
description: "[DEPRECATED] Use /spec + /plan instead. Scout gathers context, planner creates implementation plan"
argument-hint: "<task>"
agents: scout, planner
---
> **Deprecated.** This workflow is deprecated. Use `/spec` + `/plan` instead.
> The full lifecycle is more structured and produces a written spec.

Use the subagent tool with the chain parameter and `agentScope: "both"` (the agents are user-level) to execute this workflow:

1. First, use the "scout" agent to find all code relevant to: $@
2. Then, use the "planner" agent to create an implementation plan for "$@" using the context from the previous step (use {previous} placeholder). The scout findings in {previous} ARE the reconnaissance — the planner must not re-run the scout.

Both agents are bg (pane: false), so the chain awaits each one's real output and passes it forward via {previous}. Do NOT implement — just return the plan.

**Approval gate:** after the chain returns, present the plan to the user and ask how to proceed — approve and implement (e.g. via /implement), request changes, or stop. Never start implementation on your own.

If the user approves, the approved plan is the explicit handoff artifact for `/implement`: it carries the approved scope forward so `/implement` consumes it directly **without re-running the scout or planner**. Reconnaissance and planning are done here and must not be repeated downstream. Note that the plan lives in this conversation only — before invoking `/implement`, the user must either paste the plan text into the invocation or save it to a file and pass `--plan <path>`; offer to write the approved plan to a file only if the user asks. In the modular sequence, `/implement` then stops uncommitted after validation, and `/review-and-commit` performs the sole independent review and commit.

If either agent fails or returns an incomplete result, report the failure and the partial output to the user instead of continuing the chain.
