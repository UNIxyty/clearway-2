---
title: Saved replies
summary: Answers you write once and reuse when replying in the inbox.
status: written
updated: 2026-10-14
roles: Developer by default
related: developer/inbox
---

<!-- Written 2026-10-14 from the code (components/help/SavedReplies.tsx) and by doing each task on the test system as a
     Developer. -->

Open it from the portal's sidebar: **Developer** › **Saved replies**. You use them from the inbox: see
[Inbox](developer/inbox).

[screenshot: developer-saved-replies | Saved replies: Answers you write once and reuse when replying in the inbox.]

## Add a saved reply
Roles: Developer by default
Write an answer you can use again.

1. Press **New reply**.
2. Type the answer. The person receives it as an ordinary message.
3. Under **Pairs with:**, choose the status it sets when you insert it with ⇧⏎: **UNTOUCHED**, **UNDER PROCESS**,
   **DONE** or **IMPOSSIBLE**. Or leave **no status change**.
4. Press **Save**. The reply is listed with its status, for example **sets Under process · used 0×**.

:::example A saved reply
Text: `Thank you. I can see it and I am working on it now.`
Pairs with: `UNDER PROCESS`
:::

:::how-it-works
**used** counts each time the reply was put in the reply box, sent or not. A reply paired with **IMPOSSIBLE** uses
its own text as the reason.
:::

## Edit a saved reply
Roles: Developer by default
Change a saved answer.

1. Find the reply.
2. Press **Edit**.
3. Change the text or the status.
4. Press **Save**. Or press **Cancel**.

## Delete a saved reply
Roles: Developer by default
Remove a saved answer.

:::cannot-be-undone
**Delete** removes the reply at once. It does not ask first.
:::

1. Find the reply.
2. Press **Delete**.
