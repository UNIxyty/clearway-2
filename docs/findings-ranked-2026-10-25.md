# The findings, ranked by what it costs when it goes wrong (2026-10-25)

Every entry of `docs/docs-writing-lists.md` § 1, placed in one of five bands and given one line saying why. Fixed items
stay in their band, marked **Fixed** with the date. Nothing is dropped.

- **Band 1 — lost and nobody told.** Something that should have happened did not, and no one can see that it did not.
- **Band 2 — wrong reaches a document leaving the building.** A manifest, an AIP copy, a Leon record read by others.
- **Band 3 — someone is shown something false.** They may act on it.
- **Band 4 — someone is stopped from doing their job.** Visible, but blocking.
- **Band 5 — everything else.** Cosmetic, internal, or a convenience.

| Band | Open | Fixed | Total |
|---|---|---|---|
| 1 | 3 | 3 | 6 |
| 2 | 0 | 2 | 2 |
| 3 | 15 | 6 | 21 |
| 4 | 6 | 2 | 8 |
| 5 | 53 | 5 | 58 |
| **All** | **77** | **18** | **95** |

## Band 1 — lost and nobody told

- **Fixed 2026-10-25.** Flight intake: an email the agent could not read never reached Flight intake. Why: a flight
  request vanishes into a Mailbox most dispatchers cannot open, and the label said Reachable. (Production was checked
  first: 13 inbound emails since the start, 12 processed, 1 ignored, none failed or without a request — nothing was lost.)
- Ops Agent: an email that failed to send is shown as **Sent · Confirmed by you**. Why: the dispatcher believes the
  manifest went out; the recipient never gets it, and nothing says so.
- Help & support: when the Telegram alert does not go out, an urgent report does not say so. Why: someone blocked at
  night thinks the developer was pinged; nobody was.
- Ops Agent: **Limitation…** and **IMPORTANT…** on selected document text send a request whose card is shown nowhere.
  Why: the person believes a limitation was created; it expires unseen.
- Gap: no way to see that an email we sent failed to arrive (Email logs removed, outbound failures shown nowhere). Why:
  an approval email that bounces, or a client confirmation that never arrives, is invisible. Nothing built; a decision.
- **Fixed 2026-10-14.** Account › Profile: "Check your email" when the password link was not sent. Why: a real failure
  hidden from a signed-in person.

## Band 2 — wrong reaches a document leaving the building

- **Fixed 2026-10-25.** Flight intake: a renewed passport did not stop for a person. Why: a manifest goes to border
  authorities; a name and date of birth cannot tell a renewed passport from two people. The agent now stops for that
  passenger, shows both passports (country, expiry), and a person decides; on "renewal" the request's passport is added
  to the contact in Leon and goes on the flight.
- **Fixed in part 2026-10-25.** AIP documents go stale and nothing refreshes them. Why: the wall's Send AIP emails a
  cached copy; a superseded chart can leave the building. Built: refresh on the AIRAC schedule for airports with flights
  in the next 7 days, check-only until `AIP_REFRESH_DOWNLOADS=on` (EAD terms, your decision); every copy shows its date
  and a failed refresh is said on the page, in the email and in the agent's answers.

## Band 3 — someone is shown something false

- **Fixed 2026-10-25.** Flight intake: the "Process?" email showed `Times in the invite [object Object]`. Why: the
  people whose job is to trust that email read nonsense where the times should be.
- Ops Agent: after a confirmed change, **/undo** said there is no confirmed change to undo while the limitation was on
  the wall. Why: the person believes nothing happened.
- Digital Wall: a stale screen's **Mark checked** toggles and can clear a colleague's NOTAM check; checks cannot be
  undone. Why: a flight reads as checked, or unchecked, against what was done.
- Digital Wall: **Mark checked** on phones and **Checked ✓** on the wall swallow a refusal without a word. Why: the
  person believes the check was recorded.
- Digital Wall › Aircraft: **Hide all** acts on the filtered rows while saying "All aircraft hidden". Why: the message
  is untrue.
- Digital Wall › Limitations: saving an edit to a limitation that is off turns it on. Why: a limitation appears on the
  wall that nobody switched on.
