#!/usr/bin/env bash
# Load .env from project root and run the AIP sync server.
# Usage: run inside tmux so it survives SSH disconnect.
#   tmux new -s aip
#   cd ~/clearway-2 && ./scripts/run-aip-sync-server.sh
#   Detach: Ctrl+B then D

set -e
cd "$(dirname "$0")/.."
if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env
  set +a
fi
exec node scripts/aip-sync-server.mjs
