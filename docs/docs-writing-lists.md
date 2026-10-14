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

- **Ops Agent: an email that failed to send is shown as sent.** The card turned to "Sent · Confirmed by you" while the
  mailer logged "send FAILED: Resend request failed (401)" and the audit has an `email.failed` row (seen on the rig on
  2026-10-14, when the rig's key was refused). A dispatcher would believe the manifest went out. The docs tell people
  to ask the recipient to confirm.
- **Ops Agent: after a confirmed change, /undo in the same chat said "There is no confirmed change to undo — the
  limitation was never created"**, while the limitation was on the wall. Asking in words in a new chat did undo it
  (seen). The docs give the asking-in-words route.

- **Help & support: the urgent-help number is a placeholder.** Outside 06:00–22:00Z the help page and the urgent
  form tell people to "call +371 2 000 000" (`components/help/helpApi.ts:229`, shown by `HelpHome.tsx:83` and
  `HelpComposer.tsx:253`). A Latvian number has 8 digits after +371; this has 7. Someone blocked at night is told to
  call a number that cannot ring. The docs do not repeat it.

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

- **Ops Agent: internal text on screen.** Every reply shows the model id and token counts ("claude-sonnet-4-6 ·
  standard · by router · 769 in · 73 out"), raw tool names ("list_limitations", "get_weather didn't answer"), and under
  a change the tool's instruction to the model ("NOT DONE YET … Do not ask them to confirm in words, and do not call
  this tool again with a token."). Cards show raw ids ("Undo action d67477a1", attachment ids) and "Blocks [object
  Object]" (all seen).
- **Ops Agent › Mailbox: attachments open without mailbox access** (code: `agent/lib/intake/api.mjs:465` checks
  agent use only), and **Download .eml and Forward give unmasked personal data without the reveal permission**
  (code). The 60-second reveal limit is enforced only in the browser (code).
- **Ops Agent › Settings shows another person's email and spend** ("Heaviest user this month: …") and the raw model
  id (seen).

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
- **Admin › Users: a bulk password reset skips developers' rows without saying so.** An admin selects 2 rows, one a
  Developer; the bar says "2 selected", the toast says "Password reset sent to <one address>", and nothing says the
  other was skipped (`app/admin/users/page.tsx:173` filters protected rows out). Seen on the rig.
- **Help & support: when the Telegram alert does not go out, an urgent report does not say so.** After **Send — it pings
  now** the thread says "Not notified yet · Send your first message and the developer gets a Telegram alert", though the
  person has just sent it. Nothing says the alert failed (`app/api/help/threads/route.ts:126`; seen on the rig, which
  has no Telegram).
- **Help & support: "Nudge again" says "Nudge sent to Telegram" whether or not it was sent.** The route does not look
  at Telegram's answer (`app/api/help/threads/[id]/presence/route.ts:45`). Seen on the rig, which has no Telegram.
- **Help & support: "How do I…" searches only the old Digital Wall guide** (`digital-wall/guide/index.html`, read by
  `app/api/help/guide-search/route.ts:23`), not the portal's docs. "hide an airport" offered three wall flight-row
  sections. One title showed a raw `&amp;` ("The marker row &amp; weather colouring").
- **Help & support: opening a report form saves its empty template as a draft.** The next visit says "Draft restored",
  though nothing was typed, and **Discard** asks "Discard this draft?". Seen on the rig.
- **Help & support: the urgent card shows the phone number all day,** not only outside reading hours (see Serious).
- **Help & support: every report form logs React error #419** in the browser (seen on the rig). Nothing visible breaks.
- **Help & support: the attached details say "ROLE ops"** for a person whose role is User.
- **Developer › Agent access: the words "Show revoked grants" are not part of the switch.** Pressing them does nothing;
  only the switch beside them works (`components/agent/AgentAccess.tsx:166-167`). The page also logs React errors
  #422 and #425 (seen on the rig), likely from times written in the computer's local time.
- **Developer › Saved replies: "used" counts insertions, not sends.** A reply put in the box and not sent counts as used
  (`components/help/DeveloperInbox.tsx:198`). **⇧⏎** also sets the paired status at once, before anything is sent.
- **Admin › Users: "1 filter are hiding 4 people"** (grammar).
- **Admin › Permissions: the note on a changed box gives local time** ("Last set by …, 14 Oct, 13:22"), while the change
  log beside it gives UTC ("14 Oct 10:22Z"). Seen on the rig.
- **Admin › Email logs lists nothing new.** Since Pick'em was removed (commit fa076e49, 2026-10-10) no code writes to
  `email_logs`; the page only reads it (`app/api/admin/email-logs/route.ts`). Its subtitle, "Most recent 200 email send
  attempts", reads as if it covered the portal's emails today. Its times are local and carry no zone.
- **Admin › Service status editor: an unsaved change is lost after 10 seconds, with no message.** The page reloads its
  rows every 10 s and overwrites what you chose (`app/admin/service-status/page.tsx:37,55`). Seen on the rig.
- **Maintenance page: "Last updated: 10/14/2026, 1:28:00 PM"** is the reader's local time in US format, and the page
  always adds "We are improving reliability and performance." Seen on the rig.
- **Account › Profile: "Check your email" when the password link was not sent.** The profile calls
  `/api/auth/password/forgot`, which answers ok even when sending failed (so the public page does not reveal which
  addresses exist; `app/api/auth/password/forgot/route.ts:31`). For a signed-in person this hides a real failure. Seen
  on the rig, which has no mail server.
- **Account › Profile: an emptied display name stays in the sidebar** until the tab is closed (the sidebar only takes a
  new name when it is not empty; `components/portal/Shell.tsx:89`). Seen on the rig.
- **Airport search: any four-letter search is read as an ICAO code.** "Riga", "Oslo" and "Nice" find nothing; "Riga
  Int" finds EVRA (`app/api/search/route.ts:562`, and the same rule at :519 for the database). Seen on the rig.
- **Airport search: a hidden airport is still found by search.** Hiding filters only the database rows; the built-in
  list is not filtered (`app/api/search/route.ts:566-575`). The Hidden airports page says hiding "removes it from your
  own search and browse lists". Seen on the rig, with a two-airport table added for the test.
- **Airport search: "Done · open 2" opens one airport.** Ticking several opens only the first. Seen on the rig.
- **Airport search: after Find, the suggestions stay open over the result tabs** until Escape. Seen on the rig.
- **Airport page: setup text on the dispatcher's screen.** When a source is not set up, the cards say "Set
  NOTAM_SYNC_URL to your self-hosted NOTAM sync service (e.g. http://notam-sync:3001)", "Set WEATHER_SYNC_URL…" and
  "Set AIP_SYNC_URL…" (`app/api/notams/route.ts:90`). `/api/weather` answers with a Node stack trace in its error
  detail. Seen on the rig.
- **Hidden airports: times in the reader's local time, US format** ("10/14/2026, 3:45:36 PM").
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

- **Ops Agent › Settings › Who can do what is a fixed table**, not the real permissions: it says "No" under Approve KB
  for both developers, minutes after a developer approved a document (seen). The docs warn about it.
- **Ops Agent: the NOTAM card shows raw times** ("2610112100 → 2610162100"), History previews show raw Markdown
  ("**68 passengers**"), a manifest question carries "(flight_id cwy-cwy:880003)", and after an undo the record still
  says "Undo isn't automatic — ask me to revert it" (all seen).
- **Ops Agent: typing a command name after / and pressing Enter can pick another command** ("/notam" chose /flight)
  (seen).
- **Ops Agent › Mailbox: the no-access page says "0 people have access today"**, counting only the reader list (seen);
  searching for a number in an email (a reference) finds nothing, words do (seen); a failed "Process as handling
  request" leaves the email Failed with a raw server path as its reason (seen).
- **Developer › Agent access: a failed grant shows the raw database error**, and times are local with AM/PM, not UTC
  (seen).

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

- **Ops Agent: "Limitation…" and "IMPORTANT…" on selected document text send the request to the agent, but its card
  is shown nowhere**, so nothing is created and it expires (seen twice; the Activity log has the two proposals). The
  docs give the asking-in-words route.
- **Ops Agent: a React "too many updates" error (#185) is thrown each time a question is sent** (seen); the page keeps
  working.
- **Ops Agent › Knowledge base: only text files can be approved.** PDF and Word uploads get no text, so they can never
  be approved or indexed, though the upload card accepts them (code; the docs warn).
- **Ops Agent › History: a chat cannot be renamed or deleted**, though the permission text promises deleting (code).

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

**Ops Agent**
- Flight intake: Enter details by hand is now checked (2026-10-14); the six other items stay.
- Chat: Open full page, Minimise, resizing and closing the panel; the first-time microphone question (the test
  browser had allowed it); Cancel and the hold-to-delete card; where Open source opens the document; Export CSV (no
  test table had more than 10 rows).
- History: opening a chat from the panel.
- Knowledge base: Reference only.
- Mailbox: the message after creating a scheduled-flight request (the request was created).
- Activity log: someone else's row as an admin; the 60-row export limit.
- Settings: saving model tiers, receiving addresses and the retention period (each would have changed or emptied the
  rig mid-run); separate Mac and Windows shortcuts.


**AIP & Documents**
- Airport search and Hidden airports: hiding and restoring with the real airport list. The rig has no `airports`
  table; a two-airport table was added for the test, then removed.
- Airport page: a Re-sync that works; getting and downloading GEN 1.2; reading and refreshing NOTAMs and weather. The
  rig has no AIP, GEN, NOTAM or weather sync service, so each showed its failure.

**Admin**
- Users: that the password reset emails arrive (the rig has no mail server; the bulk count was checked with the
  server's answer replaced).
- Agent sites: what the requester sees in the extension (the requests were sent without the extension).
- Email logs: real rows. The rig was given the table and two invented rows; in production nothing has written to it
  since 2026-10-10 (see list 1).

**Developer**
- Inbox: answering from Telegram.
- Agent access: nothing left (revoked rows and the off switch were checked on 2026-10-14, then put back).

**Account & Settings**
- Profile: the email-change email and its link; the password email and the Set a new password page.

**Help & support**
- Get help: the Telegram alerts for urgent reports and chats.
- Your threads: the Telegram message behind Nudge again. "Developer has been notified" was set in the rig's database to
  reach Nudge again and No answer for five minutes.
