#!/usr/bin/env bash
#
# Install this pi-setup repo into the current machine's pi instance.
#
# Two jobs:
#   1. `pi install ./`  - register the repo as a pi package (extensions,
#                         skills, prompts) in ~/.pi/agent/settings.json.
#   2. Symlink agents/*.md into ~/.pi/agent/agents/ - pi packages cannot
#                         ship subagent definitions, so agents are linked
#                         separately (same trick as pi's subagent example).
#
# Idempotent: safe to re-run whenever you pull changes.

set -euo pipefail

# Repo root (this script lives in scripts/)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_SRC="$REPO_ROOT/agents"

# ---- helpers ---------------------------------------------------------------

warn() { printf '\033[33m[setup]\033[0m %s\n' "$*" >&2; }
info() { printf '\033[32m[setup]\033[0m %s\n' "$*" >&2; }

# ---- 1. pi package ---------------------------------------------------------

if ! command -v pi >/dev/null 2>&1; then
  warn "pi not found on PATH — skipping package install."
  warn "Install pi first, then re-run this script."
  pi_cmd=""
else
  pi_cmd="pi"
fi

if [[ -n "$pi_cmd" ]]; then
  info "Installing/updating pi package from $REPO_ROOT"
  # `pi install` is additive; re-running updates the entry to this path.
  "$pi_cmd" install "$REPO_ROOT"
fi

# ---- 2. subagent definitions ----------------------------------------------

if [[ ! -d "$AGENTS_SRC" ]]; then
  warn "No agents/ directory found — skipping agent symlinks."
  exit 0
fi

USER_AGENT_DIR="$HOME/.pi/agent/agents"
mkdir -p "$USER_AGENT_DIR"

linked=0
skipped=0
for agent in "$AGENTS_SRC"/*.md; do
  [[ -e "$agent" ]] || continue
  name="$(basename "$agent")"
  target="$USER_AGENT_DIR/$name"

  if [[ -L "$target" ]]; then
    # Already a symlink: refresh the target so re-runs pick up moves/renames.
    ln -sf "$agent" "$target"
    linked=$((linked + 1))
  elif [[ -e "$target" ]]; then
    warn "Refusing to overwrite existing file: $target (not a symlink to this repo)"
    skipped=$((skipped + 1))
  else
    ln -s "$agent" "$target"
    linked=$((linked + 1))
  fi
done

info "Linked $linked agent(s) into $USER_AGENT_DIR"
if [[ "$skipped" -gt 0 ]]; then
  warn "$skipped existing file(s) left untouched"
fi

info "Done. Restart pi (or run /reload) to pick up extensions and skills."
info "Subagent agents are discovered fresh on each invocation — no reload needed."
