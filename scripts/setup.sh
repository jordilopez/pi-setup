#!/usr/bin/env bash
#
# Bootstrap installer for the personal Pi package set.
#
# Modes:
#   default               - install; interactive on a TTY, picks an
#                           orchestrator backend (herdr | tmux | none).
#   --remove              - uninstall pi-setup and the skills package.
#                           Does NOT touch the orchestrator; remove it
#                           directly with `pi remove <package>`.
#   --non-interactive     - skip the orchestrator prompt; default to herdr.
#   --backend=<name>      - explicit backend; implies --non-interactive.
#                           <name> is one of: herdr, tmux, none.
#   --help                - show usage.
#
# Skills and extensions live in this repository and are discovered from the
# `pi` manifest in `package.json`. The orchestrator backend can be
# overridden via PI_SUBAGENTS_PACKAGE (a literal `pi install` source).
#
# Teardown: `scripts/setup.sh --remove` (or `npm run setup:remove`).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_AGENT_SKILLS_PACKAGE="${PI_AGENT_SKILLS_PACKAGE:-git:git@github.com:jordilopez/pi-agent-skills.git}"
MODE="install"
BACKEND="${PI_SUBAGENTS_BACKEND:-}"
NON_INTERACTIVE="${PI_SETUP_NON_INTERACTIVE:-}"

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
        printf '%s: --backend requires tmux, herdr, or none\n' "$0" >&2
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
Usage: $0 [--remove] [--non-interactive] [--backend=tmux|herdr|none]

Install or remove the Pi package set. Skills and runtime extensions are
bundled in pi-setup and discovered from its pi manifest.

Default mode (interactive, on a TTY): asks which subagent orchestrator
backend to install — herdr (recommended), tmux (legacy), or none (skip).

Flags:
  --remove              Uninstall pi-setup and the skills package.
  --non-interactive     Skip the backend prompt; default to herdr.
  --backend=NAME        Explicit backend: tmux | herdr | none. Implies
                        --non-interactive.
  --help, -h            Show this help.

Environment overrides:
  PI_SUBAGENTS_PACKAGE     Custom orchestrator install source (any string
                           accepted by \`pi install\`, e.g. npm:foo@1.2.3).
  PI_SUBAGENTS_BACKEND     Default backend if --backend is not given.
  PI_AGENT_SKILLS_PACKAGE  Custom skills package source.
  PI_SETUP_NON_INTERACTIVE Honor non-interactive mode from the env.

Subagent orchestrator default sources:
  herdr = npm:@maxiaochao/pi-herdr-subagents (recommended; uses Herdr as
          pane host; pi-herdr-subagents must be >= 0.10 for the bundled
          herdr_subagents tool to be registered when running inside Herdr).
  tmux  = npm:@vanillagreen/pi-agents-tmux (legacy; requires tmux 3.5+ with
          extended-keys=on / extended-keys-format=csi-u).
  none  = skip the orchestrator install entirely.

Use the same overrides with --remove when removing packages installed from
non-default sources.
EOF
      exit 0
      ;;
    *)
      printf 'Usage: %s [--remove] [--non-interactive] [--backend=tmux|herdr|none]\n' "$0" >&2
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

resolve_backend() {
  local picked="$BACKEND"
  if [[ -z "$picked" && "$NON_INTERACTIVE" != "1" ]]; then
    printf '\nChoose a subagent orchestrator backend:\n' >&2
    PS3="Choice [herdr]: "
    select backend in herdr tmux none; do
      case "$backend" in
        herdr|tmux|none) picked="$backend"; break ;;
        *) printf '\033[31m[setup]\033[0m invalid: %s\n' "$REPLY" >&2 ;;
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
  info "    pi remove npm:@vanillagreen/pi-agents-tmux     # legacy tmux"
  exit 0
fi

resolve_backend

ORCH_SOURCE=""
case "$BACKEND" in
  herdr)
    ORCH_SOURCE="${PI_SUBAGENTS_PACKAGE:-npm:@maxiaochao/pi-herdr-subagents}"
    ;;
  tmux)
    ORCH_SOURCE="${PI_SUBAGENTS_PACKAGE:-npm:@vanillagreen/pi-agents-tmux}"
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
    printf '\033[31m[setup]\033[0m unknown backend: %s (expected tmux, herdr, or none)\n' "$BACKEND" >&2
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
info "Re-run with --backend=<tmux|herdr|none> to switch orchestrators."
info "Teardown: $REPO_ROOT/scripts/setup.sh --remove"
