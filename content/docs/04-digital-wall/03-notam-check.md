---
title: NOTAM Check
summary: The daily NOTAM check, airport by airport. When every airport is checked, the wall's sign reads NOTAM CHECKED.
status: written
roles: All roles
updated: 2026-10-14
related: digital-wall/the-wall, digital-wall/settings
---

<!-- Written 2026-10-14 from the code (opsboard-react/src/components/console/NotamCheckPage.jsx,
     digital-wall/lib/notam-check.mjs) and by doing each task on the test system, as a User and as an Admin, with
     invented NOTAMs (rig/wall/seed-portal.mjs). -->

Open it from the portal's sidebar: **Digital Wall** › **NOTAM Check**.

Each day the check lists the airports of the day's flights, one card each. You read each airport's NOTAMs and mark
the airport checked. When the last one is checked, the wall's sign turns green.

:::statuses
CHECK NOTAM (red): Some airports are not checked yet. The wall shows !!! CHECK NOTAM !!!.
NOTAM CHECKED (green): Every airport is checked. The wall shows NOTAM CHECKED.
:::

## Read an airport's NOTAMs
Each card shows the NOTAMs that matter first.

1. Find the airport's card. It shows the airport, the flights that use it, and how many NOTAMs are flagged, for
   example **3 flagged**.
2. Read the flagged NOTAMs. Each has its number, its group in capitals (for example **CLOSURE / PROHIBITION**), its
   **Start**, **Expiry** and **Issued** times in UTC, and its text. The words that caused the flag are coloured.
3. To read every NOTAM, press **Show all NOTAMs**. NOTAMs outside today's window are shown pale.
4. To go back, press **Show flagged only**.

:::example One flagged NOTAM
Number: A9002/26
Group: CLOSURE / PROHIBITION
Start: 13 Oct 18:00Z
Expiry: 15 Oct 02:00Z
Text: APRON 3 STANDS 31-34 NOT AVBL.
:::

:::how-it-works
A NOTAM is flagged when it contains a word from the alert filter and is valid between now and 24 hours from now.
NOTAMs marked PERM count as always valid. The keyword groups and their colours are listed at the top of the page.
Admins change the words in [Settings](digital-wall/settings#change-the-alert-filter).
:::

## Mark an airport's NOTAMs checked
Roles: User, Admin and Developer by default
Record that you have read an airport's NOTAMs.

1. Read the airport's NOTAMs.
2. Press **Mark checked** on the airport's card. The card shows **CHECKED**, with your name and the time.
3. Read the count at the top, for example **1 of 4 airports checked · 3 remaining**.

When you check the last airport, a message says **All airports checked — wall sign flipped to NOTAM CHECKED**.

:::how-it-works
Checking an airport removes the **NTM** marker from that airport's flights on the wall. The reminder emails stop
when every airport is checked.
:::

## Undo an airport's check
Roles: User, Admin and Developer by default
Take back a check made by mistake.

1. Find the checked airport's card.
2. Press **Undo**. A message says the airport is unchecked.

If every airport was checked, the wall's sign goes back to **!!! CHECK NOTAM !!!**, and the reminder emails start
again.

## Retry an airport that failed
Roles: User, Admin and Developer by default
When an airport's NOTAMs could not be read, ask for them again.

1. Find the card that says **Fetch failed**.
2. Press **Retry**. The button says **Retrying…**.
3. Read the message: the airport and how many NOTAMs are flagged, or that it is **still failing**.

A check already made on that airport is kept.

## Run the check now
Roles: Admin and Developer by default
Build today's list of airports again and read every airport's NOTAMs.

:::warning It sends the NOTAM email again
Each run sends the daily NOTAM email to everyone on its list.
:::

1. Press **Run check now**, at the top. The page says **FETCHING NOTAMS…** while it works.
2. Read the message, for example **NOTAM check complete · 7 airports, notification sent to** and the addresses.

Checks already made today are kept.

:::note When the page says "NOTHING TO CHECK"
The day's check found no airports, because there were no flights yet. The page then shows **Go to Flights** and no
**Run check now** button. The next daily check runs at the usual time.
:::

:::how-it-works
The check runs by itself every day at 10:00 Riga time, unless [Settings](digital-wall/settings#set-the-notam-digest)
say another hour. It takes the departure and arrival airports of the day's flights on the wall. Then it sends an
email to the digest list saying that the check is waiting. The email has no NOTAMs in it, only counts and a link to
this page. Until every airport is checked, a reminder goes out every 120 minutes, unless Settings say otherwise.
:::
