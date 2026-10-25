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
stop() { for p in 3998 3999 5175 5199 3997 3996 3995 3994 3986 3985; do pid=$(lsof -tiTCP:$p -sTCP:LISTEN || true); [ -n "$pid" ] && kill $pid && echo "stopped :$p"; done; }
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
( cd agent && env -i PATH="$PATH" HOME="$HOME" PORT=5175 RESEND_BASE_URL=http://127.0.0.1:3996 AGENT_LOG_RANGES=true ICU_TIMEZONE_FILES_DIR="$SCR/icu-tz" TZDATA_LATEST_CHECK=off CNAIR_PORTAL_BASE=http://127.0.0.1:3994 CNAIR_USER=mock CNAIR_PASSWORD=mock INTAKE_LOOKUP_SCHEDULE_MIN="0,0.02,0.04" INTAKE_APPROVAL_HOURS="${INTAKE_APPROVAL_HOURS:-4}" node --env-file="$ENV" server.mjs > "$SCR/agent.out" 2>&1 & )
mkdir -p "$SCR/wall"
# The wall's Leon is its own per-operator mock (:3985, rig/wall/mock-leon.mjs: a day of invented flights in every
# state); they reach the board through the wall's real sync. LEON_OPERATOR_API_BASE keeps every Leon call (sync and webhook registration) on the mock, and the
# key decrypts the rig's operator tokens (rig/manifest/operators.mjs). The wall's mail goes to the mock Resend (:3996).
WALL_RIG="LEON_REFRESH_TOKEN_ENCRYPTION_KEY=rig-local-only-not-a-secret LEON_OPERATOR_API_BASE=http://127.0.0.1:3985/{opr} LEON_WEBHOOK_KEY_BASE_URL=http://127.0.0.1:3985/cwy-cwy RESEND_BASE_URL=http://127.0.0.1:3996"
# Both rig walls (:5199 here, the sign-in-on :5198 started by hand, see rig/wall/access-check.mjs) run from scratch
# folders: give them the wall's email templates and airport countries, and the portal its invented NOTAMs and AIP
# stand-ins (rig/wall/seed-portal.mjs), so mail, CAA country matching and the NOTAM check work there.
for d in wall wall-auth; do mkdir -p "$SCR/$d/data"; ln -sfn "$ROOT/digital-wall/templates" "$SCR/$d/templates"; [ -f "$SCR/$d/data/geo-airports.json" ] || cp "$ROOT/digital-wall/data/geo-airports.json" "$SCR/$d/data/"; done
node "$RIG/wall/seed-portal.mjs" > /dev/null
bash "$RIG/approve-rig-accounts.sh"
( cd "$RIG/wall" && env -i PATH="$PATH" HOME="$HOME" PORT=3985 node mock-leon.mjs > "$SCR/wall-mock-leon.out" 2>&1 & )
( cd "$SCR/wall" && env -i PATH="$PATH" HOME="$HOME" PORT=5199 $WALL_RIG node --env-file="$ENV" "$ROOT/digital-wall/server.mjs" > "$SCR/wall.out" 2>&1 & )
( cd "$RIG" && env -i PATH="$PATH" HOME="$HOME" RIG_SCRATCH="$SCR" node proxy.mjs > "$SCR/proxy.out" 2>&1 & )
( cd "$RIG/fixtures" && env -i PATH="$PATH" HOME="$HOME" PORT=3997 node server.mjs > "$SCR/fixtures.out" 2>&1 & )
# ElevenLabs on the rig is a local stand-in (rig/voice/mock-elevenlabs.mjs): no test waits on the real service, and the
# rig never spends the production account.
( cd "$ROOT" && env -i PATH="$PATH" HOME="$HOME" node rig/voice/mock-elevenlabs.mjs > "$SCR/mock-elevenlabs.out" 2>&1 & )
( cd "$RIG/intake" && env -i PATH="$PATH" HOME="$HOME" PORT=3996 node mock-resend.mjs > "$SCR/mock-resend.out" 2>&1 & )
# The provider portal: a recorded-protocol mock (never the live portal from the rig). Its log proves when logins happen.
rm -f "$SCR/cnair-mock-log.jsonl" "$SCR/cnair-mock-log.jsonl.break"
( cd "$RIG/intake" && env -i PATH="$PATH" HOME="$HOME" PORT=3994 RIG_SCRATCH="$SCR" node mock-cnair.mjs > "$SCR/mock-cnair.out" 2>&1 & )
if grep -q "^LEON_API_BASE=http://127.0.0.1:3995" "$ENV"; then ( cd "$RIG/intake" && env -i PATH="$PATH" HOME="$HOME" PORT=3995 RIG_SCRATCH="$SCR" node mock-leon.mjs > "$SCR/mock-leon.out" 2>&1 & ); fi
sleep 5
for p in 3998 5175 5199 3999 3997 3996 3995 3994 3986; do lsof -tiTCP:$p -sTCP:LISTEN >/dev/null && echo "up :$p" || { echo "DOWN :$p — see $SCR/*.out"; }; done
curl -s -H "accept: application/json" -H "x-clearway-client: extension" http://127.0.0.1:3999/agent/api/extension/session | head -c 160; echo
