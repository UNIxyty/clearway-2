---
title: Settings
summary: How the wall looks and what it shows: sizes, colours and font, the clocks, the screens allowed to show it, and the NOTAM and weather setup.
status: written
roles: Everyone can change their own view; the rest is Admin and Developer by default
updated: 2026-10-14
related: digital-wall/the-wall, digital-wall/notam-check
---

<!-- Written 2026-10-14 from the code (opsboard-react/src/components/console/SettingsPage.jsx, ColoursCard.jsx,
     FontCard.jsx, DeviceApprovalPopup.jsx) and by doing each task on the test system, as a User and as an Admin. -->

Open it from the portal's sidebar: **Digital Wall** › **Settings**. The page has five tabs: **Display & sizing**,
**Colours**, **Font**, **Wall content**, and **NOTAM, alerts & WX**.

The first three tabs set how the wall looks. Each person has their own view; the big screen in the ops room has
its own, called **Main wall**. The last two tabs apply to every wall. A part you may not change says
**View only.** and is greyed out.

Every change saves by itself, a moment after you make it. A message says what changed and that the wall updates in
seconds. There is no **Save** button.

## Change how the wall looks for you
Roles: User, Admin and Developer by default
Change sizes on the wall when it is open on your own screens.

1. Open **Display & sizing**.
2. Under **Whose view are you tuning?**, press **My view**. It says **editing**.
3. Move a slider, for example **Display scale** or **Hour spacing**. A message gives the new value.
4. To go back to the starting value, press **Reset** next to the slider. It is greyed out when the value has not
   changed.

The other cards are **Vertical sizing**, **Horizontal sizing**, **Overlay & sidebar size**, **Chips on the pills** and
**Upcoming Flight Table**.

:::warning Switching a chip off hides a warning
Under **Chips on the pills**, switching off **Important (!)**, **CAA**, **NOTAM (NTM)** or **WX** means nobody looking
at that wall sees it.
:::

:::example A bigger display
Display scale: 1.30× → 1.35×
Message: Display scale 1.35× — wall updates in seconds
:::

## Change the main wall in the ops room
Roles: Admin and Developer by default
Change how the big screen in the ops room looks.

:::warning Reset main wall to defaults does not ask
**Reset main wall to defaults** puts back every size, colour, font and chip of the big screen at once. There is no
undo.
:::

1. Under **Whose view are you tuning?**, press **Main wall (ops room)**. It says **editing the BIG SCREEN**.
2. Change what you need, on **Display & sizing**, **Colours** or **Font**. The big screen changes within seconds.
3. To put back everything, press **Reset main wall to defaults**. A message says **Main wall reset to defaults**.
4. Press **My view** when you are done, so your next changes are for your own screens.

Without permission, the row says **viewing the BIG SCREEN** and the page says **View only. You don't have permission
to change the big screen's settings.**

## Change the wall's colours
Roles: User, Admin and Developer by default
Change any colour the wall uses.

1. Open **Colours**.
2. Choose **My view**, or **Main wall (ops room)** if you may change it.
3. Find the colour. Type in **Find a colour…**, or scroll the groups, for example **Flight states (pill fills)**.
4. Press the colour square to pick a colour. Or type a hex value in the box next to it, and press Enter.
5. Read the preview pill at the top, and the warnings under the colour. A warning says, for example, when two colours
   are too alike. It does not stop you.
6. To go back to the starting colour, press **Reset** next to it.

To put back every colour, press **Reset all colours**. It does not ask first.

:::example A darker blue for airborne
Colour: Airborne
Hex value: `#3B82F6`
:::

## Change the wall's font
Roles: User, Admin and Developer by default
Choose the font the wall's text uses.

1. Open **Font**.
2. Choose **My view**, or **Main wall (ops room)** if you may change it.
3. Choose a font. The preview shows it, for example **PREVIEW · ROBOTO**.
4. To change how zero looks on Nunito, Roboto and Public Sans, choose **Dotted**, **Slashed** or **Plain**.
5. To go back to the starting font, press **Reset to default**.

:::note Choose a font where zero and O look different
Fonts marked **PLAIN ZERO** show 0 and O alike from a distance.
:::

## Set how far ahead the wall shows flights
Roles: Admin and Developer by default
Choose which flights every wall shows, by time.

1. Open **Wall content**.
2. Under **Flight visibility window**, move **Show ahead of now**: a flight appears once its departure is this many
   hours ahead or less.
3. Move **Show behind now**: a flight leaves once its arrival is more than this many hours ago.
4. To go back to the starting value, press **Reset**.

