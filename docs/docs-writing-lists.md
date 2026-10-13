# Docs writing: what the portal does badly, and what was not verified

Kept while the docs are written (step 10). Each section adds to both lists. Nothing here is fixed by the docs work:
these are for the owners to decide. "Rig" is the test system (`rig/`).

## 1. What the portal does badly

### Serious

- **Flight intake: an email the agent could not read never reaches Flight intake, and nobody is told.** It goes to the
  Mailbox as failed ("Could not read the request: The model did not respond in time."), which most dispatchers cannot
  open, while the **Intake mailbox** label still says Reachable. A lost flight request with no sign of it. Seen twice
  on the rig on 2026-10-13.
- **Flight intake: the "Process?" email (E1) shows `Times in the invite [object Object], [object Object]`.** It goes
  out with every scheduled flight, to the people whose job is to trust it. The departures became per-leg objects and
  are joined as text (`agent/lib/intake/notify.mjs:66`).

- **Digital Wall › Reports: typing in the search box on a computer blanks the whole page.** TypeError "_.trim is not
  a function": the box passes the event instead of the text (`opsboard-react/src/components/console/ReportsPage.jsx:604`).
  Seen on the rig on 2026-10-14. The phone version works. The docs warn people not to use it.

### Missing safeguard

- **Flight intake: a renewed passport does not stop for a person.** Agreed rule: when the name and date of birth match
  a Leon contact but the passport differs, stop and ask a person (a manifest goes to border authorities, and a name
  and date of birth cannot tell a renewed passport from two people). What the code does
  (`agent/lib/intake/leon-pax.mjs:192-201`): reuses the contact, attaches **no passport** (not the old one), and adds
  a line per passenger, "the existing contact holds no passport with this number: none attached". The request still
  goes to **Loaded**, with no blocker. Seen on the rig on 2026-10-13: 16 passengers, 32 such lines over two legs.
  Less dangerous than attaching the old passport (an incomplete manifest is visible, a wrong one is not), but not what
  was agreed.

### Security

- **Dashboard › Service monitors shows raw error text, including whole HTML pages.** When a check fails, the block
  shows the upstream error as it came back, for example a full HTML error page. Anything an upstream puts in an error
  (a token in a URL, a passenger name in a response) lands on every user's dashboard. Found 2026-10-13.

- **Digital Wall: raw server and upstream text on screen.** Seen on the rig: a failed NOTAM airport shows the
  upstream JSON with server setting names (`… CREWBRIEFING_USERNAME / CREWBRIEFING_PASSWORD are not configured …`);
  the NOTAM page footer says "Email problem: NOTAM_DIGEST_TO is not set — configure the recipient in the backend
  .env."; a failed attachment upload shows `{"message":"name resolution failed"}`; a failed report email showed a
  local file path. (code) the wall shows "Data unavailable: …" with a developer setting name
  (`opsboard-react/src/services/timelineApi.js:52-57`); a failed AIP send shows up to 200 characters of the portal's
  answer (`digital-wall/lib/portal-client.mjs:64`).
- **Digital Wall: the ops room account's email address is shown to every signed-in person** on Settings ("signed in
  as …", and on the Main wall row). Seen.
- **Digital Wall: AIP / GEN sends broadcast the requester's email address to every connected screen**, wall displays
  included (code: `digital-wall/lib/aip-send.mjs:41` → `lib/sse.mjs:83-91`).

### Hard to undo, and the product does not ask first

- **Dashboard › Reset to default** replaces your arrangement at once. No question, no undo.
- **Flight intake › Close · I will update Leon by hand** (duplicate box) closes the request at once. No question.
  Closed requests have no button to open them again. (`Mark handled manually` and `Cancel request` do ask.)

- **Digital Wall › Important › Delete entry** deletes at once, no question (seen). It goes to a bin only the Ops Agent
  can restore; the console has no bin.
- **Digital Wall › Important › removing an attachment** deletes the file at once, no question (code).
- **Digital Wall › Settings › Reset main wall to defaults**, **Reset all colours** and **Remove clock** act at once
  (seen). **Revoke** a screen asks through the browser's own confirm box, not the console's (seen).
- **Digital Wall › Aircraft › Hide all / Show all** act at once, and only on the rows the search shows, while the
  message says "All aircraft hidden" (seen: 1 of 4 hidden).
- **Digital Wall › Flights › Show on wall** replaces the flight someone else put on the wall, no question (code).
- **Digital Wall: checks on the wall cannot be undone.** No button takes back a "Checked ✓" (code; the server accepts
  it). On NOTAM Check, the server toggles, so a stale screen's "Mark checked" can clear a colleague's check (code).

### Wrong or misleading text

- **Flight intake: after Re-extract or Use this file instead, the header still shows the first reading's time**, and
  never "extraction 2". The API lists readings newest first (`agent/lib/intake/api.mjs:130`); the page takes the last
  one (`components/agent/intake/intake-review.tsx:37`). The values shown are the new reading's.
- **Flight intake: a flight that left weeks ago "Departs in less than a minute".** A negative time falls back to that
  text (`components/agent/intake/intake-detail.tsx:312`, `fmtMin`).
- **Flight intake: a year ahead reads "Departs in 8754 h 13 min".**
- **Flight intake: after "I checked: it is not in Leon", the page says Leon refused the leg.** The leg reads "Refused
  by Leon. Not created." and the box "Leon refused all 2 legs. Leon said: Marked not in Leon by …". Leon said nothing;
  a person marked it.
- **Flight intake: "Leon said: Leon: Aircraft is already scheduled …"** — "Leon" twice.
- **Flight intake: the box says "Stopped: 1 value not given … has no Date"** while the leg says "5 to fix" (a request
  with no flight details).
