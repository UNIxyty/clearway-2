# Rig suites: current state

**Rule (2026-10-11):** no suite stays red. A suite passes, or its failure is written here as a known bug with a date and
a reason. "Same failures as before" is not a result. Update this list whenever a suite is touched or run.

Run them all with `rig/run-all-suites.sh` (order and setup in the script; see `rig/README.md`). Counts are the
number of checks passed in the last full run.

## Known failures

None. Every suite below passed on 2026-10-11.

## Suites

| Suite | Last passing | Date |
|---|---|---|
| intake/test-classify | 46 | 2026-10-11 |
| intake/test-leon-payload | 10 | 2026-10-11 |
| intake/test-timezones | 30 | 2026-10-11 |
| intake/test-no-calendar-response | 17 | 2026-10-11 |
| intake/test-retention | 9 | 2026-10-11 |
| intake/test-webhook | 10 | 2026-10-11 |
| intake/settings-check | 10 | 2026-10-11 |
| intake/e2e | 60 | 2026-10-11 |
| intake/e2e-scheduled | 61 | 2026-10-11 |
| intake/e2e-classify | 36 | 2026-10-11 |
| intake/e2e-cancel | 31 | 2026-10-11 |
| intake/e2e-people | 34 | 2026-10-11 |
| intake/browser-check | 41 | 2026-10-11 |
| intake/browser-people | 25 | 2026-10-11 |
| intake/browser-cancel | 11 | 2026-10-11 |
| intake/browser-flows | 22 | 2026-10-11 |
| intake/browser-edits | 9 | 2026-10-11 |
| manifest/test-generator | 47 | 2026-10-11 |
| manifest/browser | 36 | 2026-10-11 |
| permissions-check | 43 | 2026-10-11 |
| permissions-browser | 13 | 2026-10-11 |
| wall/access-check | 65 | 2026-10-11 |
| wall/browser-access | 9 | 2026-10-11 |
| group2-check | 13 | 2026-10-11 |
| group4-check | 33 | 2026-10-11 |
| shell-check | 10 | 2026-10-11 |
| stage1-check | 19 | 2026-10-11 |
| portal-foundations-check | 30 | 2026-10-11 |
| stage2-check | 58 | 2026-10-11 |
| stage3-batch1-check | 39 | 2026-10-11 |
| stage3-batch2-check | 53 | 2026-10-11 |
| stage3-batch3-check | 33 | 2026-10-11 |
| stage4-check | 25 | 2026-10-11 |
| overlay-check | 4 | 2026-10-11 |
| dark-audit | 2 (46 pages) | 2026-10-11 |
| partB-check | 31 | 2026-10-11 |
| ext/t-console | clean (no messages) | 2026-10-11 |
| ext/t-issues | clean (no issues) | 2026-10-11 |

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
