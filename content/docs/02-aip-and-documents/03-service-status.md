---
title: Service status
summary: Shows, country by country, whether the portal can get AIP documents. You can read it; only admins change it.
status: written
updated: 2026-10-14
roles: All roles
related: admin/service-status-editor
---

<!-- Written 2026-10-14 from the code (app/aip/service-status/) and by reading the page on the test system as a User,
     after an Admin changed a country. -->

Open it from the portal's sidebar: **AIP & Documents** › **Service status**. The top counts the countries in each
state. **Recently changed** shows the latest changes.

[screenshot: aip-and-documents-service-status | Service status: Shows, country by country, whether the portal can get AIP documents. You can read it; only admins change it.]

:::statuses
Fully operational (green): AIP documents for this country work.
Partially works (amber): Some airports or documents may fail.
In work (orange): The Clearway team is working on this country.
Experiencing troubles (red): Getting documents for this country has problems now.
Not checked (grey): Nobody has checked this country yet.
:::

## Check whether a country's AIP is working
Roles: All roles
Find a country's status before you rely on its documents.

1. Type the country in **Filter countries**.
2. Read its **Status**, its **Note**, and when it was **Updated**.
3. To see every country in one state, press that state in the counts at the top. Press it again to see all.

:::example A country
Typed: `Lith`
Row: `Lithuania · Partially works · 14 Oct`
:::

:::how-it-works
The Clearway team sets each country's status by hand, in the [Service status editor](admin/service-status-editor),
when they check it. It is not a live test.
:::
