#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SETUP="$ROOT/scripts/setup.sh"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/pi-setup-links.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

links="$tmp/agents"
foreign_target="$tmp/foreign-target.md"
mkdir -p "$links"
printf 'keep this file\n' > "$links/commit-planner.md"
printf 'foreign target\n' > "$foreign_target"
ln -s "$foreign_target" "$links/reviewer.md"
ln -s "$ROOT/agents/planner.md" "$links/planner.md"
ln -s "$ROOT/agents/stale.md" "$links/stale.md"

PATH="/usr/bin:/bin" PI_SETUP_USER_AGENT_DIR="$links" bash "$SETUP" --links-only

if [[ "$(cat "$links/commit-planner.md")" != "keep this file" ]]; then
  printf 'foreign regular file was modified\n' >&2
  exit 1
fi
if [[ "$(readlink "$links/reviewer.md")" != "$foreign_target" ]]; then
  printf 'foreign symlink was retargeted\n' >&2
  exit 1
fi
if [[ "$(readlink "$links/planner.md")" != "$ROOT/agents/planner.md" ]]; then
  printf 'owned symlink was not refreshed\n' >&2
  exit 1
fi
if [[ -e "$links/stale.md" || -L "$links/stale.md" ]]; then
  printf 'stale owned symlink was not removed\n' >&2
  exit 1
fi
if [[ "$(readlink "$links/worker.md")" != "$ROOT/agents/worker.md" ]]; then
  printf 'missing agent link was not created\n' >&2
  exit 1
fi

printf 'setup link ownership checks passed\n'
