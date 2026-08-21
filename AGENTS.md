# AGENTS.md — Instructions for AI agents

## Project: pi-setup

Personal pi setup containing reusable **skills** and **extensions** shared across
pi instances. The package intentionally has no bundled subagent definitions or
workflow prompts: the active Pi session executes tasks directly.

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
│   ├── commit-plan/        # expensive-model commit planning workflow
│   ├── commit-quick/       # fast local commit workflow
│   ├── create-pr/          # PR preparation with test context
│   ├── frontend-tip/       # frontend tips and challenge templates
│   │   └── templates/      # starter projects for optional challenges
│   └── jsdoc-docs/         # documentation and JSDoc conventions
├── scripts/
│   ├── setup.sh            # idempotent pi package installer
│   └── validate.ts         # dependency-free static validation
└── README.md
```

## Conventions

- The manifest points at `./extensions` and `./skills`; adding files needs no
  manifest edit.
- Skills live at `skills/<name>/SKILL.md`. Frontmatter requires a lowercase
  hyphenated `name` (matching the directory) and a specific `description`.
  Markdown is loaded by pi as instructions, so keep it concise and explicit.
- Extensions use a namespaced folder with an `index.ts` default-export factory,
  or a loose top-level `.ts` file for a small standalone extension. Keep one
  command or tool per file where that makes the extension easier to maintain.
- Runtime extension dependencies must be declared in `dependencies`. Pi API
  packages are optional peer/development dependencies used for type checking.
- Keep the active session's model choice and approval points visible. Do not
  add a second orchestration layer when a focused skill or extension is enough.

### Never commit

`auth.json`, `redact.json`, `models.json`/`models-store.json`, `sessions/`,
`trust.json`, `.env` files containing secrets, or `node_modules/`. The redact
extension reads `~/.pi/agent/redact.json` at runtime.

## Models

The recommended settings use provider `opencode-go`:

- `opencode-go/gpt-5.6-luna` is the default high-quality model.
- `opencode-go/mimo-v2.5` is the inexpensive general-purpose alternative.

Use the model best suited to the current task and switch it explicitly when
moving between exploration, implementation, review, or multimodal work. Do not
encode model selection in a hidden workflow.

## Commands

```bash
./scripts/setup.sh              # install/update the pi package
npm run validate                # dependency-free static validation
npm install                     # install development tooling
npm run typecheck               # strict TypeScript check
npm run lint                    # ESLint
npm run format:check            # Prettier check
```

`npm run validate` must continue to work without `npm install`. It parses every
extension with Node's type-stripping syntax check, verifies relative imports,
checks skill frontmatter and inventory, and resolves local skill references.

For a sandboxed package check, create a temporary extension to validate:

```bash
rm -rf /tmp/pi-sandbox && mkdir -p /tmp/pi-sandbox
echo 'export default function (pi: any) {};' > /tmp/validate-ext.ts
PI_CODING_AGENT_DIR=/tmp/pi-sandbox pi install "$PWD"
PI_CODING_AGENT_DIR=/tmp/pi-sandbox pi -e /tmp/validate-ext.ts -p hello --offline --no-session
```

Extension and skill changes require a pi restart or `/reload` after
installation. `./scripts/setup.sh` is safe to rerun after pulling changes.

## Git

Use conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, etc.). Keep
changes focused and never commit local credentials or generated state.
