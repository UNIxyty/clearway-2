#!/usr/bin/env bash
# Run on NOTAM EC2 (SSH in first). Loads .env from project root and starts the NOTAM sync server.
# Usage (all on EC2):
#   cd ~/clearway-2 && git pull
#   tmux new -s notam
#   ./scripts/run-notam-sync-server.sh
#   Detach: Ctrl+B then D. Reattach: tmux attach -t notam

set -e
cd "$(dirname "$0")/.."
if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env
  set +a
fi
exec node scripts/notam-sync-server.mjs
