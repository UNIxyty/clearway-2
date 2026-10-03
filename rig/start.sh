#!/usr/bin/env bash
# Starts the whole test rig against the LOCAL database only. Loads .env.rig and nothing else — never .env.
#   rig/start.sh          start portal (3998), agent (5175), wall sandbox (5199), proxy (3999), fixtures (3997)
#   rig/start.sh stop     stop them
# Prerequisites: rig/db.sh start (once); npm run build (portal standalone) after console changes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; RIG="$ROOT/rig"; SCR="$RIG/.scratch"; mkdir -p "$SCR/storage" "$SCR/cache" "$SCR/wall"
ENV="$ROOT/.env.rig"
[ -f "$ENV" ] || { echo "no .env.rig — run rig/db.sh start first"; exit 2; }
if grep -qE "supabase\.co|verxyl\.com" "$ENV"; then echo "REFUSING: .env.rig points outside the local stack"; exit 78; fi
stop() { for p in 3998 3999 5175 5199 3997 3996 3995 3994; do pid=$(lsof -tiTCP:$p -sTCP:LISTEN || true); [ -n "$pid" ] && kill $pid && echo "stopped :$p"; done; }
if [ "${1:-}" = "stop" ]; then stop; exit 0; fi
stop >/dev/null 2>&1 || true
cd "$ROOT"
[ -f .next/standalone/server.js ] || { echo "no console build: run rig/build-portal.sh"; exit 2; }
"$RIG/check-portal-build.sh" || exit 78   # a plain npm run build bakes in production values: refuse it
rm -rf .next/standalone/.next/static .next/standalone/public && cp -R .next/static .next/standalone/.next/static && cp -R public .next/standalone/public
( env -i PATH="$PATH" HOME="$HOME" PORT=3998 HOSTNAME=127.0.0.1 node --env-file="$ENV" .next/standalone/server.js > "$SCR/portal.out" 2>&1 & )
# The provider portal is the recorded-protocol mock on :3994 (never the real portal: env -i and .env.rig keep
# the production credentials out of reach), and reference look-ups retry within
# a minute instead of over 24 h so the tests can watch them.
# Current tz data for the agent (rig/tzdata.sh fetches it). Without it the agent runs on Node's frozen copy, its
# self-test fails, and local → UTC conversion is refused: loud, by design.
[ -f "$SCR/icu-tz/zoneinfo64.res" ] || echo "NOTE: no rig/.scratch/icu-tz — run rig/tzdata.sh, or the agent will refuse to convert local times"
( cd agent && env -i PATH="$PATH" HOME="$HOME" PORT=5175 AGENT_LOG_RANGES=true ICU_TIMEZONE_FILES_DIR="$SCR/icu-tz" TZDATA_LATEST_CHECK=off CNAIR_PORTAL_BASE=http://127.0.0.1:3994 CNAIR_USER=mock CNAIR_PASSWORD=mock INTAKE_LOOKUP_SCHEDULE_MIN="0,0.02,0.04" INTAKE_APPROVAL_HOURS="${INTAKE_APPROVAL_HOURS:-4}" node --env-file="$ENV" server.mjs > "$SCR/agent.out" 2>&1 & )
[ -d "$SCR/wall/upstream" ] || cp -R "$ROOT/164.92.164.35" "$SCR/wall/upstream"   # the wall's static timeline copy
( cd "$SCR/wall" && env -i PATH="$PATH" HOME="$HOME" PORT=5199 node --env-file="$ENV" "$ROOT/digital-wall/server.mjs" > "$SCR/wall.out" 2>&1 & )
( cd "$RIG" && env -i PATH="$PATH" HOME="$HOME" RIG_SCRATCH="$SCR" node proxy.mjs > "$SCR/proxy.out" 2>&1 & )
( cd "$RIG/fixtures" && env -i PATH="$PATH" HOME="$HOME" PORT=3997 node server.mjs > "$SCR/fixtures.out" 2>&1 & )
( cd "$RIG/intake" && env -i PATH="$PATH" HOME="$HOME" PORT=3996 node mock-resend.mjs > "$SCR/mock-resend.out" 2>&1 & )
# The provider portal: a recorded-protocol mock (never the live portal from the rig). Its log proves when logins happen.
rm -f "$SCR/cnair-mock-log.jsonl" "$SCR/cnair-mock-log.jsonl.break"
( cd "$RIG/intake" && env -i PATH="$PATH" HOME="$HOME" PORT=3994 RIG_SCRATCH="$SCR" node mock-cnair.mjs > "$SCR/mock-cnair.out" 2>&1 & )
if grep -q "^LEON_API_BASE=http://127.0.0.1:3995" "$ENV"; then ( cd "$RIG/intake" && env -i PATH="$PATH" HOME="$HOME" PORT=3995 RIG_SCRATCH="$SCR" node mock-leon.mjs > "$SCR/mock-leon.out" 2>&1 & ); fi
sleep 5
for p in 3998 5175 5199 3999 3997 3996 3995 3994; do lsof -tiTCP:$p -sTCP:LISTEN >/dev/null && echo "up :$p" || { echo "DOWN :$p — see $SCR/*.out"; }; done
curl -s -H "accept: application/json" -H "x-clearway-client: extension" http://127.0.0.1:3999/agent/api/extension/session | head -c 160; echo
