# CNAIR flight-dispatcher portal: what a scraper has to know (2026-10-01)

CNAIR offers no API and will not provide one, so the scraper is the plan. This report answers the questions the
scraper depends on, from an authorised read-only capture of all eleven records visible to our account
(one session, 82 seconds, one record every ~6 s, redaction at the point of capture: see "Method").

**Answers first**

1. **`Estimated Hours` is decimal hours** (0,42 = 25 min), not h:mm. Settled by three independent checks (§1).
   Arrival time = Z departure + hours, to the minute. Resolved with certainty.
2. **Five redacted fixtures** are in `rig/fixtures/cnair/`. What varies: leg count (1, 2, 4), flight-number
   format (`ORO2151` vs `ORO 1041`), slot-adjusted departure times, a leg whose Z date and LT date differ, a
   DST change between two legs, passenger type codes (`PAX`, `PAP`, `CHI`), blank cabin fields (§2).
3. **Idle limit: between 2 and 5 minutes** without traffic, measured twice (alive at 2:00, gone at 5:00);
   a headless browser page does not keep it alive by itself. Unattended runs are viable if each run logs in,
   reads in one pass and signs out. Login is a plain form post, no MFA, no CAPTCHA, four for four today; the
   unexplained "session could not be started" refusal of 29 Sep is the one known risk (§3).
4. **Drive the Genero protocol, not the DOM.** Field identity in the protocol is the program's own column names
   (`horas_etv`, `id_oaci_ori`, …) and was byte-for-byte identical across three sessions on two days; the
   rendered DOM carries no stable identifiers at all (§4).
5. **Change detection** has to be re-read-and-compare; options with their consequences in §5. Not decided here.
6. **Still missing and needing a person:** crew count, passenger names, services, and the ICAO aircraft type (a
   name is given; a mapping exists for the two aircraft in use and must block on anything else). Nothing else
   in the application supplies them (§6).
7. **Cost:** roughly 3–4 weeks to build to the standard type 2 has, and a standing maintenance load that is
   not zero: every release of their program or of the Genero client is a potential break, detected by our own
   structural checks rather than by them telling us (§7).
8. **Notification (added 02 Oct):** it is a calendar invite; `#Ref` is the quote number and matched one
   record; `#ETD` is departure-airport local time; an invite arriving today would be misread as a type 2
   request; the agent can no longer send calendar content; our Node time-zone data is stale for Morocco (§8).

---

## 1. `Estimated Hours` means decimal hours

Three independent checks, all from the captured records (`rig/.scratch/cnair/out2/records.json`, redacted):

- **Impossible as h:mm.** Record 2613979 has legs of `1,68`; record 2613417 has `0,50`. 68 minutes is not a
  minute value. Every record's column total is the plain decimal sum (`0,42+1,68+1,68+0,42 = 4,20`,
  `1,42+1,33 = 2,75`, `3,12+3,10 = 6,22`).
- **Matches the slot messages the portal itself quotes.** Three records carry slot confirmations in their
  remarks with Z times. Decimal reading reproduces them exactly; h:mm never does:

  | Record | Leg | Z dep | Hours | Z dep + decimal | Z dep + h:mm | Quoted in remarks |
  |---|---|---|---|---|---|---|
  | 2613979 | LEGE→LEBL | 18:30 | 0,42 | **18:55** | 19:12 | 18:55 ✓ |
  | 2612887 | LEIB→LEBB | 12:10 | 1,08 | **13:15** | 13:18 | 13:15 ✓ |
  | 2612775 | LIML→LEBL | 15:30 | 1,25 | **16:45** | 16:55 | 16:45 ✓ |

- **Matches reality.** Girona→Barcelona in a CJ4: 25 min (0,42 h), not 42. Barcelona→Gran Canaria: 3 h 07
  (3,12 h). Barcelona→Jersey: 1 h 25 (1,42 h).

**Rule for the scraper:** `arrival_utc = departure_utc + round(hours × 60) minutes`, with the decimal comma
converted. The field has 2 decimals, so the resolution is 36 seconds; round to the minute. Store the computed
arrival with state `converted` (schema state that code set it), never `extracted`, so the review screen shows it
was derived.

## 2. The five fixtures and what varies

`rig/fixtures/cnair/` (redacted projections; no names, contacts or remark text were ever written):

