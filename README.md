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
│   ├── cdp/              # Chrome DevTools Protocol tools (cdp_connect, cdp_goto, ...)
│   │   └── index.ts      #   single-file extension (connect + first-tab auto-connect)
│   ├── git/              # git commands (/git:create-branch, /git:end-branch, /git:create-pr)
│   ├── read-matching.ts  # enhanced read_matching (wholeWord, rg/grep, 50KB truncation)
│   └── redact/           # redacts sensitive data from `read` tool results
├── skills/
│   ├── commit-full/      # full commit workflow (cleanup, JSDoc, a11y, tests, commit)
│   ├── commit-quick/     # analyze staged changes and commit — no cleanup/tests
│   ├── jsdoc-docs/       # JSDoc + README conventions (never changes runtime behavior)
│   ├── frontend-tip/     # on-demand frontend dev tips + practice-challenge scaffolding
│   │   └── templates/    #   starter templates for the scaffold agent (9 frameworks)
│   └── my-skill/         # template skill — copy it to add your own
├── agents/               # subagent definitions (installed separately — see below)
│   ├── scout.md          # fast codebase recon (bg)
│   ├── planner.md        # implementation plans (bg)
│   ├── reviewer.md       # code review (bg)
│   ├── worker.md         # general-purpose (pane)
│   ├── docs.md           # documentation / JSDoc (pane)
│   ├── tester.md         # unit & E2E tests (pane)
│   └── scaffold.md       # practice-challenge project scaffolding (bg)
├── prompts/              # workflow prompt templates for the subagent tool
│   ├── implement.md      # scout -> planner -> worker
│   ├── scout-and-plan.md
│   ├── implement-and-review.md
│   └── review-and-commit.md
└── scripts/
    ├── setup.sh          # one-command install
    └── validate.ts       # static validation (npm run validate)
```

## Prerequisites

| Requirement | Version / notes |
|---|---|
| Node.js | **>= 22.19** (global `WebSocket` for the cdp extension) |
| [pi](https://github.com/earendil-works/pi) | any recent install (Node >= 22.19) |
| git | any recent version |
| tmux | **>= 3.5** (needed for `extended-keys` and pane agents — see below) |
| Model provider | an `opencode-go` provider key (see `settings.example.json`) |
| Chrome | optional — only for the cdp extension (`--remote-debugging-port=9222`) |

## Running pi inside tmux

Pane agents (`pane: true`) run in visible persistent tmux panes, so pi itself
must run inside tmux for them to work.

Minimal `~/.tmux.conf` — create the file if it doesn't exist, then restart
tmux fully (`tmux kill-server` and relaunch pi) for the options to take
effect:

```tmux
# ── pi coding agent ────────────────────────────────────────────────────
# extended-keys: without these, tmux strips modifier info from Shift+Enter /
# Ctrl+Enter / Alt+Enter and they collapse to plain Enter (submitting the
# prompt instead of inserting a newline). `csi-u` is the most reliable format
# and requires tmux >= 3.5; on 3.2–3.4 omit the extended-keys-format line
# (tmux then uses the xterm format, which pi also supports).
set -g extended-keys on
set -g extended-keys-format csi-u

