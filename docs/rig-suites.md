# Rig suites: current state

What the rig cannot test at all — no Cloudflare, mail, real Leon, sync services, Telegram… — is in
[docs/rig-vs-production.md](rig-vs-production.md). A green suite says nothing about those.

**Rule (2026-10-11):** no suite stays red. A suite passes, or its failure is written here as a known bug with a date and
a reason. "Same failures as before" is not a result. Update this list whenever a suite is touched or run.

**A suite that only passes in one order is not a passing suite (2026-11-09).** tier1-check passed for weeks on intake
requests another suite had left behind: it never tested what it claimed, and the fixed order hid that. A suite makes
what it needs, or finds it and makes it when it is missing; the runner's setup lines (a wall preview, the sign-in agent
stopped, a build) are the only things it may count on. To find the rest on purpose, the runner reorders itself
(`rig/order.mjs`): `RIG_SHUFFLE=<seed>` shuffles each group of suites between two setup lines, and
`RIG_SPLIT=alternate` or `random:<seed>` deals the suites to the two lanes differently, so a suite whose maker lands in
the other box fails. `rig/box/two-lanes.sh` shuffles, with a random split, every fourth run and any run a week or more
after the last shuffled one, and prints the seed: `two-lanes.sh --shuffle <seed> --split <split>` runs that order again.
A red in a shuffled run is a red run.

What the first shuffled runs found (2026-11-08/09), each fixed so the suite makes what it needs:

| Suite | What it leaned on | Found by |
|---|---|---|
| mobile/tier1-check | intake requests another suite left | two lanes, by accident |
| intake/browser-edits | the CIMOG1 request the runner looked up after the e2e suites | shuffle |
| intake/browser-cancel | the scheduled requests whichever suite left last, and a folder only e2e-cancel made | shuffle |
| stage3-batch2 | changelog entries made by other suites | random split |
| permissions-browser | a change by permissions-check: its loose text match also hit the empty change log's sentence | random split |

Not order: in the same runs extraction-repeat found the model reading one email two ways, twice (the requester's company
with and without "Ops"; a reference taken from the subject). Both are now fixed in code (agent/lib/intake/extract.mjs).
The runner's two dashboard-layout resets went too: the suites set their own.

**A check that consumes a shared allowance changes the next check's result (2026-11-04).** The gate walk posted to the
public forms and used up the 8-an-hour ask-for-access limit, and the onboarding suite then failed with 429; give the walk
its own sender and onboarding passed 53 of 53 on the same portal. A suite that spends a limit, a quota or a seeded row
gets its own: each run is its own visitor to the rig proxy (`x-rig-visitor`, rig only).

**The rig proxy plays Cloudflare (2026-11-05).** It sets `cf-connecting-ip` to the address that connected (or to
`x-rig-visitor`) and appends it to `x-forwarded-for`; the portal's signed-out limiters key on it alone and refuse a
request without it (lib/caller-address.mjs). After pulling this, restart the sign-in proxy (:3989) along with the portal: the
new portal behind an old proxy answers every signed-out form 403.

Run them all with `rig/run-all-suites.sh` (order and setup in the script; see `rig/README.md`). Counts are the
number of checks passed in the last full run.

## Known failures

**The record is `rig/known-failures.json`** (2026-11-02, the second time today). The runner's last step,
`rig/verdict.mjs`, sorts every red suite into LISTED (a recorded cause) or UNLISTED, and names every unlisted one in
the verdict. Any red, listed or not, is RED, exit 1; there is no "green except". A listed suite that passed is named
too, so its entry goes. shell-check was red and on no list from mid-October to 2026-11-02; this is what stops that.
The list below says the same as the JSON, in words.

**Skipped while the cause holds (2026-11-02, later that day).** Each cause in `rig/known-failures.json` has a
`probe`, a command that exits 0 while the cause still holds. The runner runs each probe once at the start. A suite
under a cause that still holds is SKIPPED and printed with its cause; when the cause clears, its suites run again by
themselves. A run with skips ends "PASSED WITH SKIPS", never green.

**How this list works (2026-11-02):** each entry names one cause and lists, by name, every check it covers, with a
count. Nothing joins an entry because it failed in the same run. A failure not named here is a live finding until it
is investigated. If it has the same cause, it is added by name, with the date and the evidence, and the count changes.
No wildcards: "intake/browser-*" used to stand for five suites, and a sixth would have joined it unseen.

