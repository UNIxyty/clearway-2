---
title: Agent access
summary: Who can use the Ops Agent, and the switch that turns it off for everyone.
status: written
roles: Developer by default
updated: 2026-10-14
related: ops-agent/chat
---

<!-- Written 2026-10-14 from the code (components/agent/AgentAccess.tsx) and by doing every task on the test system as
     a Developer. -->

Open it from the portal's sidebar: **Developer** › **Agent access**. Until someone has access, the agent does not
appear anywhere for them: no menu, no page.

## Give someone access to the agent
Roles: Developer by default
Let a person use the Ops Agent.

1. Type the person's sign-in email in **Work email**.
2. Type why in **Note** if you want.
3. Press **Grant access**. The person is listed, with who granted it and when.

The address must belong to an existing portal account. If not, the page says **No account found for**, with the
address.

:::example A grant
Work email: `alice.example@example.com`
Note: `Second approver for the knowledge base`
:::

## Take someone's access away
Roles: Developer by default
Stop a person using the agent.

:::warning It takes effect at once
The person loses the agent immediately, even in a chat they have open now.
:::

1. Press **Revoke** on the person's row.
2. Read the window **Revoke agent access?**.
3. Press **Revoke access**. The count of people with access goes down by one.

To give it back, grant access again.

## See access that was taken away
Roles: Developer by default
See who had access before, and who took it away.

1. Turn on the switch beside **Show revoked grants**. The words are not part of the switch: press the switch itself.
2. Read the pale rows marked ✕. Each says when access was granted, when it was revoked, and by whom.

:::example A revoked row
Row: `alice.example@example.com granted 09 OCT 21:47Z · revoked 14 OCT 10:17Z by developer@example.com`
:::

## Turn the agent off for everyone, or back on
Roles: Developer by default
Stop the agent for every user at once, for example while answers are wrong.

:::warning Everyone loses the agent at once
Turning it off overrides every person's access. **Ops Agent** disappears from their sidebar, and its pages say **Not
found**.
:::

1. Press **Disable for everyone**. The window **Disable the agent for everyone?** opens.
2. Type why in **Why are you disabling it?**: at least 3 characters. It is recorded.
3. Press **Disable agent**. The card says **Agent is disabled for everyone**, with your reason, your address and the
   time.
4. To turn it back on, press **Enable**. It does not ask first. The card says **Agent is enabled** and **Re-enabled**.

:::example A reason
Why are you disabling it?: `Answers about NOTAMs are wrong today`
:::
