#!/bin/sh
# Passenger manifest on the rig: after rig/start.sh, restart the agent pointed at the per-operator mock Leon (:3993).
# Operator credentials come from the RIG database's leon_operators (rig/manifest/operators.mjs seed). Fake passengers
# only; nothing here can reach Leon or production.
#   rig/manifest/start.sh        rig/manifest/start.sh stop
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; RIG="$ROOT/rig"; SCR="$RIG/.scratch"; ENV="$ROOT/.env.rig"
for p in 5175 3993; do pid=$(lsof -tiTCP:$p -sTCP:LISTEN || true); [ -n "$pid" ] && kill $pid || true; done
[ "$1" = "stop" ] && exit 0
sleep 1
( cd "$RIG/manifest" && env -i PATH="$PATH" HOME="$HOME" PORT=3993 node mock-leon.mjs > "$SCR/mock-leon-operators.out" 2>&1 & )
mkdir -p "$SCR/manifest-intake"
( cd "$ROOT/agent" && env -i PATH="$PATH" HOME="$HOME" PORT=5175 ICU_TIMEZONE_FILES_DIR="$SCR/icu-tz" TZDATA_LATEST_CHECK=off \
    LEON_OPERATOR_API_BASE="http://127.0.0.1:3993/{opr}" LEON_REFRESH_TOKEN_ENCRYPTION_KEY=rig-local-only-not-a-secret \
    INTAKE_ROOT="$SCR/manifest-intake" STORAGE_ROOT="$SCR/manifest-storage" \
    node --env-file="$ENV" server.mjs > "$SCR/agent.out" 2>&1 & )
sleep 3
for p in 5175 3993; do lsof -tiTCP:$p -sTCP:LISTEN >/dev/null && echo "up :$p" || echo "DOWN :$p — see $SCR/*.out"; done
