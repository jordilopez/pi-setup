#!/usr/bin/env bash
#
# Install this pi-setup repo into the current machine's pi instance.
#
# Three jobs:
#   1. `npm install` in the repo root   - install runtime deps (e.g. ws for the
#                                         cdp extension) so imports resolve.
#   2. `pi install ./`                  - register the repo as a pi package
#                                         (extensions, skills, prompts) in
#                                         ~/.pi/agent/settings.json.
#   3. Symlink agents/*.md into ~/.pi/agent/agents/ - pi packages cannot
#                                         ship subagent definitions, so agents
#                                         are linked separately (same trick as
#                                         pi's subagent example).
#   4. `pi install` extra npm packages  - the global packages from
#                                         settings.example.json.
#
# Idempotent: safe to re-run whenever you pull changes.

set -euo pipefail

# Repo root (this script lives in scripts/)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_SRC="$REPO_ROOT/agents"

EXTRA_PACKAGES=(
  "npm:@juicesharp/rpiv-todo"
  "npm:@juicesharp/rpiv-advisor"
  "npm:pi-ask-user"
  "npm:pi-web-access"
)

# ---- helpers ---------------------------------------------------------------

warn() { printf '\033[33m[setup]\033[0m %s\n' "$*" >&2; }
info() { printf '\033[32m[setup]\033[0m %s\n' "$*" >&2; }

# ---- 1. repo dependencies --------------------------------------------------

if [[ -f "$REPO_ROOT/package.json" ]]; then
  info "Installing repo dependencies (cd $REPO_ROOT && npm install)"
  (cd "$REPO_ROOT" && npm install --no-audit --no-fund)
fi

# ---- 2. pi package ---------------------------------------------------------

if ! command -v pi >/dev/null 2>&1; then
  warn "pi not found on PATH — skipping package and extra-package install."
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

# ---- 3. subagent definitions ----------------------------------------------

if [[ ! -d "$AGENTS_SRC" ]]; then
  warn "No agents/ directory found — skipping agent symlinks."
else
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
fi

# ---- 4. extra npm packages -------------------------------------------------

if [[ -n "$pi_cmd" && ${#EXTRA_PACKAGES[@]} -gt 0 ]]; then
  info "Installing extra packages from settings.example.json:"
  for pkg in "${EXTRA_PACKAGES[@]}"; do
    info "  pi install $pkg"
    "$pi_cmd" install "$pkg"
  done
fi

info "Done. Restart pi (or run /reload) to pick up extensions and skills."
info "Subagent agents are discovered fresh on each invocation — no reload needed."
info "Optional: copy settings.example.json over ~/.pi/agent/settings.json to apply"
info "provider/model/theme defaults (then add your API keys to ~/.pi/agent/auth.json)."
