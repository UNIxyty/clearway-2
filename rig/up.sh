#!/usr/bin/env bash
# The whole rig up, as a full run needs it (2026-11-07). Until now the sign-in half was started by hand from three
# places (a scratch rebuild script, a recipe in rig/wall/access-check.mjs, rig/signin-agent.sh); the rig box on the
# server (docs/rig-on-server-plan.md) needs it in one command. Idempotent: restarts what runs.
#   rig/up.sh            database, build if missing, the sign-in-off rig (rig/start.sh), the sign-in-on portal :3992,
#                        wall :5198, agent :5176, both proxies (:3999, :3989), the manifest's Leon, tz data
#   rig/up.sh status     what answers
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; RIG="$ROOT/rig"; SCR="$RIG/.scratch"; ENV="$ROOT/.env.rig"
cd "$ROOT"; mkdir -p "$SCR"
status() { for p in 54321 3998 3999 5175 5199 3992 3989 5176 5198 3985 3986 3993 3994 3995 3996 3997; do lsof -tiTCP:$p -sTCP:LISTEN >/dev/null 2>&1 && echo "up   :$p" || echo "DOWN :$p"; done; }
[ "${1:-}" = status ] && { status; exit 0; }
kill_port() { local pid; pid=$(lsof -tiTCP:$1 -sTCP:LISTEN 2>/dev/null || true); [ -n "$pid" ] && kill $pid || true; }

# the database: started (pinned CLI, rig/db.sh), the accounts approved, the grants seeded
curl -s -o /dev/null --max-time 3 http://127.0.0.1:54321/rest/v1/ || bash "$RIG/db.sh" start
bash "$RIG/approve-rig-accounts.sh" > /dev/null
docker exec -i supabase_db_rig psql -U postgres -q < docs/supabase-permissions.sql > /dev/null 2>&1
[ -d "$SCR/icu-tz" ] || bash "$RIG/tzdata.sh" > /dev/null
[ -f .next/standalone/server.js ] || bash "$RIG/build-portal.sh" > "$SCR/build-portal.out" 2>&1

# the sign-in-off rig: portal :3998, agent :5175, wall :5199, proxy :3999, mocks
bash "$RIG/start.sh" > "$SCR/start.out" 2>&1
# the manifest's per-operator Leon (:3993) and the agent restarted against it
bash "$RIG/manifest/start.sh" > "$SCR/manifest-start.out" 2>&1 || true

# the sign-in-on portal :3992 (the scratch rebuild script's line)
kill_port 3992; sleep 1
( env -i PATH="$PATH" HOME="$HOME" PORT=3992 HOSTNAME=127.0.0.1 PERMISSIONS_TTL_MS=1000 DISABLE_AUTH_FOR_TESTING=false AGENT_TEST_ROLE= ADMIN_EMAILS= DEVELOPER_EMAILS= nohup node --env-file="$ENV" .next/standalone/server.js > "$SCR/portal-auth.out" 2>&1 & )

# the sign-in-on wall :5198 (rig/wall/access-check.mjs's recipe), with the same rig-only settings as rig/start.sh's :5199
eval "$(grep '^WALL_RIG=' "$RIG/start.sh")"
kill_port 5198; mkdir -p "$SCR/wall-auth"
( cd "$SCR/wall-auth" && env -i PATH="$PATH" HOME="$HOME" PORT=5198 DISABLE_AUTH_FOR_TESTING=false ADMIN_EMAILS= DEVELOPER_EMAILS= $WALL_RIG nohup node --env-file="$ENV" "$ROOT/digital-wall/server.mjs" > "$SCR/wall-auth.out" 2>&1 & )

# the sign-in-on agent :5176, and both proxies
sh "$RIG/signin-agent.sh" > "$SCR/signin-agent.out" 2>&1
bash "$RIG/restart-proxies.sh" > /dev/null

for _ in $(seq 60); do curl -s -o /dev/null --max-time 2 http://127.0.0.1:3989/login && curl -s -o /dev/null --max-time 2 http://127.0.0.1:3999/login && break; sleep 1; done
status
