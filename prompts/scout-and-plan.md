---
description: Scout gathers context, planner creates implementation plan (no implementation)
---
Use the subagent tool with the chain parameter and `agentScope: "both"` (the agents are user-level) to execute this workflow:

1. First, use the "scout" agent to find all code relevant to: $@
2. Then, use the "planner" agent to create an implementation plan for "$@" using the context from the previous step (use {previous} placeholder). The scout findings in {previous} ARE the reconnaissance — the planner must not re-run the scout.

Both agents are bg (pane: false), so the chain awaits each one's real output and passes it forward via {previous}. Do NOT implement - just return the plan.
