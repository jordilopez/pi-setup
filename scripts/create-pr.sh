#!/usr/bin/env bash
# Run the standalone PR flow without requiring a Pi session.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node --experimental-strip-types "$SCRIPT_DIR/create-pr.ts" "$@"
