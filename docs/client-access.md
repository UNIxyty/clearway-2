# Client access: how it is enforced (Stage 5, built 2026-10-25)

A client is a person outside Clearway — an operator or a broker — who sees only their own flights. The scoping report
(docs/client-access-scoping.md) found that before this stage "inside" meant every operator's flights in all three
services. This document is the rule set that replaced that, where each rule lives, and what the check proves.

## Identity
- A client is a Supabase account with `app_metadata.role = "client"`, written only with the service key when ops
  decide (`lib/clients/admin.ts`). The same writer sets `is_approved` (true only while approved) and `client_status`
  (requested / approved / refused / removed). A person cannot write any of it: user_metadata is never read for
  authorization (lib/permissions/check.mjs › checkMetadataReads).
- `public.clients` (migration 0027) holds the rest: company, scope, switches, passenger level, consent, who decided.
  `public.client_decisions` is the append-only log. Removing access EMPTIES the row and keeps it.
- The client role holds no action in the permissions grid: `roleKey("client")` is null, so `can()` refuses every
  write in every service. Admin › Clients is one action, `clients.manage` (admins and developers by default).

## Scope: which flights exist for them
`lib/clients/scope.mjs` › `scopeFor(caller)`: null for staff (everything), NOBODY for a client with no approved row,
otherwise their operators, registrations and trip numbers, their switches and their passenger level, read with the
service key and cached ten seconds. `flightInScope(scope, flight)`: the flight's operator, registration or trip number
is named. **Outside scope the answer is 404 — never 403**, which would confirm the flight exists. The sentence is the
same everywhere: "That is not on your account."

## Where it is enforced — on the server, on every request
| Service | Gate | What a client gets |
| --- | --- | --- |
| Wall backend | `digital-wall/server.mjs`, before any handler; `digital-wall/lib/client-scope.mjs` | Only the reads in `CLIENT_READS`, each behind its switch; every list payload cut to their flights before it is sent (board, feed, upcoming, aircraft, limitations, notices, CAA, flight checks); `/api/flight-info` 404 outside scope and, inside it, only the pieces their switches cover; `/api/notam-check/today` only the airports of their flights, with ops' bookkeeping removed; the stream carries only `flight.changed` events about their flights and nothing about presence, devices, overlays or reports; everything else — every write, the display, devices, operators — 404 |
| Agent | `agent/server.mjs`; `agent/lib/passengers/api.mjs` | The passenger routes only, for their flights (operator from the id; registration or trip from one small Leon read), at their level: off → 404 even for their own list; names → the list, no reveal; documents → the reveal, one at a time, logged, with lower thresholds (15 per 10 minutes, a burst at more than one flight). No allowlist, no chat, no tools, no intake: 404 |
| Portal | `middleware.ts` | Their world is `/client`; the holding pages (`/client/waiting`, `/client/refused`, `/client/removed`) render under a bare route with no shell, no navigation, no counts; every other page and API is 404; `/api/client/me` is their own standing (switches, level, never their scope's values); staff get 404 under `/client` |

## The check
`rig/client-scope-check.mjs` (in the runner): two clients on the sign-in rig, A on operator artlw and B on cwy-cwy.
A's session asks for B's flight and B's passengers by id at the wall and at the agent — both 404 — while A's board,
A's normalized feed (even asked for B's key), A's stream and A's NOTAM round carry nothing of B. Then the forgery:
A writes `role: "admin"`, `is_approved: true` and a scope naming B's operator into their own metadata, refreshes,
and tries everything again — still 404, still a client. Plus the waiting screen's page source, the passenger levels,
twenty-odd addresses outside their world, and the removed state. See docs/rig-vs-production.md for what the rig
cannot prove.

## Decisions taken (2026-10-20)
404 outside scope; documents for clients are the same logged reveal, off by default, with lower thresholds; removing
access empties, never deletes; no promise of a time — "You will get an email when it is decided."
