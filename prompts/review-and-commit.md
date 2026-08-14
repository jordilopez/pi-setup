---
description: Run the reviewer agent on the current changes (across all repos with edits), present the findings, apply approved fixes, then commit everything with commit-full
---
Execute this workflow — one repo at a time, but reviewers run in parallel:

1. **Find all repos with changes.** Run `git status --short` in the current working directory. Also check the pi-setup repo (`${PI_MY_SETUP:-$HOME/development/pi-setup}`) and any sibling checkouts the user mentions (e.g. other repos with edits). Produce the complete list of `{repo root, changed files}` pairs. Ignore files the repos are configured to never commit (`.env`, `auth.json`, …).

2. **Review each repo with the `reviewer` agent — in parallel.** The reviewer is a bg agent (`pane: false`), so the subagent tool awaits its real output. Dispatch one task per repo with `agentScope: "both"` (the agents are user-level):

   - `cwd`: the repo root
   - task: "Review the current uncommitted changes in <repo root>. Changed files: <exact file list>. This file list is the source of truth — do not re-run git reconnaissance beyond confirming the diff. Return your standard severity-ranked findings (critical / warnings / suggestions)."

3. **Present the findings.** Show each repo's review summary to the user. Ask whether to apply the critical/warning fixes before committing (options: apply critical+warnings / critical only / none — commit as-is). The reviewer is read-only — you apply any approved fixes yourself.

4. **Commit per repo with `commit-full`.** For each repo with changes, read and follow `${PI_MY_SETUP:-$HOME/development/pi-setup}/skills/commit-full/SKILL.md`: analyze + group the diff (split analysis!), present the grouping plan via ask_user, hunk-by-hunk review, cleanup, tests, then commit. Treat each repo as its own commit cycle — the skill's steps 4–10 run once per group. Expect interactive review steps; do not skip them.
