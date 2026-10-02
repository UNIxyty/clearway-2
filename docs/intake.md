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
| `RESEND_API_BASE`, `LEON_API_BASE` | rig only: local mocks. Never set in production. |

## Rig

`rig/intake/mock-resend.mjs` and `rig/intake/mock-leon.mjs` (from a read-only snapshot, `leon-snapshot.mjs`) replace
Resend and Leon. `rig/intake/e2e.mjs` runs the scenarios. Real Leon from the rig needs a person to type the phrase in
`rig/make-env.mjs --intake-only`.
