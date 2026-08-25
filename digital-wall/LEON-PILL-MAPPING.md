# Leon → wall-pill field mapping

> Sources: `bitbucket.org/leondevteam/api-documentation` (sample-queries/,
> standard-workflows/flight-synchronization-guide.md) cross-read against our
> `digital-wall/leon-sync.mjs`. This documents where each pill-driving fact
> comes from in the Leon GraphQL API and what we normalize it to.

## How we query (robustness note)

The docs only fully enumerate `FlightWatch` fields on the *flight-support*
namespace (`tobt, ctotIso, etdIso, offBlock, toIso, eetIso, etaIso, ldgIso,
blonIso`); the plain `flightList.flightWatch` shape is not spelled out, and a
GraphQL query naming a non-existent field fails **whole**. So `leon-sync.mjs`
**introspects** `__type(name:"FlightWatch")` / `__type(name:"Flight")` once
per boot and builds the selection from the intersection of wanted ∩ available
fields, falling back to the legacy minimal selection if introspection is
unavailable. Tenants with richer schemas automatically get richer pills.

## Field map

| Concept | Leon source (in preference order) | Our normalized field |
|---|---|---|
| Scheduled departure / arrival | `flight.startTimeUTC` / `endTimeUTC` | `startTimeUTC` / `endTimeUTC` |
| Estimated departure / arrival | `flightWatch.etd` / `etdIso`; `eta` / `etaIso` | `etd` / `eta` (fallback = scheduled) |
| Block-off (off-block) | `flightWatch.offBlock` / `bloffIso`; `journeyLog.bloffUTC` | `blockOff` |
| Take-off | `flightWatch.toIso`; `journeyLog.toTimeUTC` | `takeOff` |
| Landing | `flightWatch.ldgIso`; `journeyLog.ldgTimeUTC` | `landing` |
| Block-on | `flightWatch.blonIso`; `journeyLog.blonUTC` | `blockOn` |
| Actual departure (ATD) | `flightWatch.atd`, else take-off, else JL | `atd` |
| Actual arrival (ATA) | `flightWatch.ata`, else landing, else JL | `ata` |
| **Movement state** | derived | `movementState`: `arrived` if ATA/landing/block-on set; `airborne` if ATD/take-off/block-off set and not arrived; else `ctot` / `delayed` / `scheduled` (below) |
| **Delay** | `max(0, (atd ?? etd) − startTimeUTC)` in minutes | `departureDelayMin` (a not-yet-departed flight is "delayed" when its estimate slips past schedule) |
| **CTOT / slot** | `flightWatch.ctotIso` / `ctot` / `tobt` | `ctot` (ISO); state `ctot` when set and not yet airborne/arrived |
| **Trip status (confirmed?)** | `flight.status` — `FlightStatus` enum: `CONFIRMED` \| `OPTION` \| `OPPORTUNITY` (sync guide "Key field reference") | `tripStatus` + `isConfirmed` (= status === CONFIRMED; missing status ⇒ confirmed) |
| **Checklist color** | `flight.checklist.allItems { cdNid csId definition { groupId } }` + `checklist.getAvailableDefinitions(groupId: OPS) { nid statuses { status color } }` (definitions cached per operator) | `checklistColor` (hex) |
| Cancelled | `flight.isCnl` | `isCnl` |

## Checklist color aggregation (heuristic — adjustable)

