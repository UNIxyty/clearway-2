# The phone shell (`/m`)

Mobile Stage 2 (2026-10-18), from the Claude Design project's `mobile-portal-spec.md`. The portal hosts the phone:
one shell at `/m` with a 56 px app bar, the page, and a tab bar — **Wall · Flights · Intake · Agent · More**
(Intake and Agent only for people the Ops Agent is enabled for; Intake carries the needs-you count). **More** is a
sheet listing every other page by section, from the same `topicsForRole` the desktop sidebar uses; a page that has
a phone counterpart (`M_ROUTES` in `components/m/PhoneShell.tsx`) opens it, the rest open the desktop page in the
phone's browser. Tier 3 pages (a grid or a runner that needs a wide screen — only Permissions so far) are marked
**Desk** and get one honest screen in Stage 3.

## One breakpoint

`PHONE_MAX_WIDTH = 768` in `components/m/viewport.ts`, the wall's own `BP.phoneWide = 767` with the other sign. Under
it the Tier 1 desktop pages send the person to their counterpart, once, after the first measurement
(`components/m/PhoneRedirect.tsx`: `/agent` → `/m/agent`, `/agent/intake` → `/m/intake`, `/aip` → `/m/airport`,
`/aip/<ICAO>` → `/m/airport/<ICAO>`), and the ops-room display at `/digital-wall/timeline` sends a **signed-in person** on a
phone-sized screen, upright or sideways, to `/m/wall` (`opsboard-react/src/components/mobile/ResponsiveWall.jsx`;
`PhoneWall.jsx` is retired). Who is asking decides, not the orientation: a **registered screen** — one with a device
token, `AuthGate`'s `deviceMode`, or one still waiting to be paired — stays on the display at any size, because a
small screen mounted sideways in an ops room is a wall, not a phone; with no session and the backend unreachable
nobody is redirected. A screen that is phone-sized gets the mini timeline sideways (design A6) and the reduced
timeline upright; a tablet keeps the tablet layout. At or above the breakpoint the `/m`
pages still work, as a 430 px column, and the desktop pages keep their own layout — nothing redirects the other way.

## The facts are shared, not copied

The ops-room display is the authority. The phone wall is its own smaller thing and may show less, but what it shows
must be the same fact: `shared/wall-facts.mjs` holds the status rules (`statusFromFlight`, `STATUS_LABEL`,
`STATUS_TOKEN`), the time arithmetic (`flightTimes`: what counts as the departure and arrival time, ETD/CTOT/STD and
ETA/LDG, deltas, overdue), the marker and check keys (`markerKeysOf`, `openChecksOf`, `CHECK_KEYS`). The display's
`mapFlight` (`opsboard-react/src/services/timelineApi.js`) and `FlightPill` are built from it; the phone's
`lib/m/wall.ts` imports the same module. The display was proven pixel-identical before and after the move
(`rig/.scratch/display-baseline.mjs`). Change a rule there and both change; a rule that exists in only one place is a
bug.

The phone reads the wall's own API on the same origin (`/digital-wall/api/...`, cookie auth): the board as the display
fetches it, `notam-check/today` for the NOTAM sign, `flights/normalized` for the Flights list, `flight-checks` and
`notam-check/ack` to mark. It holds no data of its own and has no time overrides: there is no Edit on a phone flight;
the wall holds no overrides either.

## Pages (Tier 1)

| Page | Data | Loading · empty · error |
| --- | --- | --- |
| `/m/wall` | the board, 30 s poll and on return to the tab; Attention (open checks, soonest first) / All with the now-line; 6H · 12H · DAY | card skeleton · "Nothing open" / "No flights in the next N hours" with a way out · the last good board stays under a "Not updating" banner |
| `/m/wall/[id]` | one flight: status, times, the five checks with who checked and when, Weather and NOTAMs links; `?check=k` opens the sheet | row skeleton · "not on the wall" · "Couldn't load the flight" with Try again |
| `/m/flights`, `/m/flights/[id]` | every cached flight, by UTC day, search over callsign / reg / airport / trip | row skeleton · "No flights on …" / "Nothing matches" · error with Try again |
| `/m/intake`, `[id]`, `[id]/leg/[n]`, `[id]/confirm` | the intake API as the desktop uses it (`intakeApi`); the question first, answered from the list; legs with issues; the existing `ConfirmDialog` | card/row skeleton · "Nothing needs you" · error with Try again |
| `/m/agent` | `useThread`, the same composer, suggestions; context from `?icao=` / `?flight=` or the wall | the thread · suggestions · the failed send is said in the thread and the composer stays |
| `/m/airport`, `/m/airport/[icao]` | `/api/search`, `/api/notams`, `/api/weather`, `/api/aip/resolve`; NOTAM categories from the wall's rules; "Only during <flight>" ±1 h from the board | each source loads and fails on its own; the AD 2 copy on paper with the date it was fetched, never a promise of a refresh |

Marking from the phone is the wall's own model: Weather, Important, CAA and Limitations are per flight per cycle
(`wall.flights.check`); NOTAMs are per airport per Riga day (`wall.notam.ack`), the same acknowledgement as the NOTAM
Check page, so marking EETN's NOTAMs from one flight marks them for every flight at EETN today. No undo, as on the
wall.

## Tokens

`shared/mobile-tokens.css` (`--mx-*`): the shell, the now-line, the search mark, the five check chips, paper. Loaded
after the portal's tokens and never redefines a `--cw-*` token; `tailwind.config.ts` exposes them as `mx.*`. The
phone follows the portal's one stored theme choice (`cw-theme`) and motion choice (`cw-motion`), like every portal
page — docs/portal-tokens.md.

## Deliberate differences from the spec

- **No Edit of times on a phone flight.** The wall holds no overrides, so the phone cannot either.
- **Passengers, radar and services links are not on the phone flight page** until Stage 4 (the passenger viewer).
- **The display's redirect asks who, not which way up** (decided 2026-10-19): a person on a phone-sized screen goes
  to `/m/wall` in either orientation; a registered screen never does.
- **The shared composer's icon buttons are 30–36 px on a desk.** On a phone a scoped rule makes every composer
  button 44 px and hides the keyboard hint for voice; the composer itself is unchanged.

## Checks

`node --env-file=.env.rig rig/mobile/tier1-check.mjs` (the rig behind `:3999`, the wall dist built): every page above
at 390 × 844 in light and in dark — no horizontal overflow (nothing past the edge unless an ancestor scrolls or clips
sideways), every target ≥ 44 px, no page error, photographed at 2× to `rig/.scratch/shots/m-*.png`; each page's
loading, empty and error state by holding, emptying or failing its own route; the redirects at 390 and not at 1024;
the display redirect for a person upright and sideways, and not for a registered screen; the facts (the phone's flight page shows the
times and status `shared/wall-facts.mjs` computes from the wall's data); marking Weather from the sheet, then put back.
