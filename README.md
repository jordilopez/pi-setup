# pi-setup

Personal pi configuration: **skills**, **extensions**, and **subagents** shared
across all your pi instances. Install it once, keep it in one git repo, and sync
it to any machine.

## What's inside

```
pi-setup/
├── package.json          # pi package manifest (extensions, skills, prompts)
├── settings.example.json # recommended settings (provider/model/theme/packages)
├── extensions/
│   ├── subagent/         # subagent tool: delegate work to isolated pi processes
│   │   └── subagent.ts   #   the tool; index.ts entry + agents/types/format/runner support
│   ├── cdp/              # Chrome DevTools Protocol tools (cdp_connect, cdp_inspect, ...)
│   │   └── *.ts          #   one file per tool + shared connection.ts
│   └── redact/           # redacts sensitive data from `read` tool results
├── skills/
│   ├── commit-full/      # full commit workflow (logs, JSDoc, a11y, tests, commit)
│   │   └── SKILL.md
│   └── my-skill/         # template skill — copy it to add your own
│       └── SKILL.md
├── agents/               # subagent definitions (installed separately — see below)
│   ├── scout.md          # fast codebase recon
│   ├── planner.md        # implementation plans
│   ├── reviewer.md       # code review
│   └── worker.md         # general-purpose
├── prompts/              # workflow prompt templates for the subagent tool
│   ├── implement.md      # scout -> planner -> worker
│   ├── scout-and-plan.md
│   └── implement-and-review.md
└── scripts/
    └── setup.sh          # one-command install
```

## Install

```bash
./scripts/setup.sh
```

This does four things:

1. **Installs repo dependencies** (`npm install` in the repo root) so the
   `ws` import in the cdp extension resolves.
2. **Registers the repo as a pi package** (`pi install ./`) — loads
   `extensions/`, `skills/`, and `prompts/` into your user settings
   (`~/.pi/agent/settings.json`). Re-run to update.
3. **Symlinks `agents/*.md` into `~/.pi/agent/agents/`** — pi packages cannot
   ship subagent definitions, so agent files are linked separately. Existing
   non-symlink files are never overwritten.
4. **Installs the extra npm packages** from `settings.example.json`
   (`@juicesharp/rpiv-todo`, `@juicesharp/rpiv-advisor`, `pi-ask-user`, `pi-web-access`).

Restart pi (or run `/reload`) after installing.

### New machine bootstrap

1. Clone the repo and run `./scripts/setup.sh`.
2. Optionally apply the recommended settings:
   `cp settings.example.json ~/.pi/agent/settings.json`, then add your API keys
   to `~/.pi/agent/auth.json`.
3. Restart pi.

## Using subagents

Prompt the model to delegate work with the `subagent` tool. Each agent runs in
a separate `pi` process with an isolated context window, so it never pollutes
the main conversation.

Three modes:

- **Single** — one agent, one task
- **Parallel** — several agents at once (`tasks` array)
- **Chain** — sequential steps, output passed via the `{previous}` placeholder

Every call can also pass a `thinking` override (`off`..`max`) per call, task,
or step — it takes precedence over the agent's default for that invocation
only (unsupported levels per model are clamped by pi).

### Agent reference

#### `scout` — codebase recon

`deepseek-v4-flash` · thinking `off` · tools: `read, grep, find, ls, bash`

Explores the codebase and returns compressed, structured findings another
agent can use **without re-reading anything**. Use it before any change to
locate code, types, and architecture.

```
Use scout to map how authentication works: where sessions are created, validated, and revoked.
```

Parallel recon splits one question into several targeted scouts:

```
Run two scouts in parallel: one tracing the data model, one tracing the API routes.
```

Returns: `## Files Retrieved` (with line ranges), `## Key Code`, `## Architecture`, `## Start Here`.

#### `planner` — implementation plan

`deepseek-v4-flash` · thinking `high` · tools: `read, grep, find, ls` (read-only, never modifies)

Turns recon findings + requirements into a concrete, step-by-step plan. Use it
once you know *what* exists and need to decide *how* to change it.

```
Take the scout's findings and plan the implementation of refresh-token rotation.
```

Returns: `## Goal`, `## Plan` (numbered, small steps), `## Files to Modify`, `## New Files`, `## Risks`. The worker executes it verbatim.

#### `worker` — implementation

`deepseek-v4-flash` · thinking `off` · tools: full default set

Autonomous implementer. Use it to execute a plan or to do a self-contained
coding task. If a task is genuinely hard, bump thinking for that call only:

