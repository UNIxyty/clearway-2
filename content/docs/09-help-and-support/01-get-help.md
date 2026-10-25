---
title: Get help
summary: Tell the developer about something urgent, a bug or an idea, or ask how to do something.
status: written
updated: 2026-10-14
roles: All roles
related: help-and-support/your-threads
---

<!-- Written 2026-10-14 from the code (components/help/) and by doing each task on the test system as a User. The test
     system has no Telegram, so no alert reached a phone there. -->

Open it from the portal's sidebar: **Help & support**, at the bottom. Or press `?` on any page. Reports go to the
developer who builds Clearway. They are read between 06:00Z and 22:00Z.

[screenshot: help-and-support-get-help | Get help: Tell the developer about something urgent, a bug or an idea, or ask how to do something.]

The card at the top says whether the developer reads now: **Developer available**, or **Outside reading hours**. It
goes by the clock only, not by whether the developer is really there.

Each form saves a draft on the server while you type. If you leave and come back, it says **Draft restored**. To throw
a draft away, press **Discard**, then **OK** in the question **Discard this draft?**.

## Report something urgent
Roles: All roles
Tell the developer at once that something blocks ops.

:::warning Outside reading hours
Between 22:00Z and 06:00Z the developer may not see it until the morning.
:::

1. Press **Report it**, on the card **Something is blocking ops right now**.
2. In **One line — what is blocked?**, type what is blocked.
3. Press Enter, and type what you know.
4. Press **Send — it pings now**. Your report opens, with its reference, for example **RPT-2124**.
5. Read the line at the top of the report. **Developer has been notified** means the Telegram alert went out.
   Unverified: The Telegram alert. The test system has no Telegram, and there the line said **Not notified yet**.

Unverified: The Telegram alert, in step 5.

:::example An urgent report
One line: `AIP PDF will not open for any airport`
Below it: `Since 09:50Z. Tried EVRA and EYVI.`
:::

:::how-it-works
An urgent report is a live chat. The line at the top shows where the developer is: notified, opening the chat, or
there. If the developer has not opened it after five minutes, the line says **No answer for five minutes**. See
[Your threads](help-and-support/your-threads).
:::

## Report a bug
Roles: All roles
Tell the developer that something does not work.

1. Press the card **Something is broken**.
2. Type a short summary in the large first line.
3. Under **What happened** and **What you expected**, write what you saw. Click at the end of each heading, press
   Enter, and type.
4. Check **Which screen**. Press **change** to set it.
5. Press **Send report**. Your report opens, with its reference, for example **RPT-2120**, and the status
   **UNTOUCHED**.

To report a bug on the page you are on, press ⌘? (Ctrl+? on Windows) there. The form opens with **Which screen**
already filled in, and says **filled in for you**.

:::example A bug report
Summary: `AIP PDF will not open for EVRA`
What happened: `Pressed Download PDF. Nothing opened.`
What you expected: `The AD 2 EVRA PDF opens.`
Which screen: `/aip/EVRA`
:::

:::how-it-works
Every report also carries six technical details: the page, your role, your browser, the screen size, the state of
the portal's services, and its last request. Press **Review** on **Clearway will attach 6 technical details** to see
them. Nothing from the flight data is sent.
:::

## Make a suggestion
Roles: All roles
Ask for a change.

1. Press the card **I have a suggestion**.
2. Type a short summary in the first line.
3. Press Enter, and describe the change.
4. Press **Send report**.

Suggestions are read weekly, not daily. The form says so.

:::example A suggestion
Summary: `Show the airport name on the wall's NOTAM card`
Below it: `Dispatchers check the ICAO code against a list. The name would save a step.`
:::

## Ask how to do something
Roles: All roles
Ask a question. The Digital Wall guide is searched first.

1. Press the card **How do I…**.
2. Type your question. Parts of the Digital Wall guide that match appear below it.
3. If one answers it, press **Open in the guide →**.
4. If none does, press **None of these help? Ask it as a question**.
5. Press **Send report**.

:::note It searches the Digital Wall guide only
These pages are not searched. For other parts of the portal, look here first, or send the question.
:::

## Chat with the developer
Roles: All roles
Start a live conversation.

1. Press the card **Chat with the developer**.
2. Type what you want to ask in **What do you want to ask?**.
3. Press **Start chat**. Your chat opens, with its reference, for example **CHT-2123**.
4. Wait in the chat. The line at the top says when the developer is notified, when they open the chat, and when they
   are there.
   Unverified: The developer's Telegram alert. The test system has no Telegram.

Unverified: The Telegram alert, in step 4. Going live was checked from the developer's side.

## Add a screenshot to a report
Roles: All roles
Show the developer what you see.

1. In the report, paste a screenshot with ⌘V (Ctrl+V on Windows). Or drop the file on the form, or press
   **choose a file**.
2. To mark something on it, press **✎ Annotate**.
3. Choose **Pen**, **Rectangle** or **Arrow**, and draw. **Undo** takes back the last mark.
4. Press **Save annotation**.
5. Type a caption under the picture if you want.

Files can be up to 10 MB: images, PDF, text, CSV, JSON, MP4 or ZIP.

:::example A screenshot
Mark: a rectangle around the Download PDF button
Caption: `The Download PDF button`
:::
