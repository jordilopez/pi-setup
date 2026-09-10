# pi-setup

Personal [pi](https://pi.dev) setup: reusable **skills**, **extensions**,
**agents**, and **workflows** shared across pi instances.

- **Skills** are focused procedural instructions for the active session.
- **Extensions** are tools and commands (CDP, git, redaction, `read_matching`).
- **Workflows** are the explicit entry point for agent delegation (`/command`).
- **Agents** are generic role definitions used by those workflows.

Skills never delegate to agents, and agents/workflows never call skills by
name. Nothing agentic runs unless you invoke a workflow.

## What's inside

```
pi-setup/
├── extensions/           # pi tools and commands
├── skills/               # on-demand procedural instructions
├── agents/               # generic role definitions
├── workflows/            # prompt templates exposed as /commands
├── scripts/
│   ├── setup.sh          # package install, orchestration, agent links
│   └── validate.ts       # dependency-free static validation
├── settings.example.json # recommended model settings
└── AGENTS.md             # repository conventions for coding assistants
```

## Prerequisites

| Requirement                       | Version / notes                                               |
| --------------------------------- | ------------------------------------------------------------- |
| Node.js                           | **>= 22.19** (the CDP extension uses global `WebSocket`)      |
| [pi coding agent](https://pi.dev) | recent install (`pi` on PATH)                                 |
| git                               | recent version                                                |
| tmux                              | **>= 3.5** for `pane: true` agents; bg agents work without it |
| Chrome                            | optional; needed for CDP browser tools                        |

## Installation

```bash
./scripts/setup.sh
```

The script is idempotent and safe to re-run after pulling changes. It:

1. Installs the orchestration package
   (`npm:@vanillagreen/pi-agents-tmux@3.0.0` by default; override with
   `PI_AGENTS_TMUX_PACKAGE`).
2. Registers this repository as a pi package, exposing extensions, skills, and
   `workflows/` as prompt templates (`/command`).
3. Symlinks each `agents/*.md` file into `~/.pi/agent/agents/`. Existing
   non-symlink files are never overwritten; stale links owned by this repo are
   removed.

Restart pi or run `/reload` after changing extensions, skills, or workflows.
Agents are discovered fresh on each subagent invocation.

To apply the recommended defaults on a new machine:

```bash
cp settings.example.json ~/.pi/agent/settings.json
```

Add API credentials to `~/.pi/agent/auth.json`; keep that file out of git.
The optional `redact` configuration lives at `~/.pi/agent/redact.json` and is
read at runtime.

### Configure tmux before using pane agents

`worker`, `docs`, and `tester` use `pane: true`, so Pi must be running inside
a tmux session for them to open visible persistent panes. `scout`, `planner`,
`reviewer`, and `commit-planner` use background sessions and do not require
tmux.

Add this to `~/.tmux.conf` — the setup script checks for it but never edits
your tmux configuration:

```tmux
set -g extended-keys on
set -g extended-keys-format csi-u
```

Start Pi from a tmux session, preferably from the project directory where the
work will happen. The tmux server inherits the environment of the shell that
starts it; if Pi or Node was installed through a version manager, start tmux
after that manager has initialized.

Useful commands inside Pi:

- `/agents` — browse project and user agents
- `/agents status` — inspect persistent pane state
- `/agents:attach <name>` — focus an agent pane
- `/agents:stop <name>` — stop a pane while preserving its session memory
- `/agents collect` — collect completed pane results

## Invoke a workflow

Workflows are prompt templates. Type `/` in the pi editor to see them.

| Situation                         | What to do                                               |
| --------------------------------- | -------------------------------------------------------- |
| Quick fix, one-liner, known scope | Direct prompt — no workflow needed                       |
| Feature with clear requirements   | `/build` (single task) → `/review-and-commit`            |
| Feature from a vague idea         | `/spec` → `/plan` → `/build auto` → `/review-and-commit` |
| Existing uncommitted changes      | `/review-and-commit`                                     |

### The three levels

**Level 1 — Direct prompt** (no workflow)

Just tell the agent what to do. This works for quick fixes, small changes,
and anything where requirements are unambiguous.

**Level 2 — Build + Review** (TDD and structured review)

```text
/build              → implement next task from tasks/todo.md with TDD
/build auto         → implement all tasks with TDD (one approval)
/review-and-commit  → review changes, apply fixes, commit locally
```

**Level 3 — Full lifecycle** (spec → plan → build → review)

```text
/spec <idea>        → interview user, produce SPEC.md
/plan               → break spec into ordered tasks
/build auto         → implement all tasks with TDD
/review-and-commit  → review, fix, commit
```

| Command              | What it does                                        |
| -------------------- | --------------------------------------------------- |
| `/spec <idea>`       | Interview user, produce `SPEC.md`                   |
| `/plan`              | Break spec into `tasks/plan.md` and `tasks/todo.md` |
| `/build`             | Implement next task with TDD, then stop             |
| `/build auto`        | Implement all tasks with TDD (one approval)         |
| `/review-and-commit` | Review changes, apply fixes, commit locally         |

Deprecated but still present: `/implement` (use `/build`) and `/scout-and-plan`
(use `/spec` + `/plan`).

### How agents are linked

Each `agents/<name>.md` is symlinked into `~/.pi/agent/agents/<name>.md`. The
orchestration package discovers them (user scope) on every subagent call.
Edits in this repo take effect immediately — the link points at the source
file.

### Customizing agents per project

The agents here are generic role definitions. For per-project behavior, create
a project-scope agent in `<project>/.pi/agents/` (or `.claude/agents/`) using
the same frontmatter format.

With `agentScope: "both"`, duplicate names resolve as: user Claude → user Pi →
project Claude → project Pi. A project-local file with the same name does not
automatically override a global Pi agent. Safer patterns:

1. Give the project-specific role a distinct name.
2. Use a project-local workflow with `agentScope: "project"`.
3. If replacing a global role, remove or rename the global symlink first and
   verify with `/agents`.

## Remove

```bash
./scripts/setup.sh --remove
```

Removes agent symlinks owned by this repository and uninstalls the package
registrations. It never touches unrelated agents, packages, or settings
entries.

## Models

The example settings use the `opencode-go` provider:

- `opencode-go/glm-5.3-flash` is the default high-quality model.
- `opencode-go/hy4-preview` is the inexpensive general-purpose alternative.

Agent models live in frontmatter (`model:` + `model-reasoning-effort:`). Most
roles use `opencode-go/glm-5.3-flash`; planning and review roles (`planner`,
`reviewer`, `commit-planner`) use `opencode-go/gpt-5.6-luna`. Workflows never
switch the active parent session's model.

## Extensions

| Extension          | What it provides                                                                      |
| ------------------ | ------------------------------------------------------------------------------------- |
| `cdp/`             | Browser navigation, DOM queries, JavaScript evaluation, screenshots, and console logs |
| `git/`             | `/git:create-branch`, `/git:end-branch`, and `/git:create-pr`                         |
| `redact/`          | Event-based redaction of `read` results using local patterns                          |
| `read-matching.ts` | `read_matching` with context, regex, whole-word, and match limits                     |

Start Chrome with remote debugging enabled before using CDP tools:

```bash
/path/to/Google\ Chrome --remote-debugging-port=9222
```

## Skills

Skills are loaded on demand by pi and provide procedural knowledge for the
active session:

| Skill                         | What it does                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `spec-driven-development`     | Writes structured specs before coding; interviews user, produces `SPEC.md`                      |
| `planning-and-task-breakdown` | Decomposes work into ordered tasks with acceptance criteria and dependency ordering             |
| `test-driven-development`     | Drives development with red-green-refactor TDD cycle; proves code works                         |
| `incremental-implementation`  | Delivers changes in thin, verifiable vertical slices with commits per slice                     |
| `code-review-and-quality`     | Five-axis review (correctness, readability, architecture, security, performance)                |
| `create-skill`                | Meta-skill: interviews user and generates new `SKILL.md` files with valid frontmatter           |
| `git-commit-planning`         | Plans commit groups, cleanup, tests, validation, and safe local execution; never changes files  |
| `git-quick-commit`            | Creates local commits from staged changes without cleanup or tests                              |
| `git-create-pr`               | Maps relevant tests, prepares a PR description, and invokes `/git:create-pr` after confirmation |
| `frontend-tip`                | Generates one frontend tip on request and can scaffold an optional practice project directly    |
| `jsdoc-docs`                  | Adds JSDoc and maintains inline documentation and READMEs without changing behavior             |

The lifecycle skills cover the same path as the workflows, for use in the
active session without delegation:

```
IDEA → SPEC → PLAN → BUILD (TDD) → REVIEW → COMMIT → PR
```

## Compatibility

Verified integration contracts for this package. Re-verify before changing
setup or frontmatter conventions.

### Pi

Packages are managed with `pi install` / `pi remove` / `pi list`, writing to
`~/.pi/agent/settings.json` by default. A package is any directory with a `pi`
manifest in `package.json` (keyword `pi-package`). Manifest resource types:
`extensions`, `skills`, `prompts`, `themes`. Paths are relative to the package
root; arrays support globs. Agents are **not** a manifest type.

### Orchestration package

The live orchestration extension is **`@vanillagreen/pi-agents-tmux`**, pinned
to **3.0.0** by `scripts/setup.sh`. It exposes `subagent`, `delegate_subagent`,
`steer_subagent`, `get_subagent_result`, `wait_for_subagent_idle`, and
`stop_subagent`. It is never a `package.json` dependency.

### Agent discovery

- User scope: `~/.pi/agent/agents/*.md` (plus `~/.claude/agents`). This is the
  symlink target used by setup.
- Project scope: nearest `<project>/.pi/agents` plus `<project>/.claude/agents`.
- Agents are discovered fresh on each subagent invocation — no pi reload needed
  after linking.
- Frontmatter fields in current use: `name`, `description`, `model`,
  `model-reasoning-effort`, `pane`, `deny-tools`, `allowed-subagents`.

### Workflow format

Workflows are pi prompt templates: Markdown files with optional frontmatter
(`description`, `argument-hint`), invoked explicitly as `/name`. Discovery in
a prompts directory is non-recursive. This repository uses `workflows/`
through `"pi": { "prompts": ["./workflows"] }`. An `agents:` frontmatter key
is local metadata (ignored by pi) so validation can check references. Prompt
templates are picked up on pi restart / `/reload`.

## Development checks

```bash
npm install             # install development-only TypeScript/lint tooling
npm run validate        # dependency-free checks; works without npm install
npm run typecheck       # strict TypeScript check
npm run lint            # ESLint
npm run format:check    # Prettier check
bash -n scripts/setup.sh
```

`npm run validate` checks extension syntax and relative imports, skill
frontmatter, agent and workflow metadata, the expected inventory, local skill
references, and the setup-only orchestration boundary. Markdown in `skills/`,
`agents/`, and `workflows/` is excluded from formatting because pi loads it as
verbatim instructions.

## Adding content

### Skill

Create `skills/<name>/SKILL.md` with this frontmatter:

```markdown
---
name: your-skill
description: Explain what the skill does and when pi should use it.
---
```

The name must be lowercase letters, numbers, and hyphens, and must match the
skill directory name.

### Extension

Use a namespaced directory with an `index.ts` entry point, or a loose single
file for a small extension:

```
extensions/<package-name>/
├── index.ts
├── <command>.ts
└── common.ts
```

The entry point exports a default factory that receives `ExtensionAPI` and
registers tools or commands. Runtime extensions in this repository have no
npm dependencies; pi API packages remain development/peer dependencies for
type checking.

### Agent

Create `agents/<name>.md` with `name`, `description`, `model`,
`model-reasoning-effort`, and `pane` frontmatter. Keep the role generic.
Re-run `./scripts/setup.sh` to link it.

### Workflow

Create `workflows/<name>.md` with `description` and an `agents:` metadata
line listing the roles it uses. After `/reload` it appears as `/name`.

## Security

Never commit `auth.json`, `redact.json`, model stores, sessions, trust files,
`.env` files containing secrets, or `node_modules/`. The redaction extension
reads personal patterns locally and does not ship them in this repository.

Installing the orchestration package means installing an extension with full
system access, and workflows instruct the model to dispatch subagents that can
read (and, for pane agents, write) your files. Review the package source and
the agent definitions before installing.

## Credits

The lifecycle skills and workflow design in this repository were inspired by
and adapted from:

- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) —
  Production-grade engineering skills for AI coding agents. The spec, planning,
  TDD, incremental implementation, and code review skills, plus the `/spec`,
  `/plan`, `/build` workflow pattern, are adapted from this repository
  (Apache 2.0 licensed).
- [SantanderAI/ralph](https://github.com/SantanderAI/ralph) —
  Dependency-free AI coding loop with evidence-based validation. The `juez`
  (judge) pattern and loop-based stop signals informed `/build auto`.
- [jairorodriguezarias/siesta](https://github.com/jairorodriguezarias/siesta) —
  Autonomous development pipeline with knowledge base and self-improvement.
  The spec → plan → execute → review lifecycle informed the modular workflow
  sequence.
