# AGENTS.md — Instructions for AI agents

## Project: pi-setup

Personal pi setup containing reusable **skills**, **extensions**, **agents**,
and **workflows** shared across pi instances. Skills and extensions run in the
active session. Workflows are the explicit entry point for agent delegation.

## Structure

```
pi-setup/
├── package.json            # pi manifest and development scripts
├── settings.example.json   # recommended provider/model defaults
├── extensions/             # pi tools and commands
│   ├── cdp/                # Chrome DevTools Protocol tools
│   ├── git/                # branch, merge, and PR commands
│   ├── read-matching.ts    # enhanced read_matching tool
│   └── redact/             # event-based read-result redaction
├── skills/                 # on-demand procedural instructions
│   ├── code-review-and-quality/  # five-axis code review
│   ├── create-skill/             # meta-skill: generate new skills
│   ├── frontend-tip/             # frontend tips and challenge templates
│   │   └── templates/            # starter projects for optional challenges
│   ├── git-commit-planning/      # expensive-model commit planning workflow
│   ├── git-create-pr/            # PR preparation with test context
│   ├── git-quick-commit/         # fast local commit workflow
│   ├── incremental-implementation/ # thin vertical slices
│   ├── jsdoc-docs/               # documentation and JSDoc conventions
│   ├── planning-and-task-breakdown/ # decompose work into tasks
│   ├── spec-driven-development/  # write specs before coding
│   └── test-driven-development/  # red-green-refactor TDD cycle
├── agents/                 # generic role definitions (user-scope symlinks)
├── workflows/              # prompt templates exposed as /commands
├── scripts/
│   ├── setup.sh            # idempotent installer (package + agent links)
│   ├── create-pr.sh        # shell entry point for standalone PR creation
│   ├── create-pr.ts        # Pi-independent PR mechanics and CLI
│   └── validate.ts         # dependency-free static validation
└── README.md
```

## Conventions

- The manifest points at `./extensions`, `./skills`, and `./workflows`; adding
  files needs no manifest edit. Agents are not a pi manifest type; `setup.sh`
  symlinks `agents/*.md` into `~/.pi/agent/agents/`.
- Skills live at `skills/<name>/SKILL.md`. Frontmatter requires a lowercase
  hyphenated `name` (matching the directory) and a specific `description`.
  Markdown is loaded by pi as instructions, so keep it concise and explicit.
- Extensions use a namespaced folder with an `index.ts` default-export factory,
  or a loose top-level `.ts` file for a small standalone extension. Keep one
  command or tool per file where that makes the extension easier to maintain.
- Runtime extension dependencies must be declared in `dependencies`. Pi API
  packages are optional peer/development dependencies used for type checking.
- Agent files (`agents/<name>.md`) are generic role definitions. Frontmatter:
  `name` (matches filename), `description`, `pane`, optional `deny-tools`,
  and `allowed-subagents` when the agent may delegate recon. `model` and
  `model-reasoning-effort` are optional — omit them to inherit the parent
  session model. Keep agents project-agnostic; per-project customization
  belongs in `<project>/.pi/agents/`.
- Workflow files (`workflows/<name>.md` → `/<name>`) need `description`,
  `argument-hint` when they take arguments, and an `agents:` metadata line
  (comma-separated names) so validation can check the references.
- Workflows that receive generated files from read-only agents use labeled
  fenced artifact blocks: `text:path=<relative-path>` followed by the
  complete file contents. Require exactly one block per expected path; the
  parent session writes and reads the files back before approval.
- Skills are the canonical source for reusable procedures. Agents may invoke
  skills by name, and workflows may compose skills with agents. Skills never
  delegate to agents; orchestration belongs to workflows or the active session.
  Agents must not depend on repository-relative skill paths because user-scoped
  agents can run from arbitrary projects.
- Keep the active session's model choice and approval points visible. Do not
  switch the parent session's model from a workflow; per-agent models live in
  agent frontmatter only.
- The orchestration package (`@vanillagreen/pi-agents-tmux`) is installed by
  `scripts/setup.sh` only, never added to `package.json`.

### Never commit

`auth.json`, `redact.json`, `models.json`/`models-store.json`, `sessions/`,
`trust.json`, `.env` files containing secrets, or `node_modules/`. The redact
extension reads `~/.pi/agent/redact.json` at runtime.

## Models

The recommended settings use provider `opencode-go`:

- `opencode-go/glm-5.3-flash` is the default high-quality model.
- `opencode-go/hy4-preview` is the inexpensive general-purpose alternative.

Agents in this repository omit `model:` and `model-reasoning-effort:` —
they inherit the parent session model. Model selection is up to the user
and can be delegated to a router. If an agent needs a specific model, both
fields are optional in frontmatter.

Use the model best suited to the current task and switch it explicitly when
moving between exploration, implementation, review, or multimodal work. Do not
encode parent-session model selection in a hidden workflow.

## Commands

```bash
./scripts/setup.sh              # install/update the pi package and agent links
npm run validate                # dependency-free static validation
npm run test:setup              # test setup.sh link ownership (no pi install)
npm run test:validation         # test validation rules and artifact handoffs
npm install                     # install development tooling
npm run typecheck               # strict TypeScript check
npm run lint                    # ESLint
npm run format:check            # Prettier check
```

`npm run validate` must continue to work without `npm install`. It parses every
extension with Node's type-stripping syntax check, verifies relative imports,
checks skill/agent/workflow frontmatter and inventory, resolves local skill
references, and asserts that the orchestration package is not a dependency.

For a sandboxed package check, create a temporary extension to validate:

```bash
rm -rf /tmp/pi-sandbox && mkdir -p /tmp/pi-sandbox
echo 'export default function (pi: any) {};' > /tmp/validate-ext.ts
PI_CODING_AGENT_DIR=/tmp/pi-sandbox pi install "$PWD"
PI_CODING_AGENT_DIR=/tmp/pi-sandbox pi -e /tmp/validate-ext.ts -p hello --offline --no-session
```

Extension, skill, and workflow changes require a pi restart or `/reload` after
installation. Agents are discovered fresh on each subagent invocation.
`./scripts/setup.sh` is safe to rerun after pulling changes. The standalone
`./scripts/create-pr.sh` runner can be used by skills or shell sessions when a
Pi command session is unavailable.

## Git

Use conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, etc.). Keep
changes focused and never commit local credentials or generated state.
