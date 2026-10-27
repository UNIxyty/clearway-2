# What went out on 25–27 October, and how to try each piece

Everything below is live on production since 2026-10-27 00:05Z (all four services at ed2a80a0, full run GREEN 69/69,
image check passed, deployed in a confirmed flight gap). "Try it" steps are written for a person using the product,
not the rig. Where a step would write to Leon or email a real address, it says so.

## 1. Flight intake

### 1.1 An email the agent could not read is no longer lost
**Before:** it went to the Mailbox as Failed (most dispatchers cannot open it) and nowhere else, while the label said
"Reachable". **Now:** it becomes a request on Flight intake — **Needs you**, "Could not be read · a person must read the
email" — with the sender and the time, and a plain statement of what to do. The email is also still in the Mailbox.
Production was counted first: 13 emails since intake started, none lost.

**Try it:** send the intake address an email the agent cannot read — for example no text and one attachment that is a
password-protected PDF or a photo of a blank page. Within a few minutes:
- Flight intake › **Needs attention** shows a row from your address, stage "Could not be read · a person must read the email".
- Open it. The red card says *Could not read the request. Nothing has been sent to Leon.* and the stage note says what
  to do: open the original, Re-extract if it is readable, otherwise ask the sender to resend or enter the details by hand.
- **Close** it with *Mark handled manually* — this now works on such a request (it answered 404 before the fix).
- The **Intake mailbox** label at the top reads **1 not read** in red while it is open; hover for the sentence.

### 1.2 The Intake mailbox label tells the truth
It never says "Reachable" any more. It reads **Last email 27 Oct 00:14Z**, **No email yet**, **N not read** (emails of
the last 7 days that could not be read, in red) or **Not set up**.
**Try it:** open Flight intake and read the first label under the title; send any email to the intake address and
watch the time move.

### 1.3 A renewed passport stops for a person
**Before:** a passenger whose name and date of birth matched a Leon contact with a different passport was reused with
no passport, and the request went to Loaded. **Now** the agent stops for that passenger: nothing of the leg's passenger
list is written, the request is Needs you, and the leg shows an amber card — *Passenger 4: Leon has a contact with this
name and date of birth, but another passport. Which is it?* — with both passports by country and expiry (never the
numbers). Two buttons: **Same person · renewed passport** or **Different person**. Then **Send passengers to Leon**: a
renewal adds the request's passport to the contact in Leon and puts it on the flight; a different person gets a new
contact. If Leon refuses the update, the line says so and asks you to add the passport in Leon by hand and send again.

**Try it (writes to Leon — use a disposable flight):** in Leon's cwy-cwy address book create a test contact with an
invented name, a date of birth and passport number A. Send an intake request naming that person with the same date of
birth and passport number B on a disposable flight. Load the leg. The leg shows the amber card; press *Same person ·
renewed passport*, then *Send passengers to Leon* and confirm. In Leon the contact now holds both passports and the
flight's passenger row carries number B. Delete the test contact and the flight afterwards.
**Watch:** the first real renewal — Leon's rule for re-sent passport lists is not documented, so look at the contact in
Leon once: the old passport should still be there, the new one default.

### 1.4 The Process? email names the invite's times
"Times in the invite [object Object], [object Object]" is gone: one time per leg, "08:00 LEBL, 13:30 EGJJ".
**Try it:** the next scheduled-flight notification's "Process?" email, row *Times in the invite*.

## 2. Nothing claims success until it succeeded

### 2.1 Every email we send has a live status
Every email the platform sends is now a row in **Ops Agent › Mailbox › Sent** with a live delivery status from the mail
service's own events: Queued → Sent → Delivered, or Delayed, Bounced, Complained, Failed. Agent emails, the wall's AIP
sends, report emails and NOTAM digests included.
**Try it:** Mailbox › Sent. Each row shows its kind, recipients and status; open one to see the event list with times.

### 2.2 The email card reads that status
**Try it:** in the Ops Agent, ask *Email me the AIP for EVRA* (or any `email_document`), confirm. The card reads
**Handed to the mail service to you@…** and, within about a minute, **Delivered 00:41Z**. To see the other outcomes:
- send to an address that does not exist at a real domain (for example `nobody-xyz@clearway.aero`): the card turns
  red, **NOT delivered: the address bounced it … Check the address and send it again.**
- a send the mail service refuses outright reads **NOT sent to …**, in red, from the first second.
The card never says "Sent" on the click any more.

