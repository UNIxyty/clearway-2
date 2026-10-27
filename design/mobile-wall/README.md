# The Digital Wall on a phone — design import (2026-10-27)

From the Claude Design project "Clearway Portal" (`45ff380e-a9cf-4625-a2ef-10492c94df55`), imported as reference:

| File | What it is |
|---|---|
| `Mobile Wall - Phone.dc.html` | The canvas: every frame of the three screens, and the seven answers |
| `clearway-mobile-tokens.css` | The design's tokens — as designed, `--cw-*` names |
| `support.js` | The design runtime the canvas needs to render |
| `Mobile Open Flight.dc.html` | Screen 2 (also imported, it is what most of the build follows) |

Not copied, read from the project: `Mobile Flight List.dc.html` (screen 1), `Mobile Settings.dc.html` (screen 3) and
`mobile-design-spec.md` (the build values). An earlier import report called this design "kept for reference, replaced
by this build"; that was wrong. It is the design for the wall on a phone.

## What the build is, and where it differs

The build is `opsboard-react/src/components/mobile/phone/` — in the wall app, not the portal. The Wall tab in `/m`
frames it (`app/m/wall/page.tsx`).

- **Tokens are `--mw-*`.** The design named them `--cw-*`, the portal's prefix; the wall must read no portal token, and
  the check that proves it (`rig/stage1-check.mjs`) looks for `var(--cw-`. The roles and structure are the design's
  (`mobile-wall.css`); the values come from the room's own wall palette (`tokens.js`), the same source the ops-room
  display paints with.
- **Font and colours are the room's, not the phone's.** The design gave the phone its own Font and Colours pages
  (§4.3, §4.4). On 2026-10-27 the phone wall was set to draw from the room's own wall settings exactly as the display
  does, so those two rows read "From the wall". Clocks, the view and range it opens in, and keep-awake stay the phone's.
- **PAX is the shared passenger viewer** (`shared/passenger-viewer.jsx`, Stage 4): names first, one document at a time,
  fetched on reveal, logged, 30 s. The design's own masked cards (last two characters) are not built; the viewer takes
  the phone wall's colours through its `palette`.
- **Mark checked is Option B** (the design's recommendation; flagged to ops in §5). NOTAMs are acknowledged per airport
  for the day, as on the NOTAM Check page.
- **Notifications** are the flight events this phone saw since the page opened (delays, departures, landings,
  cancellations, NOTAMs to check). There is no notification store behind them yet.
- **NOTAMs** show their id, class, validity and full raw text. The wall has no plain-English summary to show above it,
  so none is invented. **TAF** is not carried by the wall yet; the sheet says so.
- **Service status** is read from Leon on demand (`/api/flight-services`, the flight's OPS checklist with its status
  captions and comments). Status words map to the design's badges by their caption.
- **World clocks**: reorder with arrows rather than long-press drag; "Add city" offers a short list of cities.
- **Wall settings** (the amber row) opens the portal's Wall settings page for admins; the staged in-phone editor with
  "Apply to wall" is not built.
- **Text size** stepper not built.
