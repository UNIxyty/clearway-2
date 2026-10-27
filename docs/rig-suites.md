# Rig suites: current state

What the rig cannot test at all — no Cloudflare, mail, real Leon, sync services, Telegram… — is in
[docs/rig-vs-production.md](rig-vs-production.md). A green suite says nothing about those.

**Rule (2026-10-11):** no suite stays red. A suite passes, or its failure is written here as a known bug with a date and
a reason. "Same failures as before" is not a result. Update this list whenever a suite is touched or run.

Run them all with `rig/run-all-suites.sh` (order and setup in the script; see `rig/README.md`). Counts are the
number of checks passed in the last full run.

## Known failures

None.

Every suite below passed in the full run of 2026-10-13 (43 suites, after the wall folder, the voice stand-in,
the extension fix, the airport-sheets rule and docs stage 4). Two earlier runs that day were stopped: the machine
was at load 13-42 (macOS's Bluetooth server stuck at full CPU), and their failures were load, not code.

## Suites

| Suite | Last passing | Date |
|---|---|---|
| check-no-real-passenger-data | 838 files, none | 2026-10-12 |
| wall/test-portal-folder | 7 | 2026-10-13 |
| airport-sheets-check | 8 | 2026-10-13 |
| docs-check | 21 | 2026-10-13 |
| check-console-theme | 24 console files, 0 findings | 2026-10-18 |
| intake/test-classify | 46 | 2026-10-12 |
| intake/test-leon-payload | 10 | 2026-10-12 |
| intake/test-timezones | 30 | 2026-10-12 |
| intake/test-no-calendar-response | 17 | 2026-10-12 |
| intake/test-retention | 9 | 2026-10-12 |
| intake/test-webhook | 10 | 2026-10-12 |
| intake/settings-check | 10 | 2026-10-12 |
| intake/e2e | 60 | 2026-10-12 |
| intake/e2e-scheduled | 61 | 2026-10-12 |
| intake/e2e-classify | 36 | 2026-10-12 |
| intake/e2e-cancel | 31 | 2026-10-12 |
| intake/e2e-people | 34 | 2026-10-12 |
| intake/browser-check | 41 | 2026-10-12 |
| intake/browser-people | 25 | 2026-10-12 |
| intake/browser-cancel | 11 | 2026-10-12 |
| intake/browser-flows | 22 | 2026-10-12 |
| intake/browser-edits | 9 | 2026-10-12 |
| manifest/test-generator | 47 | 2026-10-12 |
| manifest/browser | 36 | 2026-10-13 |
| permissions-check | 43 | 2026-10-12 |
| permissions-browser | 13 | 2026-10-12 |
| wall/access-check | 65 | 2026-10-12 |
| wall/browser-access | 9 | 2026-10-12 |
| wall/console-theme-check | 40 | 2026-10-18 |
| mobile/tier1-check | 201 | 2026-10-28 |
| mobile/tier2-check | 437 | 2026-10-28 |
| mobile/phone-wall-check | 38 | 2026-10-28 |
| mobile/pax-check | 47 | 2026-10-28 |
| self-promotion-check | 12 | 2026-10-20 |
| temporary-access-check | 24 | 2026-10-21 |
| client-scope-check | 57 | 2026-10-25 |
| client-ui-check | 60 | 2026-10-28 |
| signin-perf | 23 | 2026-10-28 |
| style-text | 1 | 2026-10-28 |
| maintenance-logos | 12 | 2026-10-28 |
| airac-dates-check | 5 | 2026-10-25 |
| aip-refresh-check | 22 | 2026-10-25 |
| docs-shots-check | 7 | 2026-10-25 |
| group2-check | 13 | 2026-10-12 |
| group4-check | 33 | 2026-10-12 |
| shell-check | 10 | 2026-10-12 |
| stage1-check | 23 | 2026-10-28 |
| portal-foundations-check | 30 | 2026-10-12 |
| stage2-check | 58 | 2026-10-12 |
| stage3-batch1-check | 39 | 2026-10-12 |
| stage3-batch2-check | 53 | 2026-10-12 |
| stage3-batch3-check | 33 | 2026-10-12 |
| stage4-check | 25 | 2026-10-12 |
| overlay-check | 4 | 2026-10-12 |
| dark-audit | 2 (49 pages) | 2026-10-12 |
| partB-check | 31 | 2026-10-12 |
| docs-browser | 77 | 2026-10-13 |
| ext/t-console | clean (no messages) | 2026-10-12 |
| ext/t-issues | clean (no issues) | 2026-10-12 |

## Red on 2026-10-14, and why (each fixed)

The rig's wall got flights (its own Leon stand-in, `rig/wall/mock-leon.mjs`) and the portal got invented NOTAMs and
AIP stand-ins (`rig/wall/seed-portal.mjs`). Three suites had relied on the rig having none:

- **stage3-batch2**: "a counter whose source fails" expected Flights today to fail because there was no Leon. The
  wall's flights request now fails on purpose for that one load (`page.route`), as `search_events` does for its block.
- **stage1-check**: the contrast pass counted the PDF viewer's selectable text layer (fully transparent text over the
  drawn page) on `/aip/EVRA`, which now has a document. Fully transparent text is skipped: nobody can see it.
