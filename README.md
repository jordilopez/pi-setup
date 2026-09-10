# pi-setup

Personal [pi](https://pi.dev) setup: reusable **skills** and **extensions**
shared across pi instances. The active Pi session does the work directly;
there are no bundled subagents or workflow prompts.

## What's inside

```
pi-setup/
├── extensions/
│   ├── cdp/              # Chrome DevTools Protocol tools
│   ├── git/              # branch, merge, and pull-request commands
│   ├── read-matching.ts  # enhanced read_matching tool
│   └── redact/           # redacts sensitive read results
├── skills/
│   ├── git-commit-planning/  # expensive-model commit planning workflow
│   ├── git-quick-commit/     # fast local commit workflow
│   ├── git-create-pr/        # PR preparation with test context
│   ├── frontend-tip/     # on-demand frontend tips and challenge templates
│   └── jsdoc-docs/       # documentation and JSDoc conventions
├── scripts/
│   ├── setup.sh          # one-command package installation
│   └── validate.ts       # dependency-free static validation
├── settings.example.json # recommended model settings
└── AGENTS.md             # repository conventions for coding assistants
```

## Prerequisites

| Requirement                       | Version / notes                                          |
| --------------------------------- | -------------------------------------------------------- |
| Node.js                           | **>= 22.19** (the CDP extension uses global `WebSocket`) |
| [pi coding agent](https://pi.dev) | recent install                                           |
| git                               | recent version                                           |
| Chrome                            | optional; needed for CDP browser tools                   |

## Models

The example settings use the `opencode-go` provider:

- `opencode-go/glm-5.3-flash` is the default high-quality model.
- `opencode-go/hy4-preview` is the inexpensive general-purpose alternative.

Switch models from Pi when a task benefits from a different balance of speed,
quality, or multimodal capability. Model selection is explicit rather than
hidden inside a workflow.

## Installation

For local development, run:

```bash
./scripts/setup.sh
```

The script registers this repository as a pi package. It is idempotent and can
be run again after pulling changes. Restart pi or run `/reload` after changing
extensions or skills.

To apply the recommended defaults on a new machine:

```bash
cp settings.example.json ~/.pi/agent/settings.json
```

Add API credentials to `~/.pi/agent/auth.json`; keep that file out of git.
The optional `redact` configuration lives at
`~/.pi/agent/redact.json` and is read at runtime.

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

Skills are loaded on demand by pi and provide procedural knowledge rather than
another execution layer:

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

## Development lifecycle

These skills cover the full path from idea to pull request, designed for use
with [`pi-agentic`](https://github.com/jordilopez/pi-agentic) workflows:

```
IDEA → SPEC → PLAN → BUILD (TDD) → REVIEW → COMMIT → PR
```

| Phase  | Skill                         | What it does                           |
| ------ | ----------------------------- | -------------------------------------- |
| Define | `spec-driven-development`     | Interview user, write structured spec  |
| Plan   | `planning-and-task-breakdown` | Decompose spec into ordered tasks      |
| Build  | `test-driven-development`     | Red-green-refactor TDD cycle           |
| Build  | `incremental-implementation`  | Thin vertical slices, commit per slice |
| Review | `code-review-and-quality`     | Five-axis code review                  |
| Commit | `git-commit-planning`         | Plan commit groups and validation      |
| Commit | `git-quick-commit`            | Fast local commits from staged changes |
| PR     | `git-create-pr`               | Prepare and create pull requests       |

The `create-skill` meta-skill extends this by generating new skills on demand.

## Pi philosophy

This setup intentionally keeps the active session in control. Skills hold
focused, reusable instructions; extensions hold tools and commands. There are
no role-based subagents or prompt-driven chains to install, configure, or
coordinate. This keeps model selection and approval points visible and avoids
duplicating the same workflow rules across prompts and agent definitions.

## Why no agents or workflow prompts

This is a deliberate decision based on Pi's principles and experience with this
setup. Pi is designed to keep the core minimal and let users shape their
workflow with focused extensions and skills rather than requiring a built-in
orchestration model.

We previously experimented with role-based agents and prompt-driven chains for
scouting, planning, implementation, review, testing, and PR preparation. In
practice, that added more moving parts than value for this workflow:

- **Model choice is a user decision.** Different steps often benefit from
  different models. A single workflow prompt cannot switch the active Pi model
  at the natural boundaries between reconnaissance, implementation, review, and
  visual analysis. The user can switch models explicitly when needed.
- **Prompts duplicated skills.** Workflow prompts repeated planning, review,
  testing, and implementation instructions instead of adding reusable
  knowledge. This created two sources of truth and made the setup harder to
  understand.
- **Agent chains add context-transfer overhead.** Each handoff needs a task
  description, a result summary, and sometimes a separate session or pane.
  That increases coordination and context overhead, while the practical token
  savings were uncertain and depended heavily on the task.
- **The workflow became harder to observe and steer.** Delegated tasks could
  obscure the reasoning boundary between steps and required extra setup for
  sessions, tmux, symlinks, and package discovery.
- **The active session already has the necessary tools.** It can inspect,
  edit, test, review, and use specialized skills directly without creating
  intermediary roles.

For this reason, the setup keeps only two reusable primitives:

- **Skills** for focused procedural knowledge, such as commit preparation,
  PR workflows, and frontend tips.
- **Extensions** for tools and commands, such as CDP browser access, Git
  operations, and read-result redaction.

This is not a claim that agentic chains are never useful. They can make sense
when tasks are genuinely independent, parallel, long-running, or require
strong isolation. For this personal setup, however, the added complexity and
uncertain token benefits do not justify them. Direct execution keeps the
context, model choice, and approval points visible to the user.

### When you need an agentic setup

If a task genuinely benefits from agent delegation and orchestration, use the
optional companion repository instead of extending this one:

- [`pi-agentic`](https://github.com/jordilopez/pi-agentic) — agent definitions, explicit workflows, and
  the optional `pi-graph` integration, installed through its own setup script.

That repository keeps the agentic layer opt-in and fully separated from this
base setup: installing it does not modify `pi-setup`, and skills in this
repository never delegate to agents. Workflows there are the only entry point
for orchestration, so the manual, model-switching workflow described above
remains the default here.

## Development checks

```bash
npm install             # install development-only TypeScript/lint tooling
npm run validate        # dependency-free checks; works without npm install
npm run typecheck       # strict TypeScript check
npm run lint            # ESLint
npm run format:check    # Prettier check
```

`npm run validate` checks extension syntax and relative imports, skill
frontmatter, the expected inventory, and local skill references. Markdown in
`skills/` is intentionally excluded from formatting because pi loads it as
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

## Security

Never commit `auth.json`, `redact.json`, model stores, sessions, trust files,
`.env` files containing secrets, or `node_modules/`. The redaction extension
reads personal patterns locally and does not ship them in this repository.

## Credits

The lifecycle skills in this repository were inspired by and adapted from:

- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) —
  Production-grade engineering skills for AI coding agents. The spec, planning,
  TDD, incremental implementation, and code review skills are adapted from
  this repository (Apache 2.0 licensed).
- [SantanderAI/ralph](https://github.com/SantanderAI/ralph) —
  Dependency-free AI coding loop with evidence-based validation. The `juez`
  (judge) pattern for incremental validation and the `stop.md` termination
  signal inspired the structured review approach.
- [jairorodriguezarias/siesta](https://github.com/jairorodriguezarias/siesta) —
  Autonomous development pipeline with knowledge base and self-improvement.
  The spec → plan → execute → review lifecycle and the consultant protocol
  for stuck situations informed the full pipeline design.
