# AIP refresh: plan (for decision, not built)

Written 2026-10-15. The pages now say how old a copy is (cff9cdbe). This plan is the real fix: copies that refresh
on the AIRAC schedule, that record which cycle they are, and that tell someone when a refresh fails.

## What is true today

- **Nothing refreshes a cached AIP document.** A copy is fetched when someone presses **Re-sync**, or opens an airport
  that has no copy. No timer, cron job or worker loop exists. The AIP sync worker logged one fetch on each of six days
  since about 30 September, never an error; the last was 12 October.
- **159 EAD AD 2 copies** in the cache: 52 fetched more than 90 days ago, 28 between 28 and 90 days, 78 between 7 and
  28 days, 1 within a week.
- **Only 2 record their AIRAC cycle.** EAD's own table gives each document's effective date, and the download script
  has recorded it since it was added (`scripts/ead-download-aip-pdf.mjs` → `lib/aip-revision-meta.mjs` → a
  `.meta.json` sidecar). The other 157 were fetched before that, so which are superseded cannot be told.
- **Flights decide what matters.** In the next 7 days, 77 airports have flights on the wall. 22 have an EAD copy; 7 of
  those are older than 28 days; 55 have no copy at all (non-EAD countries, or never opened).
- **Where a copy is read or sent:** the airport page, the wall's Send AIP / GEN email, the Ops Agent's document tool
  (`agent/lib/tools/aip.mjs`), and Download PDF. After cff9cdbe the first two say the copy's date.

## What I propose

**1. Refresh on the published AIRAC dates.**
- A table of AIRAC effective dates, `data/airac-dates.json`, copied from the published ICAO / EUROCONTROL schedule for
  2026–2028, with its source written beside it. A rig check compares every date with `lib/airac.ts` (anchored at 22 Jan
  2026, AIRAC 2601) and fails if they ever differ, or if the table runs out within six months.
- The worker refreshes after 00:00Z on each effective date, and checks again 24 hours later (EAD sometimes publishes
  late in the day).
- No timer counted from today's date: a missed run (the server was down) runs at the next start, for the cycle in
  force.

**2. Check before downloading.** EAD's AIP library table already shows each document's effective date. A new
check-only mode reads that row and compares it with the copy's recorded effective date. The worker downloads only when
the table has a newer date, or when the copy has no recorded date. Most airports do not change every cycle, so most
checks end there. It also keeps load on EAD low (see 5).

**3. Record the cycle on every document.**
- Every download, scheduled or by a person, writes the sidecar with `effectiveDate`, `airac`, `fetchedAt` and the
  history.
- A copy fetched before this keeps showing "revision unknown" until it is checked.
- The first scheduled run checks all 159, so within one run every copy either records its cycle or is refetched.

**4. Order.** In each run, in this order:
1. Airports with flights on the wall in the next 7 days.
2. The 52 copies over 90 days old.
3. Copies older than one cycle.
4. The rest.

Airports with flights in the next 7 days and no copy yet are also fetched, so the first person to open them does not
wait 1–2 minutes.

**5. Until a copy is refreshed** (the 52 over 90 days, and any copy older than one cycle):
- The airport page and the wall's email already say the date, and "more than one AIRAC cycle old" in the warning
  colour (cff9cdbe).
- I would add the same line to the Ops Agent's document answers, so the agent never quotes an old copy without its date.
- I would **not** refuse to serve an old copy. A dispatcher with an old, clearly dated document is better off than one
  with nothing, while the web AIP stays one press away. **Your call** (see "Decisions" below).

**6. When a refresh fails.**
- The old copy stays; nothing is deleted. The sidecar records `lastCheck: { at, ok: false, reason }`; the reason is our
  wording, and the detail goes to the log.
- The airport page adds: **"The refresh on 29 Oct failed; this copy is from 02 Oct 2026. Press Re-sync, or use the Web
  AIP."**
- The wall's email row says the same.
- The dashboard's AIP monitor reports what is true: "AIRAC 2611 refresh: 150 checked, 6 refetched, 3 failed (LEBL,
  LEMD, LEPA)". Degraded when anything failed.
- One message to the developer per run (Telegram, through the existing developer channel) when a run has failures, or
  when a run did not happen on an effective date.

**7. What stays as it is.** Re-sync keeps working the same way and records the cycle too. Non-EAD sources (ASECNA, the
national scrapers, the FAA's US documents, Russia) follow their own publishers. They get the same date line and
failure line now, and their own schedule later, one source at a time.

## Load and EAD's terms — needs a decision before building

A full download is a browser session on EAD Basic, about 1–2 minutes each. 159 full downloads in a row would take 3–5
hours of sessions. That is why step 2 checks first. I propose:
- one document at a time;
- a pause between requests;
- a run window of a few hours after 00:00Z.

**I have not checked EUROCONTROL's EAD Basic terms for scheduled automated retrieval.** Someone should, before this runs
on a schedule. Scheduled use may need EAD's paid service or an agreement.

## What the rig cannot show

There is no EAD on the rig (`docs/rig-vs-production.md`). The rig can test:
- the schedule and the order;
- the check-or-download decision, using a stand-in that answers with effective dates;
- what each page and email says on success and on failure.

The first real run must be watched on production: check-only first, then with downloads.

## Build order (each step is a separate commit with its check)

1. The AIRAC table and its check.
2. Check-only mode in the EAD download script.
3. The scheduled run in the worker, in check-only mode. It reports, and changes nothing.
4. Downloads turned on, in the order above.
5. Failure recording, the page and email lines, the monitor wording and the developer message.
6. The Ops Agent's document answers carry the date.

## Decisions

1. **Serving copies over 90 days old:** serve them clearly marked (as now), or refuse until refreshed?
2. **EAD Basic terms:** who checks them, and is scheduled retrieval allowed?
3. **Failure alerts:** Telegram to the developer, or something else, and to whom?
4. **Run window:** after 00:00Z on the effective date, or another time that suits ops?
5. **Pre-fetching** airports with upcoming flights that have no copy yet: yes or no?
