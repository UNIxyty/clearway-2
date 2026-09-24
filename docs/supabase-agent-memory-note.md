# Flight tracking — options and cost

Part 6 asks for `get_flight_tracking(callsign)` "against Flightradar or
equivalent", and explicitly says to **confirm the plan and cost before wiring it**.

The tool is built and declared. It currently returns `available: false` with an
instruction to fall back to the wall's own schedule, so the agent handles the
absence gracefully rather than inventing a position. Enabling a provider is a
config change, not a build.

## What the agent would use it for

Only "where is this aircraft right now". The wall's own Leon feed is already
authoritative for **planned** times, and Part 2's `get_flight` / `search_flights`
cover that. Live tracking adds one thing: an actual position when a flight is
airborne and the schedule has gone stale.

That narrow use matters for cost — it is a per-question lookup, not a polling
feed, so request-priced plans suit it better than data-feed plans.

## Providers to consider

| Provider | Shape | Notes |
|---|---|---|
| **Flightradar24 Business API** | Commercial, quote-based | The brand named in the brief. Full coverage; pricing is a sales conversation, and their terms restrict redistribution. |
| **FlightAware AeroAPI** | Pay-per-query tiers | Transparent per-request pricing, good for a lookup-shaped use. Strong for scheduled/commercial traffic. |
| **adsb.fi / ADSB.lol / OpenSky** | Community ADS-B, free or low cost | No commercial guarantee and patchy low-altitude coverage. Fine for "roughly where is it", not for anything operational. |
| **Nothing** | — | The wall already knows the schedule. Live position may simply not be worth a subscription. |

## What I need from you

1. **Is live tracking actually wanted?** It is the only Part 6 capability that
   costs money per month.
2. If yes, **which provider**, and I will confirm the current pricing before
   wiring anything.
3. **Coverage expectation** — business aviation is patchier on community
   feeds than scheduled airline traffic, and this fleet is largely the former.

Prices move and I will not quote figures I have not checked against the
provider's own page at the time of wiring.
