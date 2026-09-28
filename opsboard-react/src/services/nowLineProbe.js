// Clock and now-line telemetry for the wall (report every minute to /api/display/env).
//  - lineErrorMin: the time under the now-line on screen minus the display's clock. Measured from the page
//    itself (line x in the timeline, hour-tick width, window start), so it reports what a dispatcher sees.
//  - clock: this display's clock at send time and the last round trip, so the server can compute how far the
//    display's clock is from its own (offset ≈ sentAt + rtt/2 − server receive time).
export function measureNowLine() {
  try {
    const pin = document.querySelector('[data-now-pin]');
    const header = document.querySelector('.timeline-scroll--header');
    const tick = header?.firstElementChild?.firstElementChild;
    if (!pin || !header || !tick || pin.style.visibility === 'hidden') return null;
    const r = pin.getBoundingClientRect(); const lineX = r.left + r.width / 2;
    const contentX = lineX - header.getBoundingClientRect().left + header.scrollLeft;
    const pxPerHour = tick.getBoundingClientRect().width;
    if (!(pxPerHour > 0)) return null;
    const startMs = Number(header.dataset.windowStart);
    if (!Number.isFinite(startMs)) return null;
    const atLine = startMs + (contentX / pxPerHour) * 3600_000;
    return { lineErrorMin: Math.round(((atLine - Date.now()) / 60000) * 100) / 100, pxPerHour: Math.round(pxPerHour * 10) / 10 };
  } catch { return null; }
}
