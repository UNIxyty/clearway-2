# Leon flight types — investigation (why cancelled flights still show)

*2026-07-13 · investigation only, no filtering changes made.*
*Live pull from four Leon tenants (`vpc`, `jty`, `nvj`, `cwy-cwy`), 2026-07-12 → 2026-08-02
(3 weeks), 232 flights total. All four operator tokens authenticated successfully.
Tokens were kept in a local scratch env and are NOT in this repo; excerpts below are
scrubbed (no credentials; no passenger data was ever requested — counts only).*

## TL;DR — the single clearest reason cancelled flights still show

**The production flight cache is stale, not the filter.** The deployed code (Item 7) is
correct and current — but flights that were cancelled *before* the deploy sit in the
persisted cache (`data/timeline-cache.json`) in their **pre-Item-7 normalized form, which
never captured `isCnl`** (the old GraphQL selection didn't request it, so every cached
flight has `isCnl: false` baked in). Incremental sync only re-fetches flights **modified in
Leon after the last checkpoint**, so an already-cancelled, since-untouched flight is never
re-normalized and keeps rendering as a normal flight.

Field-level proof, captured live on 2026-07-13:

| | Leon (live GraphQL) | Production wall feed (`/api/timeline/flights`) |
|---|---|---|
| `flightNid` | `69964253` (JTY52W, LGAV→LGTS, 2026-07-12) | same flight present |
| `isCnl` | **`true`** | **`false`** |
| `iconType` | `"flight"` | **field absent entirely** (pre-Item-7 cache shape) |
| `trip.isDeleted` | `true` | not captured |

The absent `iconType` on the wall's copy is the tell: the new selection always captures it,
so this record was written by the old code and has not been re-synced since.

Only 1 of the 52 currently-cancelled flights shows on the wall right now — the Item-9
17-hour upcoming horizon hides the rest — but **each one will surface as it crosses into
the horizon** unless the cache is refreshed.

**One-shot remedy (existing endpoint, no code change):** after any deploy that widens the
sync selection, purge the flight cache so the next sync is a full re-fetch with the new
fields:

```
fetch('/digital-wall/api/admin/clear-flight-cache', { method: 'POST' })  // signed-in console
```

## How the data was pulled (reproducible)

Auth: the same path `leon-sync.mjs` uses — `POST https://<opr>.leon.aero/access_token/refresh/`
with `refresh_token=<token>` (form-encoded) → bearer token → `POST /api/graphql/`.

Leon caps query complexity at 1600 (and complexity scales with the requested time interval),
so the field set was pulled in three passes over the SAME interval and merged by `flightNid`:

```graphql
# pass A — identity + all flat kind/state indicators
query { flightList(filter: { timeInterval: { start: "2026-07-12", end: "2026-08-02" } }) {
  flightNid flightNo status isCnl isActive iconType flightType icaoType
  isSimulator isFerry isCommercial isConfirmed startTimeUTC endTimeUTC
  acft { registration }
  startAirport { code { icao } }
  endAirport { code { icao } }
} }

# pass B1 — extra state scalars (same interval)
#   isTimesToBeConfirmed flightConfirmationTime journeyLogCancelledNote passengerListCount
# pass B2 — trip object, chunked into 7-day intervals to stay under the cap
#   trip { tripType isDeleted }
```

## Flights grouped by type, per operator

### Operator `vpc` — 68 flights (2026-07-12 → 2026-08-02)

| Type | Count | Flights (No · date · route) |
|---|---|---|
| Cancelled | 18 | VPC002 07-14 LUKK→LCLK, VPC004 07-16 EETN→LIRQ, VPC004 07-17 EETN→LFMN, VPC002 07-19 LCLK→EPMO, VPC002 07-19 LGTS→ENGM, VPC002 07-19 EPMO→ENGM, VPC004 07-20 LFMN→EETN, VPC004 07-22 LFMD→LEMD … +10 more |
| Ferry / empty leg | 17 | OHTFD 07-12 EETN→LIPE, OHTFD 07-12 EFTP→EETN, VPC004 07-13 LSZH→EGLF, VPC002 07-15 LDDU→LKPR, VPC004 07-16 LIEO→LIRQ, VPC004 07-17 LEMG→EETN, VPC003 07-18 LBSF→LFMN, VPC002 07-22 LEBZ→LEMG … +9 more |
| Option | 3 | VPC003 07-13 EETN→LBPD, VPC003 07-15 LBPD→LGKF, VPC003 07-15 LGKF→LBSF |
| Confirmed — commercial | 30 | T7CMG 07-12 LOWW→EETN, T7CMG 07-13 EETN→LOWW, VPC004 07-13 EGLF→LFBZ, VPC002 07-13 EKCH→LDDU, OHTFD 07-14 EETN→EGHI, VPC004 07-16 LFBZ→LIEO, VPC004 07-16 LIRQ→LEMG, VPC004 07-17 EETN→EGPK … +22 more |

