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
- **Since 2026-11-02 there is no account until a client is approved and sets a password** (migration 0028, which
  production needs applied before this is deployed). `clients.user_id` is empty for a request. `client_invites` holds
  the set-password links, as a hash only. `app_settings` holds the notify list. The decision log gains `link-sent` and
  `activated`.
- The client role holds no action in the permissions grid: `roleKey("client")` is null, so `can()` refuses every
  write in every service. Admin › Clients is one action, `clients.manage` (admins and developers by default).

## Scope: which flights exist for them
`lib/clients/scope.mjs` › `scopeFor(caller)`: null for staff (everything), NOBODY for a client with no approved row,
otherwise their operators, registrations and trip numbers, their switches and their passenger level, read with the
service key and cached ten seconds. `flightInScope(scope, flight)`: the flight's operator, registration or trip number
is named. **Outside scope the answer is 404 — never 403**, which would confirm the flight exists. The sentence is the
same everywhere: "That is not on your account."

## What a flight is, for a client (2026-11-09): a list of fields
Which flights a client gets is the scope. What each flight carries is a second question, and until 2026-11-09 nobody
had asked it: the wall's feeds sent a client each flight as the ops wall keeps it, 55 fields. That included ops' notes
matched to the flight (Limitations, Important entries with their attachment names, CAA contacts, unreviewed NOTAM and
weather markers), ops' check marks with the name of who ticked each one, the checklist colours, the trip's internal
status, and the weather pills, whatever the client's switches said. The page drew none of it. The browser was given all
of it.

Now `digital-wall/lib/client-scope.mjs` › `clientFlight` builds what a client is sent:
- **A flight** is `CLIENT_FLIGHT_FIELDS` (identity, route, times, delay, state, passenger count) and nothing else. A
  new field on the wall's record does not reach a client until someone adds it to the list.
- **Ops' notes** come back only with their switch, cut to what they say: Limitations (title and text), Important
  notices (title and text, no attachments), CAA details (the authority and how to reach it). Ops' review markers (NTM,
  WX) and check marks never leave.
- **An aircraft or a row** is what names it: operator, registration, type.
- **The NOTAM check state** on a flight comes only with NOTAM check status, as "in today's check, checked or not" per
  airport, with no name on it.
- `/api/limitations`, `/api/important` and `/api/caa` answer a client with content only: no match rules (which name
  other operators and registrations) and no names from the audit trail. `/api/flight-checks` is not a client's at all.
- **Service status** answers whether the flight data is live and when it was last brought up to date.

Every switch now draws something on the client's pages: the four that drew nothing (Limitations, Important notices,
CAA details, Service status) are cards on a flight and a line above the board. A switch that is off still adds
nothing, to the page or to what the browser is sent. `rig/client-feed-check.mjs` reads every feed as a client with the
switches off and on, against invented notes it makes itself.

## The client allow-list (2026-11-04): a list, not a filter
`lib/clients/allow.mjs` names every address in the portal a client may reach, and the switch that opens each one.
`middleware.ts` enforces it on every request, reading the client's switches with `scopeFor` (cached ten seconds; any
read error is NOBODY, so it fails closed). An address that is not on the list answers 404, whatever it is and whoever
adds it later.

| Address | Opened by |
| --- | --- |
| `/client` (Flights) | every approved client |
| `/client/airports` | Airport & AIP search |
| `/client/documents` | Documents |
| `/client/account` (Account, 2026-11-09) | every approved client |
| `GET /api/client/me` (their own standing) | every approved client |
| `POST /api/client/account/password` (their own password) | every approved client |

Matching is exact: `/api/client/me/x` is not `/api/client/me`. Two kinds of address are not on the list, and neither
belongs to a client:
- **The public addresses** the middleware answers before it knows who is asking: sign-in, `/api/auth/*` for confirming
  an email and resetting a password, asking for access, and the set-password link.