- **Flight intake: when passengers did not reach Leon, the box says "Add them to the flight in Leon by hand"**, while
  the leg offers **Send passengers to Leon**.
- **Flight intake: a value changed and put back is still listed under "Changed" in the confirm window.**
- **Flight intake: the crew's "Show personal data" question says "passengers' names"**.
- **Flight intake: Type filter, "Scheduled · not collected yet"** — the hint is out of date.
- **Flight intake: the Stage filter lists raw stage texts, including people's names** ("Declined by
  rig-access-user", one option per person).
- **Dashboard: developer-style names in Service monitors.**
- **Dashboard: the changelog shows a user ID (a UUID) instead of a name.**
- **Dashboard: the changelog block has two names** ("Your changelog" and "Changelog — everyone").

- **Digital Wall: the console shows "user" under every account's name**, admins included
  (`opsboard-react/src/ConsoleApp.jsx:191` shows `user.role`; the wall knows the real role). Seen.
- **Digital Wall › Limitations: saving an edit to a limitation that is off turns it on** (seen;
  `LimitationsPage.jsx:204-218` never sends isActive). The docs warn about it.
- **Digital Wall › Limitations and Reports: the delete windows say "This cannot be undone"**, but both go to a bin
  the Ops Agent can restore (code).
- **Digital Wall: the "Checked:" line shows the email before the @, and a time with no Z** (seen).
- **Digital Wall › Aircraft: the OPERATOR column shows the raw operator id** (`cwy-cwy`), not its name (seen).
- **Digital Wall › Operators: the banner says "use Re-register"; the button is "Re-register all"**, and the pause
  message uses the operator's old name after a rename (seen).
- **Digital Wall › Webhooks: the page says "the 60s poll"**; the poll is every 120 s (code).
- **Digital Wall › Settings › Colours: messages show internal token names** ("stateAirborne → #3b82f6") (seen).
- **Digital Wall on a phone: NOTAM validity in raw form**, "Valid: 2610112000 -> 2610162000" (seen).
- **Digital Wall: "Screen ID dev-…" raw id** on the waiting screen and in Devices (seen).
- **Digital Wall › CAA details: Cancel on an existing authority keeps what was typed** (seen). The docs say so.
- **Digital Wall › Reports: the email's "Open this report" link opens the list, not the report** (code).

### Missing or not working

- **Flight intake: people without mailbox access cannot read the email they review.** The Original email panel says
  "You don't have access to the agent mailbox". Mailbox access is admins plus a list; Flight intake is for everyone.
- **Flight intake: "Open … in Leon" is always disabled** ("Leon link not configured").
- **Flight intake: Loaded and closed requests still show Add leg, Add crew member, Add passenger and Use this file
  instead.**
- **Flight intake: a leg you added and removed stays as a crossed-out tab.** It cannot be deleted.
- **Flight intake: two SOURCES DIFFER rows (Crew and Pax), only Pax blocks confirming.** Choosing the email's "TBA"
  for crew makes it Unknown, and that does not block. Possibly intended.
- **Dashboard: moving a block with the arrow keys skips a press.**
- **Dashboard: Recently used shows airports only.**

- **Digital Wall › NOTAM Check: a day that starts with no airports cannot be re-run from the page.** "NOTHING TO
  CHECK" shows only Go to Flights; flights added later wait for the next day's run (seen).
- **Digital Wall: Mark checked on phones and tablets, and Checked ✓ on the wall, swallow a refusal** without a word
  (code: `FlightDetailSheet.jsx:77`, `FlightInfoTab.jsx:42`).
- **Digital Wall › Settings › Devices: a screen cannot be renamed**; the name is set at approval only (code).
- **Digital Wall: dead permission `wall.webhooks.delete`**, and Force sync is open to everyone by default (seen).
- **Digital Wall › CAA details: no way to find unreviewed authorities** (seen: no filter, nothing in the list).
- **Digital Wall: keyboard and screen readers.** The My view / Main wall rows cannot be reached by keyboard; the font
  choices and the × on words and addresses have no accessible names (seen in the page's markup).

## 2. What could not be verified on the rig

Each is also marked on its page with an `Unverified:` line.

**Dashboard › The dashboard**
- Nothing. (Flights today and Delayed were tried on 2026-10-13, once the rig's wall had flights from the mock Leon.)

**Ops Agent › Flight intake**
- Check that intake is working: the red states (Not responding, Time zones). Everything was reachable.
- Correct a value: Looks right. No value was LOW CONFIDENCE.
- Enter a request by hand: the agent always found a value, so the button never showed.
- Settle a leg Leon did not answer: the case where the check finds the leg in Leon.
- Process or skip a scheduled flight: Process anyway (no question expired).
- Look up a scheduled flight now: no request stayed in Collecting with the button.
- Handle a cancellation from the provider: Keep the flights, and answering from the email. The mock portal had no
  unused future flight to cancel again.

**Digital Wall**
- The wall, phone: the empty Now tab, and MVT OVERDUE and the empty Attention tab (never happened on the rig).
- Operators: that a paused operator leaves the Webhooks page; switching webhooks off before a delete.
- Limitations and Important: date windows (no test entry had dates).
- Important: attachments. The rig's Supabase runs without file storage (`rig/supabase/config.toml`, `[storage]
  enabled = false`); turning it on means restarting the rig's database stack with new images. Your decision.
- Webhooks: the health labels other than Healthy and Registering…; history with events (the rig's Leon stand-in never
  pushes events).
- Reports: a new category; removing a preset, and wrong preset rows being dropped.
- Settings: dragging clocks into a new order; the digest hour and reminder pickers; losing unsaved filter words.