### Operator `jty` — 65 flights (2026-07-12 → 2026-08-02)

| Type | Count | Flights (No · date · route) |
|---|---|---|
| Cancelled | 26 | JTY52W 07-12 LGAV→LGTS, JTY52W 07-13 LICJ→UBBB, JTY52W 07-14 UBBB→LDSP, JTY52W 07-14 LGTS→LDSP, JTY52W 07-14 LGAV→LEIB, JTY52W 07-14 UBBB→LEIB, JTY52W 07-15 LGAV→UDYZ, JTY52W 07-17 LFMN→LIRI … +18 more |
| Inactive (replaced leg) | 3 | JTY52W 07-12 EGLF→EKOD, JTY52W 07-12 EKOD→LGAV, JTY52W 07-12 LGAV→LTBA |
| Ferry / empty leg | 14 | JTY52W 07-14 EDDM→LDSP, JTY52W 07-15 LGMK→UDYZ, JTY52W 07-17 LFMN→LFTH, JTY52W 07-18 LIEO→LGAV, JTY52W 07-19 EGLF→LFMN, JTY52W 07-20 LGAV→LGRP, JTY52W 07-21 LGRP→LGIR, JTY52W 07-22 LIEO→LICC … +6 more |
| Option | 3 | JTY52W 07-23 LGTS→LCLK, JTY52W 07-24 LCLK→LGMK, JTY52W 07-24 LGMK→EGKB |
| Confirmed — commercial | 19 | JTY52W 07-13 LTBA→EDDM, JTY52W 07-14 LDSP→LEIB, JTY52W 07-15 LEIB→LGMK, JTY52W 07-16 UDYZ→LFMN, JTY52W 07-17 LFTH→LIEO, JTY52W 07-18 LGAV→EKOD, JTY52W 07-18 EKOD→EGLF, JTY52W 07-19 LFMN→EGLF … +11 more |

### Operator `nvj` — 7 flights (2026-07-12 → 2026-08-02)

| Type | Count | Flights (No · date · route) |
|---|---|---|
| Cancelled | 2 | T7IVM 07-12 LFPB→UACC, T7IVM 07-15 ZSPD→ZSSS |
| Ferry / empty leg | 1 | T7IVM 07-13 UAAA→UACC |
| Option | 1 | T7IVM 07-31 UACC→LTBA |
| Confirmed — private | 3 | T7IVM 07-13 UACC→UAAA, T7IVM 07-14 UACC→ZSPD, T7IVM 07-17 ZSPD→UACC |

### Operator `cwy-cwy` — 92 flights (2026-07-12 → 2026-08-02)

| Type | Count | Flights (No · date · route) |
|---|---|---|
| Cancelled | 6 | MRSAR 07-12 LDDU→LIML, MRSAR 07-12 LIML→LGKL, MRSAR 07-12 LGKL→EVRA, MRSAR 07-12 EVRA→LFPB, AXE8106 07-27 EGLF→EGKB, AXE8113 07-31 EGSS→EGLF |
| Ferry / empty leg | 20 | ORO1041 07-12 LEBL→LIRI, GWC3 07-12 LIML→LIMC, TIE208H 07-12 LATI→LIML, ORO1044 07-12 LSGS→LEBL, MRSAR 07-12 LDDU→EVRA, ORO2152 07-13 LEMD→LPFR, ORO1042 07-13 LEMH→LEBL, MVE1AV 07-14 LIRN→LYBE … +12 more |
| Option | 3 | KLJ5608 07-13 LZIB→DNMM, N157MG 07-15 EVRA→BIKF, N157MG 07-16 BIKF→KBGR |
| Confirmed — commercial | 61 | DCLIK 07-12 LSGG→EKSB, GWC3 07-12 LIMC→UACC, GWC3 07-12 LIMC→UACC, ORO1042 07-12 LIRI→LEBL, ORO2151 07-12 LEBL→LGAV, ORO1043 07-12 LEBL→LSGS, KLJ6205 07-12 EGNX→LEVC, TIE208H 07-12 LIML→LGAV … +53 more |
| Confirmed — private | 2 | MRSAR 07-13 EVRA→LFPB, MRSAR 07-15 LFPB→EVRA |

## Type/state indicators — what identifies each category

