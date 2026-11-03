#!/usr/bin/env bash
#
# Bootstrap installer for the personal Pi package set.
#
# Installs:
#   1. @maxiaochao/pi-herdr-subagents - subagent orchestration tools
#   2. pi-setup                       - skills and extensions
#
# Skills and extensions live in this repository and are discovered from the
# `pi` manifest in package.json.
#
# Teardown: `scripts/setup.sh --remove` removes the package registrations. Pass
# the same source overrides used during installation when a local checkout was
# not available anymore.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_SUBAGENTS_PACKAGE="${PI_SUBAGENTS_PACKAGE:-npm:@maxiaochao/pi-herdr-subagents}"
PI_AGENT_SKILLS_PACKAGE="${PI_AGENT_SKILLS_PACKAGE:-git:git@github.com:jordilopez/pi-agent-skills.git}"
MODE="install"

case "${1:-}" in
  "") ;;
  --remove) MODE="remove" ;;
  --help|-h)
    cat <<EOF
Usage: $0 [--remove]

Install or remove the Pi package set. Skills and extensions are bundled in
pi-setup and discovered from its pi manifest.

Packages:
  subagents: $PI_SUBAGENTS_PACKAGE
  skills:    $PI_AGENT_SKILLS_PACKAGE
  pi-setup:  $REPO_ROOT (local)

Environment overrides:
  PI_SUBAGENTS_PACKAGE
  PI_AGENT_SKILLS_PACKAGE

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

if [[ "$MODE" == "remove" ]]; then
  info "Removing the Pi package set"

  pi remove "$REPO_ROOT" >/dev/null 2>&1 || true
  if pi remove "$PI_SUBAGENTS_PACKAGE" >/dev/null 2>&1; then
    info "  removed $PI_SUBAGENTS_PACKAGE"
  else
    warn "  could not remove $PI_SUBAGENTS_PACKAGE (maybe not installed)"
  fi
  if pi remove "$PI_AGENT_SKILLS_PACKAGE" >/dev/null 2>&1; then
    info "  removed $PI_AGENT_SKILLS_PACKAGE"
  else
    warn "  could not remove $PI_AGENT_SKILLS_PACKAGE (maybe not installed)"
  fi

  info "Done. Restart Pi or run /reload."
  exit 0
fi

info "Installing subagents package: $PI_SUBAGENTS_PACKAGE"
pi install "$PI_SUBAGENTS_PACKAGE"

info "Installing skills package: $PI_AGENT_SKILLS_PACKAGE"
pi install "$PI_AGENT_SKILLS_PACKAGE"

info "Installing Pi package: $REPO_ROOT"
pi install "$REPO_ROOT"

info "Done. Restart Pi or run /reload to load the installed packages."
info "Teardown: $REPO_ROOT/scripts/setup.sh --remove"