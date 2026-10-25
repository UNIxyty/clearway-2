---
title: Aircraft
summary: The aircraft the wall knows about, and which of them it shows.
status: written
roles: Everyone can view; changes are Admin and Developer by default
updated: 2026-10-14
related: digital-wall/operators, digital-wall/the-wall
---

<!-- Written 2026-10-14 from the code (opsboard-react/src/components/console/AircraftPage.jsx, leon-sync.mjs) and by
     doing each task on the test system, as a User and as an Admin. -->

Open it from the portal's sidebar: **Digital Wall** › **Aircraft**. The list shows the aircraft of active operators
that have a flight in the next 7 days. Without permission to change it, the page says **View only.**

[screenshot: digital-wall-aircraft | Aircraft: The aircraft the wall knows about, and which of them it shows.]

## Find an aircraft
Find an aircraft by its registration or its operator.

1. Type in the box **Search registration or operator…**. The list shows only the aircraft that match.
2. To see one operator's aircraft, open **Operator** and choose the operator.
3. Read the row: **REGISTRATION**, **OPERATOR**, **UPCOMING (7 DAYS)** (how many flights in the next week),
   **NEXT FLIGHT** (date and time in UTC) and **SHOW ON WALL**.

The line at the top counts every aircraft, for example **4 on wall · 0 hidden**.

## Show or hide an aircraft on the wall
Roles: Admin and Developer by default
Take one aircraft's row off the wall, or put it back.

1. Find the aircraft.
2. Switch its **On wall** switch off. Its row leaves the wall at once, and the switch says **Hidden**.
3. To show it again, switch it back on.

:::example Hiding one aircraft
Aircraft: LY-TSW
Message: Hidden LY-TSW — lane removed
:::

## Show or hide every aircraft at once
Roles: Admin and Developer by default
Show or hide all the aircraft in the list in one press.

:::warning Only the aircraft in the list change
**Show all** and **Hide all** change only the aircraft the search and the **Operator** filter show now. Clear the
search first to change every aircraft. The message says "All aircraft" in both cases. The page does not ask first.
:::

1. Clear the search, and set **Operator** to **All operators**.
2. Press **Hide all** or **Show all**.
3. Read the count at the top, for example **0 on wall · 4 hidden**.

## Delete an aircraft
Roles: Admin and Developer by default
Remove an aircraft and its flights from the wall.

:::cannot-be-undone
Deleting an aircraft:
- removes its flights from the wall at once
- keeps it hidden: if Leon sends its flights again later, they stay off the wall until someone shows the aircraft again
:::

1. Press the bin on the aircraft's row (**Delete aircraft**).
2. Read the window. It names the aircraft.
3. Press **Delete**. A message says the aircraft is deleted, and it leaves the list.

:::how-it-works
Aircraft come from Leon, so the wall cannot remove one for good. A deleted aircraft comes back to this list, hidden,
when it next has a flight within 7 days. Switch it on to show it again.
:::
