---
title: Users
summary: Everyone with a portal account. New accounts wait here until an admin approves them.
status: written
updated: 2026-10-14
roles: Admin and Developer by default
related: admin/permissions
---

<!-- Written 2026-10-14 from the code (app/admin/users/page.tsx) and by doing each task on the test system as an Admin
     and as a Developer, on an invented account. The test system has no mail server. -->

Open it from the portal's sidebar: **Admin** › **Users**. The list is sorted by role, then name.

[screenshot: admin-users | Users: Everyone with a portal account. New accounts wait here until an admin approves them.]

Admins can make someone an admin, or remove it. Only developers can make someone a developer, or remove it. Nobody can
change their own role. An admin can only copy a developer's user ID: the other actions are not offered on a
developer's row.

:::statuses
Active (green): The account can use the portal.
Waiting for approval (amber): A new account. It cannot use the portal until someone approves it.
:::

## Find a user
Roles: Admin and Developer by default
Find someone by name or email.

1. Choose a tab: **All**, **Pending**, **Admins** or **Users**. Each tab shows how many people it holds.
2. Type in **Search name or email**.
3. To narrow the list, press **Role** or **Last sign-in**, and choose one or more. **Last sign-in** offers **Today**,
   **This week**, **This month**, **Earlier** and **Never**.

A line above the list says how many people the filters hide. Press **Clear all** to show everyone.

## Approve a new account
Roles: Admin and Developer by default
Let a new account into the portal.

1. Open the tab **Pending**. A new account says **Waiting for approval**.
2. Press **Approve** on the row. A message says the person **is approved**, and that it **Takes effect within 10
   seconds**.

To take it back, press **Undo** in the message.

:::example A new account
Name: `Alice Example`
Email: `alice.example@example.com`
:::

## Make someone an admin
Roles: Admin and Developer by default
Give someone the Admin role.

1. Press **⋯** (**Row actions**) on the person's row.
2. Press **Make admin**. A message says the person **is now an Admin**, with **Undo**.

## Remove someone's Admin role
Roles: Admin and Developer by default
Take the Admin role away.

1. Press **⋯** on the person's row.
2. Press **Remove admin…**. The window **Remove Admin from**, followed by the name, opens.
3. Press **Remove Admin**. Or press **Cancel**.

The person keeps the account and signs in as a User. They lose the Admin pages at once. A message says the person **is
no longer an Admin**, with **Undo**.

## Make someone a developer, or remove it
Roles: Developer by default
Give someone the Developer role, or take it away.

1. Press **⋯** on the person's row.
2. Press **Make developer**. A message says the person **is now a Developer**, with **Undo**.

To remove it, press **⋯**, then **Remove developer…**. Read the window, and press **Remove Developer**. The person
keeps the account and any Admin role.

## Send someone a password reset
Roles: Admin and Developer by default
Email a person a link to set a new password.

1. Press **⋯** on the person's row.
2. Press **Send password reset**. A message says **Password reset sent to**, followed by the address.
   Unverified: The email. The test system has no mail server. There the message said **Couldn't send 1 reset
   email**, with the reason and **Retry**.

Unverified: The email, in step 2.

## Send password resets to several people
Roles: Admin and Developer by default
Email several people a password link at once.

1. Tick the people in the list. A bar replaces the toolbar, for example **2 selected**.
2. Press **Send password reset**, in the bar. A message says how many were sent.

:::note Developers are left out for admins
An admin may tick a developer's row, but no email is sent to that person, and the message does not say so. Count the
people in the message.
:::

Unverified: The emails. The test system has no mail server. The count was checked with the server's answer replaced.

## Copy a user's ID
Roles: Admin and Developer by default
Copy the ID a developer may ask for.

1. Press **⋯** on the person's row.
2. Press **Copy user ID**. A message says **User ID copied**, with the ID.
