# Leon investigation — status lag, cancelled flights, webhooks, HTML cross-check

*2026-07-17 · investigation only, no code changed. Live data from the four tenants
(vpc / jty / nvj / cwy-cwy — all four tokens authenticated), the official Leon API docs
repo (`bitbucket.org/leondevteam/api-documentation`, cloned), and the two OPS-view HTML
exports (`CWY-CWY.html`, `JTY.html`). All credentials scrubbed.*

---

## TL;DR — the two clearest causes

**(a) Status-update lag:** setting flight-watch times (ATD/ATA — the "flying"/"landed"
signal) does **not** mark the flight as modified in Leon. Our only live update channel is
`getModifiedFlightList`, so a landing reaches the wall only when *something else* edits
that flight (journey log completion, any ops edit) or when a full re-sync happens
(restart / cache purge). Flights whose crews file paperwork promptly look "live"; untouched
flights keep their pre-landing state for hours. Measured live: **19 of 22 flights that
landed in the last 36 h have `flightLastModificationTime` *older* than their ATA** — by
3 hours to 4.5 months — and **0 of 22 landings appeared in a 2-hour modified-list delta**.

**(b) Cancelled flights still showing:** two separate things.
1. **Production cache staleness** (the active bug, already documented on 2026-07-13):
   flights cached before the kind-fields deploy carry `isCnl:false` baked in and are never
   re-delivered. One `POST /api/admin/clear-flight-cache` fixes the backlog.
2. **A real filter gap in the code:** Leon has a *second* "doesn't fly" representation —
   **`isActive: false`** (replaced/superseded legs). These flights are CONFIRMED, not
   cancelled, pass every current check, and appear in live data (4 in jty's last-48 h
   delta alone). We don't filter on `isActive`.

---

## 1 · Why some pills update live and others lag

### How our pipeline refreshes
- The wall polls every 60 s; each poll runs a sync cycle.
- After the first full pull, the sync is **incremental only**: `getModifiedFlightList
  (dateTime: <checkpoint>)` → `created[] / changed[] / deleted[]`. Our checkpoint handling
  follows the guide correctly (we store Leon's returned `timestamp`, converting the Unix
  integer to ISO — verified in `leon-sync.mjs`).
- Therefore: **a flight only refreshes on the wall if Leon includes it in `changed[]`.**

### What Leon does — and doesn't — count as "modified"
Live measurement (36 h window, all tenants, 22 landed flights):

| Example | ATA (actual arrival) | `flightLastModificationTime` | Gap | In modified list ≤2 h after landing? |
|---|---|---|---|---|
| cwy `KLJ5852` | 07-15 10:35 | **02-26 16:02** | −3330 h | no |
| vpc `VPC004` | 07-16 16:31 | **04-18 20:07** | −2132 h | no |
| cwy `ORO1041` | 07-16 15:10 | 07-16 08:53 | −6.3 h | no |
| jty `JTY52W` | 07-16 12:05 | 07-16 **19:38** | **+7.6 h** | appeared only after the later edit |

Pattern: **flight-watch writes never bump the modification time**. The only landed flight
that showed up in a delta (jty) did so 7.6 h later, when a human edited the flight (journey
log). The docs corroborate this indirectly: crew and passenger changes have their own
dedicated modified-list queries (`getFlightListOnWhichModifiedCrew`, `…PassengerList`)
because they don't flow through the main one, and flight watch has **no pull-based
modified query at all** — only the `flightWatchChanged` webhook (see §3).

