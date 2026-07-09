# Digital Wall — guide screenshots (Stage A + Stage B)

Stage A captured 2026-07-08, Stage B (CAA / markers / settings / IMP / pickers
refresh) captured 2026-07-09 ~13:30 UTC — both against the deployed app
(clearway.verxyl.com) with real live data, signed in through the normal auth as
a temporary "Ops Guide" account (deleted after capture). Viewport 1920×1080 @2x.
Read-only capture: the only wall-visible actions in Stage B were opening/closing
one flight overlay from the Console and briefly switching Row / pill height
0.70×→1.00×→0.70× for the before/after pair (original settings restored); no
NOTAM acks, no data edits, nothing saved from any editor form.

Stage B new/refreshed shots are marked **NEW** / **REFRESHED 2026-07-09** below.

## Display / timeline (the wall)
- `display-timeline-full.png` — **REFRESHED 2026-07-09** Full wall: Clearway logo + clock bar, status legend, live limitations sidebar, aircraft lanes, now-line, NOTAM CHECKED sign, presence pills. Current behaviour: flight-ID colour is OPS-scoped (red IDs), cancelled/positioning/sim flights no longer rendered, marker rows show IMP/CAA/WX/NTM chips.
- `pill-scheduled.png` — Pill close-up: scheduled state (muted white), ICAOs + times.
- `pill-arrived.png` — Pill close-up: arrived state (dusty mauve).
- `pill-markers.png` — **REFRESHED 2026-07-09** Marker row above a pill (ORO1041), all marker types in one shot: IMP "!", teal CAA chip, per-airport WX chips with departure/arrival glyphs (takeoff/landing icons, category-coloured), NTM chip.
- `pill-caa-marker.png` — **NEW** A second pill with the teal CAA marker in the marker row alongside IMP + WX dep/arr glyphs.
- `display-overlay-caa.png` — **NEW** Side overlay for a CAA-matched flight (JTY52W LIEE→LUKK), scrolled to the CAA DETAILS contact blocks: ENAC (Italy) with Info/Contact/Mail, and Moldova CAA with Function/Contact/Phone/Mail; IMP text above, active limitations below.
- `display-height-thin.png` — **NEW** Wall at Row / pill height 0.70× (the live ops setting): thinner rows, more registrations fit.
- `display-height-default.png` — **NEW** Same wall at the default 1.00× for comparison (captured briefly, then restored to 0.70×).
- `display-sidebar-legend.png` — Sidebar close-up: colour legend + manual limitation cards.
- `display-overlay.png` — Side overlay open for a real flight: route + timings, unreviewed alerts, decoded weather for ADEP+ADES, IMP, limitations.
- `display-sign-notam-checked.png` — Wall sign: NOTAM CHECKED (green, all airports reviewed).
- `display-sign-check-notam.png` — Wall sign: !!! CHECK NOTAM !!! (red pulsing warning while airports remain unreviewed). REAL — captured by cycling one airport's ack off and back on (owner-approved; console not yet in ops use).
- `console-notam-check-unchecked.png` — NOTAM Check page in the warning state: red banner, progress bar short of complete, an airport card with the blue “Mark checked” button.
- `display-zoom-narrow.png` — Hour spacing 0.75× (more hours on screen).
- `display-zoom-wide.png` — Hour spacing 1.8× (wider gridlines).
- `display-scrolled-away.png` — Timeline scrolled away from "now".
- `display-auto-returned.png` — Same view ~11 s later: auto-returned to centre on "now".