| Fixture | Why it is there |
|---|---|
| `2613979-four-legs-slots-paxtypes` | 4 legs in one day, two slot-adjusted departures (table shows 05:20Z where the schedule said 05:30Z), passenger types `PAX`/`PAP`, Clearway listed as supplier at LDZA |
| `2612472-single-leg-crosses-midnight-z` | 1 leg; Z date 03/10 23:30 but LT date 04/10 01:30 and the list's "Flight Date" is the LT date |
| `2612398-long-legs-dst-change-blank-cabin` | type `NPE`; legs on 30/10 (LEBL +1) and 01/11 (GCLP +0, after the DST change); cabin config, seats and stretcher all blank |
| `2613417-ec-nqs-spaced-flightnumber-child-pax` | second aircraft EC-NQS; flight numbers written `ORO 1041` with a space; a `CHI` (child) passenger type; no remarks |
| `2613613-jersey-utc-plus-1-ppr-present` | EGJJ (UTC+1 while Spain is +2); PPR field filled on both legs |

Structural facts common to all eleven:

- **One record = one quote number** (`id_vuelo`, integer, 7 digits, e.g. 2613979). The same number appears as
  "Quote Nº" and "Flight Order Nº". Stable, unique, and the key the send log and duplicate check should store.
- **Legs are rows** in the schedule table (`scr_legs`) and, in the same order, in the leg table (`scr_detov`).
  The leg count is the table's `size` attribute (1, 2 or 4 seen). Selecting a different leg row does **not**
  change any other panel (checked on every record): crew, cabin, remarks, pax and airport tables are per record.
- **Flight numbers repeat across records**: `ORO2151`/`ORO2152` are used by seven of the eleven records on
  different dates. Flight number alone identifies nothing; the duplicate check must use registration + route +
  Z departure, as type 2 already does.
- **Times:** `Z Departure Date/Hour` and `LT Departure Date/Hour` per leg. LT is the **departure airport's**
  local time (offsets check out for Spain +2/+1, Jersey +1, Italy +2, Portugal +1, Canaries +1/+0 across the
  October DST change). **Use the Z columns and ignore LT.** Times are `HH:MM:SS`, sometimes with a leading
  space (`" 05:20:00"`), dates `DD/MM/YYYY`.
- **Airports** are ICAO (`Departure Airport ID` / `OACI1`); a name column sits beside each code.
- **PAX** per leg is a count (0–8 seen). The "Pax x Leg" tree gives type codes and gender per passenger, no
  names, and no count that the schedule column does not already give.
- **Aircraft:** registration (`id_avion`, e.g. EC-OMU) plus a free-text model name (`avion3`, "Citation CJ4"
  on every record). No ICAO type anywhere.
- **Type of Flight** is a code (`IP`, `EP`, `NP`, `NPE` seen); the portal's own combo list maps every code to
  `N` or `X`, which are exactly Leon's `icaoType` values (non-scheduled / other). The full map is in
  `rig/.scratch/cnair/out2/structure.json` → `comboLists.id_tvuelo1`.
- **Crew:** captain and first officer as names (never captured); a hidden flight-attendant field. No count.
- **Remarks:** rich text (Quill HTML). Where present it quoted slot confirmations; it is free text and must not
  be parsed for values, only shown to the reviewer.
- **Default list window:** the list is filtered by `F. Date Since` = today − 3 days (28/09 on 01/10) with no
  end date. Older flights need the date filter widened; a quick-filter text box (`var_filtrorapido`) and a
  Refresh action exist.

## 3. Session: idle limit and unattended viability

**Login.** `POST` of `userName`, `password`, `submit=Entrar` to the start URL → `302` → the Genero client boots.
No MFA, no CAPTCHA, no JavaScript challenge, three successful logins on two days from this machine, headless.
Cookies are all session cookies: `EFFI_TOKEN` (token, **not HttpOnly, not Secure**), `EFFI_USER`,
`Genero-SID` (HttpOnly, SameSite=Strict), `lang`. The session id also appears in every protocol URL.

**Idle limit, measured.** After the capture the browser was closed and the session was pinged
(`POST /gas320/ua/ping/<session>`) after idle gaps of 2, 5, 10, 20, 40 and 55 minutes, each ping resetting the
idle clock:

