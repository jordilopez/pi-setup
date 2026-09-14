# pi-setup

Unified Pi package for skills and extensions.

This repository is the single package for installing personal Pi resources.
Skills (engineering workflows) and runtime extensions (CDP, Git, redaction,
read-matching) live here and are discovered from the `pi` manifest in
`package.json`.

## Installation

Clone the repository and run the installer:

```bash
git clone https://github.com/jordilopez/pi-setup
cd pi-setup
./scripts/setup.sh
```

The installer installs:

1. `@vanillagreen/pi-agents-tmux@3.0.0` — subagent orchestration extension
2. `pi-setup` — skills and extensions

Restart Pi or run `/reload` after installation.

### tmux

Some agents use visible tmux panes. Start Pi inside tmux when using those
agents. The installer warns when tmux is missing or too old.

Recommended `~/.tmux.conf` settings:

```tmux
set -g extended-keys on
set -g extended-keys-format csi-u
```

Start a fresh tmux server after changing those settings.

## Usage

Skills work as direct prompts through Pi:

```text
/skill:git-commit-planning
/skill:git-create-pr
/skill:jsdoc-docs
/skill:frontend-tip
```

Extensions provide runtime tools (CDP, Git, redaction, read-matching).

## Removal

```bash
./scripts/setup.sh --remove
```

## Development checks

```bash
npm install
npm run validate
npm run typecheck
npm run lint
npm run format:check
bash -n scripts/setup.sh
```

`npm run validate` works without `npm install`.

## Security

Installing the package set installs executable Pi extensions and gives agents
access to project files. Review the source before installing.

Never commit `auth.json`, `redact.json`, model stores, sessions, trust files,
`.env` files containing secrets, or `node_modules/`.
