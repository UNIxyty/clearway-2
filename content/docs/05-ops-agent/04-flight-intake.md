---
title: Flight intake
summary: Flight requests that arrive by email. The agent reads them, you check them, and then they are created in Leon.
status: written
roles: People with Ops Agent access
updated: 2026-10-14
related: ops-agent/mailbox, ops-agent/settings
---

<!-- Written 2026-10-13 from the code (components/agent/intake/, agent/lib/intake/, app/intake/answer/) and by doing
     each task on the test system, signed in as a User and as an Admin, with the test Leon and the test CNAIR portal.
     The examples use the invented data of the passenger manifest tests (SAMPLE AVIATION UAB, LY-TST, TST101). -->

Open it from the sidebar: **Ops Agent** › **Flight intake**.

Two kinds of request come in:

- A **handling request**. A client emails the request. The agent reads the email and its attachments.
- A **scheduled flight**. The provider (CNAIR) sends a flight notice. The agent asks ops by email whether to process it. On a yes, it reads the flight from the provider's portal.

A handling request is complete when it arrives. A scheduled flight only tells you where to look.

Nothing goes to Leon until a person checks the request and confirms it.

# Find a request

## Find a flight request
The list shows every request, newest first. Use the tabs, the filters and the search to find one.

1. Choose a tab: **All**, **Needs attention**, **In progress**, **Loaded** or **Closed**. The number on a tab is how
   many requests it has.
2. To see one kind of request, open **Type** and choose **Handling** or **Scheduled**.
3. To see one stage, open **Stage** and choose it.
4. To see one sender, open **From** and choose it.
5. To search, type in the box **Search reference, route, registration, date**. The list shows only the requests that
   match.
6. Press a row. The request opens under it. Press the row again to close it.

:::example A row in the list
Status: Needs review
Type: Handling
From: Sample Aviation Ops
Reference: TST101
Route: EYVI → LSGG
Date: 14 Oct
Legs: 1
Stage: Awaiting review
:::

:::statuses
Awaiting approval (blue): A scheduled flight. Ops were asked by email whether to process it. Nothing is read yet.
Collecting (blue): Ops said yes. The agent is reading the flight from the provider's portal.
In progress (blue): The agent is reading the request.
Needs review (amber): The agent has read the request. A person checks it and confirms it.
Needs you (red): Something stopped the request, or its first flight leaves in less than 2 hours. A person must act now.
Loaded (green): The flights are in Leon.
Cancelled (grey): A person cancelled the request, or the provider cancelled the flight.
Declined (grey): Ops said no to a scheduled flight. Nothing was read and nothing is in Leon.
Expired · no answer (grey): Nobody answered about a scheduled flight in time.
Handled manually (grey): A person closed the request. They do the rest outside the agent.
:::

| Key | What it does |
|---|---|
| `/` | Goes to the search box |
| `j` and `k` | Move down and up the list |
| Enter | Opens the selected request |
| `o` | Opens the original email |
| `[` and `]` | Show the previous and next leg |
| Esc | Closes what is open |

:::how-it-works
The list updates every 15 seconds. **Needs attention** holds the requests that are **Awaiting approval**, **Needs
review** and **Needs you**. The column after the route is the date of the first leg.
:::

## Check that intake is working
Labels at the top of the page show whether the agent can reach the mailbox, Leon and the provider's portal.

1. Look at the top of the page, under the title.
2. Read **Intake mailbox**. **Reachable** means new emails arrive. **Not responding since** a time means they do not.
   Unverified: Not responding was never shown: the mailbox was reachable.
3. Read **Leon API**. **Reachable** means the agent can create flights. **Not responding** means it cannot.
   Unverified: Not responding was never shown: Leon was reachable.
4. Read **CNAIR portal**. **Read after approval** means the agent reads a scheduled flight after ops say yes. **Look-up
   off** means it does not read the portal on this server.
5. If you see **Time zones**, read it. **Out of date · local times not converted** means the agent cannot change local
   times to UTC.
   Unverified: This label never showed: the time zone data was up to date.

:::note When a label is red
Tell a developer.
:::

Unverified: The red states (Not responding, and the Time zones label). On the test system every service was reachable, and the time zone data was up to date. Written from the code.

## Open the original email
See the email as it arrived, with its attachments.

