# AGENTS.md — Instructions for AI agents

## Project: pi-setup

Personal pi setup: **skills**, **extensions**, and **subagents** shared across
all pi instances. Pi package (manifest points at `extensions/`, `skills/`,
`prompts/`) plus agent definitions installed by `./scripts/setup.sh`.

## Structure

```
pi-setup/
├── package.json            # pi manifest + ws dep (cdp)
├── settings.example.json   # recommended settings
├── AGENTS.md               # this file
├── extensions/             # each = namespaced folder (package name)
│   ├── subagent/           # subagent tool (index.ts entry + subagent.ts + support)
│   ├── cdp/                # CDP tools, one file per tool
│   └── redact/             # read-result redaction (event-based, no tools)
├── skills/                 # commit-full + my-skill (template) + frontend-tip
│   └── frontend-tip/
│       └── templates/      #   scaffold-agent starter templates (9 frameworks)
├── agents/                 # subagent defs, symlinked by setup.sh:
│                           #   scout, planner, reviewer, docs, tester, worker, scaffold
├── prompts/                # /implement, /scout-and-plan, /implement-and-review
└── scripts/setup.sh        # idempotent install
```

## Conventions

The manifest points at `./extensions`, `./skills`, `./prompts` — adding files
needs no manifest edit.

- **Skills** `skills/<name>/SKILL.md`: frontmatter `name` (lowercase-hyphen,
  ≤ 64) + specific `description` (≤ 1024 — pi loads the skill by it). Relative
  paths resolve from the skill dir. `skills/frontend-tip/templates/` (starter
  project templates) ships with the skill; the `scaffold` agent is pointed at
  their absolute path by the main model (via the subagent task), not by a
  relative-path assumption.
- **Extensions** `extensions/<pkg>/`: folder = package name; `index.ts` entry
  (default-export factory(pi)); **one file per registered tool**. Runtime npm
  deps → `dependencies` + `npm install`; pi-bundled packages →
  `peerDependencies` (marked optional).
- **Agents** `agents/<name>.md`: frontmatter `name`, `description`, `tools`
  (comma-separated), `model` (**`provider/id`**, e.g.
  `opencode-go/deepseek-v4-flash`), `thinking` (`off`..`max`; per-model
  clamped — deepseek low/medium → `high`). The subagent tool can override
  `thinking` per call/task/step. After edits re-run `./scripts/setup.sh`;
  agents re-discover each invocation (no reload).
- **Prompts** `prompts/<name>.md`: top-level only (non-recursive), registers
  as `/name`.

### Never commit

`auth.json`, `redact.json`, `models.json`/`models-store.json`, `sessions/`,
`trust.json`, `node_modules/`. `redact` reads `~/.pi/agent/redact.json` at
runtime — patterns stay local.

## Models

- Provider **opencode**: `deepseek-v4-flash` (cheap, general) + `gpt-5.6-luna`
  (quality; review; 2x usage).
- Thinking (token savings; `off` ≈ 2x cheaper on deepseek): scout/worker
  `off`, planner `high`, reviewer `medium`, docs `high`, tester `high`
  (test quality is the commit gate). Override per call when a task needs
  more (or less) reasoning.

## Commands

```bash
./scripts/setup.sh              # install/update (idempotent)
npm install                     # after adding extension runtime deps
```

Sandboxed validation (no real config):

```bash
rm -rf /tmp/pi-sandbox && mkdir -p /tmp/pi-sandbox
PI_CODING_AGENT_DIR=/tmp/pi-sandbox pi install "$PWD"
PI_CODING_AGENT_DIR=/tmp/pi-sandbox pi -e /tmp/validate-ext.ts -p hello --offline --no-session
```

Extension/skill changes need pi restart or `/reload`; agent changes don't.

## Git

- Conventional commits (`feat:`, `fix:`, `docs:`, ...).
- Keep MIT attribution headers on pi-derived files.
