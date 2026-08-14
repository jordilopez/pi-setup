#!/usr/bin/env bash
#
# Install this pi-setup repo into the current machine's pi instance.
#
# Jobs:
#   1. `pi install ./`                       - register the repo as a pi
#                                                package (extensions,
#                                                skills, prompts) in
#                                                ~/.pi/agent/settings.json.
#   2. Symlink agents/*.md into ~/.pi/agent/agents/ - the user-scope agents
#      dir where the @vanillagreen/pi-agents-tmux package discovers agents, so
#      every pi instance on the machine can use them.
#   3. `pi install` extra npm packages       - the packages listed in
#                                                settings.example.json.
#
# Idempotent: safe to re-run whenever you pull changes.
#
# After running: restart pi (or /reload) to pick up extensions and skills.
# Agents are discovered fresh on each invocation — no reload needed.

set -euo pipefail

# Repo root (this script lives in scripts/)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_SRC="$REPO_ROOT/agents"

# ---- helpers ---------------------------------------------------------------

warn() { printf '\033[33m[setup]\033[0m %s\n' "$*" >&2; }
info() { printf '\033[32m[setup]\033[0m %s\n' "$*" >&2; }

# ---- 0. tmux prerequisite (non-fatal) ----------------------------------------

if [[ -z "${TMUX:-}" ]]; then
  warn "TMUX is unset — you are not running pi inside tmux."
  warn "Pane agents (worker, docs, tester) need tmux >= 3.5 and cannot run"
  warn "outside a tmux session: the subagent tool errors with \"Persistent pane"
  warn "agents require tmux\". Start pi inside tmux (e.g. the pi() wrapper in"
  warn "README.md) or use pane:false background agents instead."
elif command -v tmux >/dev/null 2>&1; then
  tmux_version="$(tmux -V 2>/dev/null | sed -E 's/tmux ([0-9.]+).*/\1/' || true)"
  if [[ -n "$tmux_version" ]]; then
    # Numeric major/minor comparison — a lexicographic string compare would
    # mis-rank versions like 3.10 as older than 3.5.
    tmux_major="${tmux_version%%.*}"
    tmux_minor="${tmux_version#*.}"
    tmux_minor="${tmux_minor%%.*}"
    if [[ "$tmux_major" =~ ^[0-9]+$ && "$tmux_minor" =~ ^[0-9]+$ ]] && (( tmux_major < 3 || (tmux_major == 3 && tmux_minor < 5) )); then
      warn "tmux $tmux_version detected — pane agents require tmux >= 3.5"
      warn "(needed for extended-keys support). Upgrade tmux to get visible panes."
    fi
  fi
else
  warn "tmux not found on PATH — pane agents need tmux >= 3.5 to run in a visible pane."
fi

# ---- 1. pi package -----------------------------------------------------------

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

# ---- 2. subagent definitions --------------------------------------------------

if [[ ! -d "$AGENTS_SRC" ]]; then
  warn "No agents/ directory found — skipping agent symlinks."
else
  USER_AGENT_DIR="$HOME/.pi/agent/agents"
  mkdir -p "$USER_AGENT_DIR"

  linked=0
  skipped=0
  removed=0
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

  # Remove stale symlinks: entries in the user dir that point into this repo
  # but no longer have a source file (renamed/deleted agents).
  for target in "$USER_AGENT_DIR"/*.md; do
    [[ -e "$target" || -L "$target" ]] || continue
    if [[ -L "$target" ]]; then
      resolved="$(readlink "$target")"
      if [[ "$resolved" == "$AGENTS_SRC/"* && ! -e "$resolved" ]]; then
        rm "$target"
        removed=$((removed + 1))
      fi
    fi
  done

  info "Linked $linked agent(s) into $USER_AGENT_DIR"
  if [[ "$removed" -gt 0 ]]; then
    info "Removed $removed stale agent symlink(s)"
  fi
  if [[ "$skipped" -gt 0 ]]; then
    warn "$skipped existing file(s) left untouched"
  fi
fi

# ---- 3. extra npm packages ------------------------------------------------------

# Read the package list from settings.example.json so it stays in one place.
EXTRA_PACKAGES=()
if command -v node >/dev/null 2>&1; then
  # Stock macOS ships Bash 3.2, which has no `mapfile` — populate the array
  # with a plain read loop instead.
  while IFS= read -r pkg || [[ -n "$pkg" ]]; do
    EXTRA_PACKAGES+=("$pkg")
  done < <(
    node -e "const p = require(process.argv[1]); console.log((p.packages || []).join('\\n'))" "$REPO_ROOT/settings.example.json" 2>/dev/null || true
  )
fi

if [[ -n "$pi_cmd" && ${#EXTRA_PACKAGES[@]} -gt 0 ]]; then
  info "Installing extra packages from settings.example.json:"
  for pkg in "${EXTRA_PACKAGES[@]}"; do
    [[ -n "$pkg" ]] || continue
    info "  pi install $pkg"
    "$pi_cmd" install "$pkg"
  done
fi

info "Done. Restart pi (or run /reload) to pick up extensions and skills."
info "Subagent agents are discovered fresh on each invocation — no reload needed."
info "Optional: copy settings.example.json over ~/.pi/agent/settings.json to apply"
info "provider/model/theme defaults (then add your API keys to ~/.pi/agent/auth.json)."
