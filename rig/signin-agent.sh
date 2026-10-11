#!/bin/sh
# The sign-in-on rig's agent (:5176, behind the sign-in proxy :3989): real sign-in, no test role, no intake pipeline.
#   rig/signin-agent.sh          start (or restart)
#   rig/signin-agent.sh stop
# It shares the rig database with the main agent (:5175) and runs the same 30 s look-up ticker, but it has no CNAIR
# portal: a due reference look-up it picks up is recorded as "switched off on this server" and never retried. So the
# intake suites that wait for look-up retries (rig/intake/e2e-scheduled.mjs, e2e-classify.mjs) need it stopped.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; SCR="$ROOT/rig/.scratch"
pid=$(lsof -tiTCP:5176 -sTCP:LISTEN || true); [ -n "$pid" ] && kill $pid || true
[ "$1" = "stop" ] && { echo "stopped :5176"; exit 0; }
sleep 1
( cd "$ROOT/agent" && env -i PATH="$PATH" HOME="$HOME" PORT=5176 ICU_TIMEZONE_FILES_DIR="$SCR/icu-tz" TZDATA_LATEST_CHECK=off \
    DISABLE_AUTH_FOR_TESTING=false AGENT_TEST_ROLE= INTAKE_PIPELINE=off ADMIN_EMAILS= DEVELOPER_EMAILS= \
    node --env-file="$ROOT/.env.rig" server.mjs > "$SCR/agent-auth.out" 2>&1 & )
sleep 3
lsof -tiTCP:5176 -sTCP:LISTEN >/dev/null && echo "up :5176" || echo "DOWN :5176 — see $SCR/agent-auth.out"
