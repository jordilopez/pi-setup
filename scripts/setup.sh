#!/usr/bin/env bash
#
# Bootstrap installer for the personal Pi package set.
#
# Modes:
#   default               - install; interactive on a TTY, picks an
#                           orchestrator backend (herdr | pi-subagents
#                           | tmux | none).
#   --remove              - uninstall pi-setup and the skills package.
#                           Does NOT touch the orchestrator; remove it
#                           directly with `pi remove <package>`.
#   --non-interactive     - skip the orchestrator prompt; default to herdr.
#   --backend=<name>      - explicit backend; implies --non-interactive.
#                           <name> is a short alias (herdr | pi-subagents
#                           | tmux | none) or the package name itself
#                           (e.g. npm:@maxiaochao/pi-herdr-subagents).
#   --help                - show usage.
#
# Skills and extensions live in this repository and are discovered from the
# `pi` manifest in `package.json`. The orchestrator install source can be
# overridden via PI_SUBAGENTS_PACKAGE (a literal `pi install` source).
#
# Teardown: `scripts/setup.sh --remove` (or `npm run setup:remove`).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_AGENT_SKILLS_PACKAGE="${PI_AGENT_SKILLS_PACKAGE:-git:git@github.com:jordilopez/pi-agent-skills.git}"
MODE="install"
BACKEND="${PI_SUBAGENTS_BACKEND:-}"
NON_INTERACTIVE="${PI_SETUP_NON_INTERACTIVE:-}"

# Default orchestrator sources, one per backend. Shown verbatim in the
# interactive prompt so each choice names the package it will install.
DEFAULT_HERDR_SOURCE="npm:@maxiaochao/pi-herdr-subagents"
DEFAULT_SUBAGENTS_SOURCE="npm:pi-subagents"
DEFAULT_TMUX_SOURCE="npm:@vanillagreen/pi-agents-tmux"

# Argument parsing.
while [[ $# -gt 0 ]]; do
  case "$1" in
    --remove)                MODE="remove"; shift ;;
    --non-interactive)
      NON_INTERACTIVE=1
      shift
      ;;
    --backend)
      if [[ $# -lt 2 ]]; then
        printf '%s: --backend requires herdr, pi-subagents, tmux, or none\n' "$0" >&2
        exit 2
      fi
      BACKEND="$2"
      NON_INTERACTIVE=1
      shift 2
      ;;
    --backend=*)
      BACKEND="${1#*=}"
      NON_INTERACTIVE=1
      shift
      ;;
    --help|-h)
      cat <<EOF
Usage: $0 [--remove] [--non-interactive] [--backend=herdr|pi-subagents|tmux|none]

Install or remove the Pi package set. Skills and runtime extensions are
bundled in pi-setup and discovered from its pi manifest.

Default mode (interactive, on a TTY): asks which subagent orchestrator
package to install, listing each package by name.

Flags:
  --remove              Uninstall pi-setup and the skills package.
  --non-interactive     Skip the backend prompt; default to herdr.
  --backend=NAME        Explicit backend. NAME is either a short alias
                        (herdr | pi-subagents | tmux | none) or a package
                        name (e.g. npm:@maxiaochao/pi-herdr-subagents).
                        Implies --non-interactive.
  --help, -h            Show this help.

