# Rig suites: current state

**Rule (2026-10-11):** no suite stays red. A suite passes, or its failure is written here as a known bug with a date and
a reason. "Same failures as before" is not a result. Update this list whenever a suite is touched or run.

Run them all with `rig/run-all-suites.sh` (order and setup in the script; see `rig/README.md`). Counts are the
number of checks passed in the last full run.

## Known failures

None.

Every suite below passed on 2026-10-12/13 (three full runs: after the image-secrets and docs stage 1
changes, after docs stage 2, after docs stage 3; two suites re-run alone after a test fix, see below).

## Suites

| Suite | Last passing | Date |
|---|---|---|
| check-no-real-passenger-data | 838 files, none | 2026-10-12 |
| wall/test-portal-folder | 8 | 2026-10-13 |
| docs-check | 21 | 2026-10-13 |
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
| group2-check | 13 | 2026-10-12 |
| group4-check | 33 | 2026-10-12 |
| shell-check | 10 | 2026-10-12 |
| stage1-check | 19 | 2026-10-12 |
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
  and `operators`.
- **Run only by a person:** `try-extract` uses the model on a file. `leon-snapshot` and `leon-disposable-flight`
  touch real Leon and need a person-typed phrase.
- **Probes against live systems, never run from the rig:** `rig/cnair/*` (the real provider portal),
  `rig/wall/nowline-*` and `sync-probe`.
- **Extension evidence scripts:** `rig/ext/t-auth-fallback`, `t-devtools-shot`, `t-probe`, `t-region`,
  `t-replymode-region`, `t-toolbar`, `t-voice-mode`, `t-worklet-missing`, `t-console-voice`, `toolbar-composite`.
  They take screenshots and print what they see.
