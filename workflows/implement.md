---
description: "[DEPRECATED] Use /build instead. Plan approval, implementation, and validation - stops with changes uncommitted"
argument-hint: "<task> [--plan <path>]"
agents: scout, planner, worker
---
> **Deprecated.** This workflow is deprecated. Use `/build` for single tasks
> or `/spec` → `/plan` → `/build` for new features. `/build` commits per task
> and enforces TDD; this workflow stopped uncommitted and duplicated planning.

Execute this workflow with the subagent tool. This command covers planning →
approval → implementation → validation, and then **stops with the changes
uncommitted**: review and commit are handled by `/review-and-commit`, which
is the sole review/commit step of the modular sequence. Pass
`agentScope: "both"` on every dispatch (the agents are user-level). Never
commit, never push, never open a PR.

## Phase 1 — Plan (consume an approved plan if one exists)

**If the user supplied an already-approved plan** — either via `--plan <path>` in $@ (the unambiguous handoff mechanism) or pasted into the task text **with a recognizable marker such as `Approved plan:`** — treat it as the **authoritative handoff artifact**:

- If `--plan <path>` is given, **read the file first** (with the `read`
  tool) and use its full contents as the plan. Do not guess at the path.
- Do NOT run the scout or planner and do NOT re-run reconnaissance — go
  straight to Phase 2 with that plan. Reconnaissance and planning are
  already done; repeating them would contradict the approval the user
  already gave.
- **Prior approval suppresses reconnaissance and planning only.** It does
  not replace this run's approval gate: Phase 2 still requires a fresh,
  explicit execution approval before any worker is dispatched.

**Only if no approved plan exists**, use the subagent tool with the `chain`
parameter to build one:

1. Use the "scout" agent to find all code relevant to: $@
2. Then use the "planner" agent to create an implementation plan for "$@"
   using the context from the previous step (use {previous} placeholder). The
   scout findings in {previous} ARE the reconnaissance — the planner must not
   re-run the scout.

`scout` and `planner` are bg agents (pane: false), so the chain awaits each
one's real output and passes it to the next via {previous}.

## Phase 2 — Approval gate

Present the plan (the supplied approved plan or the freshly produced one) to
the user and wait for explicit approval. Do not dispatch the worker without
it — if the user declines, stop here.

If the user requests changes to the plan, re-run the "planner" agent (single
dispatch; it is a bg agent, so the tool awaits its real output) passing **both
the original plan AND the user's requested amendments** — interpolate both
into the dispatch's `task` string — then present the revised plan again.
**If the amended-plan planner dispatch fails or returns an incomplete result,
that is terminal for the current invocation**: stop and report the failure
(with the original plan and the requested amendments so nothing is lost); a
retry requires the user's explicit approval.

## Phase 3 — Implementation (worker, pane agent)

Dispatch the "worker" agent to implement the plan without committing. This is
a **standalone dispatch with no {previous} placeholder available** —
interpolate the approved plan **verbatim** (it is the source of truth) into
the dispatch's `task` string. The task must instruct the worker to:
implement exactly the approved scope, ask before any scope change, run the
concrete validation commands the plan or the repo implies (relevant tests,
typecheck, lint, format, or repo validation), and **never commit, push, or
open a PR**.

`worker` is a pane agent, so the dispatch **queues** the task into the
worker's visible tmux pane and returns immediately with a "Queued task ...
Task ID: ..." confirmation. **END YOUR TURN** after dispatching — do not poll
or call blocking waits. The worker's completion arrives as a follow-up
message that wakes you; on wake, collect the result via the wake payload or
`get_subagent_result` on the saved taskId.

## Phase 4 — Validation gate (stop on failure)

Require **concrete automated validation** from the worker's result: relevant
tests, typecheck, lint, format, or repo validation commands with real
pass/fail output — "looks fine" is not validation. Verify the worker actually
ran them (rerun the key commands yourself if the evidence is thin).

- If any validation failed, stop and report the failure and partial output to
  the user with the changes left uncommitted; re-dispatching the worker
  requires the user's go-ahead.

## Phase 5 — Handoff summary (stop uncommitted)

After validation passes, present a structured handoff summary to the user
containing exactly these sections:

- **Approved plan and scope** — what was approved and what was implemented
  (including anything intentionally left out).
- **Changed files** — the files touched, per the worker's "Files Changed"
  output and `git status --short`.
- **Validation commands and results** — the commands run and their outcomes.
- **Known limitations or unresolved issues** — anything the worker flagged or
  that was deferred.
- **Suggested next command: `/review-and-commit`** — the sole independent
  review and commit step; it inspects the actual diff and decides fixes and
  the commit plan with the user.

Then stop. Do not review, do not fix review findings, and do not commit here
— `/review-and-commit` owns review, approved fixes, revalidation, and the
local commit. All changes remain uncommitted at the end of this workflow.

**Plan artifact is conversational:** the plan as presented here lives in the
conversation. If the user wants a durable handoff artifact for a later
session, they must copy/save it to a file before invoking `/implement` with
`--plan <path>` (or paste the plan text into the invocation). Offer to write
the approved plan to a file only if the user asks for it.

## Failure behavior

If the scout/planner chain fails, the worker returns an incomplete result, or
validation fails, stop and report the failure and any partial output to the
user instead of continuing. Do not re-dispatch without asking, and never
chain past a failure.