:::warning Opening an attachment with personal data is logged
The list of attachments says which files contain personal data. Opening one is logged under your name, the same as
**Show personal data**.
:::

1. Open the request.
2. Press **Original email**, or press `o`. A panel opens on the right.
3. Read **From**, **To**, **Received** and **Subject**.
4. Read the email's text, under them.
5. To open an attachment, press **Open ↗** next to it. It opens in a new tab.
6. Press **Close**, or press Esc.

:::note When the text says "You don't have access to the agent mailbox"
The email's text is shown only to people with access to the agent mailbox. Ask an admin to add you to **Agent mailbox
access**, in the agent's settings. You can still open the attachments.
:::

:::how-it-works
The agent never changes the email. The panel shows it as it arrived.
:::

# Check a handling request

## Read what the agent found
The review shows each value the agent read, where it read it, and what it checked.

1. Open the request.
2. Read the coloured box at the top. It says the status and what to do next.
3. Under **What the agent read**, read **Treated as the request**. It names the email body or the attachment that holds
   the request.
4. Choose a leg, for example **Leg 1**. Or press `[` and `]`.
5. Read each row: the value, what the request said, the source, and the checks.
6. Read the marks in the last column. The table below says what each mark means.

| Mark | What it means |
|---|---|
| **CROSS-CHECKED** | The agent checked the value against a second source, for example the Leon fleet. |
| **CONVERTED** | The agent changed how the value is written, for example an aircraft name to its ICAO type. |
| **LOW CONFIDENCE** | The agent is not sure. Check the value. |
| **SOURCES DIFFER** | Two sources give different values. You choose one. |
| **UNKNOWN** | The request does not give the value, for example "TBA". |
| **EDITED** | A person changed the value. |
| **LEON REFUSED** | Leon did not accept the value. |

:::example One row
Field: Aircraft type
Value: C56X
The source said: AIRCRAFT: CITATION XLS
Checks: CONVERTED · Name → ICAO type
:::

:::how-it-works
All times are UTC. The **Pipeline** box shows each stage the request went through, with its time. **Can't confirm
yet**, at the bottom, lists what must be fixed before the request can go to Leon.
:::

## Correct a value
Change a value the agent read, or fill in one the request did not give. Your change is marked with your name.

1. Choose the leg.
2. Press the value you want to change.
3. Type the new value.
4. Press Enter. The row is marked **EDITED**, with the old value, your name and the time.
5. If a value is marked **LOW CONFIDENCE** and it is right, press **Looks right** in its row.
   Unverified: No value was marked LOW CONFIDENCE, so Looks right was never pressed.

:::example A corrected passenger count
Field: Pax
Was: 16
Now: 15
Mark: EDITED · was 16 · edited by you, 14:57Z
:::

Unverified: Looks right. No value was marked LOW CONFIDENCE on the test system. Changing a value was checked.

## Choose between two sources that differ
When the email and an attachment give different values, you choose which one is right.

1. Find the row marked **SOURCES DIFFER**.
2. Read both values: **The email says** and the file's name with **says**.
3. Press **Use the email's value**, or press **Use** with the file's name.

The row then shows what you chose, with your name. The request cannot go to Leon until every difference is chosen.

:::example Two passenger counts
The email says: # PAX 2
GenDec_TST101_EYVI-LSGG.pdf says: 0
You press: Use the email's value
:::

## Set the timezone of the times
When the request gives times without a timezone, you say which timezone they are in. The agent does not guess.

1. Find **Which timezone are these times in?**
2. Read the two choices. Each shows the times in UTC and when the flight would leave.
3. Press **They are UTC**, or press **They are local time** with the hours from UTC.
4. Do the same on every leg that asks.

The leg then says **Times set as UTC by** your name, with the times. To choose again, press **Change**.

:::example Times with no timezone
The request gives: STD 09:15 · STA 10:15
They are UTC: STD 09:15 UTC · STA 10:15 UTC
They are local time (UTC+3): STD 06:15 UTC · STA 07:15 UTC
:::

:::how-it-works
Nothing can be sent to Leon while a leg has times without a timezone.
:::

## Choose which file is the request
If the agent read the request from the wrong file, choose the right one. The agent reads the request again.

:::warning The values are replaced
The values on the page are replaced by the new reading.
:::

