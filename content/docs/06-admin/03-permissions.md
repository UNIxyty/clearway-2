---
title: Permissions
summary: What each role may do, one action at a time, with a log of every change.
status: written
updated: 2026-10-14
roles: Admin and Developer by default
related: admin/users
---

<!-- Written 2026-10-14 from the code (app/admin/permissions/page.tsx) and by doing each task on the test system as an
     Admin. Each change made there was put back. -->

Open it from the portal's sidebar: **Admin** › **Permissions**. Each row is an action. Each column is a role: User,
Admin, Developer. The actions are in three areas, one under the other: **Portal**, **Ops agent & flight intake** and
**Digital Wall console**. Each area is split into groups, which open folded.

A change takes effect within 10 seconds, everywhere, and is logged under your name.

## Give a role an action, or take it away
Roles: Admin and Developer by default
Change what a role may do.

:::warning Taking an action away does not ask first
A tick you clear takes effect at once. Tick it again to give it back.
:::

1. Find the action. Type in **Find an action or key**, or open its group. **Expand all** opens every group.
2. Tick the box in the role's column to give the action. Clear the box to take it away.
3. If the action is marked **Hard to undo.**, a window asks first, for example **Grant “Manage permissions (this
   screen)” to User?**. Read what it does, and press **Grant**. Or press **Cancel**: nothing changes.

The group's row shows how much of the group each role holds, for example **0 of 1 held**. Press it to give or take
away every action in the group.

:::example A change
Action: `Edit country service statuses`
Column: `User`
Change: `granted`, then `took away`
:::

:::note Some boxes cannot be changed
A greyed-out box says why when you point at it. A role may always keep an action, because it is how anyone gets back
in. And you cannot take **Manage permissions (this screen)** away from your own role.
:::

## See what differs from the default
Roles: Admin and Developer by default
See only the changes made since the start.

1. Next to **Show**, press **Differs from default**. It says how many actions differ.
2. Read the changed boxes. They are tinted, and say **default on** or **default off**.
3. Point at one to see who last changed it, and when.

When nothing differs, the page says **Nothing differs from the defaults**. Press **Show everything** to see all the
actions again.

## Read the change log
Roles: Admin and Developer by default
See every change ever made, newest first.

1. Find the change log, below the actions. It shows **When (UTC)**, **Who**, **Change**, **Action** and **Role**.
2. To narrow it, type a person, role or action in **Person, role or action**.

Nobody can change or delete a row of the log.

:::example A log row
Row: `14 Oct 10:22Z · developer@example.com · granted · Edit country service statuses · to User`
:::
