#!/usr/bin/env bash
# Every rig suite, in an order where each one finds (or makes) what it needs. The state goes in docs/rig-suites.md.
#   rig/run-all-suites.sh        → rig/.scratch/suites/<suite>.out, summary in rig/.scratch/suites/summary.log
# Needs the rig up: rig/start.sh, the sign-in-on services (portal :3992, proxy :3989, wall :5198, rig/signin-agent.sh)
# and the built console (opsboard-react/dist). Local mocks only; nothing reaches Leon, CNAIR or production.
# (the checkout's top, not dirname/..: a shuffled run runs an ordered copy of this file from rig/.scratch)
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)" || exit 2
# Keep the Mac awake for the whole run: idle sleep mid-run stalls the agent and the browsers (2026-10-12: suites that
# pass alone failed after 49-80 minute stalls, and Chrome logged ERR_NETWORK_IO_SUSPENDED). Keep the DISPLAY awake too
# (-u wakes it, -d holds it): with the display asleep, a visible Chrome window stops painting, so the extension suites'
# screenshots never finish, and the browser's audio clock stops (2026-10-13).
# Every kind of sleep: -d display, -i idle, -s system (on mains), -u user-active. A closed lid still sleeps the Mac.
[ -z "$RIG_AWAKE" ] && command -v caffeinate >/dev/null && { caffeinate -u -t 2; exec env RIG_AWAKE=1 caffeinate -d -i -s -u "$0" "$@"; }
# The rig's zone is the dispatchers', on the Mac and on the server's rig box alike, so a run means the same on both
# (2026-11-07). Not UTC on purpose: code that reads the machine's local time where it means UTC shows two hours off
# here, where production's UTC servers would hide it. The machine's own zone, not TZ: the services run under env -i.
Z=$(env -u TZ node -e 'process.stdout.write(Intl.DateTimeFormat().resolvedOptions().timeZone)')
[ "$Z" = Europe/Riga ] || { echo "VERDICT: NOT STARTED — this machine's zone is $Z; the rig runs in Europe/Riga (rig/box/user-data.yaml sets it on the rig box)"; exit 2; }
# The order (2026-11-09, rig/order.mjs). A suite that passes only in one order is not a passing suite: it leans on
# something another suite left behind. RIG_SHUFFLE=<seed> shuffles each group of suites between two setup lines;
# RIG_SPLIT=alternate|random:<seed> deals the suites to the lanes differently (cut, from LANE_B_FROM, is the default).
# This runs the ordered copy rig/order.mjs writes, once; the same seeds give the same run again.
if [ -z "${RIG_ORDERED:-}" ] && { [ -n "${RIG_SHUFFLE:-}" ] || [ -n "${RIG_SPLIT:-}" ]; }; then
  note="$(node rig/order.mjs "$0" "${RIG_SHUFFLE:-}" "${RIG_SPLIT:-cut}" rig/.scratch/order)" || { echo "VERDICT: NOT STARTED — rig/order.mjs could not order the run"; exit 2; }
  exec env RIG_ORDERED=1 RIG_ORDER_NOTE="$note" RIG_LANE_B_FILE="$PWD/rig/.scratch/order/lane-b.txt" bash rig/.scratch/order/run-all-suites.sh "$@"
fi
OUT=rig/.scratch/suites; mkdir -p $OUT; LOG=$OUT/summary.log; : > $LOG
ORDER_NOTE="${RIG_ORDER_NOTE:-order: as written · lanes: cut}$([ -n "${RIG_LANE:-}" ] && echo " · this is lane $RIG_LANE" || echo " · one lane: every suite")"; echo "$ORDER_NOTE" >> $LOG
# When the run started, by the power log's own clock format: a sleep after this makes the run INCOMPLETE (below).
RUN_STARTED="$(date "+%Y-%m-%d %H:%M:%S")"
SCR="$PWD/rig/.scratch"; E="node --env-file=.env.rig"
# Known failures (rig/known-failures.json): each cause's probe runs once here. A suite under a cause that still holds is
# SKIPPED and printed with its cause; when the cause clears, its suites run again by themselves (2026-11-02).
SKIP_LIST="$(node -e '
const k = require("./rig/known-failures.json"); const { execSync } = require("child_process"); const out = [];
for (const [key, v] of Object.entries(k)) { if (key.startsWith("$") || !v.probe) continue;
  let holds = true; try { execSync(v.probe, { stdio: "ignore", timeout: 30000 }); } catch (e) { holds = e.status !== 1; }
  if (holds) for (const s of v.suites) out.push(s + "\t" + key); }