| Idle gap before the ping | Run 1 (after the capture, 09:56–10:11) | Run 2 (login only, fresh TLS connection per ping, 10:16–10:23) |
|---|---|---|
| 0 min | 200 alive | 200 alive |
| 2 min | 200 alive | 200 alive |
| 5 min | 404 `Session not found` (the ping itself stalled 8 min on a stale keep-alive socket, so this run only proves "dead by 10:11") | 404 `Session not found` at 5:00 exactly |
| 10, 20, 40, 55 min | not reached | not reached |

**The idle limit is between 2 and 5 minutes with no traffic at all**, consistent with a 300-second session
timeout (the ping at 5:00 found it just gone). The "53 minutes" from the first session today was only the gap
until anyone looked.

**Why `X-FourJs-Timeout: 150` is not the session lifetime.** That header is the long-poll timeout for the
browser client, which is also the interval at which it is supposed to keep the session alive. Observed fact
that matters for a scraper: an idle Genero page in headless Playwright sent **no** keep-alive at all for 53
minutes (08:21–09:14), so the session died underneath it. The browser does not keep the session alive for us.

**Unattended operation.** Yes, with the run shaped to the limit: log in, read everything in one pass (eleven
records took 82 s), **sign out** (the program has a `cerrarsesion` action), and never rely on a session
outliving a few minutes. If a run must span longer than ~2 minutes between requests, it has to ping
`/gas320/ua/ping/<session>` itself every ≤120 s. Logging in again after a dead session worked every time
today (four logins, four opens). Two caveats to design around:

1. On 29 Sep, login succeeded but the program answered *"No se ha podido iniciar sesión"* twice, headless and
   headed, and worked three times on 1 Oct without any change on our side. Cause unknown (a licence seat, a
   session held open elsewhere, or server-side state). The scraper must treat this as a normal failure
   outcome: stop, record it, retry on the next schedule, alert after N consecutive failures.
2. Behaviour from the server's IP is **not tested**. `rig/cnair/login-check.sh` exists for exactly that and
   should be run once from the ops host before anything is scheduled.

## 4. Protocol, not DOM

What the two routes look like in practice:

| | Genero protocol (`POST /ua/sua/<session>`) | Rendered page (GBC DOM) |
|---|---|---|
| Field identity | Program column names: `horas_etv`, `id_oaci_ori`, `fechainiutc`, `fnumber3` | None: generated element ids, class names from the GBC build |
| Stability seen | Same names **and the same numeric node ids** (759/711/643/592/568 for the five tables) in three sessions on two days | Layout is GBC-version dependent; the GBC build id is in every asset URL |
| Types | Declared per field: `DATE`, `INTEGER`, `CHAR(4)`, `DECIMAL(16,2)` | Strings |
| Volume | 40 KB tree at start + ~7 KB per record | Full page re-scrape per record |
| Effort | A small parser (tokenizer + tree, ~60 lines, written for this capture) and the five events the client sends | Playwright selectors against unstable markup |
| Breaks when | They rename a column or restructure the program | They, or Four Js, change anything visual |

**Choice: protocol**, with the browser still doing login and bootstrap (that part is ordinary HTML), and the
scraper reading the protocol responses the client receives rather than re-implementing the client. Key every
read on `colName`, and treat the numeric node ids as a cross-check only. The capture script
(`rig/cnair/capture.mjs`) already works this way.

## 5. Change detection: options, not a decision

There is no last-modified field and no event feed. The only way to notice a change is to re-read the record
and compare the projection with what we stored at import. Nothing in the record says it changed; the slot
example shows that a departure can move by 10 minutes with no marker.

What to compare (the "meaningful change" set): per leg, Z date, Z time, departure, arrival, hours (→ arrival
time), PAX count, flight number; per record, registration, leg count, type of flight. Not: remarks, cabin text,
contacts.

| Option | How often | Cost | What it does when a change is found |
|---|---|---|---|
| **A. Re-read until departure** | Every run (e.g. hourly) for records whose first leg has not departed | One login + N record reads per run; trivial volume | Marks the request "Changed after import", lists the differences, notifies ops. The person decides; nothing automatic touches Leon |
| **B. Re-read at fixed points** | At import + 24 h, + 2 h before STD | Fewer reads; misses changes between points | Same as A |
| **C. Re-read on trigger only** | Only when a new notification e-mail arrives for the same quote number | Cheapest; depends on the provider re-notifying, which is unproven | Same as A |