- **The holding pages**, reached by status, never by switch.

The wall backend (`CLIENT_READS`) and the agent (the passenger routes) keep their own lists, because they are separate
servers.

**Why a list and not filtering. Do not build filtering here.** Of the portal's 135 endpoints, 19 hold rows that trace
to no operator, aircraft or trip: users, permissions, metrics, debug runs, the help inbox, maintenance (the inventory of
2026-11-02). There is nothing to filter them by. A filter must be right in every endpoint, forever, and fails open the
day someone adds one and forgets. A list is right by default for every endpoint nobody thought about.

## The client's shell and menu (2026-11-04)
`app/client/layout.tsx` reads the client's switches on the server and gives an approved client
`components/client/ClientShell.tsx`. Its menu is `clientMenu(switches)` from the same allow-list:
- Flights, Airports and Documents, each only with its switch.
- A single page is no menu at all.
- A client who can reach nothing gets an empty menu, which is correct and honest.
- **Account (2026-11-09)** is apart from the menu and there for every approved client: the avatar in the header on a
  desk, the last tab on a phone. `/client/account` says who is signed in and for which company, changes the password,
  shows the address to write to, and signs out. The password change asks for the current password, and the server
  checks it (`app/api/client/account/password`): at least ten characters, eight tries an hour. A change signs out every
  session of the account (the page signs this device back in with the new password), and the client gets an email from
  us saying it happened. On a phone the
  header's Sign out button is not drawn (it is on Account), so the company's name keeps the room.
- The holding pages render with no shell and no menu.

**The page source stays clean.** The client shell imports nothing of the staff shell or `components/portal/nav.ts`. The
staff frame (`PortalFrame`) used to wrap every page and draw nothing on `/client`, but its code still reached a client's
browser, staff menu and all. It is now loaded only outside `/client` (`components/portal/FrameGate.tsx`).

**`rig/client-allow-check.mjs` proves it through a real build with sign-in on:**
- the list against every page and API in `app/`: 214 addresses, 4 reachable by a client with every switch;
- the 404s;
- the menu at two switch settings;
- the page source;
- every script a client's browser downloads, run-time loading included, with no staff menu definition in any of them.
  The control is that the same probe finds 55 of those definitions in a staff member's browser.

The screens' design is still to come; this is the plumbing it will sit on.

## Where it is enforced — on the server, on every request
| Service | Gate | What a client gets |
| --- | --- | --- |
| Wall backend | `digital-wall/server.mjs`, before any handler; `digital-wall/lib/client-scope.mjs` | Only the reads in `CLIENT_READS`, each behind its switch; every list payload cut to their flights before it is sent (board, feed, upcoming, aircraft, limitations, notices, CAA, flight checks); `/api/flight-info` 404 outside scope and, inside it, only the pieces their switches cover; `/api/notam-check/today` only the airports of their flights, with ops' bookkeeping removed; the stream carries only `flight.changed` events about their flights and nothing about presence, devices, overlays or reports; everything else — every write, the display, devices, operators — 404 |
| Agent | `agent/server.mjs`; `agent/lib/passengers/api.mjs` | The passenger routes only, for their flights (operator from the id; registration or trip from one small Leon read), at their level: off → 404 even for their own list; names → the list with names only (nationality and sex belong to documents since 2026-11-02: a client approved to see who is on their flight is not approved to see where those people are from), no reveal; documents → nationality and sex in the list, and the reveal, one at a time, logged, with lower thresholds (15 per 10 minutes, a burst at more than one flight). No allowlist, no chat, no tools, no intake: 404 |
| Portal | `middleware.ts` | Their world is `/client`; the holding pages (`/client/refused`, `/client/removed`) render under a bare route with no shell, no navigation, no counts; every other page and API is 404; `/api/client/me` is their own standing (switches, level, never their scope's values); staff get 404 under `/client` |

## The check
`rig/client-scope-check.mjs` (in the runner): two clients on the sign-in rig, A on operator artlw and B on cwy-cwy.
A's session asks for B's flight and B's passengers by id at the wall and at the agent — both 404 — while A's board,
A's normalized feed (even asked for B's key), A's stream and A's NOTAM round carry nothing of B. Then the forgery:
A writes `role: "admin"`, `is_approved: true` and a scope naming B's operator into their own metadata, refreshes,
and tries everything again — still 404, still a client. Plus a holding page's source, the passenger levels,
twenty-odd addresses outside their world, and the removed state. See docs/rig-vs-production.md for what the rig
cannot prove.

