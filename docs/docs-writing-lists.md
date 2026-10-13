# Docs writing: what the portal does badly, and what was not verified

Kept while the docs are written (step 10). Each section adds to both lists. Nothing here is fixed by the docs work:
these are for the owners to decide. "Rig" is the test system (`rig/`).

## 1. What the portal does badly

### Security

- **Dashboard › Service monitors shows raw error text, including whole HTML pages.** When a check fails, the block
  shows the upstream error as it came back, for example a full HTML error page. Anything an upstream puts in an error
  (a token in a URL, a passenger name in a response) lands on every user's dashboard. Found 2026-10-13.

### Hard to undo, and the product does not ask first

- **Dashboard › Reset to default** replaces your arrangement at once. No question, no undo.
- **Flight intake › Close · I will update Leon by hand** (duplicate box) closes the request at once. No question.
  Closed requests have no button to open them again. (`Mark handled manually` and `Cancel request` do ask.)

### Wrong or misleading text

- **Flight intake: the "Process?" email (E1) shows `Times in the invite [object Object], [object Object]`.** The
  departures became per-leg objects and are joined as text (`agent/lib/intake/notify.mjs:66`). Ops get this in every
  scheduled-flight question.
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

### Missing or not working

- **Flight intake: people without mailbox access cannot read the email they review.** The Original email panel says
  "You don't have access to the agent mailbox". Mailbox access is admins plus a list; Flight intake is for everyone.
- **Flight intake: an email the agent could not read never appears on Flight intake.** It goes to the Mailbox as
  failed ("Could not read the request: The model did not respond in time."), which most dispatchers cannot open. The
  Intake mailbox label still says Reachable. Seen twice on the rig on 2026-10-13 (model time-outs).
- **Flight intake: "Open … in Leon" is always disabled** ("Leon link not configured").
- **Flight intake: Loaded and closed requests still show Add leg, Add crew member, Add passenger and Use this file
  instead.**
- **Flight intake: a leg you added and removed stays as a crossed-out tab.** It cannot be deleted.
- **Flight intake: two SOURCES DIFFER rows (Crew and Pax), only Pax blocks confirming.** Choosing the email's "TBA"
  for crew makes it Unknown, and that does not block. Possibly intended.
- **Dashboard: moving a block with the arrow keys skips a press.**
- **Dashboard: Recently used shows airports only.**

## 2. What could not be verified on the rig

Each is also marked on its page with an `Unverified:` line.

**Dashboard › The dashboard**
- Flights today and Delayed: the rig has no Leon connection for the wall.

**Ops Agent › Flight intake**
- Check that intake is working: the red states (Not responding, Time zones). Everything was reachable.
- Correct a value: Looks right. No value was LOW CONFIDENCE.
- Enter a request by hand: the agent always found a value, so the button never showed.
- Settle a leg Leon did not answer: the case where the check finds the leg in Leon.
- Process or skip a scheduled flight: Process anyway (no question expired).
- Look up a scheduled flight now: no request stayed in Collecting with the button.
- Handle a cancellation from the provider: Keep the flights, and answering from the email. The mock portal had no
  unused future flight to cancel again.
