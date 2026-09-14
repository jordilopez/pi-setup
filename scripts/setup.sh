#!/usr/bin/env bash
#
# Idempotent installer for the unified pi-setup package.
#
# Jobs:
#   1. `pi install $PI_AGENTS_TMUX_PACKAGE` - the orchestration package
#                                              (default @vanillagreen/pi-agents-tmux)
#                                              that provides the subagent tools.
#   2. `pi install ./`                        - register this repo as a pi
#                                              package so skills and workflows
#                                              load.
#   3. Optionally install the separate runtime extensions package from
#      `$PI_EXTENSIONS_PACKAGE`.
#   4. Symlink agents/*.md into ~/.pi/agent/agents/ - the user-scope agents
#      dir the orchestration package discovers.
#
# Safe to re-run after pulling changes. Never overwrites user-owned files or
# foreign symlinks. Owned links (those pointing into this repo's agents/)
# are refreshed; stale owned links are removed.
#
# Teardown: `scripts/setup.sh --remove` undoes exactly what this script did.

set -euo pipefail

# Repo root (this script lives in scripts/)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_SRC="$REPO_ROOT/agents"

# Pin the tested orchestration package by default. Override to test a newer
# release or a fork, for example:
#   PI_AGENTS_TMUX_PACKAGE='npm:@vanillagreen/pi-agents-tmux@3.0.0' ./scripts/setup.sh
PI_AGENTS_TMUX_PACKAGE="${PI_AGENTS_TMUX_PACKAGE:-npm:@vanillagreen/pi-agents-tmux@3.0.0}"
# Optional separate runtime extensions package source. Supported examples:
#   /path/to/pi-extensions, git:github.com/owner/pi-extensions, npm:pi-extensions
PI_EXTENSIONS_PACKAGE="${PI_EXTENSIONS_PACKAGE:-}"

USER_AGENT_DIR="${PI_SETUP_USER_AGENT_DIR:-$HOME/.pi/agent/agents}"
MODE="install"
case "${1:-}" in
  "") ;;
  --remove) MODE="remove" ;;
  --links-only) MODE="links-only" ;;
  --help|-h)
    cat <<EOF
Usage: $0 [--remove|--links-only]

Install the unified pi-setup package, or remove only this repository's
package registrations and agent symlinks. The installer does not overwrite
user-owned agent files or foreign symlinks.

--links-only is a development/test mode that skips pi and tmux setup and
only manages agent links.

Environment:
  PI_AGENTS_TMUX_PACKAGE  orchestration package source
                          (default: $PI_AGENTS_TMUX_PACKAGE)
  PI_EXTENSIONS_PACKAGE   optional separate runtime extensions source
                          (local path, git URL, or npm spec; unset by default)
  PI_SETUP_USER_AGENT_DIR  agent link directory override (development/test)
                          (default: $HOME/.pi/agent/agents)
EOF
    exit 0
    ;;
  *)
    printf 'Usage: %s [--remove|--links-only]\n' "$0" >&2
    exit 2
    ;;
esac

# ---- helpers ---------------------------------------------------------------

warn() { printf '\033[33m[setup]\033[0m %s\n' "$*" >&2; }
info() { printf '\033[32m[setup]\033[0m %s\n' "$*" >&2; }

# ---- 0. prerequisites ------------------------------------------------------

if [[ "$MODE" != "links-only" ]]; then
  if ! command -v pi >/dev/null 2>&1; then
    warn "pi not found on PATH — install pi first, then re-run this script."
    exit 1
  fi

  # Pane agents need a live tmux session. We intentionally warn rather than
# fail: scout/planner/reviewer run in the background and setup can be done
  # before the user starts Pi in tmux.
  tmux_available=0
  tmux_version=""
  tmux_version_ok=0
  if command -v tmux >/dev/null 2>&1; then
    tmux_available=1
    tmux_version="$(tmux -V 2>/dev/null | sed -E 's/tmux ([0-9]+\.[0-9]+).*/\1/' || true)"
    tmux_major="${tmux_version%%.*}"
    tmux_minor="${tmux_version#*.}"
    if [[ "$tmux_major" =~ ^[0-9]+$ && "$tmux_minor" =~ ^[0-9]+$ ]]; then
      if (( tmux_major > 3 || (tmux_major == 3 && tmux_minor >= 5) )); then
        tmux_version_ok=1
      fi
    fi
  fi

  if (( ! tmux_available )); then
  warn "tmux not found — pane agents need tmux >= 3.5."
  warn "bg agents (pane: false) still work; see README.md for setup guidance."
elif (( ! tmux_version_ok )); then
  warn "tmux ${tmux_version:-unknown} detected — pane agents are supported with tmux >= 3.5."
