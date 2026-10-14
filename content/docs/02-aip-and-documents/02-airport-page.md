---
title: Airport page
summary: One airport on one page: its AD 2 document, GEN 1.2, NOTAMs and weather.
status: written
updated: 2026-10-14
roles: All roles
related: aip-and-documents/airport-search, ops-agent/chat
---

<!-- Written 2026-10-14 from the code (components/portal/AirportView.tsx) and by doing each task on the test system as a
     User. The test system has a stand-in AD 2 document and no AIP, GEN, NOTAM or weather sync service, so every fetch
     from a source failed there. -->

Open it from [Airport search](aip-and-documents/airport-search). The top shows the ICAO code, name, country,
coordinates and a **Map** link, and when the AIP copy was fetched and when it expires. The document is on the left,
with the tabs **AD 2** and **GEN**. NOTAMs and weather are on the right.

## Download the AD 2 PDF
Roles: All roles
Save the airport's AD 2 document.

1. Press **Download PDF**, at the top. It says **Downloading…** while it works.
2. Wait. A copy kept by the portal comes at once. Otherwise it is fetched from the source, which can take 1 to 2
   minutes.

The file is saved as the ICAO code followed by `_AIP_AD2.pdf`.

:::example A download
Airport: `EVRA`
File: `EVRA_AIP_AD2.pdf`
:::

## Re-sync the AD 2 from the source
Roles: All roles
Fetch the AD 2 again from the source, when the copy may be old.

1. Press **Re-sync**, at the top. It says **Re-syncing…**.
2. Wait. The document area shows each step. Some sources are slow.
3. When it is done, the date at the top changes.
   Unverified: A re-sync that works. The test system has no AIP source.

If it fails, a red line says **Re-sync failed — the document shown is the previous copy from**, followed by the date.
The earlier copy stays on screen. Press **×** to close the line.

Unverified: Step 3. On the test system every re-sync failed, as described.

## Open GEN 1.2
Roles: All roles
Read the country's entry, transit and departure rules.

1. Press the tab **GEN**, followed by the country, for example **GEN · Latvia (EV)**.
2. If the document is not kept yet, press **Get GEN 1.2**. It is fetched from Eurocontrol (EAD), which can take a
   minute.
   Unverified: Getting GEN 1.2. On the test system it said **Couldn't get GEN 1.2**, with **Try again**.

To save it, press **⋯**, then **Download GEN 1.2 PDF**.

Unverified: Getting and downloading GEN 1.2. The test system has no GEN source.

## Open the official Web AIP
Roles: All roles
Open the country's own AIP website.

1. Press **Web AIP**, at the top. The window **Before opening Web AIP** says the site may be paid or not reachable.
2. Press **I understand, open Web AIP**. Or press **Cancel**. The site opens in a new tab.

## Read or refresh the NOTAMs or the weather
Roles: All roles
See the airport's NOTAMs and weather, and fetch them again.

1. Find **NOTAMs** or **Weather**, on the right.
2. To fetch them again now, press the round arrow on the card.

If they cannot be fetched, the card says **Couldn't get NOTAMs** or **Couldn't get the weather**, with **Try again**.

Unverified: The whole task. The test system has no NOTAM or weather service, and the cards always said **Couldn't get**.

## Report a problem with an airport
Roles: All roles
Tell the developer that something is wrong on this airport's page.

1. Press **⋯** (**More for** the airport), at the top right.
2. Press **Report a problem…**. A bug report opens. **Which screen** is filled in with this page.
3. Write what happened, and press **Send report**. See [Get help](help-and-support/get-help#report-a-bug).

## Ask the agent about an airport
Roles: All roles
Ask the Ops Agent with this airport as the subject.

1. Press **Ask about**, followed by the ICAO code, at the top. Or press ⌘J. The Ops Agent opens on the right, marked
   **Asking about**, followed by the code.
2. Press a suggested question, or type your own in the box, as in [Chat](ops-agent/chat).

This button shows only for people with Ops Agent access.