### Where the lag sits, concretely
`OPS sets ATA in Leon` → *(nothing happens in the API's modified list)* → wall keeps the
cached pre-landing state → hours later someone edits the flight (or the server restarts /
cache is purged) → flight appears in `changed[]` → wall updates. The variance in that
middle step is exactly why some pills look instant (busy flights get edited constantly)
and others lag (quiet flights don't).

> Note: since the timestamp-window change (Jul 13), a stale "airborne" flight still *ages
> out* on its ETA/STA even if the ATA never arrives — so the symptom today is mostly wrong
> state while visible, not flights stuck on the wall.

---

## 2 · Cancelled / positioning / simulator / unrelated flights

### Every cancelled representation found (live-verified)

| Representation | Field & value | Seen live | In modified list when it happens? | Our filter catches it? |
|---|---|---|---|---|
| Cancelled leg | `isCnl: true` | 55 flights in the 3-week window | **yes** (6 in the last-48 h deltas, mod time = cancellation time) | **yes** (primary check) |
| Deleted trip (cancels its legs) | `trip.isDeleted: true` — always co-occurs with `isCnl: true` | 19 flights | yes (via the same `isCnl` edit) | yes (subsumed by `isCnl`) |
| **Replaced / superseded leg** | **`isActive: false`** (status stays CONFIRMED, `isCnl` stays false) | 4 flights (jty) | **yes** — they appear in `changed[]` | **NO — this is the gap** |
| Removed outright | nid in `getModifiedFlightList.deleted[]` | 0 this window | n/a | yes (evicted) |

Real cancelled flight, live API (cwy-cwy, fields trimmed):

```json
{ "flightNo": "ORO2151", "startTimeUTC": "2026-07-20T05:15:00Z",
  "status": "CONFIRMED", "isCnl": true, "isActive": true,
  "trip": { "tripType": "PAX", "isDeleted": false },
  "flightLastModificationTime": "2026-07-15T06:39:00Z" }
```
(`status` never signals cancellation — it stays CONFIRMED/OPTION. `isCnl` is the flag.)

Real replaced leg that we would wrongly show (jty):

```json
{ "flightNo": "JTY52W", "startTimeUTC": "2026-07-15T08:00:00Z",
  "status": "CONFIRMED", "isCnl": false, "isActive": false,
  "journeyLogCancelledNote": null, "trip": { "isDeleted": false } }
```

### Why cancelled flights were still visible on the wall
The **code filter is correct for `isCnl`** — and cancellations *do* arrive through the
modified list, so post-deploy they evict within a poll. What kept them visible in
production is the **stale cache**: records normalized before the kind fields existed carry
`isCnl:false` forever, and (per §1) nothing re-delivers an untouched flight. Field-level
proof from 2026-07-13 stands: nid 69964253 is `isCnl:true` in Leon but `isCnl:false` +
no `iconType` in the production feed.

### Positioning / simulator / other
- **Crew positioning**: `iconType: "positioning"`. **Simulator**: `iconType: "simulator"`,
  `isSimulator: true`, `flightType: SIMULATOR`. Zero live instances on any tenant in five
  weeks of sampling — filters match the schema enums but remain unproven on real data.
- **Ferry legs** (`isFerry: true`, incl. `flightType: AIRCRAFT_REPOSITIONING`) are real
  movements and correctly stay.
- No wrong-operator or out-of-window flights found; the timestamp window (Jul 13) governs
  time-based visibility.
- **Docs discovery:** `flightList` accepts **`filter: { isCnl: false }`** — cancelled
  flights can be excluded server-side at pull time (defence-in-depth for full syncs).

---

## 3 · Webhooks — yes, and they fit exactly

Source: the cloned API docs (`subscriptions/Webhook.md`, `subscriptions/SubscriptionTriggers.md`).

### What Leon supports
GraphQL **subscription webhooks**: you register a webhook with a mutation and Leon POSTs
the subscription payload to your URL when the event fires.

- **Registration** (per tenant): `webhook { createSubscriptionWebhook(refreshToken, label,
  subscription, variables, webhookUrl) }` — the subscription is a normal GraphQL
  subscription string with `$variables`. Max **10 webhooks per refresh token**. Deletion by
  label. The refresh token used stays valid 30 days, extended each time an access token is
  generated (our hourly sync does this — so the binding self-renews).
- **Delivery**: POST to our URL, JSON payload shaped by the subscription selection.
- **Authentication**: each request carries a JWT (RS512) in `Authorization`; verify against
  the tenant's published public key
  `https://{opr}.leon.aero/.well-known/keys/leon-subscriptions-webhook-1.pub`
  (check `iss` = "Leon Software", `aud` = our URL, expiry).

### The events we need — all exist

| Event | Fires when | Fixes |
|---|---|---|
| `flightWatchChanged` / `flightWatchCreated` | OPS/crew set or edit flight-watch times (ATD, TO, LDG, **ATA**) | **§1's lag** — the exact signal missing from polling |
| `flightCancellation` | A flight is cancelled | instant removal instead of next-delta |
| `flightScheduleChange` | Times/airports change | instant repositioning of pills |
| `flightCreate` | New flight | instant lane appearance |
| `flightOpsChecklistItemChanged` | An OPS checklist item changes | live flight-ID colour |
| `trip.tripStatusChanged` | Option/Confirmed/Opportunity flips | live trip-status handling |

### Recommended wiring (not implemented)
1. Backend gains one public endpoint, e.g. `POST /leon/webhook` (gateway-routed), that
   verifies the JWT per tenant and ACKs fast.
2. On event: don't trust the payload as state — treat it as a **trigger**. Re-pull that
   `flightNid` via the normal query path, run it through the existing
   `mapLeonFlight`/filter/eviction pipeline (nothing bypasses normalization), persist, then
   broadcast the existing SSE (`roster.changed` or a new `flight.changed`) so wall +
   console refetch within ~1–2 s.
3. Register per tenant (4 tenants × ~4 events = 16 subscriptions → **needs 2 labels/events
   consolidated or one webhook per event group per tenant; the 10-per-token cap is per
   tenant token, so 4–6 per tenant is comfortable**).
4. **Keep the 60 s poll unchanged as the fallback** — webhooks augment, never replace; a
   missed delivery heals at the next poll (and the timestamp window keeps aging flights
   out regardless).
5. Risks: public endpoint (mitigated by JWT verification + HTTPS + label rotation),
   payload drift (mitigated by re-pull-on-trigger), duplicate events (idempotent upsert
   already), Leon-side delivery guarantees undocumented (poll fallback covers).

**Verdict: yes — `flightWatchChanged` + `flightCancellation` webhooks would make landed/
cancelled updates effectively immediate, with the poll as safety net, and no change to the
normalization/filter logic.** If webhooks are deferred, an interim poll-only fix exists:
re-pull the *current-day window* with full `flightList` each poll (one extra query per
tenant per minute) — that refreshes flight watch even though the modified list won't.

---

## 4 · Cross-check against the Leon OPS-view HTML exports

Method: parsed every flight row out of `CWY-CWY.html` (86 rows, 15 Jul–15 Aug) and
`JTY.html` (46 rows, 15 Jul–16 Aug); pulled the same windows live from the API; for each
API flight computed our show/hide decision (trip status + `isCnl`/positioning/simulator),
then compared. (Reading the HTML per the brief: wide colour lines = aircraft grouping;
small red/green/grey circles = OPS checklist state — the same signal as our flight-ID
colour; the "Positioning/Simulator" words are sidebar buttons, not row markers.)

| | cwy-cwy | jty |
|---|---|---|
| We show it AND it's in Leon's view (agree) | 84 | 43 |
| We hide it AND it's absent from Leon's view (agree) | 9 (all `isCnl`) | 31 (all `isCnl`) |
| **We hide it but the human sees it (wrong-hide)** | **0** | **0** |
| HTML rows with no exact API match | 2 | 3 |

- Every flight we would hide — all cancelled (`isCnl:true`) — is **also absent from Leon's
  own OPS table**, e.g. jty `JTY52W 07-17 LFMN→LIRI` and cwy `ORO2151 07-20 LEBL→LEIB`:
  hidden by us, not shown to the Leon user either. The hiding logic matches what a human
  sees.
- The 5 unmatched HTML rows are **export staleness**, not filter errors: 4 have the same
  flight number + date in the live API with a *different route* (legs re-planned after the
  export was saved — e.g. `JTY52W 08-05 EGNV→LOWW` is now `EGNV→LEIB`), 1 was removed
  entirely.
- Some API flights we'd show are missing from the HTML (23 cwy / 8 jty) — the export only
  contains the *rendered* portion of Leon's virtual-scrolled table plus it predates later
  schedule additions, so absence from the HTML proves nothing; no conclusion drawn from
  that direction.

---

## Recommended fixes (for you to act on — none applied)

1. **Now, no code:** `POST /api/admin/clear-flight-cache` on production once — clears the
   pre-deploy cancelled backlog (§2).
2. **Filter addition:** exclude `isActive === false` (new kind `"inactive"`) in
   `isExcludedFlightKind`, same eviction path as `isCnl` — it flows through the modified
   list already, so no other change needed.
3. **Webhooks (fix for the lag):** register `flightWatchChanged`, `flightWatchCreated`,
   `flightCancellation` (+ optionally `flightScheduleChange`, `flightOpsChecklistItemChanged`)
   per tenant; receiver re-pulls the flight through the existing pipeline and broadcasts
   SSE; poll unchanged as fallback. Interim alternative: full `flightList` re-pull of the
   current-day window each poll.
4. **Defence-in-depth:** pass `filter: { isCnl: false }` on full `flightList` pulls.
5. **Self-healing cache:** version-stamp `timeline-cache.json`; a version bump forces a
   full re-sync after any deploy that widens the selection (prevents §2's stale-cache class
   of bug permanently).

---

## Reproducibility (queries used — credentials redacted)

- Auth: `POST https://{opr}.leon.aero/access_token/refresh/` with `refresh_token=<token>`
  (form-encoded) → bearer token for `POST /api/graphql/`.
- Landed-vs-modified probe:
  `flightList(filter:{timeInterval:{start:"<now−36h>", end:"<now+1d>"}}) { flightNid
  flightNo startTimeUTC endTimeUTC flightLastModificationTime isCnl isActive status
  flightWatch { atd ata toIso ldgIso etd eta } … }` and
  `flights { getModifiedFlightList(dateTime:"<now−2h|−8h|−48h>") { timestamp changed {
  flightNid flightNo isCnl isActive flightWatch { ata atd } flightLastModificationTime }
  created { flightNid } deleted } }`.
- Cross-check pull: same `flightList` selection over 2026-07-15 → 2026-08-17 (two chunks —
  Leon caps query complexity at 1600 and it scales with the interval).
- HTML rows parsed with `flightNo | icaoType | day | date | STD | ADEP | ADES | STA`
  column order from the saved OPS table.
- Docs: `git clone https://bitbucket.org/leondevteam/api-documentation.git` —
  `subscriptions/Webhook.md`, `subscriptions/SubscriptionTriggers.md`,
  `standard-workflows/flight-synchronization-guide.md`.