elif [[ -z "${TMUX:-}" ]]; then
  warn "tmux $tmux_version is available, but this shell is outside tmux."
  warn "Start Pi inside tmux for pane agents (see README.md); installation can continue."
else
  info "tmux $tmux_version session detected; pane agents can use visible panes."
  extended_keys="$(tmux show-options -gqv extended-keys 2>/dev/null || true)"
  extended_keys_format="$(tmux show-options -gqv extended-keys-format 2>/dev/null || true)"
    if [[ "$extended_keys" != "on" || "$extended_keys_format" != "csi-u" ]]; then
      warn "tmux extended keys are not configured as recommended (on / csi-u)."
      warn "Add the settings from README.md, then start a fresh tmux server."
    fi
  fi
fi

# ---- teardown mode ----------------------------------------------------------

if [[ "$MODE" == "remove" ]]; then
  info "Removing pi-setup package registrations and agent links"

  # Agent symlinks owned by this repo (point into $AGENTS_SRC).
  if [[ -d "$USER_AGENT_DIR" ]]; then
    for target in "$USER_AGENT_DIR"/*.md; do
      [[ -L "$target" ]] || continue
      resolved="$(readlink "$target")"
      if [[ "$resolved" == "$AGENTS_SRC/"* ]]; then
        rm "$target"
        info "  removed agent link $(basename "$target")"
      fi
    done
  else
    info "  no agent directory at $USER_AGENT_DIR"
  fi

  # Package registrations (best effort — settings may already be clean).
  for pkg in "$REPO_ROOT" "$PI_AGENTS_TMUX_PACKAGE"; do
    if pi remove "$pkg" >/dev/null 2>&1; then
      info "  pi remove $pkg"
    else
      warn "  could not pi remove $pkg (maybe not installed)"
    fi
  done

  info "Done. Restart pi (or /reload) to drop the workflows and skills."
  exit 0
fi

# ---- 1. orchestration package ----------------------------------------------

if [[ "$MODE" == "install" ]]; then
  info "Installing orchestration package: $PI_AGENTS_TMUX_PACKAGE"
  pi install "$PI_AGENTS_TMUX_PACKAGE"

  # ---- 2. this repo as a pi package -----------------------------------------

  info "Installing pi package from $REPO_ROOT (skills, workflows)"
  pi install "$REPO_ROOT"

  if [[ -n "$PI_EXTENSIONS_PACKAGE" ]]; then
    info "Installing separate runtime extensions package: $PI_EXTENSIONS_PACKAGE"
    pi install "$PI_EXTENSIONS_PACKAGE"
  else
    info "Runtime extensions are separate; set PI_EXTENSIONS_PACKAGE to install pi-extensions."
  fi
fi

# ---- 3. agent symlinks -------------------------------------------------------

if [[ ! -d "$AGENTS_SRC" ]] || ! compgen -G "$AGENTS_SRC/*.md" >/dev/null; then
  warn "No agent files in $AGENTS_SRC — skipping agent symlinks."
else
  mkdir -p "$USER_AGENT_DIR"

  linked=0
  refreshed=0
  skipped=0
  removed=0
  for agent in "$AGENTS_SRC"/*.md; do
    [[ -e "$agent" ]] || continue
    name="$(basename "$agent")"
    target="$USER_AGENT_DIR/$name"

    if [[ -L "$target" ]]; then
      resolved="$(readlink "$target")"
      if [[ "$resolved" == "$AGENTS_SRC/"* ]]; then
        # Owned symlink: refresh so re-runs pick up moves/renames.
        ln -sf "$agent" "$target"
        refreshed=$((refreshed + 1))
      else
        warn "Refusing to overwrite existing symlink: $target (not a symlink to this repo)"
        skipped=$((skipped + 1))
      fi
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
    [[ -L "$target" ]] || continue
    resolved="$(readlink "$target")"
    if [[ "$resolved" == "$AGENTS_SRC/"* && ! -e "$resolved" ]]; then
      rm "$target"
      removed=$((removed + 1))
    fi
  done

  info "Agents in $USER_AGENT_DIR: $linked linked, $refreshed refreshed, $removed stale removed"
  info "Agents are generic defaults — customize per project in <project>/.pi/agents/ (see README.md)"
  if [[ "$skipped" -gt 0 ]]; then
    warn "$skipped existing file(s) left untouched"
  fi
fi

if [[ "$MODE" == "links-only" ]]; then
  info "Done. Link-only mode skipped pi package installation."
  exit 0
fi

# ---- 4. next steps -----------------------------------------------------------

info "Done. Restart pi (or run /reload) to load skills and workflow prompt templates."
info "Agents are discovered fresh on each subagent invocation — no reload needed."
info "Invoke a workflow explicitly with its /command (see README.md)."
info "For pane agents, run Pi from a tmux session with the recommended key settings."
info "Teardown: $REPO_ROOT/scripts/setup.sh --remove"