| Category | Identifying field(s) & value(s) | Confidence |
|---|---|---|
| **Cancelled** | `isCnl: true` — present on **all 52** cancelled flights across all 4 tenants; no cancelled flight found with `isCnl: false`. `trip.isDeleted: true` co-occurs on a subset (19) — a *deleted* trip's legs are also flagged `isCnl: true`, so `isCnl` subsumes it. `status` stays `CONFIRMED`/`OPTION` even when cancelled — status is NOT a cancellation signal. | Proven live |
| **Inactive / replaced leg** (new finding) | `isActive: false` with `isCnl: false` — 3 flights (jty). These look like superseded schedule versions (same trip re-planned via a different routing; the replacement legs exist alongside). They are NOT caught by any current filter and would render as normal confirmed flights when inside the visibility window. | Proven live (semantics inferred) |
| **Crew positioning** | `iconType: "positioning"` (enum `IconType`: `flight, positioning, office, quote, duty, reservation, maintenance, simulator`). **Zero instances** in the 3-week window on all 4 tenants — every flight had `iconType: "flight"` — so this could not be validated against a live sample. Note Leon also models crew positioning as a separate non-flight entity in some setups (it may never appear in `flightList` at all). | Enum proven; no live sample |
| **Simulator** | Three independent flags: `iconType: "simulator"`, `isSimulator: true`, `flightType: SIMULATOR` (enum `FlightType`). Zero instances in the window; not validatable live. | Enum proven; no live sample |
| **Ferry / empty leg** | `isFerry: true` (53 flights). These are REAL aircraft movements (aircraft repositioning with crew) and must stay on the wall. `flightType: AIRCRAFT_REPOSITIONING` appears once and is also a real movement. | Proven live |
| **Option / unconfirmed** | `status: OPTION` (+ `isConfirmed: false`). `OPPORTUNITY` also exists in the enum. Currently kept on the wall by design (valid trip statuses). | Proven live |
| **Commercial vs private** | `isCommercial: true/false` (non-null). Correlates with `icaoType` `N` (non-scheduled commercial) vs `G` (general aviation) and `flightType` `PAX` vs `OWNER` — but `isCommercial` is the authoritative flag (used by the CAA appliesTo matching). | Proven live |

## Raw excerpts (one representative per type, scrubbed)

#### Cancelled — `isCnl: true` (cwy-cwy)

Identifying field(s): `isCnl: true` (status stays CONFIRMED; trip not deleted)

```json
{
 "flightNid": 72414212,
 "flightNo": "MRSAR",
 "status": "CONFIRMED",
 "isCnl": true,
 "isActive": true,
 "iconType": "flight",
 "flightType": "OWNER",
 "icaoType": "G",
 "isSimulator": false,
 "isFerry": true,
 "isCommercial": false,
 "isConfirmed": true,
 "startTimeUTC": "2026-07-12T06:30:00Z",
 "endTimeUTC": "2026-07-12T08:05:00Z",
 "acft": {
  "registration": "M-RSAR"
 },
 "startAirport": {
  "code": {
   "icao": "LDDU"
  }
 },
 "endAirport": {
  "code": {
   "icao": "LIML"
  }
 },
 "isTimesToBeConfirmed": false,
 "flightConfirmationTime": "2026-07-10T17:49:40Z",
 "journeyLogCancelledNote": null,
 "passengerListCount": 0,
 "trip": {
  "tripType": "OWNER",
  "isDeleted": true
 }
}
```

#### Cancelled via deleted trip — `isCnl: true` + `trip.isDeleted: true` (jty)

Identifying field(s): `isCnl: true` AND `trip.isDeleted: true` — this is the flight the production wall still shows with `isCnl: false`

```json
{
 "flightNid": 69964253,
 "flightNo": "JTY52W",
 "status": "CONFIRMED",
 "isCnl": true,
 "isActive": true,
 "iconType": "flight",
 "flightType": "PAX",
 "icaoType": "N",
 "isSimulator": false,
 "isFerry": true,
 "isCommercial": true,
 "isConfirmed": true,
 "startTimeUTC": "2026-07-12T15:00:00Z",
 "endTimeUTC": "2026-07-12T15:45:00Z",
 "acft": {
  "registration": "OE-LOW"
 },
 "startAirport": {
  "code": {
   "icao": "LGAV"
  }
 },
 "endAirport": {
  "code": {
   "icao": "LGTS"
  }
 },
 "isTimesToBeConfirmed": false,
 "flightConfirmationTime": "2026-05-19T09:10:06Z",
 "journeyLogCancelledNote": null,
 "passengerListCount": 0,
 "trip": {
  "tripType": "PAX",
  "isDeleted": true
 }
}
```

