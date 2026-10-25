---
title: Airport search
summary: Find an airport by its ICAO code, name or country, or browse by region, and open its page.
status: written
updated: 2026-10-14
roles: All roles
related: aip-and-documents/airport-page, aip-and-documents/hidden-airports
---

<!-- Written 2026-10-14 from the code (app/aip/page.tsx, app/api/search/route.ts) and by doing each task on the test
     system as a User. -->

Open it from the portal's sidebar: **AIP & Documents** › **Airport search**.

[screenshot: aip-and-documents-airport-search | Airport search: Find an airport by its ICAO code, name or country, or browse by region, and open its page.]

## Search for an airport
Roles: All roles
Find an airport by its ICAO code, its name or its country.

1. Type in **Airport code / name / country...**. Suggestions appear after two letters.
2. Press a suggestion. The airport's page opens.
3. Or press **Find**. If several airports match, press Escape to close the suggestions. The airports are listed as
   tabs, for example **7 AIRPORTS — SWITCH TAB TO VIEW**. Press one to open it.

If nothing matches, the page says **No airports found**. If an airport you hid matches, the page says so, with
**Restore in Hidden airports**.

:::example Three searches
Typed: `EVRA` opens Riga International Airport
Typed: `Riga` finds Riga International Airport
Typed: `Latvia` lists 7 airports
:::

## Browse airports by region and country
Roles: All roles
Find an airport when you do not know its code.

1. Press **Browse by region & country**. Three steps open below: **Region**, **Country**, **Aerodromes**.
2. Choose a region, for example **Europe**. Or type the country in **Type country or region…**.
3. Choose the country.
4. Press the airport. It is ticked, and the button says **Done · open 1**.
5. Press **Done · open 1**. The airport's page opens.

To look at several, tick them all. The button says, for example, **Done · show 2**. Press it: the airports are listed
as tabs under the search box. Press one to open it.

## Open a recent airport
Roles: All roles
Go back to an airport you opened on this computer.

1. Find **Recently opened**, under the search box. It shows when you have not searched.
2. Press the airport, or **Open**.

The list is kept on this computer and browser only, for the last 8 airports.

## Hide an airport from your browse list
Roles: User, Admin and Developer by default
Take an airport you never need out of your browse list.

1. Press **Browse by region & country**, and go to the country.
2. Press the bin next to the airport (**Hide**, followed by the ICAO code). It leaves the list at once.

Hiding is for you only. The airport also leaves your search results. To bring it back, see
[Hidden airports](aip-and-documents/hidden-airports).

Unverified: Hiding with the real airport list. The test system has none: a list of two airports was added there to
try it, then removed.
