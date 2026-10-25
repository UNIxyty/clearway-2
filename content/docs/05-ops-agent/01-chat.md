---
title: Chat
summary: Ask the agent in plain words, on its own page or in the panel beside any page. It answers with sources, and asks before it changes anything.
status: written
roles: People with Ops Agent access
updated: 2026-10-14
related: ops-agent/history, ops-agent/settings, ops-agent/knowledge-base
---

<!-- Written 2026-10-14 from the code (components/agent/pages/FullPageChat.tsx, components/agent/panel, thread/*) and
     by doing each task on the test system as a User, an Admin and a Developer. The test system's agent answers with
     the real model; its flights, NOTAMs and passengers are invented. -->

Open it from the portal's sidebar: **Ops Agent** › **Chat**. Or press ⌘J (Ctrl+J on Windows) on any page, to open
the agent in a panel beside it.

[screenshot: ops-agent-chat | Chat: Ask the agent in plain words, on its own page or in the panel beside any page. It answers with sources, and asks before it changes anything.]

The agent reads the airport documents, the wall, NOTAMs and Leon. It changes something only after you confirm it,
and it can never do more than you are allowed to do yourself.

# Ask

## Ask the agent a question
Type a question in plain words and read the answer.

1. Open **Ops Agent** › **Chat**.
2. Type your question in the box **Ask, type @ for a flight or airport, / for an action…**. Or press one of the
   suggested questions.
3. Press Enter. Shift+Enter starts a new line.
4. Read the answer. Its source is under it, for example **Web · CrewBriefing NOTAMs · EVRA**.
5. To stop an answer while it is being written, press **Stop · Esc**. The chat says **Stopped by you**, and keeps
   what was written. Press **Continue** to go on.

To start again with an empty chat, press **New chat**.

:::example A question
Question: `Any NOTAMs I should know about at EVRA?`
Answer: four NOTAMs, each with its number, what it says, and until when
Source: Web · CrewBriefing NOTAMs · EVRA
:::

:::note When a part could not be answered
If a source does not answer, the reply says so, for example **get_weather didn't answer**, and says that it has not
said anything about that part. The rest of the reply stands.
:::

## Open the agent beside any page
Ask the agent without leaving the page you are on.

1. Press ⌘J (Ctrl+J on Windows). Or press **Ops Agent**, at the top right of the portal. The panel opens on the
   right.
2. Ask your question in the box at the bottom.
3. To open the chat on its own page, press **Open full page · ⌘⇧J**.
   Unverified: Open full page, Minimise, resizing and closing the panel were not tried.
4. To close the panel, press **Close · Esc**, or ⌘J again. The chat stays; ⌘J opens it again.

To keep the panel open but small, press **Minimise**. To make it wider or narrower, drag its left edge.

Unverified: Open full page, Minimise, resizing and closing. Opening the panel and asking in it were checked.

## Ask about the page you are on
Ask about the airport, flight or document you are looking at.

1. Open the page, for example an airport's page.
2. Press **Ask about**, followed by the page's name, at the top of the page. Or press ⌘J.
3. Read the line at the top of the panel, for example **Asking about EVRA**. The agent uses it as the subject.
4. Ask your question, or press one of the suggested questions.

:::example On EVRA's page
Line: Asking about EVRA
Suggested: Any NOTAMs I should know about at EVRA?
:::

## Attach a file to a question
Give the agent a file to read with your question.

1. Press **Attach**, and choose the file. Or drag the file onto the chat, or paste it.
2. Wait until the file's chip shows its size. Before that, it says **Uploading**.
3. Type your question about the file.
4. Press Enter.

| File | Limit |
|---|---|
| PDF, Word, Excel, CSV, text, Markdown, JSON | 25 MB each |
| Images (PNG, JPG, GIF, WEBP) | 3.75 MB each |
| Files per message | 3 |

A chip that says **Can't be read** or **Partly read** means the agent did not read all of the file.

:::how-it-works
The agent treats what a file says as a note, not as an official source. It checks it against the NOTAMs and
documents it can read, and says when they differ.
:::

## Mention a flight, airport or document
Name a flight, airport or document exactly, from a list.

1. Type @. A list opens.
2. Type the start of a callsign, ICAO code, registration or document name, for example `EVR`.
3. Choose from the list. Press Enter to take the highlighted one. The name goes into your question.
4. Finish your question, and press Enter.

The tabs at the top of the list narrow it: **@flight**, **@airport**, **@operator**, **@aircraft**, **@limitation**,
**@document**.

## Use a slash command
Start a common request from a list, with its blanks to fill in.

1. Type /. The list of commands opens.
2. Press the command you want, for example **/notam**. It turns into a chip, with its blank after it.
3. Type what goes in the blank, for example `EVRA`. Press Tab to go to the next blank.
4. Press Enter to send.

:::note Choose the command with the mouse or the arrow keys
If you type part of a name and press Enter, the list may pick another command whose description has the same word.
:::

You only see the commands you are allowed to use.

| Command | What it does |
|---|---|
| **/flights** | Flights for a day, operator or airport |
| **/flight** | One flight: route, times, status, limitations, NOTAM check |
| **/aip** | The AIP AD 2 document for an airport |
| **/gen** | The country's GEN 1.2 rules for an airport |
| **/notam** | Active and new NOTAMs for an airport |
| **/wx** | METAR and TAF, raw and decoded |
| **/caa** | CAA contacts and permit records for a country |
| **/limitation** | List limitations, or add one (asks first) |
| **/important** | Important notices on the wall, or add one (asks first) |
| **/wall** | What the wall shows, or show or close a flight on it (asks first) |
| **/manifest** | A passenger manifest PDF for a flight |
| **/blank-manifest** | A blank manifest form, to fill in by hand |
| **/email** | Send something from this chat by email (asks first) |
| **/search** | Search the knowledge base |
| **/doc** | Open a knowledge-base document by name |
| **/undo** | Undo your last change (asks first) |
| **/model** | Choose the model for your next message |
| **/help** | What the agent can do here |

## Talk to the agent by voice
Ask a question out loud.

1. Press ⌥⇧Space (Alt+Shift+Space on Windows). The box says **Listening…**.
2. The first time, the browser asks to use the microphone. Press **Allow microphone**.
   Unverified: The first-time question was not seen: the test browser already allowed the microphone.
3. Speak your question. What you say appears in the box.
4. Press ⌥⇧Space again to send it.
5. Read the answer.

:::note Voice never confirms a change
Saying "yes" does not confirm a change. Confirm it on the screen.
:::

:::how-it-works
The audio is turned into text and then thrown away. Only the text is kept in the chat. An admin can switch voice off
for everyone.
:::

Unverified: The first-time microphone question. Talking and sending were checked.

# Changes

## Confirm or cancel a change
When the agent wants to change something, it asks first. Nothing changes until you confirm.

:::warning Check the card before you confirm
The card says what will change. Read the **Action** and **Target** rows first.
:::

1. Read the card **Confirm:**, followed by what will change. The box below it is locked until you answer.
2. Press **Create** (or **Confirm**, or **Confirm and send** for an email). Or press ⌘⏎.
3. Read the line that replaces the card: what was done, with **applied**, who confirmed it and when.

To stop instead, press **Cancel**, or Esc. Nothing changes.

The card expires after 5 minutes. After that, nothing changes; ask again.

:::example A limitation the agent proposes
Card: Confirm: Add limitation "Rig test: de-icing pad 2 closed" for EVRA
Button: Create
After: Add limitation … for EVRA — applied · Confirmed by you · 22:07:24Z
:::

:::note A change that cannot be undone
For a change that cannot be undone, the card says so. Hold **Hold to delete** for 2 seconds to confirm. Release it
sooner and nothing happens.
:::

Unverified: Cancel, and the hold-to-delete card. Confirming was checked.

## Undo a change the agent made
Ask the agent to put back a change it made for you.

1. Ask in words, and name the change. For example: `Undo the change that added the limitation "Rig test: de-icing
   pad 2 closed" at EVRA.`
2. Read the card. It says **Confirm: Undo action**, followed by the change's number.
3. Press **Confirm**. The line says the undo is applied.

You can only undo your own changes. Limitations, important notices, reports, wall settings, operators and aircraft
visibility can be undone. Emails, files and a flight shown on the wall cannot.

:::note Name the change
The agent finds the change by what you say. If it answers that there is nothing to undo, ask again and name the
change and where it was made.
:::

## Make a limitation from a document's text
Roles: Admin and Developer by default
Turn a passage of a document into a limitation.

1. Open the document, and select the passage. Copy it.
2. In the chat, ask: `Add a limitation for EVRA with this text:` and paste the passage.
3. Read the card the agent proposes.
4. Press **Create**.

:::note The Limitation… button on selected text does not work yet
When you select text in a document, a bar offers **Limitation…** and **IMPORTANT…**. Pressing them does not show a
card, and nothing is created. Ask in the chat instead.
:::

# Files and sources

## Open a source the agent quotes
Check where an answer came from.

1. Find the source under the answer, for example **Company · digital-wall limitations store · EVRA**.
2. Text quoted from an approved document is framed and marked **VERBATIM · APPROVED TEXT · Reproduced exactly. Not
   summarised.** It says who approved it and when.
3. To open the document, press **Open source**. The document opens beside the chat.

:::example A quoted rule
Question: `How long before departure must de-icing at EVRA be requested? Quote the rule.`
Frame: VERBATIM · APPROVED TEXT
Text: 1. De-icing at EVRA must be requested at least 2 hours before departure.
:::

Unverified: Where Open source opens the document. The quoted frame was checked.

## Make a passenger manifest
Make the passenger manifest PDF for a flight.

1. Type `/manifest`, and press Enter. A list of flights opens, soonest first.
2. Choose the flight. Or type a callsign, registration, route or date to find it. **Blank form** gives an empty form.
3. Wait. The PDF opens beside the chat.
4. Read the notice in the answer: **READ BEFORE SENDING**, with the warnings, or that there are none.

:::example A manifest
Flight: KLJ7350 · LY-BGS · EGLF → EVRA
File: PAX-Manifest_KLJ7350_13Oct2026.pdf
Notice: READ BEFORE SENDING · 1 WARNING · 68 passengers · 3 crew · 71 on board · 5 pages
:::

:::note When an operator's flights are missing
The list says **Unavailable**, with the operators whose Leon connection failed. Their flights are not listed.
:::

## Download or email a file from a reply
Save a file the agent made, or send it by email.

1. Find the file in the answer, under **GENERATED FILE**.
2. Press **Download** to save it, or **Open** to see it.
3. To email it, press **Send…**. The agent asks who to send it to.
4. Answer, for example `To me, please.`
5. Read the card **Confirm before I send**, and press **Confirm and send**. The line says **Sent**.

:::warning Sent does not always mean it went
If the email fails on the way out, the line can still say **Sent**. For anything that must arrive, ask the person
to confirm they have it.
:::

## Export a table from a reply
Save a table from an answer as a CSV file.

1. Open the chat on its own page.
2. Find the table in the answer.
3. Press **Export CSV**, under the table.

The button shows on tables with more than 10 rows.

Unverified: Export CSV. The test answers' tables had 10 rows or fewer, so the button did not show.
