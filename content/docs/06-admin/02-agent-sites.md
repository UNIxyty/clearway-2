---
title: Agent sites
summary: The websites where the Ops Agent's Chrome extension may read a page.
status: written
updated: 2026-10-14
roles: Admin and Developer by default
---

<!-- Written 2026-10-14 from the code (app/admin/agent-sites/page.tsx, agent/lib/extension.mjs) and by doing each task on
     the test system as an Admin, with requests sent as a User. The requests were sent to the agent directly, not from
     the extension. -->

Open it from the portal's sidebar: **Admin** › **Agent sites**. The Ops Agent's Chrome extension reads a page only on
the sites listed here. It can still take a screenshot anywhere. Every decision is logged. All times are UTC.

You need Ops Agent access yourself to use this page. Without the right role, the page says **Agent sites is for
admins**.

## Approve or decline a site request
Roles: Admin and Developer by default
Answer someone who asked, from the extension, to use it on a site.

1. Find the request under **Waiting for a decision**. It says who asked, when, and why.
2. Choose the scope: **This host only**, or **Host and subdomains**.
3. Press **Approve**. The site moves to **Approved sites**.
4. Or press **Decline**. The window **Decline**, followed by the site, opens. Type a note in **Why — the requester sees
   this**, and press **Decline**. Or press **Keep it waiting**.

Each decision is listed under **Decision log**, newest first, with who asked, who decided, when, and your note. A
decision cannot be changed. To stop an approved site later, revoke it.

The requester sees the decision the next time they open the extension on that site.

Unverified: What the requester sees in the extension. The requests were sent without the extension on the test system.

:::example A request and a decline
Site: `fuel-sample.example`
Why they asked: `Fuel releases for LY-TST`
Your note: `Fuel releases come by email. Use the mailbox.`
:::

## Add a site
Roles: Admin and Developer by default
Allow a site before anyone asks.

1. Under **Approved sites**, type the host in **Add a site**. Give the host only: no `https://`, path or port.
2. Tick **Include subdomains** if you want.
3. Press **Add**. A message says the site was added, and it is listed with **+ subdomains** or **This site only**.

If you type a whole address, the message **That didn't work** says to give the host only.

:::example A site
Add a site: `ops-sample.example`
Include subdomains: ticked
:::

## Revoke a site
Roles: Admin and Developer by default
Stop the extension reading a site.

:::cannot-be-undone
The extension stops reading the site at once. To allow it again, add it again, or wait for someone to ask.
:::

1. Find the site under **Approved sites**.
2. Press **Revoke**. The window **Remove**, followed by the site, opens.
3. Press **Remove site**. Or press **Cancel**.
