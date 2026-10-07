# Flight intake (type 1: scheduled flights, type 2: handling requests) and the Agent mailbox

Runbook and reference for the intake build. Pages: `/agent/intake` (Flight intake) and `/agent/mailbox` (Agent mailbox).
Server code: `agent/lib/intake/*`. Schema: `docs/supabase-agent-intake.sql` (run in Supabase; safe to re-run).

## The path of one email

1. **Resend inbound** → `POST /agent/api/intake/resend-webhook` (`resend.mjs`). Svix signature verified (5 min tolerance);
   an unverified payload gets 401 and nothing is stored. Idempotent twice: on the Svix id (`intake_events.svix_id`) and
   on Resend's email id (`intake_messages` unique `provider, provider_message_id`). The full message and the raw `.eml`
   are fetched from Resend straight away (the download URL expires) and stored before anything reads them.
2. **Pipeline** (`pipeline.mjs`), off the response path, one message at a time: automatic mail is Ignored with a
   reason; everything else is **classified by its content** (next section). A handling request → one
   `intake_requests` row (unique per message), an `intake_extractions` version, the review working copy, the
   duplicate check, the E2 (or needs-you) email. A flight notification → a type 1 request (`notification.mjs`).
   No request row exists until the type is known.
3. **Review** on the intake page: every value editable, edits append to `intake_field_edits` and keep EDITED marks.
4. **Send** (`send.mjs`) through a server-verified, expiring, single-use confirmation bound to the payload hashes.
5. **The request in Leon as a note** (each flight's OPS notes, unactioned; no checklist status is ever set), then the E3 / E4 email.

## What a message is: decided by content, never by sender

Notifications and requests are forwarded, relayed and sent from other mailboxes, so **the sender address decides
nothing**: it is one confidence signal among several. `classify.mjs` is offline (no portal, no network) and applies
two POSITIVE tests with "ask a person" between them:

| Outcome | Requires | Then |
|---|---|---|
| **Flight notification** (type 1) | A provider reference line (`#Ref: <6-8 digits>`) AND the notification block (4 or more of its `#Key:` lines). A calendar part, a route-shaped subject and a known sender add confidence but are not required | Type 1 request. The model is not run and nothing is built from the message's text |
| **Handling request** (type 2) | The model reads it as a handling request with confidence ≥ 0.7, quotes the words that ASK us to provide something, code finds that quote in the message, and it carries a schedule | Type 2 request, review screen |
| **Not for us** | The model reads it as neither, with confidence ≥ 0.7, and it does not look like work (no request for anything, no dated schedule with an aircraft) | Stored, status Ignored, label "Not for us", grey. **Not** in Needs attention |
| **Needs a decision** | Anything else: notification-shaped but incomplete, flight details that ask for nothing, a quoted "ask" that is not in the message, low confidence, a cancellation for a flight we have no request for | Status Not recognised, label "Needs a decision", in Needs attention with the reason. A person chooses: Process as handling request / Process as flight notification / Mark as ignored |

Rules that follow:
- **Nothing is type 2 by default.** Flight-shaped content does not make a handling request; a notification-shaped
  message is a notification or "needs a decision", never type 2, even if the model is sure.
- **The classification is recorded** with every message (`understood.classification`): type, confidence, whether
  content or a person decided, and each piece of evidence. The mailbox shows it under "What the agent looked for".
- **Bounces are recognised by structure** (`multipart/report; report-type=delivery-status`), not by a
  `mailer-daemon@` / `postmaster@` sender: a request relayed through such an address is read like any other.
- Tests: `node rig/intake/test-classify.mjs` (pure), `node --env-file=.env.rig rig/intake/e2e-classify.mjs` (rig).

## Type 1: scheduled flights (`notification.mjs`, `providers/cnair.mjs`)

The notification is a trigger and a key. Its lines (local times, no date per leg, no arrival time, no crew count)
are never turned into flights; the flight is the provider's record, read from the CNAIR portal **once, after ops
approve**. Eleven stages:

| # | Stage | What happens |
|---|---|---|
| 1 | Request received | Classified as a notification (above). The request row is created with status `awaiting_approval`. |
| 2 | Confirmation sent | **E1 "Process? `<ref>` · route · date · N legs"** to every notification address, one email each: what arrived, **Yes, process it** / **No, skip it** buttons, "Or just reply yes or no", the deadline (`INTAKE_APPROVAL_HOURS`, default 4 h). The plain-text part carries both URLs. |
| 3 | Confirmation received | A person answers: a tap on the **answer page** (`/intake/answer?t=…`, no sign-in; L1 question → L2 recorded, L3 already answered, L4 expired), an **email reply** whose first non-quoted line is yes or no (only from an address that received E1; anything else → **E1c** "was that a yes or a no?"), or **Process it / Skip it on the intake page**. A second answer → **E1a**; an answer after the deadline → **E1b**. **No** closes the request (`declined`). **No answer by the deadline** closes it (`expired`), visibly, and it can still be processed from the page: that tap is the approval. **Nothing contacts the portal before a yes** (`intake.portal_login` audit rows and the rig's mock log prove it). |
| 4 | Collecting data | One session: log in, read the list, open the record, sign out. Keyed on the program's own column names; the screen (program, window, tables, columns, fields, actions) is checked before anything is read and any difference **refuses the import** and alerts (`structural`). The portal being down ("No se ha podido iniciar sesión") or unreachable is an ordinary failure: recorded, retried on `INTAKE_LOOKUP_SCHEDULE_MIN`, then a person is alerted. Not found is legitimate (records appear days after their quote date) and retried the same way. **Never type 2.** |
| 5 | Data collected | The record becomes the same extraction shape as a type 2 reading, so the same review, blockers, payload and send apply. Arrival = Z departure + round(Estimated Hours × 60), stored as **converted** with the sum in its note. The Z and LT columns are cross-checked against tz data. Aircraft model name → ICAO through `AIRCRAFT_TYPES` (Citation CJ4 → C25C); an unknown name is **invalid** and blocks, never guessed. Crew count, passenger names and services are not in the portal: each is a blocking "not given" on the review screen (a scheduled request needs at least one service per leg). |
| 6 | Review requested | **"Review: `<ref>` …"** email: ops are told to open Flight intake and confirm. |
| 7 | Reviewed and confirmed | The review screen behaves as for type 2 (every value editable, edits marked). |
| 8–11 | Building Leon request → Leon request built → Sent to Leon → Notification sent | **The type 2 path, unchanged** (`send.mjs`): same confirmation token, same send-log-before-Leon ordering, same partial-success handling, same checklist, same E3 / E4. |

**One-shot, by design.** Change detection is not built: the portal is read once at import. The request page says
so above the legs, and the completion email (E3) carries the same line. A later message about the same flight
still links (update / copy / cancellation) and only asks a person; it never re-reads the portal on its own.

**Linking: the reference first, the calendar UID as a cross-check.** A real cancellation carries the full block
including `#Ref`, so a message whose reference we have is that flight even if its UID was never seen (the UID
difference is recorded); the UID is the way in only when a message has no reference. The same UID with a
different reference is not linked. **Verified against real messages, not yet end to end through Resend:** four
real CNAIR messages (three invites, one cancellation; facts in `rig/fixtures/cnair/real-messages.json`, `.eml`
fixtures reconstructed from them) were read correctly both as forwarded `.msg` attachments and in the
reconstructed MIME shape. What a real message looks like after Resend (whether the `text/calendar` part and its
DESCRIPTION survive) is still unproven until one arrives at the intake address. The *update* case (same UID,
higher SEQUENCE) has no real sample yet and stays fictional.

What the real messages settled: CNAIR sends from Zimbra (plain-UUID UIDs, `multipart/alternative`); the crew
keys are `#1º:` / `#2º:`; `#Pax` is one count per leg in leg order (`0/5/5`); `#ETD` is one `HH:MM:SS-ICAO` per
leg; a cancellation's text body is one line ("La siguiente reunión ha sido cancelada") and the block lives only
in the appointment description (→ the calendar part's DESCRIPTION), which the classifier now searches; the
cancellation is recognised by `METHOD:CANCEL` (the `Cancelado:` prefix and the Spanish line are hints only).
An attached `.msg` of a meeting yields its method (from the message class), its UID (from the GlobalObjectId's
`vCal-Uid`) and the description block (`unpack.mjs`).

The look-up is **off by default**: it runs only with `INTAKE_CNAIR_LOOKUP=on` and `CNAIR_USER` / `CNAIR_PASSWORD`
in the server's environment (or against a local mock, `CNAIR_PORTAL_BASE=http://127.0.0.1:…`, rig only). Off, an
approved request waits for a person ("portal look-up is off on this server"). The reader drives the Genero
protocol, not the DOM; details and the column map are in `docs/cnair-portal-investigation.md`.

Tests: `node --env-file=.env.rig rig/intake/e2e-scheduled.mjs` (decline / no answer / approve → Leon on the mock
/ reply path / unknown aircraft / altered structure / portal down), `e2e-classify.mjs`, `rig/.scratch/reader-check`.

## Where the model stops and code starts (THE LINE)

- The model (Bedrock, tier `extraction`, recorded per version in `intake_extractions.model_id`) fills
  `EXTRACTION_SCHEMA` (`schema.mjs`) and nothing else: values as written, `said` verbatim, source, confidence, and
  the words that fix a time zone. It never converts, never builds a Leon payload, and cannot name a field Leon accepts.
- Code (`extract.mjs` normalise/enforce) does every lookup and every piece of arithmetic: airports through Leon's own
  airport table (IATA → ICAO, unknown → invalid), UTC from stated zones with each airport's IANA zone for that date,
  UTC-vs-local cross-checks, TBA/----- → Unknown (never 0), stated 0 → zero, confidence < 0.7 → low confidence,
  body-vs-attachment conflicts (by comparing each attachment's own copied facts), and scrubbing any identity the model
  put outside `personal`.
- `leon-payload.mjs` builds `FlightCreate` from the REVIEWED values. It refuses on any blocking state.

## Time zones

Where the source gives UTC, that is the value: it is never converted, and a local time beside it is only
cross-checked. A local-only time is the last resort: code converts it (`agent/lib/tzdata.mjs`), the field is marked
CONVERTED and its note names the tz data used. The model never converts.

Node resolves zones with the tz data bundled in its ICU, which is frozen at the Node release, while countries change
rules with weeks of notice (2026: Morocco to UTC+0 in September; British Columbia and Alberta stop changing clocks in
November). Stale data means a flight loaded one hour wrong with nothing looking wrong. So:

- **The image runs on current data.** Every build of `agent/Dockerfile` installs Ubuntu's `tzdata-icu` as the
  baseline, then `agent/scripts/fetch-tzdata.mjs` replaces it with the newest IANA release from the ICU project
  (Ubuntu's package can trail IANA by weeks: on 2 Oct 2026 it had 2026c while IANA was at 2026e, which changes
  Manitoba and the Northwest Territories from 1 Nov). `ICU_TIMEZONE_FILES_DIR` points Node at those files. The build
  then runs `rig/intake/test-timezones.mjs` and fails if the runtime is too old.
- **The runtime proves itself before converting.** On start (`startTzWatch`) and before the first conversion: tz
  version ≥ `TZ_MINIMUM`, and the `TRICKY` conversions come out right. If not, the log says so in capitals, the intake
  page shows a red "Time zones" pill, `/api/health` reports `tzdata.ok: false`, and **nothing is converted**: local-only
  times become a blocking field with an empty UTC value for a person to type.
- **A local time that happens twice or never** (the night the clocks change) is refused the same way, naming the two
  UTC readings.
- **Once a day** the agent reads IANA's current release name; a newer one than the runtime's is a warning (log line and
  an amber pill). It does not block. The fix is a rebuild: `docker compose up -d --build agent-service`.
- **This makes the agent's builds non-reproducible, deliberately.** Two builds of the same commit can carry different
  tz data, and a build can fail when the download is unavailable and the fallback is too old. A cached build does not
  refresh the data, so a monthly `--no-cache` rebuild is scheduled. Details and the trade-off: `docs/deploy.md`.
- **When IANA changes rules:** raise `TZ_MINIMUM`, add a `TRICKY` case for the change, rebuild.
- Check the server: `docker exec agent-service node -p process.versions.tz`.
- Audit of what was already sent: `python3 scripts/intake-tz-audit.py .env` (read only; recomputes every local-derived
  time in the send log with the machine's own tz database).
- Rig: `rig/tzdata.sh` fetches the same data for the local Node; `rig/start.sh` points the agent at it.

## Attachments

Classified by content, never by name: `request` (it is the request), `supporting` (GenDec, crew/pax list, permit, form),
`noise` (tiny inline images: classified by code from the bytes; everything else by the model), `unreadable`. The body is
the request unless an attachment clearly supersedes it; the review screen says which and why, lists every attachment
with its role (noise included, "ignored, and why"), and ops can choose "Use this file instead", which re-extracts a
new version with that file as the request.

## Storage: /storage layout, access, retention

- Server path: `/mnt/hdd-storage/intake` mounted as `/intake` in `agent-service` (`INTAKE_ROOT=/intake`).
- `raw/YYYY/MM/DD/<message-uuid>.eml` — the message as received. `files/ab/cd/<sha256>` — attachment content,
  stored once per content hash. Paths contain only dates, UUIDs and hashes — never a name, sender or filename.
- Directories 0700, files 0600, written atomically (temp + rename). The type is sniffed from the bytes; the declared
  name/type are shown, never trusted.
- Served only through authenticated agent routes (`/agent/api/intake/attachments/:id`, mailbox raw/cid routes), each
  open audited; served with `nosniff`, a sandbox CSP, and `attachment` disposition for anything not a PDF/image/text.
- Retention: `agent_settings` row `intake:retention` (days, default 90). A daily sweep deletes raw `.eml` files,
  deletes attachment files no in-period message still references, clears `intake_extractions.personal`, and marks
  rows purged. Operational rows (routes, times, counts, Leon ids) stay. **No off-site backup covers /mnt/hdd-storage.**

## Personal data

Only in `intake_extractions.personal`, the raw `.eml` and attachment files. Never in list rows, search text,
understood blocks, stage notes, emails, dialogs, audit rows or logs. The API masks it (`••••••••`); two reveal
endpoints return values for 60 s and are audited. Search text is built without any identity line; a search that looks
like a passport number or a date of birth returns the "not searchable" state.

## Leon write path (cwy-cwy)

- Per leg: the attempt row is written BEFORE the call (`intake_leon_writes.state = 'sending'`, payload + sha256), then
  Leon is called, then the outcome is recorded: `in_leon` + flight id, `not_in_leon` + Leon's words, or `unknown`
  (timeout / network / 5xx). Unknown stops the send. On restart every `sending` row becomes `unknown`
  (`recoverOnStart`). Nothing is ever retried automatically: a person runs "Check Leon for this leg" (a read by our
  marker `CWY-INTAKE <request>/<leg>` in ops notes) or states "it is not in Leon".
- First leg: `createTrip`; later legs: `flightCreate(tripNid)`, so a partial success is natural and resend sends only
  legs not in Leon. Trip status: `INTAKE_LEON_TRIP_STATUS` (default CONFIRMED).
- **Passengers and crew** (`leon-people.mjs`, 2026-10-07), written per leg right after Leon confirms its flight, from
  the request's own values (`intake_extractions.personal`), nothing added or reformatted:
  - Passengers → the flight's **passenger list as Leon's text list**: `passengerList.savePassengerText(flightNid,
    {count, text})`, one numbered line per passenger (name · DOB · nationality · passport · expiry, whatever the request
    gave), count = the reviewed passenger total. Leon's *structured* list (`savePassengerList` / `addPassengersToList`)
    takes only references to contacts that already exist in the operator's address book (`contactNid`); the agent
    creates no contacts (an open decision for ops). Consequence: the Passenger Manifest shows this list verbatim beside
    the file (never parsed into rows) and has no rows until passengers are structured records.
  - Crew → a block appended to the flight's **OPS notes**, headed `OPERATOR'S CREW per the handling request · <marker>`:
    the crew count and each crew member as the request gave them, stated as NOT assigned. Leon assigns crew only by its
    own crew-member id (`crewPanel.crew.assign`), a crew member is a full Leon user (`crewMember.create`), and no crew
    count is writable (`FlightCreate`/`FlightUpdate` have none; `crewProperty` is derived from assignments). The agent
    creates no crew records. The block is added by reading the notes Leon holds and writing them back with the block
    below (`flights.flightListUpdate`), never twice.
  - Each write is recorded BEFORE the call in `intake_leon_people_writes` (hash + count, never a value), then the
    outcome; restart → `unknown`; never retried automatically. Leon's reason is stored with personal values removed.
    A refusal or no answer keeps the flight, turns the stage "Passengers and crew" red/partial, makes the request
    Needs you ("passengers NOT in Leon for leg N") and the completion email Needs you. Bound to the confirmation like
    the payload: people changed after the dialog opened → nothing is sent.
- Duplicate check before review and again just before sending: same registration or flight number, same route (or
  one shared airport when both match), STD within ±3 h, not cancelled; or our own earlier request with the same
  reference that has legs in Leon. A match stops the pipeline; "Not a duplicate" is recorded with who and when.
- **Checklist statuses are never set by the agent** (ops' decision, 2026-10-03): every item on a created flight stays
  at Leon's own default; a status would claim work that has not happened. The client's request reaches ops as a
  **note in each flight's OPS notes** (`opsNotes` in `FlightCreate`, the field Leon shows on the flight; it also
  carries our marker on the first line). Chosen over a checklist-item note because every service is one block,
  needs no status to exist, and is part of the create itself (no second write). The note (`servicesNote` in
  `send.mjs`) carries, per leg: every requested service in the requester's own words, the review decision
  (PROVIDE / TO CONFIRM / DECLINED) with the name of the person who decided when it was not the agent, any
  "Our answer", the detail that would otherwise be lost (quantities, conditions), the free-text remarks, and the
  parties the request names (`Handler: Clearway` is a party, not a service, and never shares a row with
  "Handling"). It is headed CLIENT'S REQUEST, recorded by the agent, and NOT ACTIONED. Stages 9–10 are "Services
  noted" and "Checklist left to ops"; the E3 email says the same and claims nothing about services.
- **Service decisions carry their author.** The agent's reading is kept (`agentDecision`); a person's change is
  marked permanently (`decided`: who, when, what it was) and shown on the row like a field edit, so a declined
  service can always be traced to whoever declined it.

### Facts confirmed on a disposable test flight (2026-09-30, trip 7755133, deleted)

- `startTimeUTC` `"2027-03-10T10:00:00Z"` was stored and returned as `2027-03-10T10:00:00Z`; the same without `Z`
  was read as UTC. We always send `…Z`.
- Refusal shape: HTTP 400, `errors[0].message` like `Argument 'startTimeUTC' validation failed with reason 'Start
  time cannot be later or equal then end time'` or `Variable "$f" got invalid value "ZZZQ" at "f.adepCode"; Argument
  'ZZZQ' validation failed with reason 'Its not an airport code'`, `extensions.category = "argumentValidation"`,
  `data: null`. A bad airport in `createTrip` refuses the whole trip.
- `flightDelete` answers `true` and CANCELS the flight (`isCnl: true`; still readable). `deleteTrip` answers `true`.
  The two test flights remain visible as cancelled on 10 Mar 2027.
- A new flight gets Leon's auto-add checklist items (27 of 177 OPS definitions are auto-add).

## Settings (Agent settings → Flight intake, admins)

Edited on the Agent settings page, stored in `agent_settings` (`intake:addresses`, `intake:notify_to`,
`intake:mailbox_readers`, `intake:retention`), applied within 15 s, every save audited (`settings.changed`).

| Setting | Meaning |
|---|---|
| Receiving addresses | the agent's addresses; each shows whether its domain can receive in Resend |
| Send intake emails to | who gets E2 / E3 / E4; empty → the Notification stage fails, saying so |
| Agent mailbox access | readers besides admins/developers |
| Keep intake mail | retention in days (default 90) |

Until a value is saved there, the server's `INTAKE_ADDRESSES` / `INTAKE_NOTIFY_TO` / `INTAKE_MAILBOX_READERS`
are used (the page says "from the server's environment until saved here").

Server-only environment:

| Variable | Meaning |
|---|---|
| `RESEND_WEBHOOK_SECRET` | Svix signing secret of the Resend webhook (written by `scripts/intake-resend-setup.mjs`) |
| `INTAKE_ROOT` | storage root (compose sets `/intake`) |
| `INTAKE_LEON_TRIP_STATUS` | CONFIRMED (default) / OPTION / OPPORTUNITY |
| `INTAKE_MAIL_MODE=capture` | rig only: store emails without sending |
| `INTAKE_CNAIR_LOOKUP` | `on` to look references up in the CNAIR portal (needs `CNAIR_USER`, `CNAIR_PASSWORD`). Default off |
| `INTAKE_LOOKUP_SCHEDULE_MIN` | minutes after the first look-up at which it is retried (default `0,15,60,180,360,720,1440`) |
| `INTAKE_APPROVAL_HOURS` | how long ops have to answer E1 before the request closes as expired (default 4) |
| `AGENT_CONSOLE_URL` | base of the links in intake emails (answer page, request page); falls back to `NEXT_PUBLIC_SITE_URL` |
| `RESEND_API_BASE`, `LEON_API_BASE`, `CNAIR_PORTAL_BASE` | rig only: local mocks (the portal mock is only honoured for a loopback address). Never set in production. |

## Rig

`rig/intake/mock-resend.mjs`, `rig/intake/mock-leon.mjs` (from a read-only snapshot, `leon-snapshot.mjs`, plus
`rig/fixtures/intake/leon-extra.json`) and `rig/intake/mock-cnair.mjs` (the provider portal, speaking the recorded
Genero protocol from `rig/fixtures/cnair/portal-structure.json` and the redacted records; every login is written to
`rig/.scratch/cnair-mock-log.jsonl`; faults through `<log>.break` = `columns | total | down | login`, a record hidden
for N list reads through `<log>.hide`) replace Resend, Leon and CNAIR. The rig never reaches the live portal: the
agent runs under `env -i` with `.env.rig` only, so the production `CNAIR_*` credentials are not in its environment.
`rig/intake/e2e.mjs` and `e2e-scheduled.mjs` run the scenarios; `e2e-people.mjs` (16 invented passengers and 4 crew,
`make-people-fixture.mjs`: read back from Leon, refusal, restart mid-write, personal-data sweep) and `browser-people.mjs`
(the screen) cover passengers and crew. Real Leon from the rig needs a person to type the phrase in
`rig/make-env.mjs --intake-only`.
