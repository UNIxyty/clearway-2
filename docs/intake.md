# Flight intake (type 2: handling requests) and the Agent mailbox

Runbook and reference for the intake build. Pages: `/agent/intake` (Flight intake) and `/agent/mailbox` (Agent mailbox).
Server code: `agent/lib/intake/*`. Schema: `docs/supabase-agent-intake.sql` (run in Supabase; safe to re-run).

## The path of one email

1. **Resend inbound** → `POST /agent/api/intake/resend-webhook` (`resend.mjs`). Svix signature verified (5 min tolerance);
   an unverified payload gets 401 and nothing is stored. Idempotent twice: on the Svix id (`intake_events.svix_id`) and
   on Resend's email id (`intake_messages` unique `provider, provider_message_id`). The full message and the raw `.eml`
   are fetched from Resend straight away (the download URL expires) and stored before anything reads them.
2. **Pipeline** (`pipeline.mjs`), off the response path, one message at a time: automatic mail (bounce, auto-reply,
   newsletter) is Ignored with a reason; everything else is read by the model; not a handling request → Not recognised
   (with the checks that failed); a handling request → one `intake_requests` row (unique per message), an
   `intake_extractions` version, the review working copy, the duplicate check, the E2 (or needs-you) email.
3. **Review** on the intake page: every value editable, edits append to `intake_field_edits` and keep EDITED marks.
4. **Send** (`send.mjs`) through a server-verified, expiring, single-use confirmation bound to the payload hashes.
5. **Checklist**, then the E3 / E4 email.

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
- Duplicate check before review and again just before sending: same registration or flight number, same route (or
  one shared airport when both match), STD within ±3 h, not cancelled; or our own earlier request with the same
  reference that has legs in Leon. A match stops the pipeline; "Not a duplicate" is recorded with who and when.
- Checklist: definitions read live (`getAvailableDefinitions(OPS)`, cached 10 min); the flight's existing items are
  read first (Leon auto-adds some); existing ones are updated, the rest added. Status per decision is the first status
  the definition itself offers from: Provide → RQS, YES, CNF…; To confirm → QSM ("?"), PND…; Note → QSM. Declined
  services are not added. Checklist state never changes a leg's Leon state.

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

## Settings (server .env)

| Variable | Meaning |
|---|---|
| `RESEND_WEBHOOK_SECRET` | Svix signing secret of the Resend webhook (written by `scripts/intake-resend-setup.mjs`) |
| `INTAKE_ADDRESSES` | the agent's receiving addresses, comma list (shown as health pills) |
| `INTAKE_NOTIFY_TO` | where E2/E3/E4 go, comma list; unset → the Notification stage fails, saying so |
| `INTAKE_ROOT` | storage root (compose sets `/intake`) |
| `INTAKE_LEON_TRIP_STATUS` | CONFIRMED (default) / OPTION / OPPORTUNITY |
| `INTAKE_MAILBOX_READERS` | extra mailbox readers (emails); admins/developers always have access |
| `INTAKE_MAIL_MODE=capture` | rig only: store emails without sending |
| `RESEND_API_BASE`, `LEON_API_BASE` | rig only: local mocks. Never set in production. |

## Rig

`rig/intake/mock-resend.mjs` and `rig/intake/mock-leon.mjs` (from a read-only snapshot, `leon-snapshot.mjs`) replace
Resend and Leon. `rig/intake/e2e.mjs` runs the scenarios. Real Leon from the rig needs a person to type the phrase in
`rig/make-env.mjs --intake-only`.
