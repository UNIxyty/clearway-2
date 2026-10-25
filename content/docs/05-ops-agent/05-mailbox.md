---
title: Mailbox
summary: Every email the agent's addresses received or sent, and what was done with each one.
status: written
updated: 2026-10-14
roles: Admin, Developer, and the people named in the agent's Flight intake settings
related: ops-agent/flight-intake, ops-agent/settings
---

Open it from the portal's sidebar: **Ops Agent** › **Mailbox**. The page is called **Agent mailbox**. It holds
emails with passport numbers and dates of birth, so only some people can open it: admins, developers, and the people
listed in **Agent mailbox access** in the agent's settings. Others see **You don't have access to the agent
mailbox**.

[screenshot: ops-agent-mailbox | Mailbox: Every email the agent's addresses received or sent, and what was done with each one.]

The mailbox is not a mail program. You cannot write or answer emails here. All times are UTC.

## Find an email
Find an email by its sender, subject, text or flight.

1. Choose **Received** or **Sent**, at the top.
2. Choose a view. For received mail: **Needs attention**, **All**, **Processed**, **Replies** or **Ignored**.
   **Needs attention** opens first.
3. To search, type in **Search sender, subject, body, reference, registration, callsign, route**, and press Enter.
   The search looks only in the view you chose: choose **All** first to search everything.
4. To narrow the list, choose **Address**, **Status**, the date range, or **Attachments**.
5. Press an email to read it.

:::note Personal data is not searchable
Passport numbers, dates of birth and nationalities are left out of the search on purpose.
:::

:::how-it-works
**Needs attention** holds emails the agent could not read, could not recognise, or has not read yet. The list shows
the last 7 days to start with, and the newest 500. Choose a wider range for older mail.
:::

## Open the request an email belongs to
Go from an email to its flight request.

1. Find the email. A processed email shows its reference, for example **RIGPAX16 →**.
2. Press the reference, or press **Open request**, followed by the reference, in the email. Flight intake opens on
   that request.

## Process an email as a handling request
Roles: User, Admin and Developer by default
Turn an email the agent did not recognise into a handling request.

1. Open the email. It says **Not recognised** or **Failed**.
2. Press **Process as handling request**. A window opens.
3. Read what the agent will do. The window says when it expires, for example **Expires in 4:58**.
4. Press **Create handling request**. Or press **Cancel**.
5. Wait. The agent reads the email again. The email is then **Processed** and linked to the new request.
6. Press **Open request** to check it on Flight intake.

:::how-it-works
The agent reads the email again as a handling request. Nothing goes to Leon until someone checks and confirms the
request on Flight intake.
:::

## Process an email as a flight notification
Roles: User, Admin and Developer by default
Turn an email into a scheduled-flight request, by its provider reference.

1. Open the email.
2. Press **Process as flight notification**. A window opens.
3. Check the **Provider reference**: the quote number, 6 to 8 digits. Type it if it is empty.
4. Press **Create scheduled-flight request**. Or press **Cancel**. The button works once the reference has 6 to 8
   digits.
5. Open the new request on Flight intake. It waits for ops' answer, like any scheduled flight.

Unverified: The message the window shows after it is created. The request itself was created and checked.

## Ignore an email
Roles: User, Admin and Developer by default
Take an email out of **Needs attention**, with a reason.

1. Open the email.
2. Press **Mark as ignored…**. A window opens.
3. Choose a reason: **Not for us**, **Spam**, **Newsletter**, **Duplicate**, **Handled elsewhere** or **Other**.
4. Type a note if you want. It is shown to others. For **Other** it is required.
5. Press **Mark as ignored**. The message says the email no longer shows in **Needs attention**. It is listed under
   **Ignored**, with your name and reason.

To take it back, open the email and press **Not ignored · reprocess**.

## Reprocess an email
Roles: User, Admin and Developer by default
Ask the agent to read an email again with today's rules.

1. Open the email.
2. Press **Reprocess**. A window says what will happen.
3. Press **Reprocess** in the window. The message says the email is in the queue. It says **Waiting** until the
   agent has read it again.

If the email already has a request, the agent updates that request instead of making a second one.

## Forward an email to a person
Roles: User, Admin and Developer by default
Send an email to someone who needs it, as it arrived.

:::warning Personal data goes with it
The email is forwarded as received, with passport numbers and dates of birth. Forward it only to someone who needs
them. A forward cannot be called back.
:::

1. Open the email.
2. Press **Forward to a person…**. A window opens.
3. Type the address in **To**.
4. Type a note if you want.
5. Press **Forward**. The message says who it was forwarded to.

The email goes from the agent's address, with the original attached. It is listed under **Sent**.

## Open an email's attachments
Open or save a file that came with an email.

1. Open the email.
2. Find **ATTACHMENTS · OPEN IN A NEW TAB**. Each file shows its name, type, size and what the agent took it for.
3. Press **Open** to open the file in a new tab, or **Download** to save it.

:::note Opening personal data is logged
A file that contains personal data says so. Opening or saving it is logged under your name.
:::

## Show personal data in an email
Roles: User, Admin and Developer by default
See the passport numbers and dates of birth hidden in an email's text, for 30 seconds.

:::warning Showing personal data is logged
Each time you show it, your name and the time are logged.
:::

1. Open the email. Personal data shows as ••••••••.
2. Press **Show personal data in this message**.
3. Press **Show for 30 s**. Or press **Cancel**.
4. Read the data. To hide it sooner, press **Hide now**.

It also hides when you leave the window or open another email.

## Download the original email
Save the email exactly as it arrived, as an `.eml` file.

:::warning The file has the personal data
The saved email is complete, with passport numbers and dates of birth. Saving it is logged under your name.
:::

1. Open the email.
2. Open **Raw source and headers**. Or press `u`.
3. Press **Download .eml**. The browser saves the file, named `message-` and a number.
