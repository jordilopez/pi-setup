#!/usr/bin/env bash
# Install or update this pi-setup package in the current Pi instance.
#
# Idempotent: safe to re-run after pulling changes.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v pi >/dev/null 2>&1; then
  printf '\033[33m[setup]\033[0m pi not found on PATH — install Pi first, then re-run this script.\n' >&2
  exit 1
fi

printf '\033[32m[setup]\033[0m Installing/updating package from %s\n' "$REPO_ROOT" >&2
pi install "$REPO_ROOT"
printf '\033[32m[setup]\033[0m Done. Restart Pi or run /reload to load the updated package.\n' >&2
