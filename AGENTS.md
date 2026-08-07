# AGENTS.md — Instructions for AI agents

## Project: pi-setup

Personal pi setup: **skills**, **extensions**, and **subagents** shared across
all pi instances. The repo is a local pi package installed via
`./scripts/setup.sh`.

---

## What this repo is

- **Pi package** — `package.json` `pi` manifest points at `extensions/`,
  `skills/`, and `prompts/`.
- **Agent definitions** — `agents/*.md` are *not* part of the pi package (pi
  packages cannot ship them); `setup.sh` symlinks them into
  `~/.pi/agent/agents/` instead.
- **One-command install** — `scripts/setup.sh` (idempotent, safe to re-run).

## Structure

```
pi-setup/
├── package.json            # pi manifest + ws dependency (cdp extension)
├── settings.example.json   # recommended settings for new machines
├── AGENTS.md               # this file
├── extensions/             # registered via pi.extensions
│   ├── subagent/           # subagent tool (index.ts entry, subagent.ts = the tool)
│   │   ├── index.ts        #   entry: registers the subagent tool
│   │   ├── subagent.ts     #   the tool (schema + execute + render)
│   │   ├── agents.ts       #   agent discovery
│   │   ├── types.ts        #   shared types
│   │   ├── format.ts       #   formatting helpers
│   │   └── runner.ts       #   spawns one pi process per subagent
│   ├── cdp/                # CDP browser tools
│   │   ├── index.ts        #   entry: registers all 5 tools
│   │   ├── connection.ts   #   shared CDP connection state
│   │   ├── connect.ts      #   cdp_connect
│   │   ├── list-targets.ts #   cdp_list_targets
│   │   ├── inspect.ts      #   cdp_inspect
│   │   ├── evaluate.ts     #   cdp_evaluate
│   │   └── disconnect.ts   #   cdp_disconnect
│   └── redact/             # redacts read results (event-based, no tools)
│       ├── index.ts        #   entry: tool_result handler
│       └── redact.ts       #   redaction logic
├── skills/                 # registered via pi.skills
│   ├── commit-full/        # full commit workflow skill
│   └── my-skill/           # template — copy to add a skill
├── agents/                 # subagent definitions (installed via symlinks)
│   ├── scout.md            # fast codebase recon
│   ├── planner.md          # implementation plans
│   ├── reviewer.md         # code review (gpt-5.6-luna)
│   └── worker.md           # general-purpose
├── prompts/                # workflow prompt templates (top-level only)
│   ├── implement.md        # scout -> planner -> worker
│   ├── scout-and-plan.md
│   └── implement-and-review.md
└── scripts/setup.sh        # install/update everything
```

## Conventions for adding content

### Skills — `skills/<name>/SKILL.md`

Frontmatter requires `name` (lowercase a-z, 0-9, hyphens, ≤ 64 chars) and a
specific `description` (≤ 1024 chars) — pi decides when to load the skill from
the description. Relative paths inside the skill resolve against its directory.
No manifest edit needed: the package points at `./skills`.

### Extensions — `extensions/<package>/`

Every extension lives in a namespaced folder; the folder name is its package
name. The folder has an `index.ts` entry point (default-exports a factory
receiving `ExtensionAPI`) and **one file per registered tool** — the file
contains that tool's `registerTool` call. Shared helpers (connection state,
formatting, discovery) live in separate support files, never inside tool files.

Runtime npm deps go in `package.json` `dependencies` (then `npm install`);
pi-bundled packages (`@earendil-works/*`, `typebox`) stay in `peerDependencies`
(marked optional). No manifest edit needed: the package points at `./extensions`.

### Agents — `agents/<name>.md`

Frontmatter: `name` (required), `description` (required), `tools`
(comma-separated), `model`. The `model` field is passed to the spawned pi via
`--model`, so it must be **`provider/id`** (e.g. `opencode-go/deepseek-v4-flash`).
After adding/editing agents, re-run `./scripts/setup.sh` to refresh symlinks;
agents are re-discovered on each subagent invocation (no restart needed).

### Prompts — `prompts/<name>.md`

Top-level files only — discovery is non-recursive. Registers as `/name`.
No manifest edit needed: the package points at `./prompts`.

### Never commit

`auth.json`, `redact.json` (personal-data patterns), `models.json` /
`models-store.json` (regenerated), `sessions/`, `trust.json`, `node_modules/`.
The `redact` extension reads `~/.pi/agent/redact.json` at runtime, so patterns
stay local while the code ships.

## Model conventions

- Default provider: **opencode** (`opencode-go` models).
- **deepseek-v4-flash** — cheap general work (scout, planner, worker).
- **gpt-5.6-luna** — higher-quality output, use for review (reviewer).

## Commands

```bash
./scripts/setup.sh              # install/update everything (idempotent)
npm install                     # after changing extensions/package.json
```

### Sandboxed validation (does not touch real config)

```bash
rm -rf /tmp/pi-sandbox && mkdir -p /tmp/pi-sandbox
PI_CODING_AGENT_DIR=/tmp/pi-sandbox pi install "$PWD"
PI_CODING_AGENT_DIR=/tmp/pi-sandbox pi -e /tmp/validate-ext.ts -p hello --offline --no-session
```

Check that tools (`cdp_*`, `subagent`) appear and skills (`commit-full`,
`my-skill`) load. After migrating files out of `~/.pi/agent/`, verify with a
real-config run (`pi -p ... --offline --no-session`) — no restart needed to
test, but the running pi session must be restarted (or `/reload`) to pick up
changes.

## Git conventions

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:` etc.
- Derived content from pi's examples is MIT licensed — keep the attribution
  header in copied files.