## Console
- `console-topbar.png` — Top bar: Clearway logo, wall-live pill, presence avatars, account chip.
- `console-footer.png` — Footer: "Built by VERXYL".
- `console-flights.png` — Flights page ("All" tab): searchable list with status column and select-a-flight panel.
- `console-flights-detail.png` — Flight selected: timings, show-on-wall control, AIP/GEN send controls.
- `console-notam-check.png` — NOTAM Check: wall-sign banner, 11/11 progress + keyword legend, per-airport cards with flagged NOTAMs (Start/Expiry/Issued line, keyword highlights), CHECKED acks with names, Run check now.
- `console-operators.png` — Operators: Leon operators, sync health, add-operator form.
- `console-aircraft.png` — Aircraft: fleet list, upcoming counts, show/hide on wall.
- `console-limitations.png` — **REFRESHED 2026-07-09** Limitations: existing permanent limitation card (PERMANENT chip, "matches 5 flights"), editor with match-type selector (flight/airport/country/mixed), start/end date window, permanent toggle, wall sidebar preview.
- `console-important.png` — **REFRESHED 2026-07-09** Important: IMP editor with every field editable — title, active toggle, verbatim body text, match criteria (countries/airports/operators/registrations chips, direction, valid window), Save changes + Mark reviewed.
- `console-important-attachments.png` — **NEW** Same IMP editor scrolled to ATTACHMENTS (Attach file upload control) and the added-by / confirmed-by audit stamps ("Added: 2026-07-03 00:32Z · Confirmed: not yet reviewed").
- `console-settings.png` — **REFRESHED 2026-07-09** Settings: display scale, hour spacing, the new Row / pill height slider (at the live 0.70×), flight visibility window with Upcoming horizon 17h + Post-landing removal 2h, wall clocks below.
- `console-caa.png` — **NEW** CAA Details page: search + country/function filters, All/Any/Comm./Private toggle, 74 imported authorities with Function/Validity chips, editor showing verbatim sheet fields (authority name, country, validity, function, contact, phones, mail, AFTN/SITA).
- `console-caa-match-flags.png` — **NEW** CAA editor scrolled to MATCH FLAGS: country/airport chips and the Any flight / Commercial only / Private only selector.
- `picker-airports.png` — **NEW** Airport picker open in the Limitations editor: airports-table-sourced suggestions with real names ("EVRA · Riga International Airport · Latvia", …) after typing "rig". (Same source feeds the country pickers.)

## Auth
- `auth-signin.png` — Sign-in screen (animated backdrop, email+password card).
- `auth-signup.png` — Create-account screen (name + work email, confirmation-first). REAL (re-captured from an unauthenticated context — the first capture was bounced to the portal home by the signed-in session).
- `auth-forgot.png` — Forgot-password state on the sign-in card: “Check your email” confirmation after requesting a reset link.

## AIP/GEN documents (re-capture follow-up — REAL)
- `console-aip-send-controls.png` — Flight detail panel with the SEND AIP/GEN controls fully in view: departure/arrival selector, AIP / GEN / Both document type, recipient note.
- `console-aip-send-progress-1.png` — A real send in flight: “Fetching documents (checking shared cache, then source)…”.
- `console-aip-send-progress-2.png` — Delivered: “AIP AD-2 · LSZH (departure) — Sent to <requester>” with Send again. (Recipient shown is the temporary capture account, since a send goes to the signed-in user; the Queued/Emailing stages flashed sub-second on a cache hit and were not separable frames.)

## Still awaiting live conditions (rechecked 2026-07-09 ~13:30 UTC — not present; do NOT fake)
- still awaiting: **delayed / CTOT / airborne pill states** — live data had only scheduled+arrived in all capture windows. Capture during active daytime ops.
- still awaiting: **failed airport with Retry** — no airport fetch was failing in any window (intermittent).
- still awaiting (Stage B): **IMP attachment list with real files** and **populated added-by / confirmed-by names** — no production IMP entry has attachments or a confirmed review yet (all 60 are auto-imported, awaiting ops review), and staging one would mean creating prod records. `console-important-attachments.png` shows the upload control, empty-state text and the audit line as they genuinely are.
- still awaiting (Stage B): a **country picker** shot in isolation — the airports picker (`picker-airports.png`) was the cleanest live example; both pull from the same Supabase airports table.
