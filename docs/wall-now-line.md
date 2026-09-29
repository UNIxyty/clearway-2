# Wall timeline — the now-line (2026-09-28)

## What was wrong

Measured on the deployed bundle (production URL, `rig/wall/nowline-probe.mjs`: the page's API answered with
stand-ins — signed-in user, the **ops wall's real settings** (scale 0.75, time zoom 0.6), no flights — and its
clock controlled so hours, a blanked screen, a scale change and midnight UTC could be run deliberately). The
error is read off the page itself: time under the line = window start + line x in the timeline ÷ px per hour.

| Case | Deployed before | After the fix |
|---|---|---|
| Running, sampled every 10 min for 2 h | sawtooth: −9 → −19 → −29 → −1 → … worst **−32.9 min** | +0.5 min every sample |
| Woken after a 45-min blank, +50 ms | **−49.5 min** (right after +5 s) | +0.5 min |
| Scale change over SSE | applied live, line correct | applied live, line correct |
| Across midnight UTC | fine at 00:00, then the sawtooth again (−15.6 min) | +0.1 min |

(+0.5 / +0.1 min is half a pixel at 62.7 / 136 px/h — the centre of the label pin the probe measures from.)

**The actual causes — two, and neither of the "frozen" kind:**

1. **The line was drawn at a fixed place on screen, and the view only followed "now" in 40 px steps.** The line
   sat at `AC_LABEL_W + BEFORE_NOW_HOURS × pxPerHour` and relied on the scroll to bring "now" under it; the
   follow monitor ignored any difference under 40 px. On the ops wall (≈ 63–82 px/h) that is ~30–38 minutes:
   the line read further and further behind real time, then jumped back — while its label, which reads the
   clock, stayed right. Not a frozen line, a drifting one; a reload re-centres it, which is why reloading fixed it.
2. **Waking re-used the last clock tick.** The earlier hidden-state fix (scroll latch, bug report 6) snaps the
   scroll on `visibilitychange` — but to a target computed from the last tick before the blank; the clock was
   not re-read. So the first moments after waking showed the line where "now" was when the screen went dark.
   **The hidden-state fix covered the scroll; it did not cover the timeline's clock.**

3. **Found by the real-time run, after the first fix was deployed: the hour header could stop following the
   rows for good.** Header and rows are synced on scroll events, with an echo guard cleared in a
   `requestAnimationFrame` callback. When that frame never runs — a blanked or occluded kiosk, which is exactly
   what the earlier scroll latch was — the guard stays set and the header freezes while the rows (and flights)
   keep moving. In a 65-minute real-time run on production with a 5-minute blank, the time under the line (read
   from the header) stuck at 20:31 and was 104 min behind by the end. Same trap as the scroll latch, in the
   header sync. Fixed by comparing positions instead of a flag, writing the header directly with our own
   scrolls, and re-asserting header = rows and the line position every second in the existing monitor.

Checked and not causes: `now` is read from `Date.now()` every second (not captured once, not accumulated);
the line is not driven by rAF; a scale/horizon change reaches the board live over `config.changed`; the window
(midnight yesterday → +4 days, re-computed on every 60 s poll) always contains "now", so midnight does not strand it.

## The fix (opsboard-react/src/components/Board.jsx)

- **The line is anchored to the timeline.** Its screen x is `nowX − scrollLeft`, recomputed on every tick,
  every scroll and every render (before paint). Whatever the view does — lagging, animating, scrolled away by
  a user — the line marks the real time on the timeline.
- **One ticking source**, the wall clock every second. The line moves by px/h ÷ 3600 per tick — sub-pixel,
  drawn at fractional positions, so it glides rather than jumps. That step is deliberate.
- **Wake**: `visibilitychange`, `focus` and `pageshow` re-read the clock immediately; the scroll snap on wake
  now reads the clock first.
- **Watchdog**: the existing scroll-latch monitor (same 1 s interval, same pattern) also forces a tick when
  the clock tick has stalled for more than 5 s.
- **Follow**: the view keeps "now" in place continuously (1 px threshold); large returns still animate.

## Clock source

Each display now reports every minute (`/api/display/env`): its clock at send time, the last round trip, and
the line error it measures on its own screen. The server stores `clock` and the last 720 samples per device
(`digital-wall/data/display-devices.json`); `offsetMs > 0` means the display's clock is ahead of the server.
**The line still uses the display's own clock** — the offset is measured, not applied, until it has been seen.
