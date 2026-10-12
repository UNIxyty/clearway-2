# The docs design's sample pages vs the real product (2026-10-12)

The docs design (Claude Design project "Clearway Portal", `docs-content.js`) wrote two sample pages: **Digital Wall ›
Flight board** (20 tasks) and **Admin › Operators** (4 tasks). Each task was checked against the code. **None exists
exactly as described: 6 exist partly, in another form, and 18 do not exist.** The docs describe the portal as it is
(rule: the docs never describe something the portal cannot do). Where ops may *assume* one of these exists, that is a
product question, not a docs one.

## Flight board (the design's long sample page): there is no such page
The wall is a timeline of flight "pills" on aircraft rows (the ops-room screen is view-only; phones and tablets get
their own views). The console has a **Flights** table. No wall page has cards *and* a timeline.

| Task the design described | Real? | What exists instead |
|---|---|---|
| Read a flight card (grey badges for open checks) | partly | Phone "Now" cards; wall pills show HH:MM (no Z); unchecked markers (IMP/CAA/NTM/WX) disappear once checked; no grey badges |
| Switch between Cards and Timeline | partly | Phone tabs Now / Attention / Timeline; no Cards view; the choice is not kept |
| Change the time range 6H / 12H / DAY | partly | Phone 2H / 6H / DAY, tablet 3H / 6H / DAY; the ops-room wall uses the admin "visibility window" |
| Show arrivals or departures only | **no** | Nothing; the console Flights "Airport" filter matches either end |
| Find a flight (`/`, Enter opens first match) | partly | Search box on the console Flights page only; no `/`, no Enter-to-open |
| Show only flights with open checks | **no** | The phone "Attention" tab is the nearest |
| Open a flight (passengers, map, service status) | partly | Pill → info tab (wall), detail sheet (phone/tablet), detail panel (console); no passengers, map or service status; no Esc |
| See the passenger list (PAX, passports masked) | **no** | Nothing on the wall; passengers live in the Ops Agent (manifests, Flight intake) |
| Check limitations (a Limitations button) | partly | Numbered circles on the pill; a LIMITATIONS section in the info tab; chips on the phone |
| Read weather and NOTAMs by pressing an airport code | partly | Codes are not pressable; weather and NOTAMs are inside the info tab / sheet; full NOTAMs on the console NOTAM Check page |
| Mark a flight checked (card turns green) | partly | "Checked ✓" per section and "Check all ✓" (wall), one "Mark checked" (phone); markers disappear, nothing turns green; checks reset daily at 10:00 Riga |
| Undo a check | **no** | No button (the API accepts it; nothing calls it) |
| Add a note to a flight | **no** | Nothing; Reports and Important entries are the nearest |
| Track a flight on the map (FlightRadar24) | **no** | No map, no FR24; the agent's tracking tool is a stub |
| Add a flight by hand ("Manual") | **no** | Flights come only from Leon (Flight intake can create them *in Leon*) |
| Edit flight times ("Edited") | **no** | Nothing |
| Hide a flight from this screen | **no** | Aircraft page hides a whole tail on every wall (admin) |
| Remove a flight from the wall | **no** | Deleting a whole aircraft (admin) is the nearest |
| **Pause the Leon sync** (15 min / 1 h / until resumed, banner) | **no** | Per-operator Active toggle (also removes that operator's flights at once); an automatic back-off when Leon rate-limits |
| **Resume the Leon sync** | **no** | Switch the operator's Active toggle back on (full re-sync) |

## Operators (the design's short sample page): real, but not where or how the design says
| Task | Real? | The real thing |
|---|---|---|
| Create an operator (Admin › Operators › New operator, "Leon login" + "Leon key", Connecting → Connected) | partly | **Digital Wall console → Operators → Add operator**: Operator name, Leon subdomain (oprId), Refresh token. Statuses Synced / Error / Paused; no "Connecting". The portal's Admin has no Operators page. |
| Reconnect Leon (last 24 h fetched again) | **no** | Force sync (all operators), the Active toggle off/on, a new token, or Webhooks → Re-register all |
| Edit an operator (contact email, wall sides; code read-only; 30 s) | partly | Name, oprId (editable; changing it purges and re-syncs) and token; no email, no sides; the wall updates in 1–2 s |
| Delete an operator (type the code, "Delete permanently", deletes Flight Intake history) | partly | Trash icon, plain confirm; deletes its cached flights and aircraft visibility; leaves webhooks, checks and Flight intake history |

Evidence (file:line for every row) was gathered from `opsboard-react/src` (DisplayApp, FlightPill, Board, FlightInfoTab,
mobile/PhoneWall, mobile/TabletWall, mobile/FlightDetailSheet, console/FlightsPage, console/OperatorsPage),
`digital-wall/server.mjs`, `digital-wall/operators-store.mjs`, `digital-wall/lib/leon-sync.mjs` and
`lib/permissions/catalogue.mjs` on 2026-10-12.

Also found: `FlightOverlay.jsx:14-15` says weather never renders on the wall, but the overlay does render a
"Weather (CheckWX)" section — the comment is stale.
