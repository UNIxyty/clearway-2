---
title: Reports
summary: Reports raised in the console, with a status, that can be emailed to a list of people.
status: written
roles: All roles
updated: 2026-10-14
---

<!-- Written 2026-10-14 from the code (opsboard-react/src/components/console/ReportsPage.jsx,
     digital-wall/lib/reports-store.mjs) and by doing each task on the test system, as a User and as an Admin, with
     mail going to the test system's Resend stand-in. -->

Open it from the portal's sidebar: **Digital Wall** › **Reports**. Reports are for everyone: everyone sees every
report, and everyone can raise one.

:::statuses
Untouched (grey): Nobody has started on it. New reports start here.
Under process (blue): Someone is working on it.
Done (green): It is finished.
Impossible (red): It cannot be done.
:::

## Write a report
Roles: User, Admin and Developer by default
Raise a problem or a request.

1. Press **New report**.
2. Choose a **Category**. To make a new one, choose **+ New category…** and type its name.
   Unverified: A new category was not tried. The test report used IT.
3. Type a **Title**: one short line.
4. Type a **Description**: what happened, or what is needed.
5. Press **Create report**. A message says **Report created**. The report is at the top of the list, **Untouched**.

Unverified: Making a new category. Writing the report was checked.

:::example A report
Category: IT
Title: `Printer in the briefing room is out of toner`
Description: `Needs a new black cartridge.`
:::

## Find a report
Show only the reports you need.

:::warning Do not type in the search box on a computer
On a computer, typing in **Search title, body, category, creator…** makes the page go blank. Reload the page to get
it back. Use the filters instead. The search works on a phone.
:::

1. To show some statuses only, press them: **Untouched**, **Under process**, **Done**, **Impossible**. Press one again
   to show it again.
2. To show one category, press it: for example **IT** or **Ops**.
3. Read the list. Open reports come first, newest first.

If nothing matches, the list says **No reports**.

## Change a report's status
Roles: User, Admin and Developer by default
Keep a report's status current.

1. Press the report's status, in the **STATUS** column. A list of the four statuses opens.
2. Press the new status. A message names the report and its new status.

To go back, choose the old status again.

## Edit a report
Roles: User, Admin and Developer by default
Change a report's category, title or text.

1. Press the pencil on the report's row (**Edit**). The form says **Edit report**.
2. Change what you need.
3. Press **Save changes**. A message says **Report updated**.

Editing does not email anyone.

## Email a report
Roles: User, Admin and Developer by default
Send a report to the people who should act on it.

1. Press the envelope on the report's row (**Send to email**).
2. Choose people from the presets, for example **IT**. Or type an address in **or type an address…**.
3. Press **Send report**. A message says who it was sent to. The report's row then says **✉ sent to**, with the
   address and when.

:::example An email
Preset: IT (it-desk@example.com)
Subject: [REPORT · IT] Printer in the briefing room is out of toner
:::

:::how-it-works
The email has the report's category, status, title and text, who raised it and when, and a button to open the
console. It comes from the Digital Wall's no-reply address. Only one typed address is taken; use presets for more.
:::

## Delete a report
Roles: Admin and Developer by default
Remove a report and the record of its emails.

:::cannot-be-undone
The report and the record of where it was sent are removed from the list. They cannot be brought back from the
console.
:::

1. Press the bin on the report's row (**Delete**).
2. Read the window. It names the report.
3. Press **Delete**. A message says **Report deleted**.

## Edit the recipient presets
Roles: Admin and Developer by default
Give short names to the addresses people send reports to.

1. Press **Recipient presets**, at the top.
2. To add one, press **Add row**. Type a **Label**, for example `IT`, and an email address.
3. To remove one, press **✕** on its row.
   Unverified: Removing a preset was not tried.
4. Press **Save presets**. A message says **Presets saved**.

A row with no label or a wrong address is dropped when you save, without a message. To close without saving, press
**Recipient presets** again.

Unverified: Removing a preset, and the dropping of wrong rows. Adding and saving a preset was checked.
