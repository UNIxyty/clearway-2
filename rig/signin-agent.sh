#!/bin/sh
# The sign-in-on rig's agent (:5176, behind the sign-in proxy :3989): real sign-in, no test role, no intake pipeline.
#   rig/signin-agent.sh          start (or restart)
#   rig/signin-agent.sh stop
# It shares the rig database with the main agent (:5175) and runs the same 30 s look-up ticker, but it has no CNAIR
# portal: a due reference look-up it picks up is recorded as "switched off on this server" and never retried. So the
# intake suites that wait for look-up retries (rig/intake/e2e-scheduled.mjs, e2e-classify.mjs) need it stopped.
# Its operators' Leon is the manifest's per-operator mock (:3993, rig/manifest/start.sh), as for the main agent, so
# the passenger manifest works signed in too.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; SCR="$ROOT/rig/.scratch"
pid=$(lsof -tiTCP:5176 -sTCP:LISTEN || true); [ -n "$pid" ] && kill $pid || true
[ "$1" = "stop" ] && { echo "stopped :5176"; exit 0; }
sleep 1
( cd "$ROOT/agent" && env -i PATH="$PATH" HOME="$HOME" PORT=5176 ICU_TIMEZONE_FILES_DIR="$SCR/icu-tz" TZDATA_LATEST_CHECK=off \
    DISABLE_AUTH_FOR_TESTING=false AGENT_TEST_ROLE= INTAKE_PIPELINE=off ADMIN_EMAILS= DEVELOPER_EMAILS= \
    LEON_OPERATOR_API_BASE="http://127.0.0.1:3993/{opr}" LEON_REFRESH_TOKEN_ENCRYPTION_KEY=rig-local-only-not-a-secret RESEND_BASE_URL=http://127.0.0.1:3996 \
    node --env-file="$ROOT/.env.rig" server.mjs > "$SCR/agent-auth.out" 2>&1 & )
# Wait up to 30 s: under load (2026-10-14, load 14) the agent took longer than a fixed 3 s and every suite after it failed.
for _ in $(seq 30); do lsof -tiTCP:5176 -sTCP:LISTEN >/dev/null && break; sleep 1; done
lsof -tiTCP:5176 -sTCP:LISTEN >/dev/null && echo "up :5176" || echo "DOWN :5176 — see $SCR/agent-auth.out"