```
Use the worker with thinking max to implement the refactor carefully.
```

Returns: `## Completed`, `## Files Changed`, `## Notes` (plus handoff info
— files touched and key functions — when another agent will review).

#### `reviewer` — code review

`gpt-5.6-luna` · thinking `medium` · tools: `read, grep, find, ls, bash` (bash strictly read-only: `git diff/log/show`)

Senior code reviewer for quality, security, and maintainability. Use it as a
quality gate after implementation, before you look at the diff yourself.

```
Review the latest changes on this branch for bugs and security issues.
```

Returns: `## Files Reviewed`, `## Critical` (must fix), `## Warnings`,
`## Suggestions`, `## Summary` — with file paths and line numbers.

#### `docs` — documentation

`deepseek-v4-flash` · thinking `high` · tools: `read, grep, find, ls, bash`

Reads the repo and writes/updates markdown docs that match reality — it
never documents behavior it hasn't verified. Use it to write or refresh
READMEs, references, and guides (like this section).

```
Update the README's agent reference with usage examples for each agent.
```

Returns: `## Completed`, `## Files Changed`, `## Notes` — with the files it
touched and anything that may drift as code changes.

#### `tester` — unit & E2E tests

`deepseek-v4-flash` · thinking `high` · tools: full default set

Writes and runs tests for changed code (vitest, Playwright), iterating until
green and targeting >80% coverage. It never modifies production code — bugs
it finds are reported back for the worker to fix. Use it after implementation
and before review.

```
Write unit tests for the changed auth module, then run them until they pass.
```

Returns: `## Tests Added`, `## Coverage`, `## Notes` (bugs found, how to run).

### Workflow prompt templates

| Template | Flow |
|---|---|
| `/implement <query>` | scout → planner → worker |
| `/scout-and-plan <query>` | scout → planner |
| `/implement-and-review <query>` | worker → reviewer → worker (fix findings) |

```
/implement add Redis caching to the session store
/scout-and-plan refactor auth to support OAuth
/implement-and-review add input validation to the API
```

See [the subagent example docs](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent)
for full details on modes and streaming output.

## Adding your own stuff

### Skills

Copy `skills/my-skill/` to `skills/<your-skill>/` and edit `SKILL.md`.
Required frontmatter (see [pi docs: skills](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md)):

```markdown
---
name: my-skill            # lowercase a-z, 0-9, hyphens, max 64 chars
description: What this skill does and when to use it. Be specific.
---
```

### Subagents

Drop a markdown file into `agents/` with YAML frontmatter and a system prompt
body, then re-run `./scripts/setup.sh`:

```markdown
---
name: my-agent
description: What this agent does
tools: read, grep, find, ls
model: claude-haiku-4-5
---

System prompt for the agent.
```

Available fields: `name` (required), `description` (required), `tools`
(comma-separated), `model`, `thinking` (optional pi thinking level, `off`..`max`
— unsupported levels per model are clamped by pi). The `subagent` tool also
accepts a `thinking` override per call, task, or step — set it when a query
needs more reasoning than the agent default.

### Extensions

Every extension lives in a namespaced folder — the folder name is its package
name. Each folder has an `index.ts` entry point and **one file per registered
tool** (the file owns that tool's `registerTool` call). Shared helpers live in
separate support files. See
[pi docs: extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md).

```
extensions/<package-name>/
├── index.ts        # entry: default-export factory(pi), registers the tools
├── <tool>.ts       # one file per tool
├── <tool>.ts
└── support.ts      # shared helpers, never tool code
```

### Settings

`settings.example.json` holds the recommended defaults (provider `opencode`,
models, thinking level, theme, extra packages). On a fresh machine:

```bash
cp settings.example.json ~/.pi/agent/settings.json
```

Then add your API credentials to `~/.pi/agent/auth.json` (kept out of this repo —
never commit auth.json).

## Security note

- `auth.json` (API keys) and `redact.json` (personal-data patterns) stay in
  `~/.pi/agent/` and are **never** committed.
- The `redact` extension reads patterns from `~/.pi/agent/redact.json` at
  runtime, so it works anywhere without shipping your patterns.

## Notes

- The `subagent` extension and the agent/prompt files are derived from pi's
  [MIT-licensed example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/subagent/).
- This repo itself is MIT licensed — see [LICENSE](LICENSE).
- Keep this repo's settings/state out of git: extension sessions, logs, etc.
