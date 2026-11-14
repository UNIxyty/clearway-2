# Rig suite speed: where the time goes, and the way to twenty minutes

Measured 2026-11-01. Goal: the full rig run (`rig/run-all-suites.sh`) in about twenty minutes instead of two hours.

## Where the two hours went

With the Mac awake, the 73 suites added up to **63 minutes** on 2026-10-28; the runner's own setup steps (builds, agent
restarts, seeding) take under a minute. The rest of the "two hours" was the Mac sleeping on battery, which the runner
now reports as INCOMPLETE. The time is a long tail, not five suites: the five longest are 32 % of it, the twelve longest
61 %, and 51 suites share the last 641 s.

| # | Suite | Seconds | Cumulative |
| --- | --- | --- | --- |
| 1 | intake/e2e-people | 275 | 7 % |
| 2 | dark-audit | 258 | 14 % |
| 3 | mobile/tier2-check | 253 | 21 % |
| 4 | intake/e2e | 234 | 27 % |
| 5 | stage1-check | 186 | 32 % |
| 6 | intake/e2e-scheduled | 176 | 37 % |
| 7 | intake/browser-flows | 162 | 41 % |
| 8 | overlay-check | 162 | 45 % |
| 9 | error-text-browser | 157 | 50 % |
| 10 | mobile/tier1-check | 150 | 54 % |
| 11 | intake/e2e-classify | 144 | 57 % |
| 12 | manifest/browser | 124 | 61 % |
| 13 | mobile/pax-check | 123 | 64 % |
| 14 | utc-browser | 115 | 67 % |
| 15 | signin-perf | 103 | 70 % |

The intake suites and manifest/browser (about 23 minutes together) read with the real model through Bedrock; their time
is mostly model calls and the agent's own timers, not the test's sleeps.

## Fixed waits

`rig/lib/wait-meter.mjs` (a preload) adds up every fixed wait a suite makes as it runs. The dark audit spent 269 of its
274 s in one 2.5 s sleep per page. Suites that wait on several pages at once show more wait than run time (tier 2: 281 s
of waits in 255 s), so the meter is an upper bound there; the measure that counts is the suite's own time, before and
after.

What replaced them (rig/lib/settle.mjs):
- **the element the next assertion reads** (`waitForSelector`, `waitForURL`, a heading, a row) wherever there is one;
- **`settled(page)`** after a load or an action with no single element to wait for: no request in flight (live streams
  excepted), no DOM change, no skeleton or busy marker, for 250 ms. Every page is watched from its first request.
  It cannot see a plain timer that changes the page later; the suites that were changed are rerun to prove it holds;