### 2.3 A Telegram alert that did not go says so, at once
**Try it on production:** open Help & support, start a chat ("it pings now"). With Telegram working you see
*Developer has been notified · Telegram alert delivered HH:MMZ* only after Telegram took the message. If Telegram ever
refuses or cannot be reached, the strip is red: **The Telegram alert was NOT sent — <reason> (HH:MMZ). Nobody has been
pinged. Press Nudge again; if it fails again, use the number on the Help page.** A nudge that fails shows **Nudge NOT
sent — <reason>** in the thread's events; one that goes clears the warning. (Forcing a failure on production means
breaking Telegram; the rig check does that instead.)

### 2.4 A proposal from selected text is acknowledged
**Try it:** in the Ops Agent open any knowledge document in the viewer, close the chat panel, select a sentence and
press **Limitation…**. The panel opens, a note appears where you clicked — *Sent to the Ops Agent. Its proposal is in
the chat — confirm it there, or nothing is created.* — and the proposal card is in the chat. Cancel it. If the chat
cannot be reached the note says *Nothing was sent to the Ops Agent — the chat did not open. Open the chat and ask there.*

## 3. Manifest, AIP, wall

### 3.1 The blank manifest form is always the blank form
**Try it:** in the chat type `/manifest`, press Enter on the first row (*Blank form*). The file is
`PAX-Manifest_blank.pdf`, every row empty, no flight's crew or counts. (It used to hand the model a sentence, and the
model sometimes picked a flight and called it the blank form.)

### 3.2 The AIP cache is refilled
246 EAD AD 2 copies are on the server (5 before), each with its effective date and AIRAC cycle recorded; 244 of the 247
airports in the wall's flight cache that EAD serves, fetched one at a time by hand on 26 October. Still missing: LGMK,
OTHH, UCFM (EAD could not serve them). The 57 airports outside EAD (EGCC, CYQX, HECA, OAKB…) were not fetched.
**Try it:** open `/aip/EVRA` — *This copy is from 03 Sep 2026* (its latest edition) with no "not refreshed" warning; on
the wall, **Send AIP** for any upcoming flight attaches the copy at once with its date in the email and on the PDF.

### 3.3 The scheduled refresh now sees the copies
It listed 0 of them before (it did not know the `EVRA.pdf` file name). Check-only, airports with flights in the next
7 days, downloads off. The first run after the deploy: 41 airports, 22 current, 8 would be fetched in download mode, 11
checks failed (EETN, EGHH, LEMD, LEPA, LEVC, LLBG keep their copies; OMAD, OMDW, RJAA, UMMS, UZTT are outside EAD).
**Watch:** Dashboard › Service monitors › *EAD AIP copies* after the next cycle (00:30Z on the AIRAC date, then +24 h);
if the same six EAD airports fail again, their table rows need a look.

### 3.4 The wall's copy date is fresh within ten minutes
A resolved copy was cached six hours; after a Re-sync the emailed copy could carry the old fetch date. Now ten minutes.

## 4. Deploy safety

- **Images must run before anything restarts.** `scripts/check-image-runs.sh` builds each image and starts a throwaway
  container with no network; it must answer 200 on its health route after 25 s. In `scripts/deploy.sh` after the build
  and in the chain before the gap. `bash scripts/check-image-runs.sh --selftest` on the server proves a dying process is
  caught. (The 25 October crash loop — a Dockerfile without `lib/clients/` — cannot recur unseen.)
- **The flight-gap gate** also accepts a fresh healthy Leon sync run from the wall's health, since the wall writes its
  cache file only when a flight changes. Still fails closed.
- **Compose:** the AIP refresh settings and the wall-data mount are on `aip-sync` (they were on `notam-sync`); the rig
  check insists on it.

## 5. The findings list
`docs/findings-ranked-2026-10-25.md`: every finding in five bands by cost, one line each, fixed items marked. Band 1
(lost and nobody told) is now 0 open, 6 fixed. `docs/docs-writing-lists.md` carries the same marks.

## 6. What to watch this week
1. The first real **renewed passport** decision (§1.3) — look at the contact in Leon once.
2. The first **bounced email** — the card and Mailbox › Sent should say so within a minute.
3. The next **AIP refresh run** — whether the six EAD check failures repeat.
4. **Flight intake › Needs attention** — any "Could not be read" row is an email a person must deal with.
