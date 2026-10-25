---
title: Inbox
summary: Every thread people send from Help & support: bugs, questions, suggestions and live chats.
status: written
updated: 2026-10-14
roles: Developer by default
related: help-and-support/get-help, developer/saved-replies
---

<!-- Written 2026-10-14 from the code (components/help/DeveloperInbox.tsx) and by doing each task on the test system as
     a Developer, answering threads a User sent. The test system has no Telegram. -->

Open it from the portal's sidebar: **Developer** › **Inbox**. Threads are grouped into **WAITING ON YOU**, **OPEN**
and **DONE**. The line at the top counts them, for example **5 open · 1 unread · 5 waiting on you**.

[screenshot: developer-inbox | Inbox: Every thread people send from Help & support: bugs, questions, suggestions and live chats.]

Keys: J and K move through the list, E marks the open thread done, ⌘⏎ sends.

## Find a thread
Roles: Developer by default
Find a thread in the list.

1. Choose **Unread** or **All**.
2. To narrow the list, choose a **Status** or a **Type**.
3. Press the thread. It opens on the right.

The inbox has no text search.

## Reply to a thread
Roles: Developer by default
Answer the person who wrote.

1. Open the thread.
2. Type in the box **Reply to**, followed by the person's name or address.
3. To use a saved answer, press **Saved replies**. Type in **Type to filter** if you want.
4. Press the answer, or press Enter. To also set its paired status, press ⇧⏎ instead. The status changes at once,
   before you send.
5. Press **Send ⌘↵**. The person sees your reply in Help & support.

:::example A reply
Thread: `RPT-2120 · AIP PDF will not open for EVRA`
Reply: `Thank you. I can see it and I am working on it now.`
:::

## Change a thread's status
Roles: Developer by default
Set where a thread stands.

1. Open the thread.
2. Press **Status:**, followed by the current status.
3. Choose **Untouched**, **Under process**, **Done** or **Impossible**.
4. For **Impossible**, type why in **Why it can't be done — ops will see this**: at least 5 characters.
5. Press **Save**. Or press **Cancel**.

The person sees the change in the thread, with your reason for **Impossible**.

:::example An Impossible reason
Thread: `RPT-2121 · Show the airport name on the wall's NOTAM card`
Reason: `The wall card has no room at the width a wall screen uses.`
:::

## Mark a thread done
Roles: Developer by default
Close a thread you have finished.

1. Open the thread.
2. Press **Mark done**. Or press E.

48 hours after a thread is marked done, nobody can reply in it, until its status changes. The person can press **File
a linked report** to go on.

## Go live in a chat
Roles: Developer by default
Join a live chat or an urgent report.

1. Open the chat. It is marked **CHAT** or **URGENT**.
2. Press **Go live**. The person sees that you are there.
3. To end it, press **End chat**. This also marks the thread done. It does not ask first.

## Copy a thread's details
Roles: Developer by default
Copy the technical details the portal sent with a report.

1. Open the thread.
2. Find **AUTO-COLLECTED**: page, role, browser, screen size, services and last request.
3. Press **Copy all**. A message says **Context copied**.

## Answer threads from Telegram
Roles: Developer by default
Read and answer threads on your phone.

1. Open the Telegram message about a thread, and press its button. The inbox opens inside Telegram.
2. Read and answer as in the portal.

Only the Telegram accounts on the server's list can open it. That list is not set in the portal.

Unverified: The whole task. The test system has no Telegram.
