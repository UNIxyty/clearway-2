---
title: Component sheet sample
status: written
roles: Admin, Developer
---

<!-- The text the docs component sheet (/developer/docs-components) renders: every block, written the way a writer
     writes them (docs/how-to-write-docs.md). Everything here is invented: Example Air, EXA123, the version numbers. -->

## Add an operator
Roles: Admin and Developer by default
Connects one airline's flight system to the wall. A task: number, role, copy-link button, title, one-sentence summary.
Unverified: The task's own line, counted by the docs check: what could not be done on the test system, and why.

:::warning The wall stops updating
While an operator is paused, its flights do not reach the wall.
:::

1. Open **Operators** and press **Add operator**.
   [screenshot: sheet-stand-in | A whole screen. Fills the column; the stage keeps the same padding whatever the shape.]
2. In **Operator name**, type the name people know it by.
   Note: A note under a step: smaller, muted, with an icon.
3. Press **Save operator**.
   [screenshot: sheet-not-taken | A screenshot that has not been taken yet.]
   Unverified: A step that was not done on the test system, marked where the reader meets it.

:::example An operator called Example Air
Operator name: Example Air
Subdomain: `exampleair`
Refresh token: pasted, never typed
:::

:::note Flights already on the wall stay put
A note sits below the steps it is about.
:::

:::how-it-works
How it works: the plain explanation after the steps, for the reader who wants to know why.
:::

## Delete an operator
Roles: Admin, Developer
A task that cannot be undone, with no screenshots yet. The red band comes before the steps.

:::cannot-be-undone
Deleting an operator removes:
- its connection and token
- all of its cached flights
- its aircraft settings
:::

1. Press the bin on the operator's row.
2. Read the dialog, then press **Delete**.

## Codes and values
Inline code scales with the sentence; a block has a title, Copy, and muted explanation lines.

Type the destination as `EGLF`, not `FAB`. The field is called **ADES** on the form.

```Scheduled email subject line
SCHED EXA123 EVRA-EGLF 14OCT 1420Z
# callsign  ADEP-ADES  date  off-block (UTC)
```

## Tables
A field list (name, what to enter, an example) and a status list with coloured badges.

| Field | What to enter | Example |
|---|---|---|
| Operator code | Lowercase. Operator, then base, joined by a hyphen. | `exa-exa` |
| Login | The address the operator signs in with. | `ops@example.aero` |
| ADEP / ADES | Four-letter ICAO code. | `EVRA` |
| Off-block | UTC, 24-hour, ending in Z. | `14:20Z` |

:::statuses
Synced (green): The last sync worked. Changes arrive within a minute.
Syncing (blue): The first sync is running. Normal for a minute after adding.
Paused (amber): Someone paused the operator. Its flights are off the wall.
Error (red): The last sync failed; the error is on the row.
Not started (grey): Added, but never synced yet.
:::

## What's new and version history
A section's changes, newest first, and its earlier versions.

:::whats-new 3.4 · 2026-10-02
New: Operators can be paused without deleting them.
Changed: The sync health card shows how many flights are cached.
Fixed: A pill no longer jumps when its flight is checked.
:::

:::history
3.3 · 2026-09-20: Webhooks can be re-registered from the console.
3.2 · 2026-09-02: The wall shows a banner when it loses contact.
3.1 · 2026-08-14: Tablets get their own layout.
:::
