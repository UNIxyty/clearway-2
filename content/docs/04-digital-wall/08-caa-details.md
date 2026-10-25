---
title: CAA details
summary: Contact details of civil aviation authorities, shown as CAA on the flights they apply to.
status: written
roles: Everyone can view; changes are Admin and Developer by default
updated: 2026-10-14
related: digital-wall/the-wall
---

<!-- Written 2026-10-14 from the code (opsboard-react/src/components/console/CaaPage.jsx,
     digital-wall/lib/caa-store.mjs) and by doing each task on the test system, as a User and as an Admin. -->

Open it from the portal's sidebar: **Digital Wall** › **CAA details**. Without permission to change it, the page says
**View only.**

[screenshot: digital-wall-caa-details | CAA details: Contact details of civil aviation authorities, shown as CAA on the flights they apply to.]

Each entry is one authority: how to reach it and how long its permits take. A flight it applies to shows **CAA** on
the wall. Its details are in the flight's details on the wall.

## Add an authority
Roles: Admin and Developer by default
Add an authority's contact details and choose which flights it applies to.

1. Press **Add CAA**. The form says **New authority**.
2. Under **CONTACT DETAILS**, fill in what you have: **Authority name**, **Country**, **Validity** (the permit lead
   time), **Function** (choose one), **INFO**, **Contact**, **Phone number(s)**, **Mail**, **AFTN**, **SITA** and
   **VFR flight plan addresses**. A name or a country is required.
3. Under **MATCH FLAGS**, add **Countries**, **Airports (ICAO)**, or both. Type each and press Enter. The line under
   them says how they match.
4. Choose **Applies to** (**Any flight**, **Commercial only**, **Private only**) and **Load** (**All loads**,
   **PAX only**, **Ferry only**).
5. Press **Save changes**. A message says **CAA entry saved · wall updates in seconds**.

:::example An authority for one country
Authority name: `Sample Civil Aviation Authority`
Validity: `72HRS`
Function: Landing
Mail: `permits@caa.example.com`
Countries: Latvia
Result: Affects 4 of the board's flights
:::

:::how-it-works
With only countries, a flight matches if it leaves from or arrives in one of them. With only airports, it matches if
it uses one of them. With both, the flight must touch a listed country and a listed airport. An entry with no match
flags never shows on the wall.
:::

## Find an authority
Find an authority by name, country or airport.

1. Type in **Search authority, country, ICAO…**.
2. To narrow the list, choose a country, a function, or **Any**, **Comm.** or **Private**.
3. Read the line under the list, for example **1 of 1 authorities**. Press **Clear filters** to see them all.
4. Press an authority to open it.

## Edit an authority's details
Roles: Admin and Developer by default
Change an authority's details or match flags.

1. Press the authority in the list.
2. Change what you need.
3. Press **Save changes**. A message says **CAA entry saved · wall updates in seconds**.

:::warning Cancel does not undo your changes
On an existing authority, **Cancel** keeps what you typed on the form. To undo, open another authority without
saving.
:::

## Mark an authority reviewed
Roles: Admin and Developer by default
Record that you have checked an authority's details.

1. Open the authority.
2. Press **Mark reviewed**. It changes to **Reviewed ✓ (click to un-review)**.
3. Press **Save changes**.

:::note Reviews are not shown in the list
The list does not say which authorities are reviewed, and you cannot filter by it.
:::

## Turn an authority on or off
Roles: Admin and Developer by default
Take an authority off the wall without deleting it, or put it back.

1. Open the authority.
2. Switch the switch at the top off. Its flights lose **CAA**.
3. To show it again, switch it back on.

## Delete an authority
Roles: Admin and Developer by default
Remove an authority.

:::cannot-be-undone
The authority and all its details are deleted. There is no bin.
:::

1. Open the authority.
2. Press the bin (**Delete entry**).
3. Read the window. It names the authority.
4. Press **Delete**. A message says **CAA entry deleted**.