- **docs-browser**: it hard-coded the old wall page (20 tasks, four screenshots, an "exampleair" example). It now reads
  the task and group counts from the page's source, and waits for smooth scrolling to settle before reading the list.
- **stage3-batch1, "bulk password reset: one toast for the lot"**: it ticked the 3rd and 4th rows by position. The
  rig's second developer account (`rig/.scratch/make-dev2.mjs`, made for the docs) moved the rows, so it ticked a
  developer, whom an admin may not reset. It now ticks the admin and user rows by email.
- **Fifteen suites in one full run** (intake e2e and browser suites, permissions-check, stage1/2/3, overlay, dark-audit,
  ext/t-console): not the code. Load was 11–14, one name look-up failed (`getaddrinfo ENOTFOUND` for the model
  service), and the sign-in agent took over 3 s to start, so `rig/signin-agent.sh` said DOWN and the suites after it
  had no agent. It now waits up to 30 s. The next full run (load about 4) passed all but stage3-batch1, above.
- **stage3-batch1, "password reset reaches the auth server"**: it looked for the auth server's own text "Error sending
  recovery email". Since the error-text rule (2026-10-14) that text goes to the log and the person reads "The reset
  email was not sent. …"; the check now expects ours, and fails if the auth server's text comes back.
- **New on 2026-10-14**: utc-times, utc-browser, error-text, error-text-browser, and rig/fixes/* (one per fix:
  service-status-unsaved, search-four-letters, search-hidden, profile-email-failure, browse-several,
  email-logs-removed). The full run that day: 53 suites, all green.

## Red in two full runs on 2026-10-19/20: the portal left in maintenance mode

- **A dozen suites after portal-foundations** (permissions, intake browser suites, docs-browser, the fixes) went red
  with hour-long durations. Cause each time: portal-foundations switches maintenance on and off, and under heavy load
  (the Mac at load 30–40 from other apps) its "off" step failed, so the sign-in-on portal stayed in maintenance and
  every later suite that signs in met the maintenance page. The runner now inserts an "off" row after that suite
  whatever happened; docs/rig-vs-production.md says how to read the state (the newest `public.maintenance` row).

## Red in a full run on 2026-10-19, green alone

- **Fixed 2026-10-26 (the manifest one was not timing: the model chose a flight for the blank form; /blank-manifest now pins the tool and its input — commit "The blank manifest form is never left to the model").** **manifest/browser "the blank form is one keypress from the picker" (35/36) and wall/console-theme-check "the open
  display tab did not react: pixel-identical" (39/40)** in the second full run of the night (after the mobile
  Tier 1 suite was added). Each passed alone straight after: 36/36 (with a fresh mock Leon, as the runner starts it)
  and 40/40. Both are timing checks under load — a keypress before focus settles, and a display screenshot taken
  while the tab was busy. Watch them; if either is red twice running, split the runner's browser suites further.

## Red on 2026-10-12/13, and why (each fixed)

- **manifest/browser, "voice reaches the same picker"** (from about 22:30 UTC on 2026-10-12). Not ElevenLabs, which
  answered correctly when called directly: the Mac's display had gone to sleep, which stops the browser's audio clock,
  so the page captured no audio and sent none. The check now uses the rig's ElevenLabs stand-in
  (`rig/voice/mock-elevenlabs.mjs`; no rig test calls the real service, and the rig no longer spends the production
  account, whose key it used to copy), the test browser has a fake audio output, and the suite runner keeps the
  display awake. The stand-in only answers once real voiced audio arrives, so the check still proves capture.
- **ext/t-console** (same night): a screenshot hung with the display asleep (a visible Chrome window stops painting).
  Fixed by keeping the display awake.
- **manifest/browser, "the Riga one this evening"** (2026-10-13, 00:00 UTC): the mock puts the flight half an hour after
  its own start once 19:40Z has passed, so a mock started just before midnight UTC put it after midnight, outside "this
  evening". The check now says the flight's real day and time of day.

- **Four suites after 49-80 minute stalls** (manifest/browser, intake/e2e, e2e-scheduled, e2e-classify): the Mac
  idle-slept mid-run (power log; Chrome logged ERR_NETWORK_IO_SUSPENDED). Each passed alone. `run-all-suites.sh` now
  keeps the Mac awake (`caffeinate -i`), and the next full run had none of them.
- **stage3-batch2** ("Use the default layout … clears the saved layout"): a fixed 1.2 s wait for a save that happens
  500 ms after the change; the same fault as the other wait in that file, fixed the night before. It now waits for
  the save (up to 8 s).
- **dark-audit** on `/docs/digital-wall/operators`: counted the white icon on the red "cannot be undone" band as a
  light surface. A mask icon's background is its glyph colour, so masked elements are no longer counted as surfaces.

## Red until 2026-10-11, and why

These had been failing for days without being written down. Each is fixed; the reason stays here as a record.

- **intake/browser-check** (red from 2026-10-08): the row selector never matched the real row, and the check relied on
  CIMOG1 data that later suites truncated. Inside that noise were real product failures: the ✎ button's native
  tooltip and a ✎ that did nothing for a User (from 2026-10-09, `0c64a15`). Product fixed 2026-10-11; the check
  now loads its own data.
- **intake/browser-cancel** (from 2026-10-08): relied on `e2e-cancel`'s data, which `e2e-classify` truncated. Now
  runs `e2e-cancel` itself when the data is missing.
- **manifest/browser** (2026-10-11 morning): run against a mock Leon started 27 h earlier. It now refuses to start
  in that state, and says why.
- **intake/e2e-scheduled, intake/e2e-classify** (from 2026-10-10, when that agent first appears in the rig; they had
  not run since 2026-10-08, so nobody saw it): the sign-in rig's agent (:5176) shares the database
  and has no CNAIR portal. It took their look-up retries and recorded "switched off". It is now stopped for those
  suites (`rig/signin-agent.sh`), and they refuse to run while it is up. `e2e-scheduled` also starts its own mock
  Leon now: it passed only when it ran straight after `e2e`.
- **wall/browser-access** (from 2026-10-10, `d35554e`): the view-only wording changed, and the test was not
  updated. Not in any regular run until today.
- **wall/access-check**: started before the wall's permission cache had settled after `permissions-browser`. It now
  waits for the wall to report the defaults.
- **shell-check**: read the nav before the account had loaded (a fixed 2.5 s wait). It now waits for the
  skeletons to go.

- **No check for real passenger data** (until 2026-10-12): a real, unredacted handling request (an Outlook message
  with its GenDecs) sat in `rig/.scratch/fwd-msg-yulsa.eml` from 2026-09-30, dropped there by a one-off
  `wrap-forward` run; nothing read it. It was never committed, and `rig/.scratch` is ignored by git and never
  reaches the server. Deleted 2026-10-12. `rig/check-no-real-passenger-data.mjs` now fails on any file under
  `rig/` holding passenger-shaped data without a redaction mark (it caught this one before the delete).

- **stage3-batch2** (2026-10-12, one full run): read the saved dashboard layout a fixed 1.2 s after Done, while the
  account copy is saved 500 ms after the last change. On a busy machine it read one change behind. It now waits
  for the save. Product note, not fixed: Done does not send the pending save at once, so closing the page within
  half a second of the last edit leaves the account copy one change behind (the browser's own copy is complete).

## Not suites

These are tools, not suites; nothing is judged from their output:

- **Fixture makers and mocks:** `rig/intake/make-*`, `deliver`, `wrap-forward`, `mock-*`, `rig/manifest/fixtures`
  and `operators`; `rig/wall/mock-leon.mjs` (the walls' Leon, :3985: invented flights in every state, webhook
  subscriptions in memory) and `rig/wall/seed-portal.mjs` (invented NOTAMs and AIP stand-ins in the portal's
  storage). `rig/intake/mock-resend.mjs` also takes sends (`POST /emails`, listed at `/_rig/sent`).
- **Run only by a person:** `try-extract` uses the model on a file. `leon-snapshot` and `leon-disposable-flight`
  touch real Leon and need a person-typed phrase.
- **Probes against live systems, never run from the rig:** `rig/cnair/*` (the real provider portal),
  `rig/wall/nowline-*` and `sync-probe`.
- **Extension evidence scripts:** `rig/ext/t-auth-fallback`, `t-devtools-shot`, `t-probe`, `t-region`,
  `t-replymode-region`, `t-toolbar`, `t-voice-mode`, `t-worklet-missing`, `t-console-voice`, `toolbar-composite`.
  They take screenshots and print what they see.