#### Inactive / replaced leg — `isActive: false` (jty, NEW finding)

Identifying field(s): `isActive: false` while `isCnl: false`, `status: CONFIRMED`, trip not deleted — no current filter catches this

```json
{
 "flightNid": 69114270,
 "flightNo": "JTY52W",
 "status": "CONFIRMED",
 "isCnl": false,
 "isActive": false,
 "iconType": "flight",
 "flightType": "PAX",
 "icaoType": "N",
 "isSimulator": false,
 "isFerry": false,
 "isCommercial": true,
 "isConfirmed": true,
 "startTimeUTC": "2026-07-12T08:00:00Z",
 "endTimeUTC": "2026-07-12T09:25:00Z",
 "acft": {
  "registration": "OE-LOW"
 },
 "startAirport": {
  "code": {
   "icao": "EGLF"
  }
 },
 "endAirport": {
  "code": {
   "icao": "EKOD"
  }
 },
 "isTimesToBeConfirmed": false,
 "flightConfirmationTime": "2026-05-11T09:05:20Z",
 "journeyLogCancelledNote": null,
 "passengerListCount": 2,
 "trip": {
  "tripType": "PAX",
  "isDeleted": false
 }
}
```

#### Ferry / empty leg — `isFerry: true` (vpc) — must stay visible

Identifying field(s): `isFerry: true`; everything else normal

```json
{
 "flightNid": 72432580,
 "flightNo": "OHTFD",
 "status": "CONFIRMED",
 "isCnl": false,
 "isActive": true,
 "iconType": "flight",
 "flightType": "PAX",
 "icaoType": "N",
 "isSimulator": false,
 "isFerry": true,
 "isCommercial": true,
 "isConfirmed": true,
 "startTimeUTC": "2026-07-12T07:15:00Z",
 "endTimeUTC": "2026-07-12T10:25:00Z",
 "acft": {
  "registration": "Ground Han"
 },
 "startAirport": {
  "code": {
   "icao": "EETN"
  }
 },
 "endAirport": {
  "code": {
   "icao": "LIPE"
  }
 },
 "isTimesToBeConfirmed": false,
 "flightConfirmationTime": "2026-07-11T20:20:04Z",
 "journeyLogCancelledNote": null,
 "passengerListCount": 0,
 "trip": {
  "tripType": "PAX",
  "isDeleted": false
 }
}
```

#### Option — `status: OPTION` (cwy-cwy)

Identifying field(s): `status: OPTION`, `isConfirmed: false`

```json
{
 "flightNid": 71170835,
 "flightNo": "KLJ5608",
 "status": "OPTION",
 "isCnl": false,
 "isActive": true,
 "iconType": "flight",
 "flightType": "PAX",
 "icaoType": "N",
 "isSimulator": false,
 "isFerry": true,
 "isCommercial": true,
 "isConfirmed": false,
 "startTimeUTC": "2026-07-13T08:00:00Z",
 "endTimeUTC": "2026-07-13T15:20:00Z",
 "acft": {
  "registration": "LY-BBN"
 },
 "startAirport": {
  "code": {
   "icao": "LZIB"
  }
 },
 "endAirport": {
  "code": {
   "icao": "DNMM"
  }
 },
 "isTimesToBeConfirmed": false,
 "flightConfirmationTime": null,
 "journeyLogCancelledNote": null,
 "passengerListCount": 0,
 "trip": {
  "tripType": "PAX",
  "isDeleted": false
 }
}
```

#### Confirmed commercial (vpc)

Identifying field(s): `isCommercial: true`, `icaoType: N`

```json
{
 "flightNid": 72430142,
 "flightNo": "T7CMG",
 "status": "CONFIRMED",
 "isCnl": false,
 "isActive": true,
 "iconType": "flight",
 "flightType": "PAX",
 "icaoType": "N",
 "isSimulator": false,
 "isFerry": false,
 "isCommercial": true,
 "isConfirmed": true,
 "startTimeUTC": "2026-07-12T18:00:00Z",
 "endTimeUTC": "2026-07-12T20:45:00Z",
 "acft": {
  "registration": "Ground Han"
 },
 "startAirport": {
  "code": {
   "icao": "LOWW"
  }
 },
 "endAirport": {
  "code": {
   "icao": "EETN"
  }
 },
 "isTimesToBeConfirmed": false,
 "flightConfirmationTime": "2026-07-11T15:24:08Z",
 "journeyLogCancelledNote": null,
 "passengerListCount": 1,
 "trip": {
  "tripType": "PAX",
  "isDeleted": false
 }
}
```

#### Confirmed private (nvj)

