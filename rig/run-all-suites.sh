#!/usr/bin/env bash
# Every rig suite, in an order where each one finds (or makes) what it needs. The state goes in docs/rig-suites.md.
#   rig/run-all-suites.sh        → rig/.scratch/suites/<suite>.out, summary in rig/.scratch/suites/summary.log
# Needs the rig up: rig/start.sh, the sign-in-on services (portal :3992, proxy :3989, wall :5198, rig/signin-agent.sh)
# and the built console (opsboard-react/dist). Local mocks only; nothing reaches Leon, CNAIR or production.
cd "$(dirname "$0")/.."
# Keep the Mac awake for the whole run: idle sleep mid-run stalls the agent and the browsers (2026-10-12: suites that
# pass alone failed after 49-80 minute stalls, and Chrome logged ERR_NETWORK_IO_SUSPENDED). Keep the DISPLAY awake too
# (-u wakes it, -d holds it): with the display asleep, a visible Chrome window stops painting, so the extension suites'
# screenshots never finish, and the browser's audio clock stops (2026-10-13).
# Every kind of sleep: -d display, -i idle, -s system (on mains), -u user-active. A closed lid still sleeps the Mac.
[ -z "$RIG_AWAKE" ] && command -v caffeinate >/dev/null && { caffeinate -u -t 2; exec env RIG_AWAKE=1 caffeinate -d -i -s -u "$0" "$@"; }
OUT=rig/.scratch/suites; mkdir -p $OUT; LOG=$OUT/summary.log; : > $LOG
SCR="$PWD/rig/.scratch"; E="node --env-file=.env.rig"
run() { local name="$1"; shift; local out="$OUT/$(echo "$name" | tr '/ ' '__').out"; local t0=$(date +%s); "$@" > "$out" 2>&1 < /dev/null; local rc=$?; echo "$name rc=$rc $(( $(date +%s) - t0 ))s $(grep -cE '^(PASS|ok)' "$out") pass $(grep -cE '^(FAIL|not ok)' "$out") fail :: $(tail -1 "$out" | cut -c1-140)" >> $LOG; }
preview() { pkill -f "vite preview --port 4173"; sleep 1; ( cd opsboard-react && VITE_API_PROXY=http://127.0.0.1:$1 nohup npx vite preview --port 4173 --host 127.0.0.1 > ../rig/.scratch/vite-preview.out 2>&1 & ); sleep 4; }

# The ElevenLabs stand-in (rig/start.sh starts it; started here too if a rig from before 2026-10-13 is running).
lsof -tiTCP:3986 -sTCP:LISTEN >/dev/null || ( env -i PATH="$PATH" HOME="$HOME" nohup node rig/voice/mock-elevenlabs.mjs > rig/.scratch/mock-elevenlabs.out 2>&1 & )
# The manifest's mock Leon dates its flights from its own start, so start it fresh (this also restarts :5175).
rig/manifest/start.sh > $OUT/manifest-start.out 2>&1 < /dev/null
# The wall's mock Leon (:3985) times its flights from its own start too, so a day later the board is empty: start it fresh
# and make both rig walls read it again (the sign-in-on wall :5198 runs from the same mock).
pid=$(lsof -tiTCP:3985 -sTCP:LISTEN || true); [ -n "$pid" ] && kill $pid && sleep 1
( cd rig/wall && env -i PATH="$PATH" HOME="$HOME" PORT=3985 nohup node mock-leon.mjs > "$SCR/wall-mock-leon.out" 2>&1 & ); sleep 3
F=$(date -u -v-1d +%Y-%m-%d); T=$(date -u -v+4d +%Y-%m-%d)
for p in 5199 5198; do curl -s -m 60 -o /dev/null "http://127.0.0.1:$p/api/timeline/flights?allOperators=true&refresh=true&from=$F&to=$T" || true; done
$E rig/manifest/operators.mjs seed >> $LOG 2>&1

# ── code-only and local tests
run no-real-passenger-data node rig/check-no-real-passenger-data.mjs
run docs-check node --no-warnings rig/docs-check.mjs
run utc-times node rig/check-utc-times.mjs
run error-text node rig/check-error-text.mjs
run style-text node rig/check-style-text.mjs
run check-console-theme node scripts/check-console-theme.mjs
run intake/test-classify node rig/intake/test-classify.mjs
run intake/test-leon-payload node rig/intake/test-leon-payload.mjs
run intake/test-timezones env ICU_TIMEZONE_FILES_DIR="$SCR/icu-tz" node rig/intake/test-timezones.mjs
run intake/test-no-calendar-response node rig/intake/test-no-calendar-response.mjs
run intake/test-retention $E rig/intake/test-retention.mjs
run intake/test-webhook $E rig/intake/test-webhook.mjs
run email-status-check $E rig/email-status-check.mjs
run wall/test-portal-folder node rig/wall/test-portal-folder.mjs
run airport-sheets-check node rig/airport-sheets-check.mjs
run manifest/test-generator node rig/manifest/test-generator.mjs
run intake/settings-check $E rig/intake/settings-check.mjs
run manifest/browser $E rig/manifest/browser.mjs

# ── intake end to end. Every e2e truncates the intake tables. The sign-in agent (:5176) would take the look-up
# retries that e2e-scheduled and e2e-classify wait for, so it is stopped for this block.
rig/signin-agent.sh stop >> $LOG 2>&1
run intake/e2e $E rig/intake/e2e.mjs
run intake/e2e-scheduled $E rig/intake/e2e-scheduled.mjs
run intake/e2e-classify $E rig/intake/e2e-classify.mjs
run intake/e2e-unread $E rig/intake/e2e-unread.mjs   # leaves an envelope-only message; e2e-cancel truncates before the browser checks
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
( cd opsboard-react && npx vite build > ../rig/.scratch/vite-build.out 2>&1 ) || echo "vite build failed — see rig/.scratch/vite-build.out" >> $LOG   # the console check and the phone check read the built dist
# the wall's pages as production serves them, at /digital-wall/timeline/ (rig/proxy.mjs serves this folder): the phone wall
( cd opsboard-react && VITE_BASE_PATH=/digital-wall/timeline/ VITE_API_BASE_URL=/digital-wall npx vite build --outDir ../rig/.scratch/display-dist --emptyOutDir > ../rig/.scratch/display-build.out 2>&1 ) || echo "display build failed — see rig/.scratch/display-build.out" >> $LOG
preview 5198   # the console against the sign-in-on wall
docker exec supabase_db_rig psql -U postgres -q -c "alter table permission_changes disable trigger permission_changes_append_only; delete from permission_grants; alter table permission_changes enable trigger permission_changes_append_only;"
docker exec -i supabase_db_rig psql -U postgres -q < docs/supabase-permissions.sql > /dev/null
bash rig/approve-rig-accounts.sh >> $LOG 2>&1
run permissions-browser $E rig/permissions-browser.mjs
run self-promotion-check $E rig/self-promotion-check.mjs
run temporary-access-check $E rig/temporary-access-check.mjs
run client-scope-check $E rig/client-scope-check.mjs
run client-ui-check $E rig/client-ui-check.mjs
run signin-perf node rig/signin-perf.mjs --check   # Sign In v2: budgets, the form first, the photograph after
run airac-dates-check node rig/airac-dates-check.mjs
run aip-refresh-check $E rig/aip-refresh-check.mjs
run docs-shots-check node rig/docs-shots-check.mjs
run wall/access-check $E rig/wall/access-check.mjs
run wall/browser-access $E rig/wall/browser-access.mjs
run wall/console-theme-check $E rig/wall/console-theme-check.mjs
preview 5199   # back to the normal wall
run mobile/tier1-check $E rig/mobile/tier1-check.mjs
run mobile/tier2-check $E rig/mobile/tier2-check.mjs
run mobile/phone-wall-check $E rig/mobile/phone-wall-check.mjs
# The passenger check reads the manifest's mock Leon through the agent, which needs the manifest key in its environment
# (rig/manifest/start.sh); anything that restarted :5175 in between (rig/start.sh has no key) would leave it unable to read
# the operators' credentials. Start it fresh here, as at the top.
rig/manifest/start.sh > $OUT/manifest-start-2.out 2>&1 < /dev/null
$E rig/manifest/operators.mjs seed >> $LOG 2>&1
run mobile/pax-check $E rig/mobile/pax-check.mjs
run group2 $E rig/group2-check.mjs
run shell-check $E rig/shell-check.mjs
run stage1-check $E rig/stage1-check.mjs
run portal-foundations $E rig/portal-foundations-check.mjs
# portal-foundations switches maintenance on and off; if it fails mid-way under load (2026-10-19 and -20), the portal
# stays in maintenance and every suite after it that signs in goes red. Put it back off, whatever happened.
docker exec supabase_db_rig psql -U postgres -q -c "insert into public.maintenance (enabled, message, updated_at) values (false, 'rig: off after portal-foundations', now())" 2>/dev/null || true
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
run docs-browser $E rig/docs-browser.mjs
run utc-browser $E rig/utc-browser-check.mjs
run fixes/service-status-unsaved $E rig/fixes/service-status-unsaved.mjs
run fixes/search-four-letters $E rig/fixes/search-four-letters.mjs
run fixes/search-hidden $E rig/fixes/search-hidden.mjs
run fixes/profile-email-failure $E rig/fixes/profile-email-failure.mjs
run fixes/browse-several $E rig/fixes/browse-several.mjs
run fixes/email-logs-removed $E rig/fixes/email-logs-removed.mjs
run fixes/aip-sync-permission $E rig/fixes/aip-sync-permission.mjs
run fixes/aip-copy-date $E rig/fixes/aip-copy-date.mjs
run error-text-browser $E rig/error-text-browser-check.mjs
# A run the machine slept through proves nothing: the browser logs ERR_NETWORK_IO_SUSPENDED and every later suite finds
# the fixtures the stalled one never made (2026-10-18: seven red suites from one nap). Say so, loudly, and exit 2.
if grep -lq "ERR_NETWORK_IO_SUSPENDED" $OUT/*.out 2>/dev/null; then
  first=$(grep -l "ERR_NETWORK_IO_SUSPENDED" $OUT/*.out | head -1 | xargs basename | sed 's/\.out$//')
  echo "SUSPENDED: the machine slept during $first — nothing from that suite on can be trusted. Rerun from there." | tee -a $LOG
  echo DONE >> $LOG
  exit 2
fi
# The verdict, in the log and in the exit code (2026-10-21: a chain that counted "rc=0" lines in this log pushed on an
# empty log). Every suite this script names must have run — a missing one is INCOMPLETE, not green — and any red is red.
EXPECTED=$(grep -cE '^run ' "$0"); RAN=$(grep -cE ' rc=' $LOG); RED=$(grep -E ' rc=' $LOG | grep -vcE ' rc=0 ' || true)
# A suite that took longer than two hours ran across a sleep the browser did not report (2026-10-22: the passenger check
# "took" 42 hours and its ten-minute window test failed on stale reveals). That run is INCOMPLETE too, whatever its rcs.
SLEPT=$(grep -E ' rc=' $LOG | awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+s$/) { sub(/s$/, "", $i); if ($i + 0 > 7200) print $1 } }' | head -3 | tr '\n' ' ')
if [ -n "$SLEPT" ]; then echo "VERDICT: INCOMPLETE — the machine slept during: $SLEPT(a suite over two hours); rerun from there" | tee -a $LOG; echo DONE >> $LOG; exit 2; fi
if [ "$RAN" != "$EXPECTED" ]; then echo "VERDICT: INCOMPLETE — $RAN of $EXPECTED suites ran ($RED red)" | tee -a $LOG; echo DONE >> $LOG; exit 2; fi
if [ "$RED" != 0 ]; then echo "VERDICT: RED — $RED of $RAN suites failed" | tee -a $LOG; echo DONE >> $LOG; exit 1; fi
echo "VERDICT: GREEN — all $RAN suites passed" | tee -a $LOG
echo DONE >> $LOG