- **the saved state** for settings (the account's preferences row, the page attribute a choice sets);
- **service timers made settable**, so the rig waits for its own schedule and production keeps its own:
  `PERMISSIONS_TTL_MS` (the grants cache in lib/permissions/grants.mjs, 10 s → 1 s on the rig) is in. On the branch
  `rig-waits-pending`, until the model suites can run: `INTAKE_TICK_MS` (the agent's scheduled-try tick, 30 s → 1 s)
  and `LEON_OPERATORS_TTL_MS` (the operator registry, 30 s → 1 s). The rig's start scripts set them; production sets
  none of them.

Left on purpose: sleeps inside polling loops (they are the poll), the stage-1 hold on app scripts (now released as soon
as the first paint is read), and one wait where a request must be refused both before and after a grants cache
refresh — it waits out the cache's own period (1 s on the rig).

What the first pass got wrong, and the rule each taught (all fixed and rerun):
- **A duration can be the thing under test.** A one-second press-and-hold, a short press that must cancel, a view that
  closes itself after 30 s: a "ready" signal is wrong there. The holds keep their durations; the 30 s close is tested
  by fast-forwarding the page's clock (`page.clock.fastForward`), not by waiting.
- **Quiet is counted from the action, not from before it.** A click that starts a route change a moment later found
  the page already quiet. `settled()` now watches at least 250 ms after it is called, and a new document resets it.
- **"Never appears" needs a positive anchor first.** An absence checked too early passes for nothing. Those checks
  now wait for the page's own content, then check what must not be there.
- **A request held on purpose is not a page loading.** The first-second and skeleton checks hold a request; they
  wait for the skeleton they are about, not for "settled".
- **A skeleton can be content** (the component sheet), and **a request from a page left behind never finishes**:
  `settled()` ignores a busy marker once nothing has happened for a second, and forgets requests on navigation.
- **A save is done when it is saved**, not when it is drawn: two pins drawn but not yet saved raced the reorder.
- `RIG_SETTLE_DEBUG=1` prints each page that never settled and what was still in flight.

## Result so far (2026-11-01/02)

Measured on the 61 suites that do not need the model. The model-dependent suites cannot run: the rig's AWS key is
refused. The first verification pass, on a quiet machine, cut them from 39.4 to 27.6 minutes run one after another:

| Suite | Before | After |
| --- | --- | --- |
| mobile/tier2-check | 253 s | 58 s |
| dark-audit | 258 s | 89 s |
| error-text-browser | 157 s | 25 s |
| overlay-check | 162 s | 59 s |
| utc-browser | 115 s | 22 s |
| stage1-check | 186 s | 119 s |
| signin-perf (removed with the sign-in panel, 2026-11-02) | 103 s | 42 s |
| mobile/phone-v3-check | 60 s | 20 s |
| permissions-check | 47 s | 9 s |

The later passes, which fixed what the first one got wrong (below), ran on a Mac that was swapping. Their times are not
measurements. Every changed suite in this commit has passed with its final code. Two are held on the branch
`rig-waits-pending` until a quiet run can pass them: the dark audit's four tabs and stage 3 batch 2's drag wait.
The model-dependent changes are held there too. Those are the agent's tick and operator-cache settings, the intake
end-to-end suites and the manifest voice waits. They wait for a new key.

## The machine

The rig Mac has 8 GB of memory, and the Docker VM that runs the rig's Supabase is given 6 GB of it. Under a full run
the Mac swapped about 6 GB and its load passed 50. Suites that take a minute took 15 to 90 minutes, and one timed out.
That, not the suites, is the hard limit on running them side by side: every extra browser or second database makes it
worse. Before any parallel lane, the rig needs more memory: a 16–32 GB Mac, or a Linux runner with the rig in Docker.

## Running suites side by side

What collides today (read from the suites):
- **The intake suites** truncate the intake tables, restart the agents on :5175 and :5176, and restart the mock Leon
  (:3995). Any two of them at once break each other (the 8 October failures).
- **Rig-wide switches**: portal-foundations turns maintenance mode on for everyone; permissions-check deletes every
  grant; several suites reset dashboard layouts of the shared rig accounts (rig-access-admin, -user).
- **Shared wall state**: the wall settings, the vite preview on :4173 that the runner points at one wall or the other.
- **The manifest agent**: manifest/browser and mobile/pax-check need :5175 started with the manifest's settings,
  which the intake suites replace.

Two ways to run in parallel:

**A. Lanes on the one rig (about a day).** A prelude runs the rig-wide switches alone (permissions, portal
foundations, self-promotion, temporary access, group 4: about two minutes). Then two lanes at once: the intake lane,
serial (about 21 minutes before the tick change, less after), and the UI lane split across three workers (the rest:
about 35 minutes of suite time before the waits came out). Needed: one rig account per UI worker for the suites that
write preferences; a second vite preview port so the console checks stop moving the shared one; the manifest/pax
suites after the intake lane. Expected total: the intake lane plus the prelude, a little over twenty minutes, because
the intake lane is the critical path and most of it is model time.

**B. A second database for the API-level intake suites (A plus one to two days).** A second local Supabase
(database, auth, REST and gateway only: about 0.7 GB of memory), on shifted ports, with the same migrations; its own
.env, agent, mock Resend and mock Leon. The six API-level intake suites (e2e, e2e-scheduled, e2e-classify, e2e-unread,
e2e-cancel, e2e-people: about 16 minutes) move there; they reach the agent and the database directly and need no portal,
so no second portal build. The browser intake suites stay on the main rig. The suites' hard-coded ports
(5175, 3995, 3996 and the agent restarts inside e2e and e2e-people) become settings. Expected total: about fifteen
minutes, the longest lane being the intake lane split in two.