## The screens (built after the test was green)
- **Sign in** (`app/login`): under the form, "Clearway staff: your account is set up by an admin", then a block of its
  own for operators and brokers with **Ask for access** → `/request-access`. (Sign In v2, the photograph panel, was
  built on 2026-10-28 and taken back out the same week; its Enter-to-sign-in form and forgot-password hint stayed.) `/request-access`: full name, company (required), work email,
  You are (Operator / Broker), an optional note. There is no password field and no account. No trip, flight or
  reference field exists either: those identify a flight, not a person.
- **The onboarding flow (2026-11-02, `lib/clients/onboarding.ts`)**:
  1. **The client asks.** `POST /api/client-requests` files a clients row with no account. Asking again from the same
     address updates the open request.
  2. **Ops are told.** One email (`client-request-ops`) goes to every address on the notify list. It says who is
     asking, from which address, for which company and as what, with a button to Admin › Clients. The list is edited
     on Admin › Clients › "Who is told about new requests", stored in `app_settings` › `clients.notify_to`. The page
     warns when the list is empty. The request is filed either way. This email replaces the Telegram notice of the
     first client flow.
  3. **Ops approve** with the scope and switches. Approving sends the set-password link (`client-invite`). The toast
     says whether the mail service accepted it. An approved client with no password shows "NO PASSWORD SET YET" and
     **Send the link again**.
  4. **The link** (`/welcome?token=…`) works once and **expires after 72 hours**. Seventy-two hours means an approval
     on a Friday still works on Monday, and a link that creates an account does not stay open for weeks. Only its
     hash is stored, and a newer link replaces the older ones. The page takes the token out of the address bar. A
     used link says so. An expired or replaced link says so and offers a new one, which goes only to the address on
     the request (masked on the page), at most one every two minutes.
  5. **Setting the password creates the account** (`POST /api/client-invite`): a confirmed client, approved, linked to
     the row, then signed in to `/client`. The link is claimed before the account is made, so two tabs cannot both
     use it. If the account cannot be made, the link is given back.
- **Refused, removed** (`app/client/*`): shell-less. **The waiting screen was removed on 2026-11-02.** In the new
  flow nobody waits signed in, because there is no account until approval. On 2026-11-02 production had two client
  accounts, both approved, and nobody waiting (read from the server). Migration 0027 is applied there. A client account in any state other than approved or
  refused fails closed onto the access-ended page. A refused request in the new flow has no account and is told by
  email. The root sends a client to their world or their holding page; every
  other page is 404. The old sign-up route's client branch answers 410 and points to Ask for access.
  **The door and nothing else** (2026-10-28): the page source carries no link or label of what is behind it. The root
  not-found used to ride in every page's payload with the docs' 404 block (Help & support, the glossary, `/dashboard`,
  the portal's address). Now `middleware.ts` marks every request it lets through with `x-cw-docs` (1 under `/docs`, 0
  elsewhere, overwriting any copy a visitor sends) and `app/not-found.tsx` draws the docs version only for 1; everywhere
  else it is the portal's page as a client component with no props (`components/portal/PortalNotFound.tsx`), so the
  payload holds a module reference and none of its words. The docs segment is `force-static`, so the docs stay
  prebuilt and their unknown addresses keep a routing-level 404. The one way out is the address clients write to: the setting
  `clients.support_email` in `app_settings`, edited on Admin › Clients beside the notify list (`app/client/contact.ts`;
  since 2026-11-09 a setting of its own, not the docs' support address and not a line of code, so the address is in
  neither the docs nor the repository). It is on the holding pages as "Questions: write to …", on the client's Account
  page under Help, and nothing at all is shown while it is empty.
