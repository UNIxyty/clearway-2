---
title: Your threads
summary: Everything you sent from Help & support, with the developer's answers.
status: written
updated: 2026-10-14
roles: All roles
related: help-and-support/get-help
---

<!-- Written 2026-10-14 from the code (components/help/HelpThread.tsx, HelpHome.tsx) and by doing each task on the test
     system as a User, with the Developer answering. The test system has no Telegram: "notified" was set in its
     database to try Nudge again and File as report. -->

Your reports and chats are listed on **Help & support**, under **YOUR HISTORY**. You see only your own. When the
developer answers, **Help & support** in the sidebar shows how many answers are new.

[screenshot: help-and-support-your-threads | Your threads: Everything you sent from Help & support, with the developer's answers.]

:::statuses
UNTOUCHED (grey): The developer has not started on it.
UNDER PROCESS (blue): The developer is working on it.
DONE (green): It is done.
IMPOSSIBLE (red): It cannot be done. The developer says why.
:::

## Open a thread you sent
Roles: All roles
Read the developer's answers.

1. Open **Help & support**.
2. Under **YOUR HISTORY**, press the thread. Each one shows its status and its latest message.
3. Read the messages. The developer's are marked **DEVELOPER**. **Read** and a time means the developer has read
   your message. A status change is a line between the messages, with the reason for **Impossible**.

Only the first four threads are listed. To see the rest, press **All … reports and chats →**.

## Reply in a thread
Roles: All roles
Add to a report, or answer the developer.

1. Open the thread.
2. Type in the box at the bottom.
3. Press **Send**.

A thread marked **DONE** closes to replies 48 hours later. It then says **This thread was closed 48 hours after it was
marked Done**. To go on, press **File a linked report**. Everything in the old thread stays.

:::example A reply
Thread: `RPT-2120 · AIP PDF will not open for EVRA`
Reply: `It happens for EYVI too.`
:::

## Send a message again
Roles: All roles
Send a reply that did not go through.

1. Find the reply marked **Not delivered**, in red.
2. Press **Send again**. Or press **Copy text** to keep it.

A reply that failed is kept in this browser only. If you close the browser, it is gone.

## Ask the developer to come live
Roles: All roles
Turn a report into a live chat.

1. Open the report.
2. Press **Ask the developer to come live**, at the bottom. A chat form opens, with the report's screen filled in.
3. Type what you want to ask, and press **Start chat**.

The new chat is separate from the report. Say which report it is about, for example `About RPT-2120`.

## Nudge the developer
Roles: All roles
Remind the developer that you are waiting in a chat.

1. Open the chat. The line at the top says **Developer has been notified**.
2. Press **Nudge again**. The chat shows **Nudge sent to Telegram** and the time.
   Unverified: The Telegram message. The test system has no Telegram, and the chat still said **Nudge sent to
   Telegram**: it does not check that the message went out.

Unverified: The Telegram message, in step 2.

## File a chat as a report
Roles: All roles
When nobody answers a chat, keep what you wrote as a report.

1. Open the chat. Five minutes after the developer was notified, if nobody opened it, it says **No answer for five
   minutes**.
2. Press **File as report**. A bug report form opens with your chat's title.
3. Check **Which screen**, and press **Send report**.

:::how-it-works
The chat stays as it was. The report is a new thread, linked to the chat.
:::