process.stdout.write(out.join("\n"));' 2>/dev/null)"
# Two lanes (2026-11-09, rig/box/two-lanes.sh): RIG_LANE=a runs the suites before LANE_B_FROM, b that one and every
# suite after it; each lane runs all the setup between, so a suite finds what it needs. Unset: every suite, as before.
LANE_B_FROM=client-allow-check   # measured 2026-11-09: about 29 + 29 min here (at permissions-check 23 + 33, after the client block 32 + 27)
LANE_B="$( if [ -n "${RIG_LANE_B_FILE:-}" ]; then cat "$RIG_LANE_B_FILE"; else awk -v f="$LANE_B_FROM" '$1=="run" && $2==f {b=1} b && $1=="run" {print $2}' "$0"; fi )"
in_lane() { [ -z "${RIG_LANE:-}" ] && return 0; local inb=1; printf '%s\n' "$LANE_B" | grep -qxF "$1" || inb=0; { [ "$RIG_LANE" = b ] && [ $inb = 1 ]; } || { [ "$RIG_LANE" = a ] && [ $inb = 0 ]; }; }
case "${RIG_LANE:-}" in ""|a|b) ;; *) echo "VERDICT: NOT STARTED — RIG_LANE is a or b"; exit 2;; esac
run() { local name="$1";
  in_lane "$name" || return 0
  local known; known="$(printf '%s\n' "$SKIP_LIST" | awk -F'\t' -v n="$name" '$1==n {print $2}')"
  if [ -n "$known" ]; then echo "$name rc=skip 0s 0 pass 0 fail :: skipped — known failure \"$known\" still holds (rig/known-failures.json)" >> $LOG; return; fi
  shift; local out="$OUT/$(echo "$name" | tr '/ ' '__').out"; local t0=$(date +%s); "$@" > "$out" 2>&1 < /dev/null; local rc=$?; echo "$name rc=$rc $(( $(date +%s) - t0 ))s $(grep -cE '^(PASS|ok)' "$out") pass $(grep -cE '^(FAIL|not ok)' "$out") fail :: $(tail -1 "$out" | cut -c1-140)" >> $LOG; }
