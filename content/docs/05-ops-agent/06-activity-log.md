---
title: Activity log
summary: What the agent did: its answers, the changes it made, what it sent and what it refused. You see your own rows; admins and developers see everyone's.
status: written
updated: 2026-10-14
roles: People with Ops Agent access
related: ops-agent/chat
---

Open it from the portal's sidebar: **Ops Agent** › **Activity log**. The log is read-only. Nobody can change or
delete a row.

## See what the agent did
Read each thing the agent did, newest first.

1. Choose a tab: **All**, **Answers**, **Changes**, **Sent** or **Denied**. The table below says what each lists.
2. To narrow the list, choose **Person**, **Tool** or **Date**.
3. Read the rows: **TIME**, **WHO ASKED**, **FROM**, **KIND**, **TOOL**, **ARGUMENTS**, **RESULT** and **CONFIRMED**.
4. Press a row to see the full record. Press it again to close it.
5. To see older rows, press **Load more**, at the bottom.

| Tab | What it lists |
|---|---|
| **All** | Everything |
| **Answers** | Each reply the agent gave |
| **Changes** | Changes the agent made or proposed, confirmed or not |
| **Sent** | Emails the agent sent or tried to send |
| **Denied** | What the agent was not allowed to do, or what a person declined |

:::example One row
TIME: 21:04:08Z
WHO ASKED: a.dispatcher@example.com
FROM: Console
KIND: WRITE
TOOL: create_limitation
RESULT: Applied
CONFIRMED: Confirmed 21:04:09Z
:::

:::how-it-works
You see your own rows. Admins and developers see everyone's, and can choose a person under **Person**. Times are
UTC. The table loads 60 rows at a time.
:::

## Open the chat behind an entry
Go from a row to the chat where it was asked.

1. Press the row. Its full record opens.
2. Read **REQUEST**: the question that led to it.
3. Press the chat's title, after **Thread**. The chat opens on its own page.

:::note Only your own chats open
An admin or developer can see the request of someone else's row, but cannot open that person's chat. Rows under
**Answers** have no chat link.
:::

Unverified: Someone else's row, as an admin. Opening your own chat from a row was checked.

## Export the activity log
Save the rows you are looking at as a CSV file.

1. Choose the tab and the filters you want.
2. Press **Export CSV**. The browser saves a file called `agent-activity-` with today's date.

:::warning The file has 60 rows at most
The export holds the 60 newest rows that match the tab and filters, not the whole log.
:::

Unverified: The 60-row limit. The test log was shorter. Saving the file was checked.