Identifying field(s): `isCommercial: false`, `icaoType: G`, `flightType: OWNER`

```json
{
 "flightNid": 72430689,
 "flightNo": "T7IVM",
 "status": "CONFIRMED",
 "isCnl": false,
 "isActive": true,
 "iconType": "flight",
 "flightType": "OWNER",
 "icaoType": "G",
 "isSimulator": false,
 "isFerry": false,
 "isCommercial": false,
 "isConfirmed": true,
 "startTimeUTC": "2026-07-13T05:00:00Z",
 "endTimeUTC": "2026-07-13T06:45:00Z",
 "acft": {
  "registration": "T7-IVM"
 },
 "startAirport": {
  "code": {
   "icao": "UACC"
  }
 },
 "endAirport": {
  "code": {
   "icao": "UAAA"
  }
 },
 "isTimesToBeConfirmed": false,
 "flightConfirmationTime": "2026-07-11T16:13:25Z",
 "journeyLogCancelledNote": null,
 "passengerListCount": 4,
 "trip": {
  "tripType": "OWNER",
  "isDeleted": false
 }
}
```

#### Aircraft repositioning type (cwy-cwy) — real movement, keep

Identifying field(s): `flightType: AIRCRAFT_REPOSITIONING` + `isFerry: true`

```json
{
 "flightNid": 72232630,
 "flightNo": "MVE1AV",
 "status": "CONFIRMED",
 "isCnl": false,
 "isActive": true,
 "iconType": "flight",
 "flightType": "AIRCRAFT_REPOSITIONING",
 "icaoType": "G",
 "isSimulator": false,
 "isFerry": true,
 "isCommercial": false,
 "isConfirmed": true,
 "startTimeUTC": "2026-07-14T10:00:00Z",
 "endTimeUTC": "2026-07-14T11:30:00Z",
 "acft": {
  "registration": "N250AV"
 },
 "startAirport": {
  "code": {
   "icao": "LIRN"
  }
 },
 "endAirport": {
  "code": {
   "icao": "LYBE"
  }
 },
 "isTimesToBeConfirmed": false,
 "flightConfirmationTime": "2026-07-06T14:32:35Z",
 "journeyLogCancelledNote": null,
 "passengerListCount": 0,
 "trip": {
  "tripType": "AIRCRAFT_REPOSITIONING",
  "isDeleted": false
 }
}
```


## Cross-check against the current filter (Item 7)

`isExcludedFlightKind()` in `leon-sync.mjs` drops: `isCnl === true`, `iconType === "positioning"`,
and simulator (`iconType === "simulator" || isSimulator === true || flightType === "SIMULATOR"`).
Applied at all three ingestion paths (initial sync, incremental sync with eviction, cache load).

**The filter logic matches Leon's real representation for cancelled flights** — all 52 live
cancelled flights would be dropped by it. The gaps are:

1. **Stale cache (the active bug).** Pre-Item-7 cache records were normalized WITHOUT the kind
   fields (`isCnl` maps from a field that was never requested → `false`). The cache-load filter
   can't drop what the record doesn't show, and `getModifiedFlightList` (incremental sync) only
   returns flights modified after the checkpoint — an untouched cancelled flight never gets
   re-normalized. Verified live: nid `69964253` is `isCnl: true` in Leon but `isCnl: false` +
   no `iconType` in the production feed.
2. **`isActive: false` is not filtered.** A second "does not fly" representation found on jty
   (3 flights). These pass every current check.
3. Positioning/simulator entries could not be live-validated (none exist in the window) — the
   filter for them matches the schema enums but remains unproven against real data.

## Recommended fix (not applied)

1. **Immediately (no code):** run `POST /api/admin/clear-flight-cache` once on production.
   The next sync cycle re-fetches everything with the new selection; every stale cancelled
   flight disappears. (This also future-proofs nothing — see 3.)
2. **Filter addition:** treat `isActive === false` as excluded (new kind, e.g. `"inactive"`),
   alongside the existing `isCnl` / positioning / simulator checks. Keep `isFerry` and
   `AIRCRAFT_REPOSITIONING` visible — they are real movements.
3. **Structural guard:** stamp the cache with a schema/selection version
   (e.g. `cacheVersion: 2` in `timeline-cache.json`); on load, if the stored version predates
   the current one, discard the cache and force a full initial sync. That makes "deploy widened
   the selection" self-healing instead of requiring a manual purge after every such change.
4. Optional belt-and-braces: also exclude when `trip.isDeleted === true` (requires adding
   `trip { isDeleted }` to the selection — mind the complexity cap; in live data it never
   occurs without `isCnl`, so this is redundancy, not a gap).
