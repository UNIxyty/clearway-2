---
title: Maintenance
summary: Closes the portal to everyone except admins and developers while work is done, with a message and a time it should end.
status: written
updated: 2026-10-14
roles: Admin and Developer by default
---

<!-- Written 2026-10-14 from the code (app/admin/maintenance/page.tsx) and by doing each task on the test system: the
     portal turned off as a Developer, seen as a User and an Admin, and turned back on as an Admin. The cleared AIP
     copies were put back on the test system afterwards. -->

Open it from the portal's sidebar: **Admin** › **Maintenance**. The page is called **Maintenance control**. Under
**CURRENT STATE** it says **The portal is live**, or **The portal is off for everyone**, since when and by whom.

[screenshot: admin-maintenance | Maintenance: Closes the portal to everyone except admins and developers while work is done, with a message and a time it should end.]

While the portal is off, the Ops Agent, the wall and the portal's services keep running. Admins and developers are
taken to this page whenever they open the portal, so one of them can turn it back on.

## Turn maintenance on
Roles: Developer by default
Close the portal to everyone except admins and developers.

:::warning Everyone else is stopped at their next page
Everyone except admins and developers gets the maintenance page when they next open or reload a page. Anything they
have not saved when they move is lost.
:::

1. Type a **Message** for the maintenance page. You can leave it empty.
2. Type when it should end in **Expected back**.
3. Read the **PREVIEW**.
4. Press **Turn the portal off…**. The window **Turn the portal off for everyone?** opens.
5. Type `OFF` in **Type OFF to confirm**.
6. Press **Turn off now**. Or press **Keep it on**. A message says the portal is off for everyone.

An admin sees the note **Turning the portal off needs “Turn maintenance on”** instead of the button.

:::example A maintenance message
Message: `Clearway is being updated. Flight intake is not affected.`
Expected back: `about 30 minutes`
:::

:::how-it-works
The maintenance page shows **Portal currently under maintenance**, a fixed line about reliability and performance,
your message, and **Estimated time:** with what you typed. People can still sign in, but they are taken straight to
it, with the time it was last updated.
:::

## Turn maintenance off
Roles: Admin and Developer by default
Open the portal again for everyone.

1. Press **Turn the portal back on**. It does not ask first. A message says the portal is live again.

**CURRENT STATE** then says **The portal is live**, and when the last maintenance ended, and who ended it.

## Clear the cached AIP PDFs
Roles: Admin and Developer by default
Delete the portal's kept copies of AIP documents.

:::cannot-be-undone
Every kept AIP copy is deleted. Each airport fetches its documents again the next time someone opens them, which is
slow.
:::

1. Under **PDF cache**, press **Clear PDF cache…**. The window **Clear the PDF cache?** opens.
2. Press **Clear the cache**. Or press **Cancel**. A message says how many were deleted, for example **Cleared 4
   cached PDFs**.
