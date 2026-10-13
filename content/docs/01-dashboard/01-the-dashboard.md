---
title: The dashboard
summary: The page the portal opens on. It shows today's numbers from the wall, the airports you looked at last, whether the services work, and what changed.
status: written
updated: 2026-10-13
related: digital-wall/the-wall
---

<!-- Written 2026-10-13 from the code (components/portal/dashboard/) and by doing each task on the test system, signed
     in as a User and as an Admin. -->

Open it from the sidebar: **Dashboard**. It is also the page you see when you go to the portal's address, unless you
chose another start page in **Settings**.

The dashboard is made of blocks. Everyone has **Today**, **Recently used**, **Service monitors**, **Quick links** and
the changelog. Admins and developers also have **Server health**. You can move, resize, add and remove blocks. Your
changes are for you only.

## Read today's numbers
Shows four numbers for today from the Digital Wall. Each number opens the page it counts.

1. Find the **Today** block, at the top left.
2. Read the four numbers. The table below says what each one counts.
3. To see the flights or checks behind a number, press the number. Its page opens.

| Number | What it counts | Pressing it opens |
|---|---|---|
| **Flights today** | Every flight on today's date | **Digital Wall** › **Flights** |
| **Delayed** | Today's flights that are delayed | **Digital Wall** › **Flights** |
| **NOTAM checks left** | Airports whose NOTAMs still need today's check, out of all of today's airports | **Digital Wall** › **NOTAM Check** |
| **Open reports** | Wall reports that are not **Done** or **Impossible** | **Digital Wall** › **Reports** |

:::example A morning with work still to do
Flights today: 42
Delayed: 3
NOTAM checks left: 2 of 9
Open reports: 1
:::

:::note When a number cannot be read
It shows a dash (**—**) and **Couldn't load** under it. The other numbers still count. If none can be read, the block
says **Couldn't reach the Digital Wall.** Press **Retry**.
:::

:::how-it-works
The numbers come from the Digital Wall and refresh every minute. "Today" is today's date in UTC.
:::

Unverified: Flights today and Delayed. The test system has no Leon connection, so these two always show "Couldn't load" there. NOTAM checks left and Open reports were checked.

## Go back to an airport you looked at
The **Recently used** block lists the airports you searched for or opened last, so you can go back in one press.

1. Find **Recently used**.
2. Press an airport code. The airport's page opens.

Each airport shows once, with **Searched** or **Opened** and how long ago. **Searched** means you typed it in
**Airport search**. **Opened** means you picked it from the list of a country's airports. The block shows up to eight.

:::note Only airports are listed
Pages you open elsewhere in the portal, on the wall or in the Ops Agent do not appear here. Until you look at an
airport, the block says **Nothing recent yet**, with a link to **Search an airport**.
:::

## Check that the services work
The **Service monitors** block shows whether the parts of the portal are working: the airport lookup, NOTAMs,
weather, the background workers, the Digital Wall, the Ops Agent, the Leon feed, and how fresh the stored AIP, NOTAM and
weather data is.

1. Find **Service monitors**.
2. Read the line at the top, for example **11 of 13 operational**. If any service has a problem, a yellow
   **need attention** sign shows how many.
3. Read the list. Services with a problem are at the top, marked **Down**, **Degraded** or **Unknown**. A working
   service is marked **Operational**.
4. To run every check again now, press **Re-check now**: the round arrows at the top right of the block. Its name
   shows when you point at it. The time after **checked** changes.

:::note When the block says "The service checker isn't running"
The checks are not running on this server, so the block cannot say how the services are. Ask a developer.
:::

:::how-it-works
The portal checks each service on its own, every 1 to 30 minutes depending on the service. The block refreshes every
30 seconds. Times are UTC, ending in Z.
:::

## Check the server's health
Roles: Admin, Developer
Shows how busy the server is, how full its disks are, and whether its containers run. Only admins and developers
see this block.

1. Find **Server health**. It says **admins only** next to its name.
2. If there is a yellow list at the top, read it first. These are warnings, for example a container that stopped.
3. Read the three numbers: **CPU LOAD**, **CPU TEMP** and **RAM**. A number turns yellow when it is high and red when
   it is close to the limit.
4. Read the lines below: any disk that is more than 80% full, and any container that is not running. If all is well,
   they say so, for example **All 12 containers running**.

:::note When the block says "The metrics collector isn't answering"
The server's numbers cannot be read right now. Ask a developer.
:::

## Read the changelog
Shows what changed lately. You see your own changes. Admins and developers see everyone's.

1. Find the changelog block. It is called **Your changelog**. For admins and developers it is called **Changelog —
   everyone**.
2. Read the six latest entries, newest first. An error has a red background, and its second line starts with
   **Error ·**.
3. To see more, press **Full changelog**. It shows up to 60 entries.
4. On that page, choose **All**, **Edits** or **Errors** to show only what you need.

:::how-it-works
The changelog collects changes from across the portal: airports, maintenance, emails, the Ops Agent's changes, and the
wall's important notices, reports and Leon webhooks. Your conversations with the Ops Agent are not in it.
:::

## Open a page from Quick links
The **Quick links** block takes you to five pages people use often.

1. Find **Quick links**.
2. Press a link: **Airport search**, **Service status**, **Digital Wall**, **NOTAM check** or **Report a problem**.

**Digital Wall** opens the wall. **NOTAM check** opens the NOTAM Check page in the wall's console. Both leave the
portal's own pages. **Report a problem** opens **Help & support**.

## Customise the dashboard
Move, resize, add and remove blocks. Only you see the change, on every computer where you sign in.

1. Press **Customise**, at the top right. The line under the title changes to **Editing — changes save as you make
   them and only affect you.** A **Blocks** list appears: on the right on a wide screen, above the blocks on a smaller
   one.
2. To remove a block, press the **✕** at its top right. Or untick it in the **Blocks** list.
3. To add a block, tick it in the **Blocks** list. It appears at the end.
4. To make a block wider or narrower, choose **S**, **M** or **L** next to **Width**, under the block's name.
5. To move a block, drag it by its handle: the dotted grip left of its name. Without a mouse, press Tab until the
   handle is selected, then press ↑ or ↓ until the block is where you want it.
6. Press **Done**.

:::note You can also start from Settings
**Settings** › **Customisation** › **Customise dashboard** opens the dashboard ready to customise.
:::

:::how-it-works
Each change saves on its own, half a second after you make it, to your account and to this browser. If saving to your
account fails, a message says **Couldn't save your layout to your account**. The change stays in this browser; make
another change in a moment and it saves again.
:::

## Put the dashboard back to its default layout
Brings back every block, in the order and widths the dashboard started with.

:::warning Your own arrangement is replaced at once
There is no undo. To get your arrangement back, you arrange it again.
:::

1. Press **Customise**.
2. Press **Reset to default**. The blocks go back to the start.
3. Press **Done**.

If you removed every block, the dashboard says **Your dashboard has no blocks**. Press **Use the default layout** to
bring them all back, or **Add blocks** to choose them one by one.

:::how-it-works
The default is **Today** (S), **Recently used** (L), **Service monitors** (M), **Server health** (M, admins and
developers only), **Quick links** (S) and the changelog (L).
:::
