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
| **Checklist color** | `flight.checklist.allItems { cdNid csId }` + `checklist.getAvailableDefinitions(groupId: OPS) { nid statuses { status color } }` (definitions cached per operator) | `checklistColor` (hex) |
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

## Pill fill precedence (Part A1)

`arrived` (pink) → `airborne` (blue) → `ctot` (purple) → `delayed` (yellow)
→ `scheduled` (white). **CTOT-and-delayed** flights render purple (CTOT wins,
matching the listed order) — flagged for confirmation; flip the two lines in
`movementStateOf()` in `leon-sync.mjs` to change it.

## What Leon exposes that we now fetch (previously dropped)

- `flightWatch.etd/eta` (estimates — previously the pill's "ETD" was always
  the schedule), `ctot`, `offBlock/blon` (block times), the `status` enum,
  and per-flight checklist items. All are carried on every normalized flight
  and persisted in the local cache, so the console can use them too.
