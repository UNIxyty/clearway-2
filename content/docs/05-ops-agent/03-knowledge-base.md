---
title: Knowledge base
summary: The documents the agent answers from. Developers upload and approve them; an approved document is quoted to everyone as the source.
status: written
updated: 2026-10-14
roles: People with Ops Agent access; uploading and approving are Developer by default
related: ops-agent/chat
---

Open it from the portal's sidebar: **Ops Agent** › **Knowledge base**.

The agent uses two kinds of document. An **authoritative** document is quoted word for word, and names the person
who approved it. A **reference** document is searched and cited, but never quoted as approved text. The agent never
uses a document that is still awaiting approval.

:::statuses
Indexed (green): The agent uses it.
Awaiting approval (amber): Uploaded. The agent does not use it until someone approves it.
Rejected (red): Not to be used. The uploader can see why.
Failed · no text (red): No text could be read from the file.
:::

## Open a document
Read a document in the portal's viewer.

1. Find the document in the list. Its tier and status are on the row.
2. Press the row. Its details open on the right, and an **Open** button appears at the right of the row.
3. Press **Open**. The document opens in the viewer, with **Ask about this document**, **Email**, **Download** and
   **Open source** at the top.

In the viewer, **Ask about this document** opens the agent with the document as the question's subject.

## Download a document's original file
Save the file as it was uploaded.

1. Press the document's row. Its details open on the right.
2. Press **Original file**. The browser saves the file with its own name, for example `kb-sample.md`.

Or open the document and press **Download**.

## Upload a document
Roles: Developer by default
Add a document for the agent to read.

1. Press **Upload**, at the top right. The card **Upload a document** opens.
2. Press **Choose file**, and choose the file. The **Title** fills in from the file name.
3. Check the **Title**. Fill in what you know: **Source**, **Version**, **Effective date**, **Country**, **ICAO**.
4. Press **Upload and classify**. A bar shows the upload.
5. Find the document in the list. It says **Awaiting approval**, with the tier the agent proposes.

:::warning Only text files can be approved
Text, Markdown, CSV and JSON files are read, and the agent proposes a tier. Other files, such as PDF and Word, are
kept, but no text is read from them, so they cannot be approved or indexed.
:::

:::how-it-works
Files can be up to 100 MB. Uploading never makes a document available to the agent. Someone else must approve it.
:::

## Approve or reject a document
Roles: Developer by default
Decide whether the agent may use a document, and how.

:::warning Approving makes it the source for everyone
An approved authoritative document is quoted to every user, word for word, with your name as approver. There is no
button to undo an approval.
:::

1. Press the document's row. Its review opens on the right.
2. Read **CHECK THE EXTRACTED TEXT**, clause by clause. Press **Next clause** and **Previous clause**, or
   **Compare all** to see every clause.
3. Press one of the three buttons. The table below says what each does.
4. Read the line at the top of the review, for example **Approved as authoritative · by you · 2 clauses now
   quotable**.

| Button | What happens |
|---|---|
| **Approve as authoritative** | The agent quotes these clauses exactly, and names you as approver. |
| **Reference only** | The agent searches and cites it, but does not quote it as approved text. |
| **Reject** | Type why in **Note to the uploader**, and press **Reject with note**. The uploader can see your note. |

You cannot approve a document you uploaded yourself: the button is greyed out, with **You uploaded this document —
someone else must approve it**.

Unverified: Reference only. Approving and rejecting were checked.

## Edit a document's details
Roles: Developer by default
Change a document's title, version, effective date, ICAO code or tags. The file does not change.

1. Open the document.
2. Press **Edit record**, at the top of the viewer.
3. Change the **Title**, **Source**, **Version**, **Effective from**, **ICAO** or **Tags**.
4. Press **Save record**. The details on the right show the new values.

:::note Approved clauses keep their old details
Clauses approved earlier keep the version, date and ICAO code they had when they were approved.
:::

## Re-upload a missing file
Roles: Developer by default
Put back a document's file when the list says it is missing.

1. Press the row marked **File missing**. Its details open on the right.
2. Press **Re-upload**, followed by the file name.
3. Choose the file. The document opens again, and the **File missing** mark goes.

If you choose a different file from the one that was approved, the message asks you to review its approved clauses.