Environment overrides:
  PI_SUBAGENTS_PACKAGE     Custom orchestrator install source (any string
                           accepted by \`pi install\`, e.g. npm:foo@1.2.3).
  PI_SUBAGENTS_BACKEND     Default backend if --backend is not given.
  PI_AGENT_SKILLS_PACKAGE  Custom skills package source.
  PI_SETUP_NON_INTERACTIVE Honor non-interactive mode from the env.

Subagent orchestrator choices (see README for what each does):
  1) npm:@maxiaochao/pi-herdr-subagents
  2) npm:pi-subagents
  3) npm:@vanillagreen/pi-agents-tmux
  4) none

Use the same overrides with --remove when removing packages installed from
non-default sources.
EOF
      exit 0
      ;;
    *)
      printf 'Usage: %s [--remove] [--non-interactive] [--backend=herdr|pi-subagents|tmux|none]\n' "$0" >&2
      exit 2
      ;;
  esac
done

warn() { printf '\033[33m[setup]\033[0m %s\n' "$*" >&2; }
info() { printf '\033[32m[setup]\033[0m %s\n' "$*" >&2; }

if ! command -v pi >/dev/null 2>&1; then
  warn "pi not found on PATH — install pi first, then re-run this script."
  exit 1
fi

# Piped/redirected stdin is not interactive, even with --backend omitted.
if [[ ! -t 0 ]]; then
  NON_INTERACTIVE=1
fi

# Map a user-provided value (short alias or package name) to a canonical
# backend alias. Prints nothing for an unrecognized value.
normalize_backend() {
  case "$1" in
    herdr|"$DEFAULT_HERDR_SOURCE") printf 'herdr' ;;
    pi-subagents|"$DEFAULT_SUBAGENTS_SOURCE") printf 'pi-subagents' ;;
    tmux|"$DEFAULT_TMUX_SOURCE") printf 'tmux' ;;
    none) printf 'none' ;;
    *) printf '' ;;
  esac
}

# Resolve the orchestrator backend the user picked.
#
# Inputs:
#   $BACKEND         - alias or package name from --backend /
#                      PI_SUBAGENTS_BACKEND; empty when relying on
#                      non-interactive default.
#   $NON_INTERACTIVE - "1" if --non-interactive was passed or stdin
#                      was piped/redirected.
#
# Validates BACKEND against the canonical alias table; exits 2 if it
# is set but unrecognized. Otherwise prompts on a TTY and accepts a
# number, Enter (default), or the same canonical alias. Writes the
# resolved alias back to BACKEND; falls back to "herdr".
resolve_backend() {
  local picked
  picked="$(normalize_backend "$BACKEND")"
  if [[ -z "$picked" && -n "$BACKEND" ]]; then
    printf '\033[31m[setup]\033[0m unknown backend: %s\n' "$BACKEND" >&2
    printf '\033[31m[setup]\033[0m expected herdr, pi-subagents, tmux, none, or a package name\n' >&2
    exit 2
  fi
  if [[ -z "$picked" && "$NON_INTERACTIVE" != "1" ]]; then
    printf '\nChoose a subagent orchestrator to install:\n' >&2
    printf '  1) %s\n' "$DEFAULT_HERDR_SOURCE" >&2
    printf '  2) %s\n' "$DEFAULT_SUBAGENTS_SOURCE" >&2
    printf '  3) %s\n' "$DEFAULT_TMUX_SOURCE" >&2
    printf '  4) none\n' >&2
    local reply
    while true; do
      read -r -p 'Choice [1]: ' reply || reply=""
      case "$reply" in
        ""|1) picked="herdr"; break ;;
        2) picked="pi-subagents"; break ;;
        3) picked="tmux"; break ;;
        4) picked="none"; break ;;
        *) printf '\033[31m[setup]\033[0m invalid choice: %s\n' "$reply" >&2 ;;
      esac
    done
  fi
  BACKEND="${picked:-herdr}"
}

if [[ "$MODE" == "remove" ]]; then
  info "Removing the Pi package set"
  pi remove "$REPO_ROOT" >/dev/null 2>&1 || true

  if [[ -n "${PI_SUBAGENTS_PACKAGE:-}" ]]; then
    if pi remove "$PI_SUBAGENTS_PACKAGE" >/dev/null 2>&1; then
      info "  removed $PI_SUBAGENTS_PACKAGE"
    else
      warn "  could not remove $PI_SUBAGENTS_PACKAGE (maybe not installed)"
    fi
  else
    info "  skipping orchestrator removal (PI_SUBAGENTS_PACKAGE not set)"
  fi

  if pi remove "$PI_AGENT_SKILLS_PACKAGE" >/dev/null 2>&1; then
    info "  removed $PI_AGENT_SKILLS_PACKAGE"
  else
    warn "  could not remove $PI_AGENT_SKILLS_PACKAGE (maybe not installed)"
  fi

  info "Done."
  info "Note: --remove only cleans up the orchestrator if PI_SUBAGENTS_PACKAGE was"
  info "set during install. To remove the default-backend orchestrator, run:"
  info "    pi remove npm:@maxiaochao/pi-herdr-subagents    # herdr (default)"
  info "    pi remove npm:pi-subagents                     # general-purpose"
  info "    pi remove npm:@vanillagreen/pi-agents-tmux     # legacy tmux"
  exit 0
fi

resolve_backend

ORCH_SOURCE=""
case "$BACKEND" in
  herdr)
    ORCH_SOURCE="${PI_SUBAGENTS_PACKAGE:-$DEFAULT_HERDR_SOURCE}"
    ;;
  pi-subagents)
    ORCH_SOURCE="${PI_SUBAGENTS_PACKAGE:-$DEFAULT_SUBAGENTS_SOURCE}"
    ;;
  tmux)
    ORCH_SOURCE="${PI_SUBAGENTS_PACKAGE:-$DEFAULT_TMUX_SOURCE}"
    if ! command -v tmux >/dev/null 2>&1; then
      warn "tmux backend selected but tmux is not on PATH."
    elif [[ -z "${TMUX:-}" ]]; then
      warn "tmux backend selected but this shell is outside tmux."
    fi
    warn "Pane agents need tmux 3.5+ with extended-keys=on and extended-keys-format=csi-u."
    ;;
  none)
    ORCH_SOURCE=""
    ;;
  *)
    printf '\033[31m[setup]\033[0m unknown backend: %s (expected herdr, pi-subagents, tmux, or none)\n' "$BACKEND" >&2
    exit 2
    ;;
esac

if [[ -n "$ORCH_SOURCE" ]]; then
  info "Installing orchestrator ($BACKEND): $ORCH_SOURCE"
  pi install "$ORCH_SOURCE"
else
  info "Skipping orchestrator install (backend=none)."
fi

info "Installing skills package: $PI_AGENT_SKILLS_PACKAGE"
pi install "$PI_AGENT_SKILLS_PACKAGE"

info "Installing Pi package: $REPO_ROOT"
pi install "$REPO_ROOT"

info "Done. Restart Pi or run /reload to load the installed packages."
info "Re-run with --backend=<herdr|pi-subagents|tmux|none> to switch orchestrators."
info "Teardown: $REPO_ROOT/scripts/setup.sh --remove"
