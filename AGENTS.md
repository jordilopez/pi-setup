# AGENTS.md — Instructions for AI agents

## Project: pi-setup

Personal pi setup: **skills**, **extensions**, and **subagents** shared across
all pi instances. Pi package (manifest points at `extensions/`, `skills/`,
`prompts/`) plus agent definitions installed by `./scripts/setup.sh`. Agent
execution is provided by the `@vanillagreen/pi-agents-tmux` package
(`subagent` tool, tmux panes, bg sessions).

## Structure

```
pi-setup/
├── package.json            # pi manifest + validate script
├── settings.example.json   # recommended settings
├── AGENTS.md               # this file
├── extensions/             # each = namespaced folder (package name)
│   ├── cdp/                # CDP tools (single index.ts: connect/goto/query/eval/...)
│   ├── git/                # git commands (/git:create-branch, /git:end-branch, /git:create-pr)
│   ├── read-matching.ts    # enhanced read_matching (loose single file)
│   └── redact/             # read-result redaction (event-based, no tools)
├── skills/                 # commit-full + commit-quick + jsdoc-docs + frontend-tip
│   └── frontend-tip/
│       └── templates/      #   scaffold-agent starter templates (9 frameworks)
├── agents/                 # subagent defs, symlinked by setup.sh:
│                           #   scout, planner, reviewer, docs, tester, worker, scaffold
├── prompts/                # /implement, /scout-and-plan, /implement-and-review, /review-and-commit
└── scripts/
    ├── setup.sh            # idempotent install
    └── validate.ts         # static validation (npm run validate)
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
  (default-export factory(pi)). A package may be a **single `index.ts`**
  (`cdp/`), an `index.ts` importing **loose top-level files** (`git/`), or a
  **loose single file** at `extensions/<name>.ts` (`read-matching.ts`).
  Runtime npm deps → `dependencies` + `npm install`; pi-bundled packages →
  `peerDependencies` (marked optional). The cdp extension uses the global
  `WebSocket` (Node >= 22.19) — no runtime deps.
- **Agents** `agents/<name>.md`: tmux-package frontmatter — `name` (must equal
  the filename), `description`, `model` (**`provider/id`**, e.g.
  `opencode-go/deepseek-v4-flash`), `model-reasoning-effort`
  (`off`/`minimal`/`low`/`medium`/`high`/`xhigh`/`max`; per-model clamped —
  deepseek low/medium → `high`), `pane` (`true` = visible tmux pane,
  omitted/false = bg), `deny-tools` (comma-separated). Legacy `tools:` and
  `thinking:` lines are **not parsed** — do not add them. Read-only agents
  (scout, planner, reviewer) set `deny-tools: write, edit`. After edits
  re-run `./scripts/setup.sh`; agents re-discover each invocation (no reload).
- **Prompts** `prompts/<name>.md`: top-level only (non-recursive), registers
  as `/name`. All dispatches use `agentScope: "both"` (the agents are
  user-level). `chain` is bg-only — pane steps (worker) are dispatched
  separately and the turn ends until the completion wake.

### Never commit

`auth.json`, `redact.json`, `models.json`/`models-store.json`, `sessions/`,
`trust.json`, `node_modules/`. `redact` reads `~/.pi/agent/redact.json` at
runtime — patterns stay local.

## Models

- Provider **opencode**: `deepseek-v4-flash` (cheap, general) + `gpt-5.6-luna`
  (quality; review; 2x usage).
- `model-reasoning-effort` (token savings; `off` ≈ 2x cheaper on deepseek):
  scout/worker `off`, planner `high`, reviewer `medium`, docs `high`, tester
  `high` (test quality is the commit gate). Override per call when a task
  needs more (or less) reasoning. Unsupported levels per model are clamped by
  pi (deepseek low/medium → `high`).

## Commands

```bash
./scripts/setup.sh              # install/update (idempotent)
npm run validate                # static validation (extensions, frontmatter, inventory)
npm install                     # dev tooling only — runtime has no dependencies
npm run typecheck               # tsc --noEmit (strict, against the pi API types)
npm run lint                    # eslint (typescript-eslint recommended)
npm run format                  # prettier --write
npm run format:check            # prettier --check
```

Dev tooling (`.editorconfig`, `.prettierrc.json`, `tsconfig.json`,
`eslint.config.js`, `.nvmrc`) covers `extensions/` and `scripts/`; the
skills/prompts/agents Markdown is excluded from prettier/eslint (prose loaded
verbatim by pi). `npm run validate` stays dependency-free — it must keep
working without `npm install` (sandbox recipe).

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
