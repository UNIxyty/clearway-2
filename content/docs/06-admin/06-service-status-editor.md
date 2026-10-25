---
title: Service status editor
summary: Where admins set, country by country, whether AIP retrieval works. Everyone reads it on AIP & Documents › Service status.
status: written
updated: 2026-10-14
roles: Admin and Developer by default
related: aip-and-documents/service-status
---

<!-- Written 2026-10-14 from the code (app/admin/service-status/page.tsx) and by doing the task on the test system as an
     Admin, then reading the result as a User. The change was put back. -->

Open it from the portal's sidebar: **Admin** › **Service status editor**. The page is called **Country Service
Status**. Each row is a country, with its status, a note, and **Save**.

[screenshot: admin-service-status-editor | Service status editor: Where admins set, country by country, whether AIP retrieval works. Everyone reads it on AIP & Documents › Service status.]

## Set a country's service status
Roles: Admin and Developer by default
Say whether getting AIP documents works for a country.

1. Type the country in **Search country...**.
2. Choose its status: **Not checked**, **In work**, **Partially works**, **Fully operational** or **Experiencing
   troubles**.
3. Type a note in **Optional note for this country** if you want.
4. Press **Save** on the row. Until you do, the row says **Not saved**.

The change shows on [Service status](aip-and-documents/service-status) for everyone, with the date.

:::example A status
Country: `Latvia`
Status: `Experiencing troubles`
Note: `Riga AIP downloads are slow this morning`
:::

:::how-it-works
The list reloads every 10 seconds, so changes made by someone else show up. A change you have not saved yet is kept
across the reload. The list holds the countries of the airports the portal knows, and every country that already
has a status.
:::