What cannot happen in any option: editing a flight in Leon. Leon flights are not updated by this pipeline
(`docs/leon-flight-write-path.md`: update is a different, deprecated-leaning path we have not built). So a
detected change becomes a ticket for a person with the diff attached, and the request stays open until
someone marks it handled. If the policy is to cancel-and-recreate in Leon, that is a new write path with its
own confirmation and send-log rules; it should be decided, not assumed.

Storage: the projection we already write (the fixture shape) is the stored state; the comparison is a
field-by-field diff of two JSON documents, kept as an `intake_extractions` version like a re-extraction.

## 6. What stays missing, and nothing else in the application fills it

The application is one window with one form; the Genero tree lists no other windows, no top menu, no report
actions and no export (actions present: refresh, quick filter, find, copy/cut/paste, sign out, exit). The
"View" column in the schedule table sent one protocol event and opened nothing from a headless client.
So, after reading everything the account can see:

| Schema field | Portal | Gap |
|---|---|---|
| departure / arrival airport | ICAO per leg | none |
| std | Z date + Z time per leg | none (`extracted`) |
| sta | — | **computed** from hours (§1), state `converted` |
| registration | yes | none |
| aircraftType (ICAO) | model name only | **mapping needed**: `Citation CJ4 → C25C`. Only CJ4 has been seen on both aircraft in use. Any other name must block (`invalid`), never guess |
| flightNumber | yes, with or without a space | normalise whitespace; not unique |
| flightType | code → N/X from the portal's own list | none |
| pax total | count per leg | none; adults/children/infants only as type codes, not counts |
| crewCount | — | **person** (captain + FO are named, so ≥2 is known, but not the count) |
| passenger names | — (types and gender only) | **person**, if Leon needs them at all |
| services | — | **person** (the handling checklist has no source here) |
| reference | quote number | none; also the duplicate-check key |

Each "person" row is a blocking `not_given` state on the review screen, exactly as type 2 shows them.

## 7. Cost, honestly

**Build (to the standard type 2 has):** about 3–4 weeks.
- Protocol reader as a library with structural validation (1 week): login, bootstrap, list, per-record read,
  the projection, the checks in §"Breakage detection" below.
- Type 1 pipeline stages wired to it (1 week): the nine stages exist as a list; "Collecting data" and
  "Data collected" need the reader, the e-mail link (pending the sample), the quote-number duplicate key, the
  computed-arrival and aircraft-type conversions, and the review screen with the person-filled gaps.
- Change detection (½–1 week) for whichever option is chosen, plus the "changed after import" state and
  notification.
- Rig: a recorded-protocol mock from the fixtures so none of this is tested against the live portal (½ week).

**Keeping it working:** the realistic load is a few hours per incident, with incidents whenever their program
or the Genero client changes. We will not be told; our checks will tell us, and the import stops until someone
updates the reader. Budget for that as an on-call item, not a project.

**Breakage detection (what every run must verify before importing anything):**
1. The program identifies itself as `ProgramacionCnair`, one window `cn_clearway`.
2. The five tables exist by name with exactly the expected column names in the expected order, and the field
   `varType`s where declared match (`DATE`, `INTEGER`, `CHAR(4)`, `DECIMAL(16,2)`).
