---
title: Operators
summary: Operators are the airlines and charter companies whose flights the wall shows. Each one is a Leon account; the wall reads its flights through it.
status: written
roles: Admin and Developer by default
video: operators | 30 seconds
updated: 2026-10-12
related: digital-wall/the-wall
---

Operators live in the wall's console: in the portal's sidebar, **Digital Wall** › **Operators**. Everyone signed in can open the page. Adding, editing, pausing and deleting operators are switched on for Admin and Developer by default; an admin can change who may do each one in **Admin** › **Permissions**.

## Add an operator
Roles: Admin, Developer
Connects one Leon account to the wall, so its flights start to appear. You need the operator's Leon subdomain and a Leon refresh token before you start.

:::warning An existing subdomain is replaced, not added twice
If an operator with the same Leon subdomain is already in the table, saving replaces its name and token.
:::

1. In the portal's sidebar, open **Digital Wall** › **Operators**, and press **Add operator**.
   [screenshot: operators-add-button | Add operator, at the top right of the Operators page.]
2. In **Operator name**, type the name people know the operator by. You can leave it empty; the wall then uses the subdomain.
3. In **Leon subdomain (oprId)**, type the part of the operator's Leon address before `.leon.aero`.
4. In **Refresh token**, paste the token from Leon. The operator's Leon admin makes one under **Admin → API → Personal tokens**.
   Note: The token is stored encrypted and is never shown again, not even to you.
5. Press **Save operator**. The operator appears in the table, and its first sync starts straight away.
   [screenshot: operators-table-new-row | The new operator in the table, with its status.]

:::example An operator called Example Air
Operator name: Example Air
Leon subdomain (oprId): `exampleair`
Refresh token: pasted from Leon, never typed
:::

:::how-it-works
The wall reads each active operator's flights from Leon on a timer, and Leon also tells the wall about changes as they happen. The status column shows how the last sync went: **Synced**, **Error** (with the error on the row) or **Paused**.
:::

## Check that the wall is getting flights
Roles: All roles
Shows whether syncing with Leon is healthy, and lets you run a sync now instead of waiting for the next one.

1. Open **Digital Wall** › **Operators**. The **Sync health** card at the top shows whether the last run was healthy, when it ran, how many flights are cached, and the last error if there was one.
   [screenshot: operators-sync-health | The Sync health card.]
2. To sync now, press **Force sync**. It runs one sync for every active operator, and says how many flights are cached when it finishes.

## Pause or resume an operator
Roles: Admin, Developer
Stops the wall reading one operator's flights, or starts it again.

:::warning Pausing takes the operator's flights off the wall at once
While an operator is paused, none of its flights show on any wall, phone or tablet.
:::

1. Open **Digital Wall** › **Operators** and find the operator's row.
2. Switch its **Active** toggle off. The row now reads **Paused**.
3. To start again, switch the toggle back on. The wall reads all of the operator's flights again from the start, which can take a minute.

## Edit an operator
Roles: Admin, Developer
Changes an operator's name, its Leon subdomain or its refresh token.

1. Open **Digital Wall** › **Operators** and press the pencil on the operator's row (**Edit operator**).
2. Change what you need. Leave **Refresh token** empty to keep the current token.
3. Press **Save changes**.
4. If you changed the token or the subdomain, open **Digital Wall** › **Webhooks** and press **Re-register** for this operator. The wall says so in a banner after saving, because Leon's change notices are tied to the token.

:::note Changing the subdomain starts the operator again
The operator's cached flights are removed and read again from the new Leon account.
:::

## Delete an operator
Roles: Admin, Developer
Removes an operator from the wall completely.

:::cannot-be-undone
Deleting an operator removes:
- its Leon connection and refresh token
- all of its cached flights, so its lanes disappear from every wall
- its aircraft visibility settings
:::

1. Open **Digital Wall** › **Operators** and press the bin on the operator's row (**Delete operator**).
2. Read the dialog: it names the operator. Press **Delete**.

:::how-it-works
Deleting does not remove the operator's change notices in Leon (re-register or delete them on **Digital Wall** › **Webhooks**), and it does not touch Flight intake. If you only want its flights off the wall for a while, pause the operator instead: that keeps everything.
:::