- Digital Wall: the console shows "user" under every account's name, admins included. Why: a false role.
- Ops Agent › Settings › Who can do what is a fixed table, not the real permissions. Why: it says "No" where the answer
  is yes.
- Two flight counts on the same screen (dashboard 7 and 0, agent 20 and 2). Why: both are presented as "today" and
  "delayed"; one of them is wrong for the words used.
- Flight intake: after Re-extract, the header still shows the first reading's time. Why: the page misdates its values.
- Flight intake: a flight that left weeks ago "Departs in less than a minute". Why: a false countdown.
- Flight intake: after "I checked: it is not in Leon", the page says "Refused by Leon … Leon said: Marked not in Leon by …".
  Why: Leon said nothing; a person did.
- Flight intake: the box says "Stopped: 1 value not given" while the leg says "5 to fix". Why: two counts, one wrong.
- Flight intake: when passengers did not reach Leon, the box says add them by hand while the leg offers **Send
  passengers to Leon**. Why: one of the two instructions is wrong.
- Admin › Users: a bulk password reset skips developers' rows without saying so. Why: the toast says sent; one was not.
- Help & support: **Nudge again** says "Nudge sent to Telegram" whether or not it was. Why: the person stops asking.
- **Fixed 2026-10-14.** Dashboard › Service monitors showed raw error text, whole HTML pages included.
- **Fixed 2026-10-14.** Digital Wall showed raw server and upstream text (setting names, JSON, file paths).
- **Fixed 2026-10-14.** Admin › Permissions gave local time beside a UTC log.
- **Fixed 2026-10-14.** Admin › Email logs listed nothing new while reading as if it did.
- **Fixed 2026-10-14.** Airport search found hidden airports.
- **Fixed 2026-10-14.** Airport page showed setup text ("Set NOTAM_SYNC_URL…") to dispatchers.
- **Fixed 2026-10-14.** Developer › Agent access showed the raw database error on a failed grant.

## Band 4 — someone is stopped from doing their job

- Digital Wall › Reports: typing in the search box on a computer blanks the whole page. Why: the page is unusable until
  reloaded.
- Help & support: the urgent-help number is a placeholder (+371 2 000 000, seven digits). Why: someone blocked at night
  is told to call a number that cannot ring.
- Flight intake › **Close · I will update Leon by hand** closes at once, no question, and closed requests cannot be
  reopened. Why: one slip ends the request for good.
- Flight intake: people without mailbox access cannot read the email they review. Why: the review needs the source.
- Digital Wall › NOTAM Check: a day that starts with no airports cannot be re-run from the page. Why: flights added
  later wait for tomorrow's run.
- Ops Agent › Knowledge base: only text files can be approved; PDF and Word get no text. Why: the upload is accepted and
  then can never be used.
- **Fixed 2026-10-14.** Admin › Service status editor lost an unsaved change after 10 seconds.
- **Fixed 2026-10-14.** Airport search read any four-letter word as an ICAO code ("Riga" found nothing).

## Band 5 — everything else

Internal text, cosmetics, conveniences, and exposures that stay inside the building (marked *privacy*).

- Digital Wall: the ops room account's email address is shown to every signed-in person (*privacy*). Why: an internal
  address exposed, nothing false.
- Digital Wall: AIP / GEN sends broadcast the requester's email address to every connected screen (*privacy*).
- Ops Agent › Mailbox: attachments open without mailbox access; Download .eml and Forward give unmasked personal data
  without the reveal permission; the 60-second reveal limit is browser-only (*privacy*). Why: staff only, but the
  permission does not hold.
- Ops Agent › Settings shows another person's email and spend, and the raw model id (*privacy*).
- Ops Agent: model id, token counts, raw tool names, the tool's instruction to the model, raw ids, "Blocks [object
  Object]" on screen. Why: internal text, no decision rests on it.
- Flight intake: the Stage filter lists raw stage texts including people's names (*privacy*).
- **Fixed 2026-10-14.** Portal: `GET /api/aip/sync` asked for no permission (any signed-in account could trigger a
  fetch); the permissions check now examines every endpoint.