3. Every value parses in its declared format: dates `DD/MM/YYYY`, times `HH:MM:SS`, ICAO `^[A-Z]{4}$`, hours
   `^\d+,\d{2}$`, the column total equals the sum of the legs, the LT offset for each departure airport equals
   the IANA offset for that date, checked against **current** tz data (Node's bundled copy is stale, §8).
4. The record re-reads identically within the same session (it did, on every record today).
5. Any failure of 1–4: refuse the import, record the raw structural diff (never the values), alert. Importing
   on a partial pass is not an option.

## 8. The notification is a calendar invite (sample received 2026-10-02)

The notification is an Outlook meeting request sent from the aircraft's own mailbox (`ec-nqs@…`), subject =
route, with a ten-line `#Key: value` body. The sample was cross-checked against portal record **2614050**, read
on 2026-10-02 under the same redaction rules (fixture `2614050-notified-by-invite-…json`).

**Answers**

1. **The link is `#Ref` = the portal's quote number, and it matched exactly one record.** Use it as the lookup,
   duplicate and send-log key.
2. **`#ETD` is local time at each leg's departure airport**, one entry per leg, no date. Leg 1: `17:00:00-LEBL`
   = portal LT 17:00 = **15:00 Z**. Times still come from the portal's Z columns; the invite is trigger and key.
3. **The pipeline accepts a calendar invite and the body survives**, but today it would be **misread as a
   type 2 handling request** (below). That must be closed before CNAIR invites are pointed at the intake address.
4. **The agent can no longer send calendar content at all** (guard in the one outbound mail function, tested).
5. **Whether changes arrive as meeting updates is not established.** It cannot be read from one sample; what to
   check is listed below.

**Invite ↔ portal record 2614050**

| Invite | Portal | Result |
|---|---|---|
| `#Ref: 2614050` | Quote Nº 2614050 (also Flight Order Nº) | exact match, one record |
| Sender `ec-nqs@` | Aircraft EC-NQS | match. A confidence signal only: a forwarded or relayed notification will not carry it, so it must never decide or reject anything |
| Subject `LEBL-GMMN-LEBL` | leg 1 LEBL→GMMN, leg 2 GMMN→LEBL | match |
| `#DATE: 05/10/26` | Flight Date 05/10/2026 = leg 1's date; leg 2 is on 06/10 | **first leg's date**, not the trip's span |
| `#ETD: 17:00:00-LEBL` | leg 1: LT 17:00, Z 15:00 | **local time** at the departure airport |
| `#ETD: 17:30:00-GMMN` | leg 2: LT 17:30, Z 17:30 (06/10) | consistent; Morocco is UTC+0 on that date (see below) |
| `#Pax: 2/2` | PAX 2 on leg 1, 2 on leg 2 | consistent with **pax per leg**. Not seats (7). Not adults/children (that would be 4). One sample with equal legs cannot exclude "x of y"; a sample with unequal legs settles it |
| `#Cliente: (Extracomunitario Pasaje)` | Type of Flight code `EP` | the code spelled out: E/I/N = Extracomunitario / Intracomunitario / Nacional, P = Pasaje |
| `#1`, `#2` (crew initials) | Captain and First Officer both present | two crew identified in both; still no crew count |
| `#TCP:` empty | Flight Attendant field empty | consistent (TCP = cabin crew) |
| `#Fra:`, `#Otros:` empty | nothing corresponding on the form | **to ask.** "Fra." is the usual Spanish abbreviation of *factura* (invoice), so probably an invoice reference, but that is an inference |
| meeting window 5 Oct 15:00 → 6 Oct 17:30 (as displayed) | Z departures: 15:00 on 05/10, 17:30 on 06/10 | numerically equal to the portal's Z departure of the first and last leg. Displayed times depend on the viewer, so this proves nothing without the raw `.ics` (`DTSTART`/`DTEND`/`TZID`) |

**Morocco, and a time-zone problem on our side.** The portal shows GMMN local = UTC on 06/10/2026. The current
IANA database (2026c, on this Mac) agrees: Morocco moved to UTC+0 on 20 Sep 2026 with no later change. **Node's
bundled time-zone data is older (2025a) and still says UTC+1.** The deployed type 2 intake converts local times
with Node's data (`leon-lookup.mjs` → `Intl.DateTimeFormat`): `localToUtc("2026-10-06","17:30","Africa/Casablanca")`
returns 16:30Z here; the correct answer is 17:30Z. So:
- a handling request giving only local times at a Moroccan airport would be converted **one hour early**, with no
  warning; one giving both UTC and local would be flagged as a mismatch (which blocks, correctly);
- the server's Node version was not checked from here: `docker exec agent-service node -p process.versions.tz`;
- the structural check in §7 ("LT offset matches IANA") must use current tz data, or it will reject correct
  Moroccan records. This is one more reason to take times from the portal's Z columns only.
This is a defect in what is already deployed, independent of type 1. Followed up on 02 Oct: the production base
image runs tz data 2025c, which is wrong for four zones (Casablanca, El Aaiún, Vancouver, Edmonton); the
production send log was audited and nothing had been sent to Leon at all; the fix (current tz data in the image,
a self-test that refuses to convert on stale data, refusal of ambiguous local times) is described in
`docs/intake.md`, "Time zones".

**How the pipeline handles an invite today** (three fictional invites in the provider's shape, run through the
rig: `rig/fixtures/cnair/invite-{request,update,cancel}.eml`):

| Sent | What happened |
|---|---|
| Meeting request | Body text intact; the calendar part is stored as an unnamed `text/calendar` attachment (method, UID, sequence readable by code). **Read as a handling request**, reference = the `#Ref` number, 2 legs, state "Needs you · timezone unknown" |
| Update (same UID, sequence 1, new time) | **A second, separate request** with the same reference. Nothing links it to the first |
| Cancellation (`METHOD:CANCEL`) | "Not recognised: a calendar cancellation". Nothing links it to the request it cancels |

The timezone block means nothing reaches Leon without a person, but a person could set the zone and confirm, and
flights would then be built from the invite's ten lines instead of the portal. Needed before go-live (corrected on 03 Oct: an earlier version of this paragraph keyed the rule on the
provider's sender domain, which is wrong; notifications can arrive from any address). The type is decided by
content: a message is type 1 when it carries a reference that **resolves to a record in the provider's system**;
the `#Ref` / `#ETD` / `#Pax` block, a route-shaped subject, a calendar part and a known sender are supporting
evidence only. A reference that does not resolve (a record can appear in the list days after its quote date) is
"ask a person", never type 2. A second message with the same calendar `UID` or the same resolved reference
attaches to the existing request; `METHOD:CANCEL` marks it cancelled-by-provider for a person to act on.

Not proven: that Resend's inbound delivers a real Exchange invite with the calendar part. By design it should
(we store the raw message as received and parse from that), but it needs one real invite sent to the intake
address to confirm. How invites will reach that address (CNAIR adding it as an attendee, or a mail-flow rule
copying them from the ops mailbox) is a decision; a copy rule avoids the agent appearing as an attendee.

**The agent cannot answer an invite.** It has no calendar or mailbox API; the only way it could respond is by
mailing iCalendar content, and all of its mail (chat tools, intake notifications, mailbox forward) leaves
through one function, `deliverViaResend` in `digital-wall/lib/mailer.mjs`. That function now refuses: any
attachment that is an iCalendar object (by name or content, plain or base64), any attached message carrying a
calendar part with a response method (REPLY, COUNTER, DECLINECOUNTER, REFRESH), and iCalendar text in the body.
The provider payload has only `from, to, subject, html, attachments`, so a body can never be a calendar part.
Forwarding an invite as received from the mailbox (the original `.eml`, method REQUEST) is still allowed: that is
a person passing on evidence. Test: `node rig/intake/test-no-calendar-response.mjs` (15 checks, sends go to a
local capture server). Intake's own e-mails go only to the recipients in Agent settings, never to a sender.
What this does not stop: a person asking the agent in chat to send an ordinary e-mail to the provider; that is a
plain message with the existing external-recipient confirmation, not a calendar response.

**Do changes arrive as meeting updates?** Unknown. What would settle it, in order of cost:
1. Ops search the department mailbox for mail from the provider's aircraft addresses: are there items shown as
   meeting *updates*, or subjects beginning "Canceled:" / "Cancelada:"? Two minutes, and it answers both questions.
2. The raw sample (`.msg` or `.ics`): it shows `UID`, `SEQUENCE` and how times are zoned. A `SEQUENCE` above 0 on
   any past invite means they do send updates.
3. Ask the provider whether a schedule change edits the same calendar event or deletes and recreates it.
If updates do arrive, they replace polling as the trigger for a re-read (§5); the comparison and the "a person
decides" outcome stay the same. Until then §5 stands.

**Also seen on 2026-10-02**
- **A record appeared late.** Quote 2613767 (quote date 25/09, flight 04/10) is in the list today and was not on
  01/10. Records become visible to our account some time after the quote date, so "new since last run" must be
  judged by quote number seen, not by quote date.
- **The list is a moving window** (flight date ≥ today − 3 days): 2613613 (28/09) has dropped out.
- **Both legs of 2614050 carry the same flight number** (`ORO 1041`), so it does not even distinguish legs
  within a record.

## Method

Authorised by the account holder on 2026-10-01 for a one-session, read-only capture of the eleven records.
`rig/cnair/capture.mjs`: logs in once, parses every protocol response in memory into the widget tree, writes
only an allowlisted projection per record (dates, times, codes, counts, registration, aircraft name, field
names/types; presence markers for everything personal), takes no screenshots, logs network metadata only (no
bodies), scrubs the credentials from everything it writes, then closes the browser and runs the idle probes.
Written output was scanned afterwards for e-mail addresses, phone numbers, multi-word names and remark text:
none present. The raw capture from the earlier session (which did contain crew names) was deleted before this
run; nothing raw exists on disk now. Credentials: `.env` only, never committed, never logged.