- **Admin › Clients, fixed 2026-11-02**: typing put one letter in a field and then lost focus. The editor was a component
  declared inside the page, so every render made a new component type and React remounted it. It is now at module scope.
  The page uses the portal's padding (`components/portal/PageContent.tsx`, `--cw-page-pad`), and the approved table
  picks its six columns by its own width (a container query), not the window's. Between 900 and 1250px with the
  sidebar it used to run past the card. `rig/clients-page-check.mjs` checks the padding and the overlap at six widths,
  and types a whole word into every field, asserting the value and the focus.
- **Smart search (2026-11-02)**: as ops type, suggestions from real records only — operators by name and code
  (`leon_operators`), the fleet's registrations and the trips on the wall's flights (read as the admin,
  `lib/clients/catalogue.ts`, `GET /api/admin/clients/catalogue`), and the people and companies who asked or were
  approved. Prefix matches rank first (`lib/clients/suggest.mjs`). ↑↓ move, ↵ takes, Esc closes; nothing matching is
  said in words. The editor's scope field takes only a suggestion, and saving or approving refuses a new scope entry
  that does not exist (an operator not in Leon, an aircraft not in the fleet, a trip not on the wall; if the wall cannot
  be read, new aircraft and trips are refused rather than let through). The page search opens a person's client, or
  lists the approved clients who can see an operator, aircraft or trip — directly or through their operator or aircraft.
- **Admin › Clients** (`app/admin/clients`, action `clients.manage`): Waiting (review → the editor in the row),
  Approved (scope chips, the 11-dot matrix, the passenger chip, granted by whom), the decision log. The editor keeps
  scope and access apart; Flight board is required; no scope, no Approve; documents need the consent line; the summary
  says what the client will see; Remove access asks for the company typed and lists what happens. The live "matches N
  flights in the next 7 days" and the suggestion row read the wall as the admin.
- **The emails** (`lib/clients/mail.ts`, `lib/clients/onboarding.ts`): the request to ops, the set-password link,
  approved (for an account from before 2026-11-02), refused (with ops' note) and access ended. All are sent by us
  through `lib/mail/send.ts`, from the brand's sender, and each appears in Mailbox › Sent with its delivery status
  (docs/emails.md).
- **The client wall** (`app/client/wall.tsx`): builds itself from the switches. Board (Today / Tomorrow / 7 days, or
  trips grouped for trip-scoped clients) and the open flight side by side from 700px; the board first and the flight full
  screen below it, with "← All flights". Cards per switch: weather, NOTAMs, radar, passengers (the one passenger viewer,
  at the client's level), documents; Airports and Documents become header tabs, or a bottom tab bar on the phone, only
  when switched on. Every number comes from the wall backend's scoped answers.
- **Checks**: `rig/client-onboarding-check.mjs` (in the runner) walks the whole flow above against the mock Resend:
  request, ops email, approve, link, replaced link, password, account, used link, expired link and a new one to the
  address on file only, refusal by email, then the sign-in emails Supabase used to send, and the Mailbox › Sent rows.
  `rig/client-ui-check.mjs` (in the runner) approves a client through the page, looks at the wall as the
  client at 1440 and 390 in both themes, checks no horizontal scroll and no shell in the client's pages, changes and
  removes through the page, and finds the row kept, emptied.

## Decisions taken (2026-10-20)
404 outside scope; documents for clients are the same logged reveal, off by default, with lower thresholds; removing
access empties, never deletes; no promise of a time — "You will get an email when it is decided."
