# AGENTS.md — Instructions for AI agents

## Project: pi-setup

`pi-setup` is the unified package for Pi skills and runtime extensions.
It owns installer defaults, setup documentation, and all runtime resources:

- `skills/` — engineering workflow skills (git-commit-planning, jsdoc-docs, etc.)
- `extensions/` — CDP, Git, redaction, and `read_matching`
- `@vanillagreen/pi-agents-tmux` — separately installed orchestration extension

## Structure

```text
pi-setup/
├── package.json            # development scripts and private metadata
├── settings.example.json   # recommended provider/model defaults
├── extensions/             # CDP, Git, redaction, read-matching
├── skills/                 # engineering workflow skills
├── scripts/
│   ├── setup.sh            # installs the orchestration package
│   └── validate.ts         # dependency-free setup validation
├── README.md               # package boundaries and installation
├── AGENTS.md               # repository conventions
└── tasks/                  # plans and task lists for this repository
```

## Conventions

- `scripts/setup.sh` installs the orchestration package and registers this
  repository as a local Pi package. Environment variables override package
  sources.
- Skills and extensions live in this repository under their respective
  directories and are discovered from the `pi` manifest in `package.json`.
- Use conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, etc.).

## Commands

```bash
./scripts/setup.sh
./scripts/setup.sh --remove
npm run validate
npm run typecheck
npm run lint
npm run format:check
bash -n scripts/setup.sh
```

`npm run validate` must work without `npm install`. It checks the bootstrap
inventory, package manifest, and installer variables. `scripts/setup.sh` must
remain safe to rerun.

## Never commit

`auth.json`, `redact.json`, model stores, sessions, trust files, `.env` files
containing secrets, `node_modules/`, or generated package state.