- Dashboard › Reset to default replaces the arrangement at once. Why: undoable by hand, nobody misled.
- Digital Wall › Important › Delete entry deletes at once (bin via the Ops Agent only).
- Digital Wall › Important › removing an attachment deletes the file at once.
- Digital Wall › Settings › Reset main wall / Reset all colours / Remove clock act at once; Revoke uses the browser's box.
- Digital Wall › Flights › Show on wall replaces someone else's flight without asking.
- Flight intake: a year ahead reads "Departs in 8754 h 13 min". Why: true, unreadable.
- Flight intake: "Leon said: Leon: …" — Leon twice.
- Flight intake: a value changed and put back is still listed under Changed.
- Flight intake: the crew's "Show personal data" question says "passengers' names".
- Flight intake: Type filter hint "Scheduled · not collected yet" is out of date.
- Flight intake: "Open … in Leon" is always disabled.
- Flight intake: Loaded and closed requests still show Add leg, Add crew member, Add passenger, Use this file instead.
- Flight intake: a leg added and removed stays as a crossed-out tab.
- Flight intake: two SOURCES DIFFER rows, only Pax blocks confirming (possibly intended).
- Help & support: "How do I…" searches only the old wall guide; a title shows a raw `&amp;`.
- Help & support: opening a report form saves its empty template as a draft.
- Help & support: the urgent card shows the phone number all day.
- Help & support: every report form logs React error #419.
- Help & support: the attached details say "ROLE ops" for a User.
- Developer › Agent access: the words beside the switch are not part of it; React errors #422/#425.
- Developer › Saved replies: "used" counts insertions, not sends; ⇧⏎ sets the status before sending.
- Admin › Users: "1 filter are hiding 4 people".
- **Fixed 2026-10-14.** Maintenance page: local time in US format and a fixed reliability line.
- Account › Profile: an emptied display name stays in the sidebar until the tab is closed.
- **Fixed 2026-10-14.** Airport search: "Done · open 2" opened one airport.
- Airport search: after Find, the suggestions stay open over the result tabs.
- **Fixed 2026-10-14.** Hidden airports: local times in US format.
- Dashboard: developer-style names in Service monitors.
- Dashboard: the changelog shows a user ID instead of a name.
- Dashboard: the changelog block has two names.
- Dashboard: moving a block with the arrow keys skips a press.
- Dashboard: Recently used shows airports only.
- Digital Wall › Limitations and Reports: the delete windows say "This cannot be undone", but both go to a bin.
- Digital Wall: the "Checked:" line shows the email before the @, and a time with no Z.
- Digital Wall › Aircraft: the OPERATOR column shows the raw operator id.
- Digital Wall › Operators: banner says "use Re-register", the button is "Re-register all"; the old name after a rename.
- Digital Wall › Webhooks: "the 60s poll" is every 120 s.
- Digital Wall › Settings › Colours: internal token names in messages.
- Digital Wall on a phone: NOTAM validity in raw form.
- Digital Wall: "Screen ID dev-…" raw id.
- Digital Wall › CAA details: Cancel on an existing authority keeps what was typed; no way to find unreviewed authorities.
- Digital Wall › Reports: the email's "Open this report" link opens the list.
- Digital Wall › Settings › Devices: a screen cannot be renamed.
- Digital Wall: dead permission `wall.webhooks.delete`; Force sync open to everyone by default.
- Digital Wall: keyboard and screen readers (My view / Main wall rows, unnamed controls).
- Ops Agent: the NOTAM card shows raw times; History previews show raw Markdown; "(flight_id cwy-cwy:880003)"; after an
  undo the record still says undo is not automatic.
- Ops Agent: typing a command name after / and pressing Enter can pick another command.
- Ops Agent › Mailbox: "0 people have access today"; a number in an email cannot be searched; a failed Process leaves a
  raw server path as the reason.
- Ops Agent: a React "too many updates" error (#185) on each question sent.
- Ops Agent › History: a chat cannot be renamed or deleted, though the permission text promises deleting.