# mouse on: forwards mouse-wheel / trackpad events to pi so fullscreen TUI
# mode can scroll the transcript under the pointer; also enables
# click-to-select panes and scrollback scrolling in other apps.
set -g mouse on
```

Extended keys need a terminal that supports them: Ghostty, Kitty, iTerm2,
WezTerm, or Windows Terminal (not Apple Terminal). `Ctrl+J` is a raw-byte
newline alias that always works inside tmux, even without this config.

Optional `pi()` zsh wrapper that starts the tmux session on demand:

```zsh
# ~/.zshrc
pi() {
  if [[ -z "$TMUX" ]]; then
    tmux new-session -A -s main "pi $*"
  else
    command pi "$@"
  fi
}
```

Without tmux (or with tmux < 3.5), `./scripts/setup.sh` prints a warning, and
`pane: true` agents **cannot run** — the subagent tool errors with
"Persistent pane agents require tmux ($TMUX is unset)." There is no
background fallback. Start pi inside tmux (the `pi()` wrapper above does
this automatically) or use `pane: false` (bg) agents instead.

## Install

```bash
./scripts/setup.sh
```

This does three things:

1. **Registers the repo as a pi package** (`pi install ./`) — loads
   `extensions/`, `skills/`, and `prompts/` into your user settings
   (`~/.pi/agent/settings.json`). Re-run to update.
2. **Symlinks `agents/*.md` into `~/.pi/agent/agents/`** — pi packages cannot
   ship subagent definitions, so agent files are linked separately. Stale
   symlinks (pointing at renamed/deleted agents) are cleaned up. Existing
   non-symlink files are never overwritten.
3. **Installs the extra npm packages** from `settings.example.json`
   (`@juicesharp/rpiv-todo`, `pi-ask-user`, `@vanillagreen/pi-agents-tmux`).

Restart pi (or run `/reload`) after installing. There is **no** repo-root
`npm install` step — the extensions have no runtime dependencies (the cdp
extension uses the global `WebSocket`).

### New machine bootstrap

1. Install the prerequisites above (Node >= 22.19, pi, git, tmux >= 3.5).
2. Clone the repo and run `./scripts/setup.sh`.
3. Optionally apply the recommended settings:
   `cp settings.example.json ~/.pi/agent/settings.json`, then add your API keys
   to `~/.pi/agent/auth.json`.
4. Run `npm run validate` to sanity-check the setup (parses every extension,
   checks agent/skill/prompt frontmatter, and verifies the expected inventory).
5. Restart pi.

## Using subagents

Prompt the model to delegate work with the `subagent` tool (provided by the
`@vanillagreen/pi-agents-tmux` package). Each agent runs in a separate `pi`
process with an isolated context window, so it never pollutes the main
conversation.

Two execution modes:

- **bg agents** (`pane: false`) — run in the background; the subagent tool
  awaits their real output. `chain` (sequential, `{previous}` placeholder)
  and `tasks` (parallel) work with bg agents.
- **pane agents** (`pane: true`) — run in a visible persistent tmux pane. The
  subagent tool **queues** the task and returns immediately with a
  "Queued task ... Task ID: ..." confirmation. **End your turn** after
  dispatching — the completion arrives as a follow-up message that wakes you;
  report via the wake payload or `get_subagent_result(taskId)`.

**`chain` cannot mix pane steps** — pane steps queue asynchronously instead of
returning real output, so a chain is bg-only. Workflows that end in a pane step
(see `/implement`) split the chain and dispatch the pane step separately.

Every dispatch should pass `agentScope: "both"` (the agents live in
`~/.pi/agent/agents`, a user-level directory).

### Agent reference

| Agent | pane | model | model-reasoning-effort | deny-tools |
|---|---|---|---|---|
| `scout` | bg | deepseek-v4-flash | off | write, edit |
| `planner` | bg | deepseek-v4-flash | high | write, edit |
| `reviewer` | bg | gpt-5.6-luna | medium | write, edit |
| `worker` | pane | deepseek-v4-flash | off | — |
| `docs` | pane | deepseek-v4-flash | high | — |
| `tester` | pane | deepseek-v4-flash | high | — |
| `scaffold` | bg | deepseek-v4-flash | high | — |

> Legacy `thinking:` / `tools:` frontmatter is **not parsed** by the tmux
> package — agents use `model-reasoning-effort` (off..max) instead, and
> tool restriction is expressed as `deny-tools:`.

#### `scout` — codebase recon

Fast codebase recon that returns compressed, structured findings another agent
can use **without re-reading anything**. Use it before any change to locate
code, types, and architecture.

```
Use scout to map how authentication works: where sessions are created, validated, and revoked.
```

Parallel recon splits one question into several targeted scouts:

```
Run two scouts in parallel: one tracing the data model, one tracing the API routes.
```

Returns: `## Files Retrieved` (with line ranges), `## Key Code`, `## Architecture`, `## Start Here`.

#### `planner` — implementation plan

Turns recon findings + requirements into a concrete, step-by-step plan with a
Risk Assessment and a Definition of Done. Use it once you know *what* exists
and need to decide *how* to change it. The worker executes it verbatim.

```
Take the scout's findings and plan the implementation of refresh-token rotation.
```

Returns: `## Summary`, `## Risk Assessment`, `## Non-goals`, `## Files to Change` (dependency-ordered table), `## Step-by-Step Order`, `## Key Considerations`, `## Definition of Done`.

#### `worker` — implementation

Autonomous implementer (visible pane). Use it to execute a plan or to do a
self-contained coding task. If a task is genuinely hard, bump the reasoning
effort for that call only:

```
Use the worker with model-reasoning-effort max to implement the refactor carefully.
```

Returns: `## Completed`, `## Files Changed`, `## Notes` (plus handoff info
— files touched and key functions — when another agent will review).

#### `reviewer` — code review

Senior code reviewer for quality, security, and maintainability. Use it as a
quality gate after implementation, before you look at the diff yourself.

```
Review the latest changes on this branch for bugs and security issues.
```

Returns: `## Critical` (must fix), `## Warnings`, `## Suggestions`, `## Looks Good` — with file paths and line numbers.

#### `docs` — documentation

Reads the repo and writes/updates markdown docs that match reality — it
never changes runtime behavior. Use it to write or refresh READMEs,
references, and guides, and to add JSDoc (via the `jsdoc-docs` skill).

```
Update the README's agent reference with usage examples for each agent.
```

Returns: `## Completed`, `## Files Changed`, `## Notes`.

#### `tester` — unit & E2E tests

Writes and runs tests for changed code (vitest, Playwright), iterating until
green and targeting >80% coverage. It never modifies production code — bugs
it finds are reported back for the worker to fix. Use it after implementation
and before review.

```
Write unit tests for the changed auth module, then run them until they pass.
```

Returns: `## Tests Added`, `## Coverage`, `## Notes` (bugs found, how to run).

#### `scaffold` — practice-challenge scaffolding

Builds a runnable frontend practice-challenge project from a challenge
description: selects a topic-appropriate starter template, pins dependency
versions via `npm view`, writes a README with the challenge text, runs `npm
install`, and verifies the build before reporting success. Invoked by the
`frontend-tip` skill when the user accepts the optional challenge.

```
Scaffold the challenge for a 'React' tip into /tmp/foo/frontend-tip-challenges/react-fetch-state/ using templates at <templates-abs-path>.
```

Returns: `## Completed`, `## Files Changed`, `## Build Verification`, `## Notes`.

### Workflow prompt templates

| Template | Flow | Pane step |
|---|---|---|
| `/implement <query>` | scout → planner → worker | worker (last step — chain ends before it) |
| `/scout-and-plan <query>` | scout → planner | none (pure bg chain) |
| `/implement-and-review <query>` | worker → reviewer → worker | worker (steps 1 & 3) |
| `/review-and-commit` | reviewer → ask_user → commit-full | none (bg reviewer) |

```
/implement add Redis caching to the session store
/scout-and-plan refactor auth to support OAuth
/implement-and-review add input validation to the API
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PI_MY_SETUP` | `$HOME/development/pi-setup` | Absolute path to this repo; agents and prompts use it to resolve `skills/...` paths |
| `TMUX` | (unset outside tmux) | `setup.sh` warns when unset (pane agents need tmux) |

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
body, then re-run `./scripts/setup.sh`. The frontmatter schema is the tmux
package's (see its README for full details):

```markdown
---
name: my-agent
description: What this agent does
model: opencode-go/deepseek-v4-flash
model-reasoning-effort: off      # off | minimal | low | medium | high | xhigh | max
pane: true                       # true = visible tmux pane, omit = bg
deny-tools: write, edit          # comma-separated tools to deny
---
```

Available fields: `name` (required, equals the filename), `description`
(required), `model` (`provider/id`), `model-reasoning-effort` (per-model
clamped), `pane` (true/false), `deny-tools` (comma-separated). The legacy
`tools:` / `thinking:` fields are not parsed. Agents are re-discovered on each
invocation — no reload needed after edits.

### Extensions

Every extension lives in a namespaced folder — the folder name is its package
name. Each folder has an `index.ts` entry point (default-export
`factory(pi)`) that registers its tools and commands. A package may be a
**single `index.ts`** (see `extensions/cdp/`) or **loose top-level files**
plus an `index.ts` that imports them (see `extensions/git/`, which keeps one
file per command). A loose single file at `extensions/<name>.ts` is also a
valid package (see `extensions/read-matching.ts`). See
[pi docs: extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md).

```
extensions/<package-name>/
├── index.ts        # entry: default-export factory(pi), registers the tools
├── <command>.ts    # one file per command (optional)
└── common.ts       # shared helpers (optional)
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

- The agent/prompt files are derived from pi's
  [MIT-licensed example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/subagent/).
- This repo itself is MIT licensed — see [LICENSE](LICENSE).
- Keep this repo's settings/state out of git: extension sessions, logs, etc.