preview() { pkill -f "vite preview --port 4173"; sleep 1; ( cd opsboard-react && VITE_API_PROXY=http://127.0.0.1:$1 nohup npx vite preview --port 4173 --host 127.0.0.1 > ../rig/.scratch/vite-preview.out 2>&1 & ); sleep 4; }

# The ElevenLabs stand-in (rig/start.sh starts it; started here too if a rig from before 2026-10-13 is running).
sh rig/port.sh 3986 >/dev/null || ( env -i PATH="$PATH" HOME="$HOME" nohup node rig/voice/mock-elevenlabs.mjs > rig/.scratch/mock-elevenlabs.out 2>&1 & )
# The manifest's mock Leon dates its flights from its own start, so start it fresh (this also restarts :5175).
rig/manifest/start.sh > $OUT/manifest-start.out 2>&1 < /dev/null
# The wall's Leon operators first: the refresh below reads them, and the rig walls do not poll by themselves (2026-11-07:
# on a fresh database the seed ran after the refresh, and the board stayed empty all run; the Mac had them for weeks)
$E rig/manifest/operators.mjs seed >> $LOG 2>&1
# The wall's mock Leon (:3985) times its flights from its own start too, so a day later the board is empty: start it fresh
# and make both rig walls read it again (the sign-in-on wall :5198 runs from the same mock).
pid=$(sh rig/port.sh 3985 || true); [ -n "$pid" ] && kill $pid && sleep 1
( cd rig/wall && env -i PATH="$PATH" HOME="$HOME" PORT=3985 nohup node mock-leon.mjs > "$SCR/wall-mock-leon.out" 2>&1 & ); sleep 3
# (node, not date -v: BSD only, so on Linux both dates were empty, 2026-11-07)
F=$(node -e 'process.stdout.write(new Date(Date.now()-864e5).toISOString().slice(0,10))'); T=$(node -e 'process.stdout.write(new Date(Date.now()+4*864e5).toISOString().slice(0,10))')
for p in 5199 5198; do curl -s -m 60 -o /dev/null "http://127.0.0.1:$p/api/timeline/flights?allOperators=true&refresh=true&from=$F&to=$T" || true; done

# ── code-only and local tests
run no-real-passenger-data node rig/check-no-real-passenger-data.mjs
run docs-check node --no-warnings rig/docs-check.mjs
run utc-times node rig/check-utc-times.mjs
run error-text node rig/check-error-text.mjs
run no-browser-dialogs node rig/check-no-browser-dialogs.mjs   # no alert/confirm/prompt anywhere: our own overlays only (2026-11-09)
run migrations-check node rig/migrations-check.mjs   # every schema file reaches the rig from the repository, none by hand (2026-11-07)
run style-text node rig/check-style-text.mjs
run own-mail node rig/check-own-mail.mjs
run telegram-media-token node rig/telegram-media-token-check.mjs   # one file, one person, 15 minutes
run anthropic-runtime node rig/anthropic-runtime-check.mjs   # the agent's model calls on the Anthropic API, against a local stand-in
run smoke-alarm $E rig/smoke-alarm-check.mjs   # the scheduled smoke calls' alarm and the wall's watch over it (2026-11-03)
run configured-not-working $E rig/configured-not-working-check.mjs   # statuses from real calls, not settings (2026-11-03)
run fallback-watch $E rig/fallback-watch-check.mjs   # every fallback recorded with why; the rate alarms (2026-11-03)
run read-limit $E rig/read-limit-check.mjs   # 1,100 planted rows: the paging helpers see all; a plain read stops at 1000 (the control)
run knowledge-fts $E rig/knowledge-fts-check.mjs   # knowledge search on Postgres full text (2026-11-03)
run web-search $E rig/web-search-check.mjs   # the API's own search (Tavily removed 2026-11-05), two passes, citations and the mark, follow-ups, through the chat route
run agent-disclosure $E rig/agent-disclosure-check.mjs   # disclosure only when it names something real: greetings, a full answer, a failed tool, a partial one (real model, the rig key; skips without it)
run knowledge-roundtrip $E rig/knowledge-roundtrip-check.mjs   # upload indexes at once, never the uploader's approval, Remove takes it out and is recorded (real model for the answers)
run settings-truth $E rig/settings-truth-check.mjs   # every figure and switch on Settings does something (2026-11-03)
run status-truth node rig/status-truth-check.mjs   # the Leon feed verdict and the TV's NOTAM sign tied to today (2026-11-03)
run scheduled-jobs $E rig/jobs-check.mjs   # the agent's scheduled jobs record their runs; failed or overdue fails a smoke check (2026-11-03)
run portal-colours node scripts/check-portal-colours.mjs   # every portal colour a --cw-* token; prints its exceptions and why
run check-console-theme node scripts/check-console-theme.mjs
run intake/test-classify node rig/intake/test-classify.mjs
run intake/test-fill-shape node rig/intake/test-fill-shape.mjs   # one extraction shape every time (2026-11-03)
run intake/test-conflict-pair node rig/intake/test-conflict-pair.mjs   # a conflict always carries the two values to choose from (2026-11-07)
run intake/test-checklist-side node rig/intake/test-checklist-side.mjs   # one checklist item every time: a plain pick follows the leg's airport (2026-11-08)
run intake/test-leon-payload node rig/intake/test-leon-payload.mjs
run intake/test-timezones env ICU_TIMEZONE_FILES_DIR="$SCR/icu-tz" node rig/intake/test-timezones.mjs
run intake/test-no-calendar-response node rig/intake/test-no-calendar-response.mjs
run intake/test-retention $E rig/intake/test-retention.mjs
run intake/test-webhook $E rig/intake/test-webhook.mjs
run intake/receiving-address $E rig/intake/receiving-address-check.mjs   # Receiving addresses decide what is read (2026-11-03)
run intake/silence $E rig/intake/silence-check.mjs   # the silence alarm, armed when intake goes live (2026-11-03)
run email-status-check $E rig/email-status-check.mjs
run wall/test-portal-folder node rig/wall/test-portal-folder.mjs
run airport-sheets-check node rig/airport-sheets-check.mjs
run manifest/test-generator node rig/manifest/test-generator.mjs
run intake/settings-check $E rig/intake/settings-check.mjs
run manifest/browser $E rig/manifest/browser.mjs

# ── intake end to end. Every e2e truncates the intake tables. The sign-in agent (:5176) would take the look-up
# retries that e2e-scheduled and e2e-classify wait for, so it is stopped for this block.
rig/signin-agent.sh stop >> $LOG 2>&1
run intake/extraction-repeat $E rig/intake/extraction-repeat.mjs   # the same email, several runs, the same record (needs the model key)
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
run intake/browser-edits $E rig/intake/browser-edits.mjs   # its own CIMOG1 request: the newest, or one it delivers (2026-11-09)

# ── permissions, wall, portal, extension
run permissions-check $E rig/permissions-check.mjs
run account-delete $E rig/account-delete-check.mjs   # deleting an account revokes its grants and takes it off the notify list, in the same delete (0029)
( cd opsboard-react && npx vite build > ../rig/.scratch/vite-build.out 2>&1 ) || echo "vite build failed — see rig/.scratch/vite-build.out" >> $LOG   # the console check and the phone check read the built dist
# the wall's pages as production serves them, at /digital-wall/timeline/ (rig/proxy.mjs serves this folder): the phone wall
( cd opsboard-react && VITE_BASE_PATH=/digital-wall/timeline/ VITE_API_BASE_URL=/digital-wall npx vite build --outDir ../rig/.scratch/display-dist --emptyOutDir > ../rig/.scratch/display-build.out 2>&1 ) || echo "display build failed — see rig/.scratch/display-build.out" >> $LOG
preview 5198   # the console against the sign-in-on wall
bash rig/permissions-reset.sh >> $LOG 2>&1   # every grant back to the defaults (permissions-browser does this itself too)
run permissions-browser $E rig/permissions-browser.mjs
run dialogs $E rig/dialogs-check.mjs   # our own dialogs by keyboard: Help discard, Admin › Clients refuse, console delete operator; inside the console preview against the sign-in wall (2026-11-09)
run self-promotion-check $E rig/self-promotion-check.mjs
run temporary-access-check $E rig/temporary-access-check.mjs
run client-scope-check $E rig/client-scope-check.mjs
run client-ui-check $E rig/client-ui-check.mjs
run client-allow-check $E rig/client-allow-check.mjs   # the client allow-list, the menu, and no staff menu in a client's page or scripts (2026-11-04; needs the rig build, uses :3982/:3979)
run client-feed-check $E rig/client-feed-check.mjs   # what a client's browser is given of a flight: a list of fields, ops' notes only by switch (2026-11-09)
run clients-page-check $E rig/clients-page-check.mjs   # Admin › Clients: padding, overlap at 6 widths, a whole word in every field
run client-onboarding-check $E rig/client-onboarding-check.mjs   # ask → ops mail → approve → set-password link → account; our own sign-in emails, all in Mailbox › Sent
run files-route-check $E rig/files-route-check.mjs   # /files serves only its allow-list: AIP PDFs; a new folder, a .json, another's draft → 404
# A third rig portal with the middleware's client block and write gate off (RIG_CLIENT_MIDDLEWARE_OFF=1, honoured only
# against the rig's local Supabase): every endpoint must refuse a client and an unknown role on its own (2026-11-02).
( env -i PATH="$PATH" HOME="$HOME" PORT=3981 HOSTNAME=127.0.0.1 PERMISSIONS_TTL_MS=1000 DISABLE_AUTH_FOR_TESTING=false AGENT_TEST_ROLE= ADMIN_EMAILS= DEVELOPER_EMAILS= RIG_CLIENT_MIDDLEWARE_OFF=1 nohup node --env-file=.env.rig .next/standalone/server.js > "$SCR/portal-gateless.out" 2>&1 & )
for _ in $(seq 40); do [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3981/login)" = 200 ] && break; sleep 1; done
run client-gate-check $E rig/client-gate-check.mjs   # 115 portal handlers refuse a client / unknown role without the middleware; the wall and agent directly
run personal-data-paths-check $E rig/personal-data-paths-check.mjs   # text, scan, list, .eml and forward: one permission, one bucket, one row each
run mail-image-check $E rig/mail-image-check.mjs   # a stranger's image aimed at loopback: held back, then refused; nothing fetched
run sender-check $E rig/sender-check.mjs   # account mail and wall alerts from clearway.verxyl.com; the fallback until it verifies
pid=$(sh rig/port.sh 3981 || true); [ -n "$pid" ] && kill $pid
run maintenance-logos node rig/maintenance-logos-check.mjs
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
# The extension the suites load is built here, for the rig (2026-11-07): until now they loaded whatever extension/dist one
# Mac's main checkout held (built 13 October). Removed first, so a failed build cannot leave an old one to test.
rm -rf extension/dist; ( cd extension && npm run build:rig > ../rig/.scratch/ext-build.out 2>&1 ) || echo "extension build failed (rig/.scratch/ext-build.out): the extension suites will fail" >> $LOG
# An MV3 extension needs a visible Chrome (headless: false); a machine with no display gives it one (2026-11-07: the rig box)
headed() { if [ "$(uname)" = Linux ] && [ -z "${DISPLAY:-}" ]; then xvfb-run -a -s "-screen 0 1920x1200x24" "$@"; else "$@"; fi; }
run ext/t-console headed $E rig/ext/t-console.mjs
run ext/t-issues headed $E rig/ext/t-issues.mjs
run group4 $E rig/group4-check.mjs
run stage2-check $E rig/stage2-check.mjs
run stage3-batch1 $E rig/stage3-batch1-check.mjs
run stage3-batch2 $E rig/stage3-batch2-check.mjs
run stage3-batch3 $E rig/stage3-batch3-check.mjs
# (no layout reset between the stage suites any more, 2026-11-09: stage3-batch2 and stage4 each set the layout they need)
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
EXPECTED=$(grep -E '^run ' "$0" | awk '{print $2}' | while read -r n; do in_lane "$n" && echo "$n"; done | wc -l | tr -d ' '); RAN=$(grep -cE ' rc=' $LOG); RED=$(grep -E ' rc=' $LOG | grep -vcE ' rc=0 ' || true)
# A suite that took longer than two hours ran across a sleep the browser did not report (2026-10-22: the passenger check
# "took" 42 hours and its ten-minute window test failed on stale reveals). That run is INCOMPLETE too, whatever its rcs.
SLEPT=$(grep -E ' rc=' $LOG | awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+s$/) { sub(/s$/, "", $i); if ($i + 0 > 7200) print $1 } }' | head -3 | tr '\n' ' ')
# The machine slept during the run (2026-11-02: a full run on battery took 17 hours; every suite after the first sleep
# timed out on stale sessions and stale data, and the verdict said RED instead of INCOMPLETE). macOS records each sleep
# in its power log; one after the start is enough.
SLEEPS=$(pmset -g log 2>/dev/null | awk -v s="$RUN_STARTED" '($1" "$2) >= s && $4 == "Sleep"' | wc -l | tr -d ' ')
if [ "${SLEEPS:-0}" != 0 ]; then echo "VERDICT: INCOMPLETE — the machine slept $SLEEPS time(s) during the run (power log); nothing after the first sleep can be trusted. Run again on power." | tee -a $LOG; echo DONE >> $LOG; exit 2; fi
if [ -n "$SLEPT" ]; then echo "VERDICT: INCOMPLETE — the machine slept during: $SLEPT(a suite over two hours); rerun from there" | tee -a $LOG; echo DONE >> $LOG; exit 2; fi
if [ "$RAN" != "$EXPECTED" ]; then echo "VERDICT: INCOMPLETE — $RAN of $EXPECTED suites ran ($RED red)" | tee -a $LOG; echo DONE >> $LOG; exit 2; fi
# Every red suite is LISTED (a recorded cause, rig/known-failures.json) or UNLISTED, and the unlisted are named (2026-11-02).
# Any red is RED; there is no "green except".
node rig/verdict.mjs "$LOG" "$EXPECTED" | tee -a $LOG; rc=${PIPESTATUS[0]}
echo "$ORDER_NOTE" | tee -a $LOG
echo DONE >> $LOG
exit $rc
