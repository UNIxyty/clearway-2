---
title: Webhooks
summary: The change notices Leon sends the wall for each operator, so flight changes arrive as they happen.
status: written
roles: Everyone can view; changes are Admin and Developer by default
updated: 2026-10-14
related: digital-wall/operators
---

<!-- Written 2026-10-14 from the code (opsboard-react/src/components/console/WebhooksPage.jsx,
     digital-wall/lib/leon-webhooks.mjs) and by doing each task on the test system, as a User and as an Admin, against
     the test system's Leon stand-in. -->

Open it from the portal's sidebar: **Digital Wall** › **Webhooks**. Each active operator has a card. Without
permission to change it, the page says **View only.**

A webhook asks Leon to tell the wall when something changes: a landing, a cancellation, new times. The wall then
reads that flight again. Without webhooks the wall still reads every operator every 2 minutes.

## Check the webhooks' health
See whether Leon is sending each operator's change notices.

1. Press **Refresh health**, at the top. The page asks Leon for its current list.
2. Read the label next to each operator's name. The table below says what each means.
3. Read each event's line. **live on Leon** means it works. It also says when the last event came.

| Label | What it means |
|---|---|
| **Healthy** | Every event that is switched on is registered in Leon. |
| **Registering…** | Some events are switched on but not confirmed in Leon. A new operator stays like this until someone presses **Re-register all**. |
| **N trigger(s) need attention** | Some events failed. The card shows why. |
| **Live on Leon · >24h silent** | All is registered, but no event has come for more than 24 hours. |
| **Disabled** | No event is switched on. |
| **Status unknown (Leon unreachable)** | Leon did not answer **Refresh health**. |

Unverified: The labels other than Healthy and Registering…. The test system's Leon always answered, and nothing failed.

## Re-register an operator's webhooks
Roles: Admin and Developer by default
Register every switched-on event for one operator again.

Do this after adding an operator, or after changing its token or subdomain.

1. Find the operator's card.
2. Press **Re-register all**. A message says the events are registered, for example **Re-registered all enabled
   events for** and the operator.
3. Read the card. Each switched-on event says **live on Leon**, and the label says **Healthy**.

## Turn an event on or off
Roles: Admin and Developer by default
Choose which changes Leon reports for an operator.

1. Find the operator's card, and the event's line.
2. Switch the event on. A message says it is registered, and the line says **live on Leon**.
3. To stop it, switch it off. A message says it is removed.

| Event | What it reports |
|---|---|
| **flightWatchChanged** | Times set or changed, such as take-off and landing |
| **flightWatchCreated** | The first times recorded for a flight |
| **flightCancellation** | A flight cancelled |
| **flightScheduleChange** | Planned times or airports changed |
| **flightCreate** | A new flight |
| **tripStatusChanged** | A trip moved between option and confirmed. Off when an operator is added. |

## See what Leon sent for an event
Read the last notices Leon sent for one event, and what each changed on the wall.

1. Press the clock on the event's line (**Trigger history — what Leon pushed and what it changed**). The history
   opens, newest first.
2. Read each line: the date and time in UTC, the flight, and what changed, for example **landed (ATA 12:34)**.
3. Press **✕** to close it.

If nothing has come yet, it says **No events received yet for this trigger — history appears as Leon starts
pushing.**

Unverified: History with events in it. The test system's Leon never sends events, so only the empty history was seen.

## Delete a webhook
Roles: Admin and Developer by default
Remove one event's registration in Leon.

1. Press the bin on the event's line (**Delete webhook**). It shows only for a registered event.
2. Read the message. The event is removed, and its switch is off.

This is the same as switching the event off. To get it back, switch it on.
