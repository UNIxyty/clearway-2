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

## Tier 2 and Tier 3 (Stage 3, 2026-10-20)

Tier 2 — "readable and operable, nothing cut off" — is built from four patterns in `components/m/tier2.tsx`, chosen
per page as the design did (`mobile-tier2-data.js` › `kind`): a **list** that opens a detail (rows ≥ 60 px with one
trailing item: a meta time, a tone badge, a 44 px action, a 44 px call button, or a chevron), **cards** with a
severity edge, **blocks** (the dashboard), and **form** (grouped settings rows with 48 × 28 toggles, a chevron, or a
lock for read-only rows; a status card and an outlined danger button for Maintenance). No page uses a table. Loading
is shared (six row skeletons); every page carries its own empty and error copy, and Try again. The detail of a list
page is the same route with `?id=`, so the back button is the app bar's. Data comes through one hook
(`lib/m/t2.ts` › `useResource`: the portal's, the agent's and the wall's routes, a poll that keeps the last good
answer through a failure, errors through `ShownError`/`shownText`); writes through `useAction` with the same
permission gates as the desk — the server decides, the phone only draws what the person may do.

| Phone route | Desk page | Pattern | Writes from the phone |
| --- | --- | --- | --- |
| `/m/dashboard` | Dashboard | blocks | — (layout is set on a desk) |
| `/m/service-status` | Service status | list → detail | — (edited at /admin/service-status) |
| `/m/hidden-airports` | Hidden airports | list | Show again |
| `/m/notam-check` | NOTAM check (console) | list by to-check / checked | Mark checked (`wall.notam.ack`); a row opens the Tier 1 airport page |
| `/m/operators` | Operators | list → detail | pause / resume the sync, fetch flights again |
| `/m/aircraft` | Aircraft | list (search) → detail | shown on the wall |
| `/m/limitations` | Limitations | list by airport / country / flight → detail | on / off |
| `/m/important` | Important | cards → detail | on / off |
| `/m/caa` | CAA details | list (call button) → detail | call, email |
| `/m/webhooks` | Webhooks | list → detail | trigger on / off, re-register |
| `/m/wall-settings` | Wall settings (console) | form, with the room's preview | the markers the wall shows; approve a waiting screen |
| `/m/reports` | Reports (console) | list → detail; New report form | create |
| `/m/history` | Agent history | list by day (search) | — (opens the thread in /m/agent) |
| `/m/knowledge` | Knowledge base | list → detail | approve / reject (developers) |
| `/m/activity` | Activity log | list by day, filter chips | — |
| `/m/agent-settings` | Agent settings | form | your own toggles; capabilities (admins); routing read-only |
| `/m/mailbox` | Agent mailbox | list → detail (readers) | ignore / un-ignore / reprocess / read as a request |
| `/m/help`, `/m/help/[ref]` | Help & support | list → thread; Ask a person form | create a thread, reply |
| `/m/inbox` | Developer inbox | list by status → the same thread page | reply, change status |
| `/m/users` | Users | list → detail | approve, make / remove admin, password reset |
| `/m/maintenance` | Maintenance | form (Tier 1 care) | off with the typed OFF, on |
| `/m/agent-sites` | Agent sites | list → detail | approve / decline, revoke |
| `/m/profile` | Profile | form | name, email (with confirmation), password reset, sign out |
| `/m/settings` | Settings | form | theme, motion, start page |

**Tier 3** — Permissions, the debug runner, the component sheet — is one honest screen each at `/m/desk/[id]`
(`components/m/HonestScreen.tsx`): what the page is, why it needs room, "Back to <section>" and "Email me the link"
(a mail to yourself with the desk address), and not one disabled button. The More sheet marks Permissions **Desk**;
the debug runner and the component sheet are not in the nav at all, as on a desk.

### Deliberate differences from the Tier 2 design
- **No Clients page** until Stage 5 builds it; the design's row exists, the product's page does not.
- **No Passenger manifest page**: on a desk it is the `/manifest` command in the agent's composer, which the phone's
  Ops Agent already has.
- **Settings has no "Use the wall's colours", "Text size" or "Notifications"**: the first was the design's open
  question 2 and loses to the one-theme rule; the other two do not exist in the product. Table density is a desk
  setting and is not shown.
- **Desk-only on purpose**: uploading to the knowledge base, changing a report's status, the mailbox's email bodies
  (revealing is logged on a desk), help attachments and screenshots, writing limitations / notices / CAA entries,
  renaming or revoking a screen, the wall's colours, font and sizes.
- **The wall-settings preview** draws only the colours the room has set (`settings.colors`); with none set it says the
  wall runs on its shipped palette rather than drawing that palette from the wall's files.

### Checks
`node --env-file=.env.rig rig/mobile/tier2-check.mjs`: every Tier 2 page in both themes and its first detail, the
three honest screens (a way back, the desk link, no disabled button), each page's loading / empty / error by its own
route, the More sheet's routes and the Desk tag, and asking a person from the phone creating a thread that opens.

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
