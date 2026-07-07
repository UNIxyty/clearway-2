# Digital Wall — guide screenshots (Stage A)

Captured 2026-07-08 against the deployed app (clearway.verxyl.com) with real
live data, signed in through the normal auth as a temporary "Ops Guide"
account (deleted after capture). Viewport 1920×1080 @2x. Read-only capture:
the only wall-visible actions were opening/closing one overlay and briefly
switching hour spacing (original settings restored); no NOTAM acks, no data
edits.

## Display / timeline (the wall)
- `display-timeline-full.png` — Full wall: Clearway logo + clock bar, status legend, live limitations sidebar, aircraft lanes, now-line, NOTAM CHECKED sign, presence pills.
- `pill-scheduled.png` — Pill close-up: scheduled state (muted white), ICAOs + times.
- `pill-arrived.png` — Pill close-up: arrived state (dusty mauve).
- `pill-markers.png` — Marker row above a pill: NTM / IMP / per-airport WX category chips.
- `display-sidebar-legend.png` — Sidebar close-up: colour legend + manual limitation cards.
- `display-overlay.png` — Side overlay open for a real flight: route + timings, unreviewed alerts, decoded weather for ADEP+ADES, IMP, limitations.
- `display-sign-notam-checked.png` — Wall sign: NOTAM CHECKED (green, all airports reviewed).
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
- `console-limitations.png` — Limitations (reworked): match-type selector (flight/airport/country/mixed), flight search, permanent toggle, date window, wall preview.
- `console-important.png` — Important: IMP entries + needs-review filter (65 needing review after the reset).
- `console-settings.png` — Settings: clocks with drag reorder, display scale, hour spacing, NOTAM keyword filter groups.

## Auth
- `auth-signin.png` — Sign-in screen (animated backdrop, email+password card).
- `auth-signup.png` — Create-account screen (name + work email, confirmation-first).

## Not capturable in live data at capture time (for Stage B to note or re-shoot)
- Pill states **delayed / CTOT / airborne** — no live flight was in these
  states during the capture window (evening lull); re-shoot during active ops
  or reuse the verified test renders from the repo history.
- The red `!!! CHECK NOTAM !!!` sign — all 11 airports were already CHECKED
  by ops today; capture any morning before the team acks.
- A **failed airport with Retry** — no airport was failing at capture time.
