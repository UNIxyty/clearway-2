# CNAIR portal fixtures

Five records from the CNAIR flight-dispatcher portal, captured on 2026-10-01 with the account holder's
authorisation (one read-only session, `rig/cnair/capture.mjs`). They are the structural variety a type 1
reader must handle; see `docs/cnair-portal-investigation.md` §2 for what each one shows.

Shape: the allowlisted projection the capture writes, keyed by the portal's own column names
(`schedule.rows[*].zTime` is `horiniutc`, `legs.rows[*].flightNumber` is `fnumber3`, and so on; the full map
is in the investigation report). `hoursCheck` is the arrival computed both ways from `Estimated Hours`, kept
as evidence that the field is decimal hours.

Redaction happened at capture, not afterwards: crew names and ids, passenger rows, contact names, phones,
e-mail addresses and remark text were parsed in memory and never written. Fields that held them carry
`"present"` / `"empty"` markers instead. Airport names, ICAO codes, dates, times, counts, registration, aircraft
model name and flight numbers are the portal's values as read.

Quote numbers, registrations and flight numbers are the provider's real identifiers for a real operator's
flights; they identify no person.

## Added 2026-10-02

- `2614050-notified-by-invite-morocco-same-flightnumber.json`: the record a real notification pointed to
  (its `#Ref`). Same redaction as the others.
- `invite-request.eml`, `invite-update.eml`, `invite-cancel.eml`: **fictional** calendar invites in the shape
  of the provider's notification (Exchange meeting request, `text/calendar` part, ten `#Key:` lines in the
  body). Invented registration, reference, initials and addresses; written by `rig/cnair/make-invite-fixtures.mjs`.
  The update has the same UID with SEQUENCE 1; the cancel is `METHOD:CANCEL`.
- `portal-structure.json` (added 2026-10-03): the program's screen as the protocol describes it (node ids, the
  five tables with their columns and types, form fields, actions, the type-of-flight and stretcher lists), no data.
  `rig/intake/mock-cnair.mjs` serves the records above through it, speaking the recorded protocol, so the agent's
  reader is exercised unchanged on the rig; the mock also adds two synthetic records (2619001, an aircraft name the
  agent must not guess; 2619002, hidden from the list on demand).
