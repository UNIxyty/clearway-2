# Digital Wall — guide screenshots (Stage A)

Captured 2026-07-08 (follow-up re-captures same night) against the deployed app (clearway.verxyl.com) with real
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
- `auth-signup.png` — Create-account screen (name + work email, confirmation-first). REAL (re-captured from an unauthenticated context — the first capture was bounced to the portal home by the signed-in session).
- `auth-forgot.png` — Forgot-password state on the sign-in card: “Check your email” confirmation after requesting a reset link.

## AIP/GEN documents (re-capture follow-up — REAL)
- `console-aip-send-controls.png` — Flight detail panel with the SEND AIP/GEN controls fully in view: departure/arrival selector, AIP / GEN / Both document type, recipient note.
- `console-aip-send-progress-1.png` — A real send in flight: “Fetching documents (checking shared cache, then source)…”.
- `console-aip-send-progress-2.png` — Delivered: “AIP AD-2 · LSZH (departure) — Sent to <requester>” with Send again. (Recipient shown is the temporary capture account, since a send goes to the signed-in user; the Queued/Emailing stages flashed sub-second on a cache hit and were not separable frames.)

## Still awaiting live conditions (checked again 2026-07-08 ~01:15 Riga — not present; do NOT fake)
- still awaiting: **delayed / CTOT / airborne pill states** — live data had only scheduled+arrived in both capture windows (night). Capture during active daytime ops.
- still awaiting: **red `!!! CHECK NOTAM !!!` wall sign** — the sign was CHECKED (all 11 airports acked); the warning state exists only after the 10:00 Riga run and before ops acks. Capture 10:00–11:00 Riga.
- still awaiting: **failed airport with Retry** — no airport fetch was failing in either window (intermittent).