1. Under **Treated as the request**, find the file you want.
2. Press **Use this file instead**, next to it.
3. Read the question.
4. Press **Read it again**. Or press **Cancel**.
5. Wait. The agent reads the file. **Treated as the request** then shows the file, chosen by you.

## Answer the requested services
For each requested service, choose what we will do: **Provide**, **To confirm** or **Decline**.

1. Find the leg's services, under **Services**.
2. Read each line: what the request said, and how the agent read it.
3. Choose **Provide**, **To confirm** or **Decline**. Or select the line and press `1`, `2` or `3`.
4. If the line has **OUR ANSWER**, type our answer in it.
5. Press Enter.
6. Do the same on each leg.

A line you changed shows **DECIDED BY** your name, and what the agent had chosen.

:::example Two service lines
The request said: CATERING FOR 4 PAX
The agent read it as: Catering (ADEP)
We will: Provide
The request said: Payment CC if credit not CFM
Our answer: `Card accepted on arrival`
:::

:::how-it-works
The services and our answers go into the flight's OPS notes in Leon, marked as not actioned. No checklist item in Leon
is changed.
:::

## Add a service the agent missed
Add a service the request asked for that the agent did not list.

1. Under the leg's services, press **Add a service the agent missed**. A new line appears, marked **Added by you**.
2. In **Name the service**, type the service.
3. Press Enter.
4. Choose **Provide**, **To confirm** or **Decline**.

:::example An added service
Name the service: `Lavatory service`
We will: Provide
:::

## Add or remove a leg
Add a leg the agent did not read, or remove a leg that must not go to Leon.

To add a leg:

