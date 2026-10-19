---
title: On a phone
summary: The portal on a phone has its own pages for the wall, flights, Flight intake, the Ops Agent and airports, with tabs at the bottom. Everything else opens as on a desk.
status: written
updated: 2026-10-20
roles: All roles
related: digital-wall/the-wall, ops-agent/flight-intake, aip-and-documents/airport-search
---

<!-- Written 2026-10-18 from the code (app/m, components/m) and by opening each page on the test system at a phone's
     width, in light and in dark. Marking a check from the phone was done on the test system; the rest was read. -->

Open the portal's address on your phone and sign in as usual. The pages that matter most on the move have a phone
layout: the **Wall**, **Flights**, **Flight intake**, the **Ops Agent** and **airports**. Five tabs at the bottom
move between them. The other pages open as they do on a desk, in your phone's browser.

| Tab | What it shows |
|---|---|
| **Wall** | Today's flights as cards, with what needs attention first |
| **Flights** | Every flight the wall knows, by day, with a search |
| **Intake** | Flight intake, with the number of requests that need you. Only when the Ops Agent is enabled for you |
| **Agent** | The Ops Agent. Only when it is enabled for you |
| **More** | Every other page, by section |

A desk page you open on a phone goes to its phone version by itself: the Ops Agent, Flight intake, airport search and
an airport's page. The wall's big-screen address does the same on a phone, upright or sideways, as long as you are signed in; a screen
approved as a wall screen stays a wall.

:::note The phone shows the same facts as the ops-room screen
The times, the status words and the colours on the phone come from the same rules as the ops-room screen. The phone
shows less, never something different.
:::

## Read the wall on a phone
The **Wall** tab lists today's flights as cards, soonest first.

1. Press **Wall**. The clock in the header is UTC.
2. Read **Attention**: the flights with something still to check, soonest first. The number next to it counts them.
3. Press **All** for every flight in the range, with a **Now** line between what has gone and what is to come.
4. Press **6H** to change the range: **6H** (an hour back, five ahead), **12H** or **DAY**.

Each card shows the time that matters now — **STD**, **ETD**, **CTOT** or **ETA**, and **landed** once it has —
with the callsign, the registration, the route, the status and the parts still open to check.

:::note When the phone cannot reach the wall
A banner says **Not updating**, with the time of the board it is showing. Press **Try again**. The board refreshes
every 30 seconds on its own, and when you come back to the tab.
:::

## Open a flight on the phone
See one flight's times and what has been checked.

1. Press the flight's card. Its page opens: the status, the route, the times, then **Checks**.
2. Read **Checks**: **Important**, **NOTAMs**, **Weather**, **CAA** and **Limitations**, each with what is flagged, or
   who checked it and when.
3. Press **Weather** or **NOTAMs and documents** at the bottom to open the airport's page.
4. Press **‹** to go back to the wall.

## Mark a part of a flight checked on the phone
Roles: User, Admin and Developer by default
Marking from the phone is the same as marking on the wall: it shows on the ops-room screen in a moment, signed with
your name and the time.

:::warning There is no undo
A check stays until the wall's next daily reset. NOTAMs are checked for the whole airport for the day: marking an
airport's NOTAMs from one flight marks them for every flight at that airport today, as on the [NOTAM
Check](digital-wall/notam-check) page.
:::

1. Open the flight.
2. Press the part under **Checks**. A sheet opens from the bottom with what is flagged.
3. Press **Mark … checked**. The sheet closes and the row says who checked it.

If you may not mark checks, the sheet says so and the button is greyed.

## Find a flight
The **Flights** tab lists every flight the wall knows, by day.

1. Press **Flights**. Today's flights are listed by part of the day.
2. Press **Yesterday** or **Tomorrow** for another day.
3. Or type in the search: a callsign, a registration, an airport or a trip number. The matches are highlighted.
4. Press a flight for its record: the times in UTC, the aircraft and the operator.

Times on a phone cannot be edited: the wall holds no changes of its own, and neither does the phone.

## Answer a Flight intake question from the phone
Roles: User, Admin and Developer by default
Only when the Ops Agent is enabled for you.
The **Intake** tab puts what needs you first, with the question and its answers on the card.

1. Press **Intake**. **NEEDS YOU** lists the requests waiting for a decision, each with its question.
2. Answer on the card, or press **Open** to read the request first: its legs, services and people.
3. On the request, press a leg marked **Needs a look** to check its fields; press **Review and send to Leon** when
   nothing is blocking it. The confirmation is the same as on a desk.

Requests moving on their own are listed under **MOVING ON THEIR OWN**; the done and closed ones are folded at the
bottom.

## Ask the Ops Agent from the phone
Roles: User, Admin and Developer by default
Only when the Ops Agent is enabled for you.

1. Press **Agent**. Start with one of the suggestions, or type your question.
2. The agent answers as on a desk, and asks you to confirm before it changes anything.
3. Press the clock icon for your recent threads; press **‹** for a new one.

If the agent cannot be reached, the thread says so and your question stays in the box.

## Open any other page on the phone
Every page has a phone layout. Tables become lists; a row opens its detail.

1. Press **More**. The sheet lists every page you can open, by section, with **Help & support** at the foot.
2. Press a page. Lists open the detail when you press a row; settings pages are rows with a switch or an arrow.
3. What you may change is what you may change on a desk: a switch or button you don't see is one you don't have.

Some things are done on a desk only, where they need room: writing limitations, notices and CAA entries, uploading
documents for the agent, the wall's colours and font, attachments on a report.

## Pages that need a wider screen
Permissions, the debug runner and the component sheet are marked **Desk** in More.

1. Press one. A screen says what the page is and why it needs a wider screen.
2. Press **Back**, or **Email me the link** to send yourself the page's address for a laptop.

## Look up an airport on the phone
1. Press **More**, then **Airport search**. Or open **Weather** or **NOTAMs and documents** from a flight.
2. Type the ICAO or IATA code or the city, or press one of **ON TODAY'S FLIGHTS**.
3. Read the airport's page: **NOTAMs**, **Weather** and **Documents**.

**NOTAMs** opens filtered to the next flight at that airport, an hour either side; turn **Only during …** off to see
them all. Press a NOTAM to read it as published and copy it. **Weather** decodes the METAR into wind, visibility,
ceiling, temperature and QNH, with the TAF below. **Documents** opens the AIP copy the portal holds, with the date it
was fetched; it is not refreshed from the phone.
