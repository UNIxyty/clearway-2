---
title: Operators
summary: Operators are the airlines and charter companies whose flights the wall shows. Each one is a Leon account; the wall reads its flights through it.
status: written
roles: Everyone can view; changes are Admin and Developer by default
video: operators | 30 seconds
updated: 2026-10-14
related: digital-wall/the-wall, digital-wall/webhooks, digital-wall/aircraft
---

<!-- Rewritten 2026-10-14 from the code (opsboard-react/src/components/console/OperatorsPage.jsx,
     digital-wall/operators-store.mjs) and by doing each task on the test system, as a User and as an Admin, against
     the test system's Leon stand-in. -->

Open it from the portal's sidebar: **Digital Wall** › **Operators**. Everyone signed in can open the page. Without
permission to change it, the page says **View only.** and its buttons are greyed out.

[screenshot: digital-wall-operators | Operators: Operators are the airlines and charter companies whose flights the wall shows. Each one is a Leon account; the wall reads its flights through it.]

## Add an operator
Roles: Admin and Developer by default
Connect one Leon account to the wall, so its flights start to appear.

You need the operator's Leon subdomain and a Leon refresh token before you start.

1. Press **Add operator**, at the top right.
   [screenshot: operators-add-button | Add operator, at the top right of the page.]
2. In **Operator name**, type the name people know the operator by. If you leave it empty, the wall uses the
   subdomain.
3. In **Leon subdomain (oprId)**, type the part of the operator's Leon address before `.leon.aero`.
4. In **Refresh token**, paste the token from Leon. The operator's Leon admin makes one under **Admin → API →
   Personal tokens**.
   Note: The token is stored encrypted and is never shown again, not even to you.
5. Press **Save operator**. A message says **Operator added · initial sync queued**. The operator appears in the
   table.
6. Open **Digital Wall** › **Webhooks** and press **Re-register all** for the new operator. Until then, Leon does not
   tell the wall about its changes as they happen.

:::example An operator called Sample Aviation
Operator name: Sample Aviation
Leon subdomain (oprId): `sampleaviation`
Refresh token: pasted from Leon, never typed
:::

:::how-it-works
The wall reads each active operator's flights from Leon every 2 minutes. With webhooks registered, Leon also tells
the wall about changes as they happen.
:::

## Check that the wall is getting flights
Roles: All roles
See whether reading flights from Leon works, and read them now instead of waiting.

1. Read the **Sync health** card, at the top. **Healthy** means the last run worked. **Error** means it did not.
2. Read **LAST RUN** (when it last ran), **FLIGHTS CACHED** (how many flights the wall holds) and **LAST ERROR**.
3. Read the **STATUS** column in the table: **Synced**, **Error** or **Paused** for each operator. An error is shown
   under the operator's row.
4. To read from Leon now, press **Force sync**. A message says how many flights are held when it finishes, for
   example **Sync complete · 10 flights cached**.

## Pause or resume an operator
Roles: Admin and Developer by default
Stop the wall reading one operator's flights, or start it again.

:::warning Pausing takes the operator's flights off the wall at once
While an operator is paused, none of its flights show on any wall, phone or tablet.
:::

1. Find the operator's row.
2. Switch its **Active** switch off. The row says **Paused**, and a message says the operator is paused.
3. To start again, switch it back on. The wall reads all of the operator's flights again, which can take a minute.

:::note Webhooks of a paused operator
A paused operator is not listed on the **Webhooks** page. Leon's change notices for it are ignored until you resume
it.
:::

Unverified: That a paused operator leaves the Webhooks page. Pausing and resuming were checked.

## Edit an operator
Roles: Admin and Developer by default
Change an operator's name, its Leon subdomain or its refresh token.

1. Press the pencil on the operator's row (**Edit operator (name, prefix, token)**).
2. Change what you need. Leave **Refresh token** empty to keep the current token.
3. Press **Save changes**. A message says the operator is saved.
4. If you changed the token or the subdomain, a banner says the webhooks are no longer valid. Open
   **Digital Wall** › **Webhooks** and press **Re-register all** for this operator.

:::note Changing the subdomain starts the operator again
The operator's flights are removed from the wall and read again from the new Leon account.
:::

## Delete an operator
Roles: Admin and Developer by default
Remove an operator from the wall completely.

:::cannot-be-undone
Deleting an operator removes:
- its Leon connection and refresh token
- all of its flights, so its rows disappear from every wall
- its aircraft settings (which aircraft are hidden)
:::

1. Open **Digital Wall** › **Webhooks** and switch off every event for the operator. After the delete, the operator
   is no longer on that page.
   Unverified: The test operator had no webhooks registered, so this step was not needed.
2. Come back to **Operators**, and press the bin on the operator's row (**Delete operator**).
3. Read the window. It names the operator.
4. Press **Delete**. A message says the operator is deleted.

Unverified: Step 1, switching the webhooks off first. The delete itself was checked.

:::how-it-works
To take an operator's flights off the wall for a while, pause it instead: pausing keeps everything. Adding it again
later needs the operator's Leon token again.
:::
