---
title: Flights
summary: The console's list of flights, where you open one, put it on the big screen, or email yourself its AIP and GEN.
status: written
roles: All roles
updated: 2026-10-14
related: digital-wall/the-wall, digital-wall/notam-check
---

<!-- Written 2026-10-14 from the code (opsboard-react/src/components/console/FlightsPage.jsx,
     digital-wall/lib/aip-send.mjs) and by doing each task on the test system as a User. -->

Open it from the portal's sidebar: **Digital Wall** › **Flights**. It is also the page the console opens on.

## Find a flight
The list shows today's flights, earliest first. Use the search and the filters to find one.

1. To search, type in the box **Search callsign, route, registration…**. The list shows only the flights that
   match.
2. To see one operator's flights, open **Operator** and choose the operator.
3. To see the flights at one airport, open **Airport** and choose the airport. A flight shows if it leaves from or
   arrives at that airport.
4. To see more than today, press **All**. To go back, press **Today**.

If nothing matches, the list says **No flights match**. Change the search or the filters, or press **All**.

| Column | What it shows |
|---|---|
| **CALLSIGN** | The flight number |
| **MARKERS** | The same markers as on the wall: **!**, **CAA**, **WX**, **NTM**, and the ICAO flight type letter |
| **ROUTE** | From and to |
| **REG** | The registration and the aircraft type |
| **OPERATOR** | The operator |
| **ETD** | The time it is expected to leave, in UTC |
| **STATUS** | Where the flight is, for example **Airborne**, **Delayed** or **Scheduled**. **On wall** means it is on the big screen now. |

:::example A search by registration
Search: `LY-TSV`
Result: TST301 EETN → ESSA, and TST302 ESSA → EETN
:::

:::how-it-works
**Today** means the flight's planned departure is on today's date in UTC. **All** shows from yesterday to four days
ahead. The list updates every minute.
:::

## Open a flight's details
See a flight's times, the important notices that apply to it, and the controls to send its documents.

1. Press the flight in the list. Its details open on the right.
2. Read **TIMELINE MARKERS**: the markers the wall shows for it, and what each means.
3. Read **TIMINGS (UTC)**: **STD**, **ETD** and **ATD** for the departure; **STA**, **ETA** and **ATA** for the
   arrival.
4. Read the important notices, if any. The wall shows only **!**; the full text is here.
5. To close the details, press **✕**.

:::note The address keeps the flight
The page's address names the open flight. Copy it to send a colleague straight to the same flight.
:::

## Show a flight on the wall
Roles: User, Admin and Developer by default
Put one flight's details on the big screen in the ops room, for everyone to see.

:::warning One flight at a time
Showing a flight replaces the one on the wall now, even if someone else opened it. The page does not ask first.
:::

1. Open the flight's details.
2. Press **Show on wall**. A message says the flight is on the wall.
3. Read the banner at the top of the page. It says which flight is on the wall, who opened it, and when.
4. To take it off, press **Close on wall**, in the banner or in the flight's details.

:::example The banner
Banner: TST103 · EVRA → EYVI is currently on the wall — opened by a.dispatcher, 2s ago
:::

:::how-it-works
On the wall, the flight's details open on the right: its times, alerts, weather, important notices, CAA details and
limitations. The flight stays there until someone closes it.
:::

## Email yourself the AIP or GEN for a flight
Roles: User, Admin and Developer by default
Get the AIP AD 2 or GEN 1.2 documents for a flight's airports, by email, to your own address.

1. Open the flight's details.
2. Under **SEND AIP / GEN**, choose the airports: **Departure**, **Arrival**, or both. **Departure** is chosen to
   start with.
3. Choose the document: **AIP**, **GEN** or **Both**.
4. Press **Send document**. The lines below show each step.
5. Read the result. **Sent to** with your address means the email has gone.

A document that could not be found is listed as **unavailable**, with the reason. The email still goes with the
documents that were found. To send again, press **Send again**, or **Retry send** if nothing was sent.

:::example A send
Chosen: Departure · EVRA, AIP and GEN
AIP AD-2 · EVRA: found
GEN 1.2 · EVRA: unavailable
Email: Sent to a.dispatcher@example.com, with EVRA-AD2_fetched-2026-10-02.pdf
:::

:::how-it-works
The email goes only to the address you sign in with. It is never shown on the wall. Its subject starts with
`[DOCS]`, then the flight number, the route and the file names. The documents come from the portal's own copies
first, and are fetched from the source if there is no copy. A copy is not refreshed automatically, so each document
says when it was fetched: in the email, in its file name, and in a line across the top of every page. A copy older
than 28 days, one AIRAC cycle, says so.
:::