- **Cause: no credit on the Anthropic account (since 2026-11-11).** The account behind the rig's key is the same one
  production uses; it has no credit left, so the API refuses every model call with a credit-balance error. Not a code
  fault; it clears when the account is topped up (the probe, `rig/probes/no-credits.mjs`, sends a one-token message and
  exits 0 while the API refuses it for want of credit). **12 suites:** agent-disclosure, knowledge-roundtrip,
  manifest/browser, intake/extraction-repeat, intake/e2e, intake/e2e-classify, intake/e2e-unread, intake/browser-flows,
  intake/e2e-people, intake/browser-people, intake/browser-check, intake/browser-edits. Recorded on 2026-11-12 from the
  full run at 1be18dcc (each shows `model_error` or the agent's "Something went wrong while answering").
- **Cause: no working model key on the rig (since 2026-11-01).** AWS Bedrock refuses the rig's access key
  (UnrecognizedClientException), so every call to the model fails. It is not a code fault. It clears when the agent
  moves to the Anthropic API with a working key, or `.env.rig` holds a working AWS key. **9 suites** (intake/e2e-scheduled, intake/e2e-cancel and intake/browser-cancel passed on 2026-11-02 and came off):
  manifest/browser, intake/e2e, intake/e2e-classify, intake/e2e-unread,
  intake/e2e-people, intake/browser-flows, intake/browser-people, intake/browser-check,
  intake/browser-edits. Recorded on 2026-11-01 from that day's runs. Each is re-confirmed by name when it is next run.
- *Closed 2026-11-02:* permissions-check's three reveal checks ("a User cannot reveal…", "…the review screen is told
  so", "an Admin can…"). They were filed under the model key, but the real cause was a missing fixture. They read the
  request RIGPAX19, which only the model-driven intake suites make. Without it the id was empty and the URL was
  malformed, so the gate refused all three before any reveal logic ran. The admin check was one of the three, not a
  fourth. The check now seeds its own invented request and all three pass. permissions-check passes in full.
- **Last full run: 2026-11-10, two lanes on the existing rig boxes (no rebuild, the order as written), at 1d02ca85:
  RED 8 of 107 suites, 29 min 16 s wall clock — every red was in something that session changed (the client view v2,
  the one NOTAM card, the map, the emails, the lazy console chunk, the AIP library's menu entry). Each was fixed and
  those eight suites were rerun on rigbox2 at 4ecabef5: all eight green (no second full run, by the session's rule).**
- **Run before that: 2026-11-09, two lanes on two rig boxes built from nothing (rig/box/two-lanes.sh --build), at
  a22cb7a9: GREEN, all 106 suites, 30 min 1 s wall clock (lane a 60 suites, lane b 46).**
- **Run before that: 2026-11-09, on the server's rig box built from the repository alone (rig/box/build.sh --replace, no
  hand step), at d0937eb4: GREEN, all 103 suites, 54 min 43 s, known-failures record empty.** The first full run since
  3 November. On the way: 34 red on the box's first trial, then 19, 5, 1 — setup only the Mac had (schema, fixtures, the
  Python env, the sign-in accounts, the walls' operators, a 13 October extension build, a hand-made voice recording),
  Linux differences (lsof, date -v, no display, pdftotext), suites behind the code, and five product bugs (raw error
  text, an unresolvable intake conflict, a varying checklist item, D-IMOI read as an airport code, glossary links).
- **Run before that: 2026-11-03 overnight, on power, at 6d8e51d3: 71 passed, 9 skipped (no-model-key still holds), 3
  unlisted red, each fixed and rerun alone.**
  - `error-text`: the mailer's new fallback tests Resend's text internally; marked `public-error-ok`.
  - `intake/e2e-scheduled`: the check read the emails before the ops alert was sent (it goes just after the attempt is
    recorded); it now waits for it.
  - `mobile/tier1-check`: going back on the email's headers alone raced its body, which is what unlocks Confirm; the
    page marks the loaded body and the check waits for it.
  All three pass alone.

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
| permissions-check | 53 | 2026-11-02 |
| permissions-browser | 13 | 2026-10-12 |
| wall/access-check | 65 | 2026-10-12 |
| wall/browser-access | 9 | 2026-10-12 |
| wall/console-theme-check | 40 | 2026-10-18 |
| mobile/tier1-check | 190 (the Wall page left the list: the phone app has its own suite) | 2026-11-14 |
| mobile/tier2-check | 427 | 2026-11-14 |
| mobile/phone-v3-check | 1053 (the phone app v3 as staff at /digital-wall/phone/: the old addresses lead there once and a registered screen stays; the timeline and the flight as the old phone wall behaved, T1–T9, F1–F11, D1–D2; every staff page and sheet by taps; the settings kept; a broken part says "This part failed." with Reload; every page and sheet at 390 and 360 px, light and dark: 16 px fields, 44 px targets, no overlap, nothing under the bottom bar. Replaces mobile/phone-wall-check and mobile/staff-phone-check) | 2026-11-14 |
| mobile/phone-v3-client-check | 412 (the same app as a client, sign-in shell :3989: only the granted aircraft, no staff part drawn and no staff or console file downloaded, the switches, the filter and start page saved on the account, the support address both ways, first-visit set-up, the same audit at 390 and 360 px, light and dark) | 2026-11-14 |
| error-boundary-check | 45 (one part made to throw in the console, the ops room display, the phone app and the client desk: the small message with Reload, the rest working, the error in the wall's log and never in the words; the timeline's last good picture under NOT LIVE; a phone part's report is taken under either of its two boundary names) | 2026-11-14 |
| mobile/pax-check | 47 | 2026-10-28 |
| self-promotion-check | 12 | 2026-10-20 |
| temporary-access-check | 24 | 2026-10-21 |
| client-scope-check | 66 | 2026-11-14 |
| client-ui-check | 324 (the client view v2: Admin › Clients approval with the nine switches; the shell, the frame and the Board at 1440/390/360 light and dark; Flights with search; a flight as panel and page; the map and the passengers sheet; Operators & aircraft saved on the account; the start page; Account with start page, appearance, grants and a real password change; the zoom check; the retired pages 404) | 2026-11-10 |
| client-feed-check | 85 (what a client's browser is given of a flight: the listed fields, ops' notes only by switch; the retired wall reads 404; coords and passenger names; invented notes it makes and removes; since 2026-11-13 the phone app, opened with a start page saved first, and every aircraft it is given carries what names it and nothing else) | 2026-11-14 |
| client-ui-check | +23 on 2026-11-11: the client display settings (desk light, phone dark: the ops look cards, a saved setting read back from the client's own profile, the window key ignored, the ops settings route 404, Reset to default) and the status screens (not-found, client not-found, forbidden, an unknown set-password link: centred, logo, headline, one button; the logo light on dark and dark on light) | 2026-11-11 |
| client-ui-check | 1161 on 2026-11-14 (the client desktop v3 at 1280/1440/1920 light and dark: the sidebar with Help & support and the collapse to a rail; Timeline with its hour labels level and inside their columns at every zoom; Flights with search, the columns lined up; the flight panel and its head; Operators & aircraft; Account from the top, one failed part with Reload; the start page; phones sent to the phone app once; a window narrow for an instant is not; the settings preview shows hours and a flight, desk and phone; the status logo judged by the theme the screen is drawn in) | 2026-11-14 |
| email-templates | 20 templates × 11 (every email template built with sample values, sent once to the mail mock, rendered at 660/375 light and dark; escaping, preheader, Outlook button, UTC times, no raw variable, no internal hostname) | 2026-11-10 |
| aip-library | 11 (the AIP library table while ENR is paused: every ENR link one paused state with the one sentence, not counted; the four countries without a public AIP; dated links rebuilt for the cycle in force; the eAIP GEN guesses) | 2026-11-11 |
| clients-page-check | 41 (red on the pre-fix page: padding ×6, past the edge at 1250, focus; `CLIENTS_CHECK_SELFTEST=overlap` turns the overlap assertion red) | 2026-11-02 |
| client-onboarding-check | 62 | 2026-11-14 |
| files-route-check | 9 (red on 1b3fbbf1: another person read a help draft through /files) | 2026-11-02 |
| client-gate-check | 49 (red on b8ba5dd0 with the approval redirect off: 74 of 135 handlers answered an unapproved or temporary account; red on 8d627e99 with the middleware block off: 73 of 115 portal handlers answered a client; red on fcf442fb: 93 pages rendered for an unknown role, and the docs search index answered one; 49 again on 2026-11-14, with the gateless portal on :3981 started as rig/run-all-suites.sh starts it) | 2026-11-14 |
| web-search | 60 (the follow-up section red on 0053146f's rules: a check that was made still showed a partial answer first; the ceiling section red when the day's real-model runs had already spent past its $2, now it starts from an empty day) | 2026-11-05 |
| agent-disclosure (real model, the rig key, a few cents) | 21 (red on the code before: "hey" → a partial banner and a NOTAM follow-up; "what can you do" 198 tokens) | 2026-11-05 |
| knowledge-roundtrip (real model for its two answer checks) | 11 (red on the code before: an upload waited for approval; the uploader's own approval was refused only by the page; no Remove) | 2026-11-05 |
| personal-data-paths-check | 16 (red on the code before: a person without the reveal permission got the scan, the list and the .eml; one row of four; no limit) | 2026-11-02 |
| mail-image-check | 11 (red on the code before: "show images" fetched a loopback listener) | 2026-11-02 |
| telegram-media-token | 9 (the old hourly token opened every file and named no one) | 2026-11-02 |
| own-mail | 1 (red on a planted `resetPasswordForEmail`) | 2026-11-02 |
| portal-colours | 1 (5 exceptions printed with their reasons) | 2026-11-02 |
| style-text | 1 | 2026-10-28 |
| maintenance-logos | 12 | 2026-10-28 |
| airac-dates-check | 5 | 2026-10-25 |
| aip-refresh-check | 22 | 2026-10-25 |
| docs-shots-check | 7 | 2026-10-25 |
| group2-check | 13 | 2026-10-12 |
| group4-check | 33 | 2026-10-12 |
| shell-check | 10 (red from at least 8d627e99 until 2026-11-02: a page opened from the sidebar kept the old scroll; fixed in the shell) | 2026-11-02 |
| stage1-check | 22 | 2026-11-14 |
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
