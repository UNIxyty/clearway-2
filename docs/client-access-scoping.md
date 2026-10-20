# Client access: how flight data is scoped today, and the real size of Stage 5

Written 2026-10-20, before any Stage 5 code, from the code as deployed (wall backend, agent, portal) — the brief asks
for this first: "if the answer is 'it isn't', say so plainly — that is the real size of this stage."

## The answer: it isn't

There is no scope anywhere. A person is either outside (no session, or `is_approved: false`, who sees the sign-in or
the pending page and nothing else) or inside — and inside means **all of Clearway's flights, every operator**.

| Where | Who gets in | What they get |
| --- | --- | --- |
| Portal (Next middleware) | any Supabase session not pending approval; roles `user` / `admin` / `developer` from the account's metadata | every page and API behind sign-in: airports, NOTAMs, weather, AIP copies, dashboard, help; the only per-person data is a person's own recents, hidden airports and preferences |
| Wall backend (`/digital-wall/api`) | any signed-in person (the portal's cookie), or a registered screen's device token on the read whitelist | `timeline/flights?allOperators=true` — the caller chooses `allOperators`; there is no filter tied to who is asking. Likewise `flights/normalized`, `notam-check/today`, limitations, important, CAA, the SSE stream. Writes are gated by *actions* (permissions grid), never by *which* flights |
| Agent (`/agent/api`) | any person on the agent allowlist (`assertMayUseAgent`), with `agentRole` user / admin / developer | intake requests (all), the mailbox (readers), the manifest search ("Internal · Leon flights, all operators"), and since Stage 4 the passenger endpoints: any flight id of any configured operator, read with that operator's Leon credentials |

Flights are not rows in a database with an owner column: the wall keeps one cache (`timeline-cache.json`) of every
operator's flights, and the agent reads Leon live per operator from `leon_operators`. So there is nothing today that
*could* be filtered by a policy — the data model has no notion of "whose".

The permissions grid (`lib/permissions/catalogue.mjs`) is about **actions**, by role. It cannot express "this person
may see these flights"; a client role in it would still see everything the role's reads allow.

## What Stage 5 therefore is

Not a page. A second kind of person, a scope model, and enforcement on every read, in three services.

### 1. Identity: a client is not a user with fewer switches
- A `clients` table: person (Supabase user id) ↔ company ↔ status (requested / approved / refused / removed) ↔
  **scope** (any mix of Leon operator ids, aircraft registrations, trip numbers) ↔ **access switches** (the 11 in
  the spec; Flight board required) ↔ passenger level (off / names / documents, with the consent flag) ↔ a decision
  log (who, what, when, note).
- A **`client` role** distinct from `user`, resolved the same way the three existing roles are, so every gate that
  reads a role sees it. In the permissions catalogue the client role holds **no** agent, intake, admin, developer,
  user or permission actions — not off, absent from the client's world: the agent's allowlist never includes a
  client; the nav has no such topics for the role.
- Sign-in stays email + password (Supabase). "Ask for access" creates the account with `is_approved: false` and a
  `clients` row in `requested`; the pending page for a client is the waiting screen with no navigation and no counts
  (the page source must contain none either — the middleware must route a client to a layout that never renders the
  portal shell).

### 2. Enforcement: on the server, on every request, in all three services
This is the real size. Each read that can return a flight, or something keyed by a flight, must resolve the caller's
scope and apply it before answering — never by the client filtering in the browser.

- **Wall backend.** A `scopeFor(requestUser)` that returns `null` for ops (everything) or the client's scope; then
  `timeline/flights`, `flights/normalized`, `flight-checks` (read), `notam-check/today` (only airports of their
  flights), limitations / important / CAA (only entries matching their flights' airports and operators), the
  **SSE stream** (events filtered or not subscribed), and `display/*` **refused** outright (the ops-room display is
  never a client's). A request for a flight by id outside the scope answers 404 — not 403, which confirms existence.
- **Agent.** Clients are not on the agent allowlist, so `/agent/api/*` answers 401 to them today — which also means
  the passenger viewer, the manifest and the airport NOTAM/weather reads the phone makes through the agent are closed
  to them. The passenger endpoints need a client path: scope check first (is this flight in the client's scope, and
  is their passenger level ≥ names / documents), then the same masked list and the same logged reveal.
- **Portal.** Airports, NOTAMs, weather and AIP copies are reference data, not flight data; the switches decide whether
  a client gets them at all (Airport & AIP search, Documents, NOTAM information), enforced in the API routes by role
  and switch. The dashboard, help, reports and every ops page are not in a client's world.
- **The client wall** (`Client Wall.dc.html`): builds itself from the switches — one switch, one piece, nothing greyed.
  It is a new front end on the portal's tokens, at 1440 and 390, reading only scoped endpoints.

### 3. The test that matters most
Two clients, different scopes, on the rig: client A's session asks for client B's flight and client B's passengers
**by id, directly at the endpoints** (wall and agent), and both are refused. Plus: A's board never contains B's
flights; A's SSE stream carries no event about B's flights; A's NOTAM check lists only A's airports; the waiting
screen's page source has no nav, no counts, no page titles.

## What the rig can and cannot prove
The rig has no real Leon and no real clients. It can prove every scope rule against the mock Leon's invented
operators (artlw, cwy-cwy, klj) and invented trips, the two-client refusal test, the waiting screen's source, and
the client wall at both sizes. It cannot prove how production's Leon tenants map to operator ids (that is ops' scope
entry) nor the email flows (no mail on the rig, docs/rig-vs-production.md).

## Cost, honestly
- Identity and the Clients page: ~1 day (table, role, request flow, waiting/refused/removed pages, the admin page
  with its editor and decision log).
- Enforcement in the wall backend: ~1 day, the part that must be right — every read listed above, the stream, the
  404-not-403 rule, and the display refused.
- The agent's client path for passengers and the airport reads: ~½ day.
- The client wall at 1440 and 390: ~1–1½ days.
- The two-client test and the rest of the checks: ~½ day.
About four to five days, with the enforcement day first — a client wall that shows the right flights because the
server will not return any others.

## Decisions needed before code
1. **Which of the design's open questions stand**: documents for clients (30-second logged reveal, or printed
   manifest only); removing access deletes or empties; the one-working-day promise.
2. **404 or 403** for a flight outside scope — I propose 404, so an id reveals nothing.
3. **Operator-wide scope** gives a client everything that operator flies, including other clients' trips on the same
   aircraft; trip scope is the narrow one. The suggestion row in the editor should default to the narrowest match.
