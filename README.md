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
./scripts/setup.sh
```

The installer installs:

1. `@vanillagreen/pi-agents-tmux@3.0.0` — subagent orchestration extension
2. `pi-setup` — skills and extensions

Restart Pi or run `/reload` after installation.

### tmux

Some agents use visible tmux panes. Start Pi inside tmux when using those
agents. The installer warns when tmux is missing or too old.

Recommended `~/.tmux.conf` settings:

```tmux
set -g extended-keys on
set -g extended-keys-format csi-u
```

Start a fresh tmux server after changing those settings.

## Usage

Skills work as direct prompts through Pi:

```text
/skill:git-commit-planning
/skill:git-create-pr
/skill:git-quick-commit
/skill:jsdoc-docs
/skill:frontend-tip
```

The Git extension registers one interactive command:

- `/git:create-branch` — create a new branch from an existing trunk or the
  current branch.

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

Install alongside `pi-setup` to make the full skill set available.

## Removal

```bash
./scripts/setup.sh --remove
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
