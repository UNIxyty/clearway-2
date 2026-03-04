#!/usr/bin/env bash
# Run on AIP EC2 (SSH in first). Loads .env from project root and starts the AIP sync server.
# Usage (all on EC2):
#   cd ~/clearway-2 && git pull
#   tmux new -s aip
#   ./scripts/run-aip-sync-server.sh
#   Detach: Ctrl+B then D. Reattach: tmux attach -t aip

set -e
cd "$(dirname "$0")/.."
if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env
  set +a
fi
exec node scripts/aip-sync-server.mjs
