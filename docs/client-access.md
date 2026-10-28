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

## The screens (built after the test was green)
- **Sign in** (`app/login`, Sign In v2 since 2026-10-28): under the form, one line for operators and brokers with
  **Ask for access** → `/request-access`, and "Clearway staff: your account is set up by an admin". `/request-access`: full name, company (required), work email,
  You are (Operator / Broker), an optional note. No password here: the email link sets it; confirming the email sends the
  request. No trip, flight or reference field exists — those identify a flight, not a person.
- **The request** (`app/api/auth/email/request-confirmation`, kind "client"): the invited account is a client from the
  first moment (app_metadata, service key), not approved, status requested; a clients row is opened; ops are told in
  Telegram "New client access request — decide under Admin › Clients" (no chat button approves a client: the scope is
  set on the page). The confirm step keeps the client keys and skips the staff pending flow.
- **Waiting, refused, removed** (`app/client/*`): shell-less, three steps on the waiting screen, "You will get an email
  when it is decided." The root sends a client to their world or their holding page; every other page is 404.
  **The door and nothing else** (2026-10-28): the page source carries no link or label of what is behind it. The root
  not-found used to ride in every page's payload with the docs' 404 block (Help & support, the glossary, `/dashboard`,
  the portal's address); it is now a client component with no props, and unknown `/docs` addresses get the docs' own
  404 inside the docs (`app/docs/[section]/[page]/[...rest]`). The one way out is a contact address from the brand
  settings, `content/docs/site.json` › `supportEmail` (`app/client/contact.ts`): shown on the three holding pages as
  "Questions: write to …" once someone fills it in, and nothing at all while it is empty.
- **Admin › Clients** (`app/admin/clients`, action `clients.manage`): Waiting (review → the editor in the row),
  Approved (scope chips, the 11-dot matrix, the passenger chip, granted by whom), the decision log. The editor keeps
  scope and access apart; Flight board is required; no scope, no Approve; documents need the consent line; the summary
  says what the client will see; Remove access asks for the company typed and lists what happens. The live "matches N
  flights in the next 7 days" and the suggestion row read the wall as the admin.
- **The email** (`lib/clients/mail.ts`): approved / refused (with ops' note) / access ended, through Resend; the only
  promise the waiting screen makes.
- **The client wall** (`app/client/wall.tsx`): builds itself from the switches. Board (Today / Tomorrow / 7 days, or
  trips grouped for trip-scoped clients) and the open flight side by side from 700px; the board first and the flight full
  screen below it, with "← All flights". Cards per switch: weather, NOTAMs, radar, passengers (the one passenger viewer,
  at the client's level), documents; Airports and Documents become header tabs, or a bottom tab bar on the phone, only
  when switched on. Every number comes from the wall backend's scoped answers.
- **Checks**: `rig/client-ui-check.mjs` (in the runner) approves a client through the page, looks at the wall as the
  client at 1440 and 390 in both themes, checks no horizontal scroll and no shell in the client's pages, changes and
  removes through the page, and finds the row kept, emptied.

## Decisions taken (2026-10-20)
404 outside scope; documents for clients are the same logged reveal, off by default, with lower thresholds; removing
access empties, never deletes; no promise of a time — "You will get an email when it is decided."