Leon stores a status **per checklist item**; the OPS board shows one color
per flight. We aggregate: each item's `csId` is looked up in its
definition's ordered `statuses` list; the item with the **lowest progress**
(earliest position in its status list) wins, and its status `color` becomes
the flight's `checklistColor`. Rationale: the least-complete item is the one
an ops room cares about. If a flight has no checklist items (or the tenant
doesn't expose `checklist` on `Flight`), `checklistColor` is `null` and the
pill ID renders in the default color.

### OPS-only scoping (verified against live Leon)

The ID colour is driven **only by the OPS checklist group**, enforced twice:

1. Items whose `definition.groupId` is present and ≠ `OPS` are skipped in the
   aggregation (the sub-selection is added only when the tenant's
   `ChecklistItem` type exposes `definition`, introspected per operator).
2. The definitions map only contains `getAvailableDefinitions(groupId: OPS)`
   results, so an item from another group can't resolve a colour even
   without the per-item guard.

Live findings (reference tenant, Jul 2026): flight-level `checklist.allItems`
carries **only OPS items** — SALES checklists hang on the **trip** checklist
(`trip.checklist`), which the wall never queries. OPS and SALES definition
nids are disjoint sets. `flight.salesDotColor` is uniformly `#FF0000` on this
tenant, and an OPS item at a red status produces the **same red** — a red
flight ID therefore means a least-complete **OPS** item at a red status
(e.g. UPPC001 → `#FF0000` from OPS), not a SALES leak. `flight.colors` is
Leon's strip colour (trip/aircraft), unrelated to checklist state.

## Pill fill precedence (Part A1)

`arrived` (pink) → `airborne` (blue) → `ctot` (purple) → `delayed` (yellow)
→ `scheduled` (white). **CTOT-and-delayed** flights render purple (CTOT wins,
matching the listed order) — flagged for confirmation; flip the two lines in
`movementStateOf()` in `leon-sync.mjs` to change it.

## Corrections from the live cwy-cwy verification (July 2026)

Captured real flightList payloads with a temporary cwy-cwy credential and ran
them through the mapper. Findings, all fixed:

- **`delayedDepartureUTC`/`delayedArrivalUTC` double-counted.** They were
  computed as estimate + delay, but the delay is measured against the ACTUAL
  time — real case NUM221: ETD 11:30, ATD 11:49, delay 49 min → old math said
  "delayed until 12:19". Now the delayed-until instant IS `atd ?? etd`
  (`ata ?? eta` on arrivals), so the hatch segment and boundary labels end at
  the real departure/arrival.
- **Checklist colors arrive as bare hex** (`86BF53`, `FF0000`, `FFA500`,
  `BBBBBC` — red/amber/green/na in cwy-cwy's 174 OPS definitions). The mapper
  now normalizes them to `#`-prefixed CSS colors.
- **Dark checklist colors were discarded by the pill's contrast guard** — a
  red (= unfinished, the most urgent signal) ID silently rendered in the
  default color. The pill now lightens the colour toward white until legible
  instead of dropping the hue.
- **Numeric epoch-seconds flightWatch fields confirmed live** (`atd:
  1783165740` etc.) — `normalizeDateLike` already handles them, but cache
  entries written by pre-fix code carry absurd delays (−29,645,850 min) and
  no `movementState`, and `getModifiedFlightList` never re-delivers old
  unmodified flights. `healCachedFlight()` now repairs every entry on cache
  load (derives movementState, clamps delays to ±48 h, recomputes the
  delayed-until instants, normalizes colors) — this is what un-whites the
  stale "uncoloured" pills.
- Negative delays (early ops — e.g. ORO1041 ATD 47 min before schedule) are
  real and common; both mapper and UI treat ≤ 0 as "not delayed".
- CTOT + already-arrived occurs in the wild (ORO1041 LEBL→LIPR carried
  `ctotIso` after landing); `arrived` correctly wins per the precedence
  order.

## Trip status + ID colour: reviewed against live data (July 2026, Item 2)

**What drives what.**
- *Trip confirmed?* — `Flight.status` (FlightStatus enum `CONFIRMED | OPTION |
  OPPORTUNITY`) → normalized `tripStatus` + `isConfirmed`
  (`status === "CONFIRMED"`; a missing status counts as confirmed). The pill
  renders the flight ID *italic* when `isConfirmed === false`, upright
  otherwise. Nothing else (checklist, movement, delay) affects the slant.
- *ID colour* — the flight's checklist items (`checklist.allItems`) aggregated
  against the operator's OPS definitions: the least-complete item (earliest
  position in its definition's ordered status list) wins and its status
  colour becomes `checklistColor` ('#'-normalized). The pill passes it
  through `readableIdColor`, which lightens toward white ONLY until the
  legibility threshold (luminance ≥ 0.55) — never swaps the hue.

**Live verification (cwy-cwy, 126 flights over −10..+30 days).** Statuses in
the wild: 124 CONFIRMED, 2 OPTION. `MRSAR` (OPTION) → `isConfirmed=false`,
rendered italic in `#ff7070` (its red `FF0000` checklist lightened two mix
steps); `NUM221` (CONFIRMED) → upright in the exact Leon green `#86BF53`
(bright enough, untouched). Aggregation spot check on a 15-item flight: the
lowest-progress item (a `YES` at position 3/5) correctly beat all `NAP`
(not-applicable, position N/N = complete) and later-position items. Verdict:
mapping and rendering are correct; no code change required.

## What Leon exposes that we now fetch (previously dropped)

- `flightWatch.etd/eta` (estimates — previously the pill's "ETD" was always
  the schedule), `ctot`, `offBlock/blon` (block times), the `status` enum,
  and per-flight checklist items. All are carried on every normalized flight
  and persisted in the local cache, so the console can use them too.

## Timing display precedence (ops rules, bug report 7–9 — exact)

Source fields: CTOT, ETD, BLOFF, T/O, EET, ETA, LDG, STD, STA (flight-watch
panel). Reference: initial schedule = STD/STA; actual = T/O (departure) and
LDG (arrival).

Departure label (pill start):
1. **T/O** — always wins when present, overrides everything.
2. else **the LATER of CTOT and ETD** (equal priority; label names the one
   that supplied the later instant).
3. else plain STD time (no prefix).
**BLOFF is never displayed** (it still participates in movement-STATE via
the atd/ata fallback chain — state and display are separate).

Arrival label (pill end):
1. **LDG** once landed.
2. **ETA** once T/O is set (in-flight) — or when a flight-watch ETA differs
   from STA.
3. else plain STA time.

Schedule differences: the SIGNED delta vs STD/STA rides on each label
(+late amber, −early green — early is as visible as late), and the striped
segment on the pill covers min(sched,actual)→max(sched,actual) on each end,
so both delays and early movements read geometrically too. In-flight the
labels are exactly T/O + ETA; after arrival exactly T/O + LDG (per ops).
The old mid-pill boundary labels (ETD…ATD pairs) are gone — they were why
a flight with a real T/O could render as bare "ETD 05:50": the endpoint
always showed ETD and the actual only appeared when a positive delay AND
wide clearance allowed a boundary label.

## Delay/hatch geometry (bug report 3 item 1 — REVERSES report 2 item 4)

The label precedence above is UNCHANGED (T/O overrides everything;
CTOT-vs-ETD later-wins; LDG→ETA flips; BLOFF never displays). The
geometry per the NEWEST ops mockups (this reverses the report-2
"trailing tail" model):
- The hatched segment LEADS the body: it spans schedule→actual
  departure ([STD, T/O] — or CTOT/ETD while not departed), rendered in
  WHITE & BLACK stripes. It only appears when the departure is late.
- The coloured BODY is the actual flight: [displayed departure,
  displayed arrival]. Arrival with no explicit LDG/ETA is PROJECTED by
  shifting the schedule's elapsed time onto the displayed departure
  (EET = STA − STD), so a delayed flight keeps its real duration.
- No trailing tail; arrival differences show only through the signed
  label deltas (`T/O 13:22 +22`, `LDG 15:35 +5`; early = green negative).
- Stale-estimate guard: a flight-watch ETD >30 min BEFORE STD on a
  not-departed flight is treated as re-planning residue and ignored
  (the 'ETD 07:00 −120' backwards-hatch case); real early departures
  come through T/O, which is actual data and always wins.

## Window visibility (bug report 3 items 5+8)

A flight is on the wall while its [start, end] interval OVERLAPS
[now − postLandingHours, now + upcomingHorizonHours] (start = ATD→ETD→STD,
end = ATA→ETA→STA). The window is GLOBAL on BOTH sides (bug report 4
item 2): `getVisibilitySettings` reads only the shared default, AND the
settings PUT persists the two window keys into that default (never into
account profiles — stale copies are purged, and resolution force-serves
the keys from the default). Report 3 fixed only the read side while the
sliders kept writing to account profiles nobody read — the wall stayed at
13h/1.5h regardless of settings, the recurring ">13h flights invisible".

## MVT flash (bug report 3 item 7)

No T/O `mvtThresholdMin` minutes (default 15) past the reference time —
CTOT/ETD when set, else STD (that instant is exactly the pill's displayed
departure) — blinks a red RING around the pill contour every
`mvtFlashSeconds` (default 1 s). Contour only: the overlay ring never
touches the fill, the hollow-estimate inset or the info-tab outline. It
stops the moment a T/O (or any actual departure) arrives and never fires
on arrived or cancelled flights. Both knobs are per-account settings.

## Per-airport checklist colours (bug report 3 item 10)

The Upcoming Flight Table colours ADEP/ADES by the flight's SLOT &
HANDLING services. Live-introspected (2026-08-23, cwy tenant):
`checklist { getAvailableDefinitions(groupId: OPS) { nid label
affectedAirport statuses { status color } } }` — each definition names the
airport it affects (`AffectedAirport: adep | ades | both`; e.g.
`Slot (ADEP)` nid 11 / `Slot (ADES)` nid 12 / `Handling (ADEP/ADES)`
nids 7/8, plus Passenger/Cargo Handling and friends). Selection rule:
OPS-group items whose definition label matches /slot|handling/i; per side
the least-complete item (worst progress in its ordered status list) wins,
mirroring the flight-level aggregate. Status palette on the live tenant:
QSM/UNT/REJ #FF0000, RQS/CNX #FFA500, CNF #86BF53, NAP #BBBBBC. Mapped
onto `checklistAdepColor` / `checklistAdesColor` (flight cache v6).
