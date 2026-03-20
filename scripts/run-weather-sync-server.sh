#!/usr/bin/env bash
# Run on NOTAM EC2 (SSH in first). Loads .env and starts weather-only sync server.
# Usage (all on EC2):
#   cd ~/clearway-2 && git pull
#   tmux new -s weather
#   ./scripts/run-weather-sync-server.sh
#   Detach: Ctrl+B then D. Reattach: tmux attach -t weather

set -e
cd "$(dirname "$0")/.."
if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env
  set +a
fi
export SYNC_SERVER_MODE=weather
export NOTAM_SYNC_PORT="${WEATHER_SYNC_PORT:-3003}"
exec node scripts/notam-sync-server.mjs
