---
title: The wall
summary: Today's flights as a timeline, one row per aircraft. The same wall runs on the ops-room screen and on tablets; a phone opens the portal's own phone pages, with the same facts.
status: written
roles: All roles
video: the-wall | 30 seconds
updated: 2026-10-18
related: digital-wall/flights, digital-wall/notam-check, digital-wall/settings
---

<!-- Rewritten 2026-10-14 from the code (opsboard-react/src: DisplayApp, Board, FlightPill, FlightInfoTab,
     FlightOverlay, components/mobile/*) and by doing each task on the test system, as a User and as an Admin, with
     the test system's own Leon stand-in (rig/wall/mock-leon.mjs: invented flights TST101–TST402). -->

Open it from the portal's sidebar: **Digital Wall** › **Open wall**. The wall reads its flights from Leon. Nothing on
the wall changes Leon.

[screenshot: digital-wall-the-wall | The wall: Today's flights as a timeline, one row per aircraft. The same wall runs on the ops-room screen and on tablets; a phone opens the portal's own phone pages, with the same facts.]

The wall picks its layout from the screen:

| Screen | Layout |
|---|---|
| 1920 pixels wide or more, or 1280 or more with a mouse or trackpad | The full board |
| A phone, when you are signed in | The portal's phone pages open instead, on the **Wall** tab ([On a phone](dashboard/on-a-phone)) |
| A phone-sized screen approved as a wall screen | A full-screen timeline sideways, the reduced timeline upright |
| A tablet, or any other touch screen | A reduced timeline |

# On the ops-room screen

## Read the board
Each row is an aircraft. Each flight is a pill on its row, placed by its times.

1. Read the clocks at the top. **UTC** is blue. The local clock for this station is amber.
2. Read the date under the logo, on the left. It is today's date in UTC.
3. Find the aircraft's row. The registration is on the left, with the operator under it.
4. Read the pill. Its colour says where the flight is. The **TIMELINE AGENDA**, on the left, says what each colour
   means.
5. Read the times under the pill. A late time has a plus, for example `+45`. An early time has a minus.
6. Read the airport codes on the pill. Their colour is the weather at that airport, as in the **WX AGENDA**.
7. Read the markers before and after the pill. The table below says what each one means.

| Marker | What it means |
|---|---|
| A number in a circle, before the callsign | A limitation applies. The number is its number in the list on the left. |
| **!** | An important notice applies. |
| **CAA** | Civil aviation authority details apply. |
| **NTM** | The airport has NOTAMs that nobody has checked today. |
| A callsign in italics, with a red outline | The flight is not confirmed in Leon. |
| Black and white stripes at the end of a pill | The gap between the planned time and the real or expected time. |

:::statuses
Not departed (grey): The flight has not left.
Airborne (blue): The flight has taken off.
Delayed (amber): The flight is late and has not left.
CTOT (blue): The flight waits for its take-off slot.
Arrived (grey): The flight has landed.
:::

:::example One aircraft's row
Row: LY-TST · Sample Aviation
Pill: TST103 · EVRA → EYVI · 23:05 → 00:05
Markers: 1 · ! · CAA · NTM
:::

:::how-it-works
The wall asks for new flights every minute, and Leon tells it about changes as they happen. There is nothing to
refresh. The view moves back to the present 10 seconds after anyone touches it.
:::

## Read the NOTAM sign
The sign at the top right shows whether today's NOTAM check is done.

1. Look at the top right of the wall.
2. Read the sign. **!!! CHECK NOTAM !!!**, in red, means some airports are not checked yet. **NOTAM CHECKED**, in
   green, means every airport is checked.

:::note When there is no sign
Before the day's check has run, the wall shows no sign.
:::

:::how-it-works
The sign changes when the last airport is checked on the [NOTAM Check](digital-wall/notam-check) page.
:::

## Open a flight's details
See what a flight's markers are about: its limitations, important notices, NOTAMs, weather and CAA details.

1. Press the flight's pill. Its details open under the aircraft's row.
2. Read each part: **LIMITATIONS**, **IMPORTANT**, **NOTAM**, **WEATHER** and **CAA**. The number after a name says
   how many items it has.
3. To close the details, press **✕**. Or press the pill again.

:::how-it-works
Only one flight's details are open at a time. They close by themselves after 3 minutes.
:::

## Mark a part of a flight checked
Roles: User, Admin and Developer by default
Tell everyone that you have read one part of a flight's details.

:::warning There is no undo
A check cannot be taken back. It stays until the next daily check resets it.
:::

1. Open the flight's details.
2. Find the part you have read, for example **IMPORTANT**.
3. Press **Checked ✓**, at the right of that part's name.

What changes:

- **IMPORTANT**, **NOTAM** and **CAA**: the part leaves the details, and its marker leaves the pill.
- **LIMITATIONS**: the part stays, marked **✓ checked**. The number on the pill turns pale.
- **WEATHER**: the part stays, marked **✓ checked**. The airport codes keep their weather colour.

:::how-it-works
Checks are for everyone: once you check a part, it is checked on every wall. They reset every day at the daily NOTAM
check time, 10:00 Riga time unless [Settings](digital-wall/settings#set-the-notam-digest) say otherwise.
:::

## Check everything on a flight at once
Roles: User, Admin and Developer by default
Mark every part of a flight checked in one press.

:::warning There is no undo
The checks cannot be taken back. They stay until the next daily check resets them.
:::

1. Open the flight's details.
2. Press **Check all ✓**, at the top right of the details.

## See who checked a flight
Each check keeps who made it and when.

1. Open the flight's details.
2. Read the **Checked:** line at the bottom. It lists each checked part, with the person and the time in UTC.

:::example A Checked line
Checked: Important ✓ a.dispatcher 21:04Z · NOTAM ✓ a.dispatcher 21:04Z
:::

:::note The person is shown by their email
The line shows the first part of the person's email address, before the @.
:::

## Read a limitation
Limitations are listed on the left of the wall, numbered as they are on the pills.

1. Find **PERMANENT:** on the left. Every limitation in force today is listed under it.
2. Press a limitation's title. Its full text opens under it.
3. Press the title again to close it.

:::note None in force
If no limitation is in force, the list says **None active**.
:::

## Put a flight on the big screen
Roles: User, Admin and Developer by default
Show one flight's details large on the ops-room screen. You do this from the console.

1. In the portal's sidebar, open **Digital Wall** › **Flights**.
2. Press the flight.
3. Press **Show on wall**. The flight's details open on the right of the wall.
4. To take it off, press **Close on wall**.

The steps are on the [Flights](digital-wall/flights#show-a-flight-on-the-wall) page.

## Bring a new screen onto the wall
A screen with nobody signed in can show the wall after an admin approves it.

1. On the new screen, open the wall's address. The screen says **Waiting to be approved** and shows a code of four
   letters and numbers.
2. Ask an admin to approve the screen. They check that the code matches.
3. Wait a few seconds. The wall appears on the screen.

To sign in as yourself instead, press **…or sign in as a user instead**.

:::how-it-works
An approved screen can only show the wall. It cannot check anything or change anything. Admins approve and remove
screens in [Settings](digital-wall/settings#approve-a-new-screen). The code changes after 15 minutes.
:::

# On a phone

The wall's address on a phone, when you are signed in, opens the portal's phone pages on the **Wall** tab — upright or
sideways: cards instead of the timeline, what needs attention first, and the same checks. How to read and mark from
there is in [On a phone](dashboard/on-a-phone). A small screen approved as a wall screen in
[Settings](digital-wall/settings#approve-a-new-screen) is not a phone: it keeps the timeline whichever way it is
mounted.

## Open the wall on a phone
Get to the phone pages from the wall's own address.

1. Open the wall's address on your phone and sign in if asked. The portal's **Wall** tab opens, upright or sideways.
2. Read and mark from there, as in [On a phone](dashboard/on-a-phone).
3. To see the timeline instead, use a tablet or the ops-room screen. A screen approved as a wall screen in
   [Settings](digital-wall/settings#approve-a-new-screen) always keeps the timeline, whichever way it is mounted.

# On a tablet

## Zoom the tablet's timeline
Choose how much time the tablet shows.

1. Press **3H**, **6H** or **DAY**, at the top.
2. Scroll sideways to move in time.

## Open the legend and limitations
See what the colours mean, and the limitations in force.

1. Press **Legend & limits**, at the top right. A panel opens on the right.
2. Read **WX AGENDA**, **TIMELINE AGENDA**, and the limitations under **PERMANENT:**, each with its full text.
3. Press **✕** to close the panel.

## Open a flight on the tablet
See one flight's times and notices, and mark it checked.

1. Press the flight's pill. Its details open.
2. Read the times and the notices.
3. To check everything on the flight, press **Mark checked**.
4. To close the details, press **✕**.

## Open the wall's settings from a tablet
Open the console's Settings page from the tablet.

1. Press **⚙**, in the bar on the left. The console's **Settings** page opens.

A screen that an admin approved without anyone signed in cannot open Settings. It asks someone to sign in first.
