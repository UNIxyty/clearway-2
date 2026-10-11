#!/usr/bin/env bash
# Every rig suite, in an order where each one finds (or makes) what it needs. The state goes in docs/rig-suites.md.
#   rig/run-all-suites.sh        → rig/.scratch/suites/<suite>.out, summary in rig/.scratch/suites/summary.log
# Needs the rig up: rig/start.sh, the sign-in-on services (portal :3992, proxy :3989, wall :5198, rig/signin-agent.sh)
# and the built console (opsboard-react/dist). Local mocks only; nothing reaches Leon, CNAIR or production.
cd "$(dirname "$0")/.."
OUT=rig/.scratch/suites; mkdir -p $OUT; LOG=$OUT/summary.log; : > $LOG
SCR="$PWD/rig/.scratch"; E="node --env-file=.env.rig"
run() { local name="$1"; shift; local out="$OUT/$(echo "$name" | tr '/ ' '__').out"; local t0=$(date +%s); "$@" > "$out" 2>&1 < /dev/null; local rc=$?; echo "$name rc=$rc $(( $(date +%s) - t0 ))s $(grep -cE '^(PASS|ok)' "$out") pass $(grep -cE '^(FAIL|not ok)' "$out") fail :: $(tail -1 "$out" | cut -c1-140)" >> $LOG; }
preview() { pkill -f "vite preview --port 4173"; sleep 1; ( cd opsboard-react && VITE_API_PROXY=http://127.0.0.1:$1 nohup npx vite preview --port 4173 --host 127.0.0.1 > ../rig/.scratch/vite-preview.out 2>&1 & ); sleep 4; }

# The manifest's mock Leon dates its flights from its own start, so start it fresh (this also restarts :5175).
rig/manifest/start.sh > $OUT/manifest-start.out 2>&1 < /dev/null
$E rig/manifest/operators.mjs seed >> $LOG 2>&1

# ── code-only and local tests
run no-real-passenger-data node rig/check-no-real-passenger-data.mjs
run intake/test-classify node rig/intake/test-classify.mjs
run intake/test-leon-payload node rig/intake/test-leon-payload.mjs
run intake/test-timezones env ICU_TIMEZONE_FILES_DIR="$SCR/icu-tz" node rig/intake/test-timezones.mjs
run intake/test-no-calendar-response node rig/intake/test-no-calendar-response.mjs
run intake/test-retention $E rig/intake/test-retention.mjs
run intake/test-webhook $E rig/intake/test-webhook.mjs
run manifest/test-generator node rig/manifest/test-generator.mjs
run intake/settings-check $E rig/intake/settings-check.mjs
run manifest/browser $E rig/manifest/browser.mjs

# ── intake end to end. Every e2e truncates the intake tables. The sign-in agent (:5176) would take the look-up
# retries that e2e-scheduled and e2e-classify wait for, so it is stopped for this block.
rig/signin-agent.sh stop >> $LOG 2>&1
run intake/e2e $E rig/intake/e2e.mjs
run intake/e2e-scheduled $E rig/intake/e2e-scheduled.mjs
run intake/e2e-classify $E rig/intake/e2e-classify.mjs
run intake/e2e-cancel $E rig/intake/e2e-cancel.mjs
run intake/browser-cancel $E rig/intake/browser-cancel.mjs
run intake/browser-flows $E rig/intake/browser-flows.mjs
run intake/e2e-people $E rig/intake/e2e-people.mjs
rig/signin-agent.sh >> $LOG 2>&1
run intake/browser-people $E rig/intake/browser-people.mjs
run intake/browser-check $E rig/intake/browser-check.mjs
CIMOG=$(docker exec supabase_db_rig psql -U postgres -At -c "select id from intake_requests where reference='CIMOG1' order by created_at desc limit 1")
run intake/browser-edits $E rig/intake/browser-edits.mjs "$CIMOG"

# ── permissions, wall, portal, extension
run permissions-check $E rig/permissions-check.mjs
preview 5198   # the console against the sign-in-on wall
docker exec supabase_db_rig psql -U postgres -q -c "alter table permission_changes disable trigger permission_changes_append_only; delete from permission_grants; alter table permission_changes enable trigger permission_changes_append_only;"
docker exec -i supabase_db_rig psql -U postgres -q < docs/supabase-permissions.sql > /dev/null
run permissions-browser $E rig/permissions-browser.mjs
run wall/access-check $E rig/wall/access-check.mjs
run wall/browser-access $E rig/wall/browser-access.mjs
preview 5199   # back to the normal wall
run group2 $E rig/group2-check.mjs
run shell-check $E rig/shell-check.mjs
run stage1-check $E rig/stage1-check.mjs
run portal-foundations $E rig/portal-foundations-check.mjs
run ext/t-console $E rig/ext/t-console.mjs
run ext/t-issues $E rig/ext/t-issues.mjs
run group4 $E rig/group4-check.mjs
run stage2-check $E rig/stage2-check.mjs
run stage3-batch1 $E rig/stage3-batch1-check.mjs
docker exec supabase_db_rig psql -U postgres -q -c "update user_preferences set dashboard_layout = null where dashboard_layout is not null"
run stage3-batch2 $E rig/stage3-batch2-check.mjs
run stage3-batch3 $E rig/stage3-batch3-check.mjs
docker exec supabase_db_rig psql -U postgres -q -c "update user_preferences set dashboard_layout = null where dashboard_layout is not null"
run stage4 $E rig/stage4-check.mjs
run overlay-check $E rig/overlay-check.mjs
run dark-audit $E rig/dark-audit.mjs
run partB-check $E rig/partB-check.mjs
echo DONE >> $LOG