:::warning This changes every wall
The window applies to every wall, the console's flight lists, and the airports of the daily NOTAM check.
:::

:::example The starting values
Show ahead of now: 17h
Show behind now: 2h
:::

## Add or change a wall clock
Roles: Admin and Developer by default
Choose the clocks along the top of every wall.

1. Open **Wall content**.
2. Under **Wall clocks**, press **Add clock**.
3. Type a city or time zone in **Search city / time zone…**, and choose it. A message says **Clocks saved**.
4. To mark the clock that is local time here, press **Set local** on it. It then says **Local**, and the wall shows it
   in amber.
5. To change the order, drag a clock up or down.
6. To remove a clock, press its bin (**Remove clock**). It does not ask first.

Read **WALL CLOCK BAR PREVIEW** to see the clocks as the wall will show them. A wall keeps between 1 and 12 clocks.

:::example The clocks
Clocks: Riga (local), Paris, New York, Istanbul, UTC
:::

Unverified: Dragging to change the order. Adding, setting local and removing were checked.

## Approve a new screen
Roles: Admin and Developer by default
Let a screen with nobody signed in show the wall.

:::warning Check the code
Approve a screen only if its code is on that screen right now. An approved screen keeps a long-lived key to the
wall's flight data.
:::

1. On the new screen, open the wall. It says **Waiting to be approved** and shows a code.
2. In the console, a window **Screen requesting access** shows the same code. Press **Not now** to do it from
   Settings instead.
3. Open **Wall content**, and find **Devices**. The waiting screen is listed with its code.
4. Check that the code is the one on the screen.
5. Type a name in **Name this screen (e.g. Ops room wall)**.
6. Press **Approve**. A message says the screen comes to life within a few seconds.

:::example A new screen
Code: C1RL
Name: `Ops room wall`
:::

:::how-it-works
The approved screen can only show the wall. It cannot check or change anything. A screen's name is set when you
approve it, and cannot be changed later.
:::

## Revoke a screen
Roles: Admin and Developer by default
Stop a screen showing the wall.

1. Open **Wall content**, and find **Devices**.
2. Find the screen in the list. It shows its name, when it was last seen and who approved it.
3. Press **Revoke**.
4. The browser asks you to confirm. Press **OK**.

The screen stops at once and shows **Waiting to be approved** with a new code. To let it back, approve it again.

## Set the NOTAM digest
Roles: Admin and Developer by default
Choose who gets the daily NOTAM email, when the check runs, and how often the reminder goes out.

1. Open **NOTAM, alerts & WX**.
2. Under **Digest recipients**, type an email address in **Add e-mail and press Enter…**, and press Enter. A message
   says how many addresses the digest goes to.
3. To remove an address, press **×** on it.
4. Choose **Daily check hour**, in Riga time.
5. Choose **Reminder every**.
6. Read **Effective now:** under the card. It says who gets the email, when the check runs, and how often the
   reminder goes.

:::example A digest setup
Digest recipients: `ops-desk@example.com`
Daily check hour: Default (10:00)
Reminder every: Default (120 min)
:::

Unverified: Changing the hour and the reminder. Adding and removing a recipient were checked, and the email reached the recipient.

## Fetch the weather now
Roles: Admin and Developer by default
Read the weather again for every airport with a flight today or tomorrow.

1. Open **NOTAM, alerts & WX**.
2. Under **Weather**, press **Fetch weather now**. The button says **Fetching weather…**.
3. Read the message, for example **Weather refreshed for 8 airport(s)**.

:::how-it-works
The wall fetches the weather by itself every day at 00:01 UTC. Fetch it now after adding flights during the day, or
if the weather colours look old.
:::

## Change the alert filter
Roles: Admin and Developer by default
Choose the words that flag a NOTAM.

1. Open **NOTAM, alerts & WX**.
2. Under **NOTAM / alert filter**, find the group, for example **Closure / prohibition**.
3. Press **+ Add** in the group, type the word, and press Enter.
4. To remove a word, press **×** on it.
5. Press **Save rules**. It shows only when there are unsaved changes. A message says the rules apply from the next
   scan.
6. To scan now, press **Run scan now**. A message says how many flights were scanned and how many new findings there
   are.

:::warning Unsaved words are lost
If you leave the tab before **Save rules**, your changes are lost. The page does not warn you.
:::

:::example A new word
Group: Closure / prohibition
Word: `CLSD`
:::

Unverified: Losing unsaved words when you leave the tab. Adding and removing words, Save rules and Run scan now were checked.
