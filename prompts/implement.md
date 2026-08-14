---
description: Full implementation workflow - scout gathers context, planner creates plan, worker implements
---
Execute this workflow with the subagent tool:

1. **Chain steps 1-2 (bg agents, real output passing):** use the subagent tool with the `chain` parameter and `agentScope: "both"` (the agents are user-level):
   1. First, use the "scout" agent to find all code relevant to: $@
   2. Then, use the "planner" agent to create an implementation plan for "$@" using the context from the previous step (use {previous} placeholder). The scout findings in {previous} ARE the reconnaissance — the planner must not re-run the scout.

   `scout` and `planner` are bg agents (pane: false), so the chain awaits each one's real output and passes it to the next via {previous}.

2. **Worker step (pane agent):** dispatch the "worker" agent to implement the plan from step 2 (use {previous} placeholder), again with `agentScope: "both"`. `worker` is a pane agent, so this step **queues** the task into the worker's visible tmux pane and the tool returns immediately with a "Queued task ... Task ID: ..." confirmation — the worker runs asynchronously in its pane.

3. **After the worker dispatch returns: END YOUR TURN.** Do not poll or call blocking waits. The worker's completion arrives as a follow-up message that wakes you; on wake, report what the worker implemented (use the wake payload / `get_subagent_result` on the saved taskId for the summary).