1. Press **Add leg**, after the leg tabs. A new leg opens, marked **ADDED**, with no values.
2. Fill in each value, as in [Correct a value](ops-agent/flight-intake#correct-a-value).

To remove a leg:

1. Choose the leg.
2. Press **Remove leg**. The leg is marked **Removed**. It will not be created in Leon. Its values stay on the page.
3. To bring it back, press **Undo remove**.

:::note The last leg cannot be removed
A request keeps at least one leg. A leg you added stays as a crossed-out tab after you remove it.
:::

## Enter a request by hand
When the agent could read no values, enter the flight yourself.

1. Open the request. The box at the top says the agent read **0 legs**.
2. Press **Enter details by hand**. An empty leg opens, marked **ADDED**, and **Can't confirm yet** lists the values
   to fill in.
3. Fill in each value, as in [Correct a value](ops-agent/flight-intake#correct-a-value).

## Show crew and passengers' personal data
Roles: Admin and Developer by default
Show names, dates of birth and passport numbers for 60 seconds.

:::warning Showing personal data is logged
Each time you show it, your name and the time are logged.
:::

1. Under **Crew** or **Passengers**, press **Show personal data**.
2. Read the question.
3. Press **Show for 60 s**. Or press **Cancel**.
4. Read the data. The section says **Visible to you · hides after 60 s · logged**.
5. To hide it sooner, press **Hide now**.

:::how-it-works
Dates of birth and passport numbers are hidden as ••••••••. Passengers' names are hidden too. Without this permission,
the section says **Personal data stays masked: you don't have permission to show it.**
:::

## Correct a passenger's surname and given names
Roles: Admin and Developer by default
Leon needs the surname and the given names apart. If the agent split a name wrongly, correct it.

:::warning This shows personal data
If the data is hidden, you are asked to show it first. That is logged.
:::

1. Under **Passengers**, find the passenger.
2. Press **✎** in the row.
3. If you are asked, press **Show for 60 s**.
4. Read the name as it is **written in the request**.
5. Type the **Surname**.
6. Type the **Given names**.
7. Press **Save split**. Or press **Cancel**.

The row then says **edited by** your name.

:::example A name in the order first, middle, last
Written in the request: ALICE MARIA EXAMPLE
Surname: EXAMPLE
Given names: ALICE MARIA
:::

:::how-it-works
The agent splits names by the order the request gives, for example "FIRST, MIDDLE, LAST NAME". If the request gives
no order, the last word becomes the surname, and the row says **check**.
:::

## Add a crew member or passenger
Add a person the request did not list, on one leg.

1. Choose the leg.
2. Under **Crew** or **Passengers**, press **Add crew member** or **Add passenger**.
3. Fill in **Name**. It is the only value you must fill in.
4. Fill in the other values you have: **Role** (or **Type**), **Sex**, **Date of birth**, **Nationality**, **Passport
   no.** and **Expiry**.
5. Press **Add crew member** or **Add passenger**.

The person shows in the list, marked **Added by** your name. To remove a person you added, press **✕** in their row.

:::example A passenger
Type: Adult
Name: `Bruno Sample`
Sex: M
Date of birth: 14 Jun 1985
Nationality: Latvia
Passport no.: `TEST00002`
Expiry: 03 Mar 2029
:::

:::how-it-works
The person is saved with the request's personal data. It is hidden everywhere, logged without values, and deleted
with the request.
:::

# Send to Leon

## Create the flights in Leon
When every value is right, confirm. The agent creates the flights in Leon.

:::warning Check before you confirm
After this, the flights are in Leon. The agent cannot change or remove them. You change them in Leon.
:::

1. Look at the bottom of the request. If it says **Can't confirm yet**, do what each line says first.
2. Press **Review and create in Leon**. A window opens.
3. Read **Legs**, **Services**, **In Leon**, **People** and **Changed**.
4. Press **Create in Leon** before the time in **Expires in** runs out. Or press **Cancel**.
5. Wait. The box at the top says **Sending to Leon**. You can leave the page.
6. Read the box. **Loaded** means the flights are in Leon. It gives their Leon flight numbers.

For a scheduled flight, the buttons are **Review and send to Leon** and **Send to Leon**.

:::example The box after confirming
Status: Loaded. Both legs are in Leon.
Created: 14:58Z, as flights 90000012 and 90000013
:::

:::how-it-works
The window expires 5 minutes after it opens. For each flight, Leon gets:

- the client's request, word for word, in the flight's OPS notes, marked **NOT ACTIONED**. No checklist status is set: every item stays at Leon's **?**.
- the passengers, as contacts in Leon's address book with their passports. A passenger already in Leon is reused and not changed. The agent looks first for the same passport, then for the same name and date of birth.
- the crew, as a note in the OPS notes. They are not assigned to the flight in Leon.

The agent then emails ops that the request is loaded.

**Why no checklist item is set.** The checklist is your record of what you did. The agent did none of it: it wrote
down what the client asked for. Nobody has arranged the catering or confirmed the fuel yet. Marking an item would
claim work that has not happened. You set each item as you do the work.

**Why the crew are a note.** Leon assigns crew only from its own crew records, by crew member. The agent cannot make
crew records for another operator's people, and Leon has no field for a crew count. So the OPS notes are the only
place this can go.
:::

## Fix a value Leon refused
If Leon refuses a value, nothing is created. Change the value, or send it again unchanged.

1. Read the box at the top. It says what Leon refused, and why.
2. Find the row marked **LEON REFUSED**.
3. If the value is wrong, change it, as in [Correct a value](ops-agent/flight-intake#correct-a-value).
4. If the value is right, press **Resend unchanged**.
5. Do the same on each leg.
6. Press **Review and resend the legs**.
7. Press **Resend to Leon**.

:::example A refused registration
Field: Registration
Value: LY-TST
Mark: LEON REFUSED · Leon: Aircraft is already scheduled at this time.
:::

## Handle a possible duplicate
If the flights may already be in Leon, the agent stops and asks you.

:::cannot-be-undone
**Close · I will update Leon by hand** closes the request at once. It does not ask first.
- The request closes as **Handled manually**.
- The agent sends nothing more to Leon for it.
:::

1. Read the box **Looks like flights already in Leon**.
2. Compare the table: this request on the left, Leon on the right. A row marked **DIFFERS** has different values.
3. If they are the same flights, press **Close · I will update Leon by hand**.
4. Update the flights in Leon yourself.

If they are different flights, press **Not a duplicate · review it** instead. The box then says **Marked not a
duplicate by** your name. Check the request as usual.

:::note "Open … in Leon" cannot be pressed
The button is there, but it does not work yet. Open the flight in Leon yourself, with the flight number in the box.
:::

:::how-it-works
The agent compares the registration, the flight number, the route and the STD (within 3 hours) with the flights in
Leon. The agent cannot change flights that are already in Leon.
:::

## Settle a leg Leon did not answer
If Leon did not answer, the agent does not know whether the leg was created. Check before sending it again.

:::warning Check Leon first
If you mark a leg as not in Leon while it is there, the next send creates it twice.
:::

1. Under **What was sent to Leon**, find the leg marked **Unknown · checking**.
2. Press **Check Leon for this leg**. The agent looks for the leg in Leon.
3. Read the answer. If it says **Not found in Leon**, go on.
   Unverified: Only the Not found answer was seen. The leg was never in Leon.
4. Open Leon. Look for the flight yourself.
5. If it is not in Leon, press **I checked: it is not in Leon**.
6. Send it again, as in [Create the flights in Leon](ops-agent/flight-intake#create-the-flights-in-leon).

While a leg is unknown, nothing is sent again.

:::example One leg, before and after
Before: Unknown · checking. Leon did not answer.
After: NOT in Leon. Marked not in Leon by you after checking Leon.
:::

Unverified: What the page shows when Check Leon for this leg finds the leg in Leon. On the test system the leg was never in Leon. The not-found case was checked.

## Send passengers to Leon again
If a flight is in Leon but its passengers are not, send the passengers again.

1. Under **What was sent to Leon**, find the leg that says **Passengers: Leon did not answer** or **Passengers NOT in
   Leon's passenger database**.
2. Press **Send passengers to Leon**, in that leg.
3. Read the question. It says how many passengers go, and that the flight's passenger list is replaced.
4. Press **Confirm and send**. Or press **Cancel**.
5. Read the leg. It says how many passengers are in Leon.
6. Do the same on each leg that needs it.

:::example The leg after sending
Passengers: 16 in the flight's passenger database in Leon (PAX → DATABASE)
New contacts: 0
Existing contacts reused: 16
:::

:::how-it-works
Contacts made by the first send are reused, not made again.
:::

## See what was sent to Leon
After a request is sent, see what Leon got, and the emails the agent sent about it.

1. Open the request.
2. Find **What was sent to Leon**. Each leg shows its Leon flight number, its passengers and its crew.
3. Read **The request in Leon · OPS notes of each flight**. It is the text written into Leon, word for word.
4. To see what the agent sent and what Leon answered, press **Show** next to **Raw request and response**. Or press
   `r`.
5. Find **Emails the agent sent for this request**. Each email has its type, subject, time and state.
6. To read an email, press it. It opens in **Mailbox**.

Step 6 needs access to the agent mailbox.

:::note When a passenger has no passport in Leon
If a passenger's name and date of birth match a contact in Leon, but the passport does not, the agent reuses the
contact and attaches no passport. The leg then has a line for that passenger: **Passenger 3: the existing contact
holds no passport with this number: none attached (the contact was not edited).** The request still says **Loaded**.
That passenger's passport is not on the flight in Leon.
:::

# Scheduled flights

## Process or skip a scheduled flight
When the provider sends a flight notice, ops decide whether to process it. You can answer on this page.

:::warning The agent reads the portal once, and does not see later changes
After ops say yes, the agent reads the flight from the provider's portal once. If the provider changes the flight
after that, nothing tells you. This is a limit of the agent today. Check the portal yourself before you confirm, and
again after.
:::

1. Open the request marked **Awaiting approval**.
2. Read **What the notification says**: the reference, route, date, departures, passengers and crew lines.
3. Press **Process it**, or press **Skip it**.
4. If you pressed **Process it**, wait. The agent reads the flight from the portal. The request then says **Needs
   review**.
5. Check the request, as for a handling request.
6. Press **Review and send to Leon**.

If you press **Skip it**, the request closes as **Declined**. Nothing is read and nothing goes to Leon.

If nobody answers before the time in the email, the request closes as **Expired · no answer**. To process it after
that:

1. Open the request, in **Closed**.
2. Press **Process anyway**.
   Unverified: No question expired on the test system.

:::note When it says "portal look-up is off on this server"
The agent does not read the portal on this server. Read the reference in the provider's portal yourself.
:::

:::example A notice
Reference: 2619101
Route: EYVI → LSGG
Date: 20/10/26
Departures: 17:00 EYVI
Passengers: leg 1: 2
:::

:::how-it-works
A scheduled flight is the provider telling us that a flight exists in their system. The notice points to the flight;
it is not the flight. So ops are asked first: acting on it means reading another company's system, and not every
notice is one we handle. Then the flight is read from the portal, which holds the operator's own data.

The notice is written for a person to read. It comes in three different layouts, some characters arrive broken (the
º in `#1º`), and its times are local without always saying which local time. The portal record has none of these
problems. So the notice tells the agent which flight; the portal tells it what the flight is.

The crew count is the one value taken from the notice, because the portal does not have it. The arrival time is
worked out from the portal's estimated hours. Passenger names and services are not in the portal: enter them on the
page.
:::

Unverified: Process anyway. No question expired during the test. Written from the code.

## Answer a scheduled flight from the email
The agent emails ops to ask whether to process a scheduled flight. You answer from the email.

:::note Who gets this email
The addresses in **Send intake emails to**, in the agent's settings. You do not need to sign in to the portal to
answer.
:::

1. Open the email **Process?**, with the reference, route and date in its subject.
2. Read it.
3. Press **Yes, process it** or **No, skip it**. A page opens in your browser.
4. Read the flight on the page.
5. Press the button on the page again.
6. Read the answer. **Recorded: process it** means it worked. You can close the page.

You can also reply to the email with yes or no.

:::note Only the first answer counts
If someone answered already, the page says **Already answered**, with who answered and when. Your press changes
nothing. If the page says **This link does not work**, open the email again and use the button, or reply to it.
:::

:::how-it-works
The page needs no sign-in. On a yes, the agent reads the flight and emails you when it is on Flight intake, ready to
check. Nothing goes to Leon without that check.
:::

## Look up a scheduled flight now
If the agent has not found the flight in the provider's portal yet, ask it to look again now.

1. Open the request marked **Collecting**.
2. Press **Look up now**.
   Unverified: This button never showed: no request stayed in Collecting.
3. Wait. The button says **Looking up…**. The request then shows what the agent found.

Unverified: Look up now. On the test system no request stayed in Collecting with the button shown. Written from the code.

## Handle a cancellation from the provider
When the provider cancels a flight that is in Leon, the agent asks whether to cancel it in Leon too.

:::cannot-be-undone
**Cancel in Leon** cancels the flights in Leon.
- Leon keeps each flight as cancelled. It is not removed.
- The agent cannot undo it.
:::

1. Open the request marked **Needs you**. The box says **The provider cancelled this flight. Cancel it in Leon?**
2. Read **Cancellation from the provider**: each leg, its Leon flight number and its time.
3. Press **Cancel in Leon**, or press **Keep the flights**.
   Unverified: Keep the flights was not pressed. Cancel in Leon was.
4. Read the leg. **Cancelled in Leon** means it is done.

A leg that has already departed is not cancelled by the agent. It says **Already departed** and a person decides.

You can also answer from the email the agent sends: **Yes, cancel in Leon** or **No, keep the flights**. This was not
tried on the test system.

:::example A leg after Cancel in Leon
Leg: 1 · EYVI → LSGG
Leon flight: 90000015
State: Cancelled in Leon. Leon keeps it as cancelled, not removed.
:::

Unverified: Keep the flights, and answering a cancellation from the email. The test portal had no unused flight to cancel a second time. Cancel in Leon was checked.

# Close a request

## Read a request again
Ask the agent to read the email again, from the start.

:::warning The values are replaced
The values on the page are replaced by the new reading.
:::

1. Press **Re-extract**.
2. Read the question.
3. Press **Read again**. Or press **Keep it open**.
4. Wait. The agent reads the email again.

**Re-extract** shows only on a handling request with no leg in Leon.

## Mark a request handled manually
Close a request that you finish outside the agent.

:::cannot-be-undone
- The request closes. There is no button to open it again.
- The agent sends nothing more to Leon for it.
:::

1. Press **Mark handled manually**.
2. Read the question.
3. Press **Close request**. Or press **Keep it open**.

The request moves to **Closed**, marked **Handled manually**.

## Cancel a request
Close a request that must not go to Leon.

:::cannot-be-undone
- The request closes as **Cancelled**. There is no button to open it again.
- Nothing is sent to Leon.
:::

1. Press **Cancel request**.
2. Read the question.
3. Press **Cancel request** again. Or press **Keep it open**.

**Cancel request** shows only while no leg is in Leon.
