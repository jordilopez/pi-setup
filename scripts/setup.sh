#!/usr/bin/env bash
#
# Bootstrap installer for the personal Pi package set.
#
# Installs:
#   1. @vanillagreen/pi-agents-tmux - subagent orchestration tools
#   2. pi-setup                     - skills, extensions, agents, and workflows
#
# Skills, extensions, agents, and workflows live in this repository and are
# discovered from the `pi` manifest in package.json.
#
# Teardown: `scripts/setup.sh --remove` removes the package registrations. Pass
# the same source overrides used during installation when a local checkout was
# not available anymore.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_AGENTS_TMUX_PACKAGE="${PI_AGENTS_TMUX_PACKAGE:-npm:@vanillagreen/pi-agents-tmux@3.0.0}"
MODE="install"

case "${1:-}" in
  "") ;;
  --remove) MODE="remove" ;;
  --help|-h)
    cat <<EOF
Usage: $0 [--remove]

Install or remove the Pi package set. Skills, extensions, agents, and
workflows are bundled in pi-setup and discovered from its pi manifest.

Packages:
  orchestration: $PI_AGENTS_TMUX_PACKAGE
  pi-setup:      $REPO_ROOT (local)

Environment overrides:
  PI_AGENTS_TMUX_PACKAGE

Use the same overrides with --remove when removing packages installed from
non-default sources.
EOF
    exit 0
    ;;
  *)
    printf 'Usage: %s [--remove]\n' "$0" >&2
    exit 2
    ;;
esac

warn() { printf '\033[33m[setup]\033[0m %s\n' "$*" >&2; }
info() { printf '\033[32m[setup]\033[0m %s\n' "$*" >&2; }

if ! command -v pi >/dev/null 2>&1; then
  warn "pi not found on PATH — install pi first, then re-run this script."
  exit 1
fi

# Pane agents need a live tmux session. Background agents and package
# installation work without one, so setup warns instead of failing.
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
elif (( ! tmux_version_ok )); then
  warn "tmux ${tmux_version:-unknown} detected — pane agents need tmux >= 3.5."
elif [[ -z "${TMUX:-}" ]]; then
  warn "tmux $tmux_version is available, but this shell is outside tmux."
  warn "Start Pi inside tmux for pane agents; installation can continue."
else
  info "tmux $tmux_version session detected; pane agents can use visible panes."
  extended_keys="$(tmux show-options -gqv extended-keys 2>/dev/null || true)"
  extended_keys_format="$(tmux show-options -gqv extended-keys-format 2>/dev/null || true)"
  if [[ "$extended_keys" != "on" || "$extended_keys_format" != "csi-u" ]]; then
    warn "tmux extended keys are not configured as recommended (on / csi-u)."
    warn "Add the settings from README.md, then start a fresh tmux server."
  fi
fi

if [[ "$MODE" == "remove" ]]; then
  info "Removing the Pi package set"

  pi remove "$REPO_ROOT" >/dev/null 2>&1 || true
  if pi remove "$PI_AGENTS_TMUX_PACKAGE" >/dev/null 2>&1; then
    info "  removed $PI_AGENTS_TMUX_PACKAGE"
  else
    warn "  could not remove $PI_AGENTS_TMUX_PACKAGE (maybe not installed)"
  fi

  info "Done. Restart Pi or run /reload."
  exit 0
fi

info "Installing orchestration package: $PI_AGENTS_TMUX_PACKAGE"
pi install "$PI_AGENTS_TMUX_PACKAGE"

info "Installing Pi package: $REPO_ROOT"
pi install "$REPO_ROOT"

info "Done. Restart Pi or run /reload to load the installed packages."
info "Teardown: $REPO_ROOT/scripts/setup.sh --remove"