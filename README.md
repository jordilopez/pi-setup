# pi-setup

Unified Pi package for skills and extensions.

This repository is the single package for installing personal Pi resources.
Skills (engineering workflows) and runtime extensions (CDP, Git, redaction,
read-matching) live here and are discovered from the `pi` manifest in
`package.json`.

## Installation

Clone the repository and run the installer:

```bash
git clone https://github.com/jordilopez/pi-setup
cd pi-setup
npm run setup
```

The script can also be run directly (`./scripts/setup.sh`); the npm script is
just a convenience wrapper.

By default, the installer also installs the recommended subagent orchestrator
extension. See [Picking a subagent orchestrator](#picking-a-subagent-orchestrator)
for the choices.

## Picking a subagent orchestrator

`scripts/setup.sh` lets you pick which subagent orchestrator (if any) to
install alongside `pi-setup` and `pi-agent-skills`. On a TTY the script asks:

```text
Choose a subagent orchestrator to install:
  1) npm:@maxiaochao/pi-herdr-subagents
  2) npm:pi-subagents
  3) npm:@vanillagreen/pi-agents-tmux
  4) none
Choice [1]:
```

The choices are:

- `npm:@maxiaochao/pi-herdr-subagents` — recommended; uses Herdr as pane host.
- `npm:pi-subagents` — general-purpose; works in any terminal (optional Herdr bridge).
- `npm:@vanillagreen/pi-agents-tmux` — legacy; requires tmux 3.5+.
- `none` — skip the orchestrator install.

For non-interactive runs (CI, scripted installs, piped stdin), the default
is `herdr`. Pass `--backend=<name>` (or one of the env vars below) to choose
explicitly:

```bash
npm run setup -- --backend=herdr        # default — Herdr as pane host
npm run setup -- --backend=pi-subagents # general-purpose
npm run setup -- --backend=tmux         # legacy pi-agents-tmux
npm run setup -- --backend=none         # skip orchestrator install
npm run setup -- --non-interactive      # same as --backend=herdr without a prompt
```

`PI_SUBAGENTS_PACKAGE` overrides the install source directly (any string
accepted by `pi install`, e.g. `npm:foo@1.2.3`); `PI_SUBAGENTS_BACKEND` sets
the default for `--backend`.

Restart Pi or run `/reload` after installation.

## Usage

Skills work as direct prompts through Pi:

```text
/skill:git-commit-planning
/skill:git-create-pr
/skill:git-quick-commit
/skill:jsdoc-docs
/skill:frontend-tip
```

The Git extension registers two interactive commands and two tools:

- `/git:create-branch` — create a new branch from an existing trunk or the
  current branch.
- `/git:create-worktree` — create a worktree on a new branch in a sibling
  directory (or any path you choose), leaving the current checkout untouched.
- `git_create_pr` tool — push the current branch and create or update its
  GitHub PR; the user confirms title, body, and base before anything is pushed.
- `git_prune_merged_branches` tool — delete local branches already merged into
  `origin/<default>`, counting both git ancestry and merged PRs (so squash and
  rebase merges are caught). The user confirms the list before deletion; the
  current branch, trunk branches, and branches checked out in other worktrees
  are never touched. Pass `dryRun: true` to preview. Local branches only.

The legacy `/git:end-branch` command (merge a branch into master/main locally
and delete it) was removed. The `git-create-pr` skill covers the same workflow
via GitHub PRs: push the branch, create or update a PR, and merge on GitHub.

Extensions provide runtime tools (CDP, Git, redaction, read-matching).

### Additional skills (agent-skills port)

This package ships workflow skills specific to git and documentation.
Broader engineering workflow skills are available via
[`pi-agent-skills`](https://github.com/jordilopez/pi-agent-skills),
a Pi port of [@addyosmani's agent-skills](https://github.com/addyosmani/agent-skills)
(v0.6.9).

All 25 upstream skills are available as `/skill:<name>`:

```text
/skill:code-review-and-quality
/skill:spec-driven-development
/skill:test-driven-development
/skill:planning-and-task-breakdown
/skill:incremental-implementation
/skill:api-and-interface-design
/skill:frontend-ui-engineering
/skill:security-and-hardening
/skill:performance-optimization
/skill:code-simplification
/skill:debugging-and-error-recovery
/skill:doubt-driven-development
/skill:context-engineering
/skill:constraint-driven-development
/skill:deprecation-and-migration
/skill:documentation-and-adrs
/skill:observability-and-instrumentation
/skill:shipping-and-launch
/skill:source-driven-development
/skill:ci-cd-and-automation
/skill:browser-testing-with-devtools
/skill:idea-refine
/skill:interview-me
/skill:git-workflow-and-versioning
/skill:using-agent-skills
```

Plus nine prompt templates (`/build`, `/spec`, `/planning`, `/test`,
`/review`, `/constraints`, `/code-simplify`, `/ship`, `/webperf`)
and four specialist agent definitions
(code-reviewer, security-auditor, test-engineer, web-performance-auditor).

All included automatically via `setup.sh`.

### Picking between review-level skills

Two review skills read a diff with different intent. Pick the one whose
question matches the situation:

- `code-review-and-quality` (`pi-agent-skills`) — multi-axis review
  (correctness, readability, architecture, security, performance) before any
  merge.
- `code-simplification` (`pi-agent-skills`) — reduce complexity in working
  code while preserving exact behavior.

Use `code-review-and-quality` before any merge. Use `code-simplification`
after a feature works but the implementation feels heavier than it should.

## Removal

```bash
npm run setup:remove
```

Or directly: `./scripts/setup.sh --remove`.

`--remove` uninstalls `pi-setup` and `pi-agent-skills`. It does **not** remove
the subagent orchestrator — remove that one directly:

```bash
pi remove npm:@maxiaochao/pi-herdr-subagents   # herdr backend (default)
pi remove npm:pi-subagents                     # general-purpose backend
pi remove npm:@vanillagreen/pi-agents-tmux     # legacy tmux backend
```

## Development checks

```bash
npm install
npm run validate
npm run typecheck
npm run lint
npm run format:check
bash -n scripts/setup.sh
```

`npm run validate` works without `npm install`.

## Security

Installing the package set installs executable Pi extensions and gives agents
access to project files. Review the source before installing.

Never commit `auth.json`, `redact.json`, model stores, sessions, trust files,
`.env` files containing secrets, or `node_modules/`.
