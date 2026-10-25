---
title: Limitations
summary: The airport and flight restrictions the wall shows on matching flights, as numbered circles on their pills.
status: written
roles: Everyone can view; changes are Admin and Developer by default
updated: 2026-10-14
related: digital-wall/the-wall, digital-wall/important
---

<!-- Written 2026-10-14 from the code (opsboard-react/src/components/console/LimitationsPage.jsx, leon-sync.mjs) and by
     doing each task on the test system, as a User and as an Admin. -->

Open it from the portal's sidebar: **Digital Wall** › **Limitations**. Without permission to change it, the page
says **View only.**

[screenshot: digital-wall-limitations | Limitations: The airport and flight restrictions the wall shows on matching flights, as numbered circles on their pills.]

A limitation is a short text that applies to some flights: by flight, by airport, by country, or a mix. On the wall,
each one has a number. The number shows in a circle on every flight it applies to, and the list on the left of the
wall gives its title.

## Add a limitation
Roles: Admin and Developer by default
Write a limitation and choose which flights it applies to.

1. Under **New limitation**, type a **Title**. It is the line shown on the wall.
2. Type a **Description**: the full text. People read it when they open the limitation.
3. Under **Match type**, choose **Flight**, **Airport**, **Country** or **Mixed**.
4. Add the flights, airports or countries it applies to. The table below says how for each match type.
5. To limit it to some days, choose a **Start date** and an **End date**. Leave them empty for no end.
   Unverified: Dates were not tried. Every test limitation had no dates.
6. To make it permanent, switch **Permanent** on. A permanent limitation cannot be deleted.
7. Press **Save limitation**. A message says it is saved. It appears in the list, with how many flights it matches.

| Match type | How to add a target |
|---|---|
| **Flight** | Type in **Search callsign / registration / ICAO…**, and choose the flight. |
| **Airport** | Type the ICAO code in **Add ICAO…**, and press Enter. |
| **Country** | Type the country in **Add country…**, and press Enter. |
| **Mixed** | Any of the three. |

Look at **WALL SIDEBAR PREVIEW**, on the right, to see the text before you save.

:::example An airport limitation
Title: `EVRA: apron 3 closed for works`
Description: `Park on apron 1 only. Expect towing of up to 20 minutes.`
Match type: Airport
Airports: EVRA
Result: always · matches 4 flights
:::

:::how-it-works
A flight matches if any of the targets fit: one of the chosen flights, or a flight leaving from or arriving at a
chosen airport or country. A limitation with dates counts only on those days, by today's date in UTC.
:::

Unverified: Start and end dates. The rest was checked.

## Edit a limitation
Roles: Admin and Developer by default
Change a limitation's text, its targets or its dates.

:::warning Saving turns it on
If the limitation is switched off, saving your changes switches it on again, and it shows on the wall.
:::

1. Press the pencil on the limitation's row (**Edit limitation**). The form says **Edit limitation**.
2. Change what you need.
3. Press **Save changes**. The list shows the new text.

To stop without saving, press **Cancel**.

## Turn a limitation on or off
Roles: Admin and Developer by default
Take a limitation off the wall without deleting it, or put it back.

1. Find the limitation's row.
2. Switch it off. It leaves the wall's list, and its circles leave the flights. The row is shown pale.
3. To show it again, switch it back on.

## Delete a limitation
Roles: Admin and Developer by default
Remove a limitation.

:::cannot-be-undone
The limitation leaves the wall at once. It cannot be brought back from the console.
:::

1. Press the bin on the limitation's row (**Delete limitation**).
2. Read the window. It names the limitation.
3. Press **Delete**. A message says **Limitation deleted**.

:::note Permanent limitations cannot be deleted
Their bin is greyed out: **Permanent limitation — cannot be deleted. Turn it off with the toggle instead.**
:::
