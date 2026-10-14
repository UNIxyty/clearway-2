---
title: Settings
summary: Your own agent preferences, and for admins the agent's settings for everyone: models, capabilities, shortcuts and flight intake.
status: written
updated: 2026-10-14
roles: People with Ops Agent access; the organisation's tabs are Admin and Developer by default
related: ops-agent/chat, ops-agent/flight-intake, ops-agent/mailbox
---

Open it from the portal's sidebar: **Ops Agent** › **Settings**. The page is called **Agent settings**. It has five
tabs: **Your preferences**, **Model tiers**, **Capabilities**, **Access & sites** and **Flight intake**. Tabs marked
**ADMIN** are for everyone in the organisation. Each change saves when you make it, unless the page shows a **Save**
button.

## Choose your default model
Choose how much thinking the agent puts into your answers.

1. Open **Your preferences**.
2. Under **Default model**, choose **Automatic**, **Fast · Haiku**, **Standard · Sonnet** or **Reasoning · Opus**.

:::how-it-works
**Automatic** lets the agent choose for each question. A fixed choice is the lowest it uses: it may still use a
stronger model for a hard question. To choose for one question only, type `/model reasoning` before it.
:::

## Skip confirmation for low-risk actions
Let the agent make changes that can be undone without asking you first.

1. Open **Your preferences**.
2. Switch on **Skip confirmation for low-risk actions**.
3. To see which actions this covers, press **Which actions qualify**.

:::how-it-works
It is off to start with. Only changes that can be undone skip the question. Each one is logged as auto-confirmed,
and the reply has an **Undo**. Voice never skips a confirmation. An admin can turn this off for everyone.
:::

## Set the model for each tier
Roles: Admin and Developer by default
Choose which model answers at each level, and what to use if it is not available.

1. Open **Model tiers**.
2. For each tier, type the **Model ID**, and the **Fallback, if it is unavailable**.
3. Under **Escalation**, set when a question moves up a level.
4. Press **Save routing**. Or press **Discard**.

The change applies from the next message.

Unverified: Saving model tiers. Changing them would have changed the test system's agent for the rest of the run.

## Turn the agent's capabilities on or off
Roles: Admin and Developer by default
Switch a part of the agent on or off for everyone.

:::warning This changes it for everyone
Off removes the ability for everyone, whatever their role allows.
:::

1. Open **Capabilities**.
2. Switch on or off: **Web search**, **Voice**, **Write actions**, **Send email**, **Auto-approve reference uploads**
   or **High-knowledge model**.

## Change the agent's keyboard shortcuts
Roles: Admin and Developer by default
Choose the keys that open the agent, confirm a change and start voice.

1. Open **Capabilities**, and find **Keyboard shortcuts**.
2. Press the shortcut you want to change. It says **Press keys…**.
3. Press the new keys. A shortcut needs a modifier key, such as ⌘, Ctrl or ⌥. The shortcut shows the new keys, and
   the change is saved. Press Esc to stop without changing it.
4. To use different keys on Mac and Windows, switch on **Separate shortcuts for Mac and Windows**.
   Unverified: Separate shortcuts for Mac and Windows was not tried.
5. To go back to the shipped keys, press **Reset to defaults**. It does not ask first.

| Action | Shipped keys |
|---|---|
| Open or close the panel | ⌘J (Ctrl+J on Windows) |
| Expand to the full page | ⌘⇧J |
| Confirm a standard change | ⌘⏎ |
| Talk | ⌥⇧Space |

Unverified: Separate shortcuts for Mac and Windows. Changing a shortcut and Reset to defaults were checked.

## See who can do what with the agent
Roles: Admin and Developer by default
See, for each person, what the agent may do for them.

1. Open **Access & sites**.
2. Read **Who can do what**: for each person, **Read**, **Wall**, **Email** and **Approve KB**, each **Yes**, **Asks**
   or **No**.

:::warning This table is not the real permissions
It shows the same answers for everyone, whatever their role allows. For what each role may do, see
[Permissions](admin/permissions).
:::

## Set where flight requests arrive and who is told
Roles: Admin and Developer by default
Choose the addresses that receive flight requests, and who gets the intake emails.

1. Open **Flight intake**.
2. Under **Receiving addresses**, type an address and press **Add**. Remove one with **×**.
3. Under **Send intake emails to**, add the addresses that get the **Review**, **Loaded** and **Needs you** emails.
4. Press **Save**.

At least one receiving address must stay. Changes apply within 15 seconds.

Unverified: Changing these addresses. Changing them would have stopped the test system's mail. The same controls were checked under Agent mailbox access.

## Choose who can read the mailbox
Roles: Admin and Developer by default
Choose the people, besides admins, who may open the agent's mailbox.

1. Open **Flight intake**.
2. Under **Agent mailbox access**, type an address and press Enter. Remove one with **×**.
3. Press **Save**. The list says **Saved**, with the date and your address.

Admins and developers can always open the mailbox.

## Set how long emails are kept
Roles: Admin and Developer by default
Choose how many days the agent keeps request emails and their personal data.

:::cannot-be-undone
A shorter period deletes, at the next clean-up:
- raw emails and attachments older than the new period
- the personal data read from them
:::

1. Open **Flight intake**.
2. Under **Keep intake mail**, type the number of days, from 1 to 3650.
3. Press **Save**.

Unverified: Changing the period. A shorter period deletes mail at the next clean-up, so it was not changed on the test system.

:::how-it-works
The days count from when the email arrived, or from the request's last flight, whichever is later. Flights, times
and Leon numbers stay.
:::

## See this month's usage
Roles: Admin and Developer by default
See how much the agent has cost this month.

1. Read the box at the top right of the page: the month, the cost against the monthly cap, and how many replies and
   tool calls.
