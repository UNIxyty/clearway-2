# AIP refresh: what was built (2026-10-25), from docs/aip-refresh-plan.md

Cached EAD AD 2 copies now refresh on the AIRAC schedule, record which cycle they are, and say when a refresh failed.

## The pieces
- **`data/airac-dates.json`** — the effective dates 2026–2028 with their source written beside them; `rig/airac-dates-check.mjs`
  fails if the table and `lib/airac.ts` ever disagree, if consecutive dates are not 28 days apart, or if the table runs
  out within six months. The dates are the 28-day arithmetic from 22 January 2026 (AIRAC 2601), which is what ICAO
  publishes; compare once with EUROCONTROL's list when 2027 and 2028 are announced.
- **Check-only mode** in `scripts/ead-download-aip-pdf.mjs` (`--check`): reads EAD's table row for the airport — its
  effective date and AIRAC flag — prints one JSON line, downloads nothing.
- **`scripts/aip-refresh.mjs`**, run by the sync worker (`scripts/aip-sync-server.mjs`). Every half hour it asks whether
  a run is due: the cycle in force has no run yet (from 00:30Z on its effective date), or the recheck 24 hours after the
  first run has not happened. No timer counted from today: a missed date runs at the worker's next start. A run goes
  through the copies **one at a time with a pause** (`AIP_REFRESH_PAUSE_MS`, 20 s), in this order: airports with flights
  on the wall in the next 7 days (the wall writes `data/portal/upcoming-airports.json`, ICAO codes only, and the worker mounts that folder read-only as `/wall-portal`, never the wall’s whole data folder), copies over 90 days old, copies
  older than one cycle, the rest; airports with flights and no copy are appended. For each copy it checks the source and
  **refetches only when the table has a newer date or the copy has no recorded date** — and only in download mode.
- **Check-only is the default.** `AIP_REFRESH_DOWNLOADS=on` in the server's `.env` turns refetching on. Until then a
  run records what it found and changes no document.
- **Every sidecar** gets `lastCheck { at, ok, sourceEffectiveDate, newer | refetched | reason }`. A failure keeps the old
  copy. `lib/airac.ts` reads it: a copy checked this cycle with nothing newer is **current**; one the source has a newer
  document for is **superseded** until refetched.
- **Where it shows:** the airport page's copy line adds "The refresh on 29 Oct failed; this copy is from the date above.
  Press Re-sync, or use the Web AIP."; the wall's Send AIP email adds the same next to the copy's date; the Ops Agent's
  document answers carry "could not be refreshed on …; this copy is from …" (`agent/lib/knowledge/revision.mjs`).
- **The dashboard monitor** (`lib/service-checker.ts` › EAD AIP copies) reads `aip/refresh-state.json`: "AIRAC 2611
  refresh (check): 150 checked, 6 refetched, 3 failed (LEBL, LEMD, LEPA)." Degraded when anything failed, when the cycle
  in force has no run yet, or when the date table runs short.
- **The developer** gets one Telegram line per run with failures, and one when a date went by without a run.
- **Endpoints** on the worker (sync secret): `GET /refresh/status`, `POST /refresh/run?mode=check|download&limit=N`.

## Decisions (the plan's five)
1. **Copies over 90 days old are served**, clearly marked, as now. A dispatcher with an old, dated document is better off
   than one with nothing while the web AIP is one press away. Decided.
2. **EAD Basic terms for scheduled retrieval — yours.** Check-only is one page read per airport per cycle, one at a time,
   20 seconds apart; a full download is a browser session of 1–2 minutes. I recommend running check-only for the first
   two cycles and turning downloads on once someone has read the EAD Basic terms, or an agreement exists. The switch is
   one line in `.env` and a worker restart.
3. **Failure alerts go to the developer Telegram channel**, the one that already carries approvals. Decided.
4. **Run window:** due from 00:30Z on the effective date, with the 24-hour recheck. Decided.
5. **Pre-fetching** airports with upcoming flights and no copy: yes, in download mode (appended to the run). Decided.

## Production, in order
1. Run migration-free: nothing to run on the database.
2. Deploy `aip-sync` (the compose file now mounts the wall’s `data/portal` read-only and sets `AIP_REFRESH_DOWNLOADS` off) and the
   `portal` (the revision types, the monitor, the page line) and `digital-wall-backend` (the email line) and
   `agent-service` (the answer line) — this block's one deploy.
3. **The first run** is due at once (AIRAC 2610 has no run recorded): check-only, ~160 copies, about an hour with the
   pause. Watch `GET /refresh/status` and the worker log. Then decide 2.

## The 52 oldest
Dealt with by the order: they are checked second in every run, right after airports with flights; in check-only mode
each gets `lastCheck` and shows as current or superseded; in download mode the superseded ones are refetched first.
