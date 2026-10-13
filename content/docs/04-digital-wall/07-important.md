---
title: Important
summary: Important notices that apply to matching flights. They show as ! on the wall until someone checks them.
status: written
roles: Everyone can view; changes are Admin and Developer by default
updated: 2026-10-14
related: digital-wall/the-wall, digital-wall/limitations
---

<!-- Written 2026-10-14 from the code (opsboard-react/src/components/console/ImportantPage.jsx,
     digital-wall/lib/important-store.mjs) and by doing each task on the test system, as a User and as an Admin. -->

Open it from the portal's sidebar: **Digital Wall** › **Important**. Without permission to change it, the page says
**View only.**

An important notice is a standing instruction, kept word for word as it was written. A flight that matches it shows
**!** on the wall. The full text is in the flight's details, on the wall and on the **Flights** page.

## Add an important notice
Roles: Admin and Developer by default
Write a notice and choose which flights it applies to.

1. Press **New entry**.
2. Type the title in **Entry title**.
3. Under **BODY TEXT (VERBATIM FROM BULLETIN)**, type or paste the full text.
4. Under **MATCH CRITERIA**, add one or more: **Countries**, **Airports (ICAO)**, **Operators**, **Registrations**.
   Type each and press Enter.
5. Choose the **Direction**: **Any**, **Departure** or **Arrival**.
6. To limit it to some days, choose the dates under **Valid window**.
   Unverified: Dates were not tried. The test notices had none.
7. To limit it by flight, choose **Flight type** (**Any**, **Commercial**, **Private**) and **Load** (**All**,
   **PAX**, **Ferry**).
8. Press **Save changes**. A message says **Important entry saved**. The notice says how many flights it affects,
   for example **Affects 4 of the board's flights**.

:::example A notice for one airport
Entry title: `EVRA: fuel only by prior request`
Body text: `Fuel at EVRA must be requested 24 hours before arrival through the handling agent.`
Airports (ICAO): EVRA
Direction: Any
:::

:::how-it-works
Inside one kind of criteria, any value can match. Across kinds, all must match: for example, an airport and an
operator means flights of that operator at that airport. A notice with no criteria matches nothing.
:::

Unverified: The valid window. The rest was checked.

## Find notices that need review
Notices brought in from the ops bulletin need a person to check them before they are trusted.

1. Tick **Needs review only**. The number after it says how many there are.
2. To search, type in **Search important limitations…**. It searches the title, the text and the criteria.
3. Press a notice to open it.

Each row says **Reviewed** or **Needs review**, and **Active**, **Inactive** or **Expired**.

## Edit a notice
Roles: Admin and Developer by default
Change a notice's title, text or criteria.

1. Press the notice in the list.
2. Change what you need.
3. Press **Save changes**. A message says **Important entry saved**.

## Mark a notice reviewed
Roles: Admin and Developer by default
Record that you have checked a notice.

:::warning It saves everything on the form
Marking a notice reviewed also saves any other change you made on the form.
:::

1. Open the notice. It says **Needs review**.
2. Read it, and check its criteria.
3. Press **Mark reviewed**. A message says **Marked reviewed**.

The bottom of the notice says who added it and who confirmed it, with the time in UTC.

:::note Marking a notice unreviewed again
Press **Human-reviewed**, at the top of the notice. It changes to **Needs review**. Press **Save changes**.
:::

## Add or remove an attachment
Roles: Admin and Developer by default
Keep a file with a notice, for example the bulletin it came from.

:::cannot-be-undone
Removing an attachment deletes the file. The page does not ask first.
:::

1. Open the notice. Save it first if it is new.
2. Under **ATTACHMENTS**, press **Attach file**.
3. Choose the file. It can be a PDF, a Word or Excel file, a CSV, text, an image or an email, up to 10 MB.
4. To remove a file, press the bin next to it (**Remove attachment**).

Unverified: Attaching and removing files. The test system has no file storage, so every upload fails there.

## Turn a notice on or off
Roles: Admin and Developer by default
Take a notice off the wall without deleting it, or put it back.

1. Open the notice.
2. Switch the switch at the top off. The row says **Inactive**, and its flights lose the **!**.
3. To show it again, switch it back on.

## Delete a notice
Roles: Admin and Developer by default
Remove a notice.

:::cannot-be-undone
The notice is deleted at once. The page does not ask first. It cannot be brought back from the console.
:::

1. Open the notice.
2. Press the bin (**Delete entry**). The notice leaves the list.
