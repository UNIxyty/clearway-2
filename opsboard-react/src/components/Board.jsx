import { useState, useEffect, useMemo, useRef } from 'react';
import { p2, clamp } from '../data';
import FlightPill, { pillVerticalMetrics } from './FlightPill';

// Pill fill semantics (Leon-derived — see digital-wall/LEON-PILL-MAPPING.md).
const LEGEND = [
  { status: 'scheduled', label: 'Scheduled',   color: '#dde1ea' },
  { status: 'delayed',   label: 'Delayed',     color: '#c9ab62' },
  { status: 'ctot',      label: 'CTOT / slot', color: '#9d8cc2' },
  { status: 'airborne',  label: 'Flying',      color: '#7d9cc4' },
  { status: 'arrived',   label: 'Arrived',     color: '#bd8ba4' },
  { status: 'aog',       label: 'AOG',         color: 'rgba(180,60,60,.4)', hatch: true },
];

const LIM_TYPE_COLOR = {
  AOG:  { bg: 'rgba(239,106,106,.18)', text: '#ef8080', border: 'rgba(239,106,106,.35)' },
  WX:   { bg: 'rgba(95,181,255,.15)',  text: '#7ec8ff', border: 'rgba(95,181,255,.3)'   },
  CREW: { bg: 'rgba(240,177,59,.15)',  text: '#f0c060', border: 'rgba(240,177,59,.3)'   },
  PAX:  { bg: 'rgba(58,165,122,.15)',  text: '#60c898', border: 'rgba(58,165,122,.3)'   },
  CTOT: { bg: 'rgba(184,140,255,.15)', text: '#c8a8ff', border: 'rgba(184,140,255,.3)'  },
  // Alert scanner findings (Feature 6) and Important entries (Feature 7).
  NTM:  { bg: 'rgba(255,145,80,.15)',  text: '#ffab73', border: 'rgba(255,145,80,.32)'  },
  IMP:  { bg: 'rgba(255,105,180,.14)', text: '#ff8fc6', border: 'rgba(255,105,180,.32)' },
};
// The weather alert badge reuses the existing WX limitation color.
LIM_TYPE_COLOR.WEATHER = LIM_TYPE_COLOR.WX;

// Idle time before the view glides back to "now" (Item 3).
const AUTO_RETURN_TO_NOW_MS = 10_000;

function nowFracUtc(nowMs, windowStartMs, windowDurationMs) {
  return clamp((nowMs - windowStartMs) / windowDurationMs);
}

function nowTimeStr(nowMs) {
  const n = new Date(nowMs);
  return `${p2(n.getUTCHours())}:${p2(n.getUTCMinutes())} UTC`;
}

function SoftGrid({ hours }) {
  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      preserveAspectRatio="none"
    >
      <defs>
        <filter id="gblur"><feGaussianBlur stdDeviation="1.2" /></filter>
      </defs>
      {Array.from({ length: hours - 1 }, (_, i) => (
        <line
          key={i}
          x1={((i + 1) / hours * 100).toFixed(3) + '%'} y1="0"
          x2={((i + 1) / hours * 100).toFixed(3) + '%'} y2="100%"
          stroke="rgba(255,255,255,0.05)" strokeWidth="1" filter="url(#gblur)"
        />
      ))}
    </svg>
  );
}

function toMs(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function assignFlightLanes(flights, { windowStartMs, windowDurationMs, timelinePx }) {
  const MIN_VISUAL_DURATION_MS = 45 * 60 * 1000;
  const LANE_GAP_PX = 14; // visual breathing room between rounded pills
  const frac = (ms) => clamp((ms - windowStartMs) / windowDurationMs);
  const gapFrac = timelinePx > 0 ? (LANE_GAP_PX / timelinePx) : 0;

  const sorted = [...(flights || [])]
    .map((flight) => {
      const startMs = toMs(flight.startUtcMs);
      const depCrossEndMs = Math.max(
        startMs,
        toMs(flight.delayedStartUtcMs, startMs + toMs(flight.depDelayMin, 0) * 60_000)
      );
      const schedArrMs = Math.max(depCrossEndMs, toMs(flight.scheduledEndUtcMs, depCrossEndMs));
      const arrCrossEndMs = Math.max(schedArrMs, toMs(flight.endUtcMs, schedArrMs));
      const endMs = Math.max(startMs + MIN_VISUAL_DURATION_MS, arrCrossEndMs);
      return {
        ...flight,
        __startFrac: frac(startMs),
        __endFrac: frac(endMs),
      };
    })
    .sort((a, b) => a.__startFrac - b.__startFrac);

  const laneEnds = [];
  const withLanes = [];

  for (const flight of sorted) {
    const startFrac = flight.__startFrac;
    const endFrac = flight.__endFrac;
    let lane = laneEnds.findIndex((laneEndFrac) => startFrac >= laneEndFrac);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(endFrac + gapFrac);
    } else {
      laneEnds[lane] = endFrac + gapFrac;
    }
    withLanes.push({ ...flight, __lane: lane, __laneStartFrac: startFrac, __endFrac: undefined });
  }

  // Neighbour awareness (1B/2A): each flight learns how far away the NEXT
  // flight in its own lane starts, so marker rows and below-pill text can
  // budget their width against the neighbour instead of printing over it.
  const byLane = new Map();
  for (const flight of withLanes) {
    if (!byLane.has(flight.__lane)) byLane.set(flight.__lane, []);
    byLane.get(flight.__lane).push(flight);
  }
  for (const laneFlights of byLane.values()) {
    laneFlights.sort((a, b) => a.__laneStartFrac - b.__laneStartFrac);
    for (let i = 0; i < laneFlights.length; i += 1) {
      const next = laneFlights[i + 1];
      laneFlights[i].__nextGapFrac = next ? next.__laneStartFrac - laneFlights[i].__laneStartFrac : null;
      laneFlights[i].__laneStartFrac = undefined;
    }
  }

  return {
    flights: withLanes,
    lanes: Math.max(1, laneEnds.length),
  };
}

export default function Board({ aircraft = [], limitations = [], windowStartUtc, windowEndUtc, scale = 1, timeZoom = 1, rowZoom = 1, pillHeight = 1, markerScale = 1, labelScale = 1, sidebarScale = 1.3, autoFitRows = false, onAutoFitComputed = null }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [visibleTimelineWidth, setVisibleTimelineWidth] = useState(720);
  const boardRef = useRef(null);
  const headerScrollRef = useRef(null);
  const bodyScrollRef = useRef(null);
  const hasCenteredInitiallyRef = useRef(false);
  // Ops-room legibility: all metrics scale with the display scale setting;
  // a larger scale also shows fewer hours per viewport, so pills get wider
  // and their bigger labels still fit.
  const sz = (v) => Math.round(v * scale);
  // The left panel (legend + limitations) sizes with its OWN scale setting —
  // the board scale no longer moves it (Item 2).
  const szSide = (v) => Math.round(v * sidebarScale);
  const s = makeStyles(sz, szSide);
  const AC_LABEL_W = sz(150);
  const END_PAD_PX = sz(260);
  // timeZoom stretches/squeezes the hour axis independently of text scale:
  // 2 = hour gridlines twice as far apart (fewer hours visible), 0.5 = twice
  // as many hours on screen. Everything downstream (pxPerHour, gridlines,
  // pills, labels, now-line) derives from these two numbers.
  const VIEWPORT_HOURS = 10 / scale / timeZoom;
  const BEFORE_NOW_HOURS = 3 / scale / timeZoom;
  // ── Auto-fit (Item 2): measure the rows viewport, count rows/lanes, and
  // scale the four vertical knobs so EVERY aircraft row fits on screen.
  // The manual slider values stay authoritative when autoFitRows is off,
  // and act as the shape/ratio baseline when it is on (each knob is the
  // slider value × a common fit factor, clamped to the slider ranges whose
  // minimums embed the absolute legibility floors in pillVerticalMetrics).
  // If all rows can't fit even at the floors, rows render AT the floors and
  // the board scrolls vertically — never illegible, never clipped.
  const [rowsViewportH, setRowsViewportH] = useState(0);
  useEffect(() => {
    const el = bodyScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let timer;
    const measure = () => setRowsViewportH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(measure, 150); // debounce — no thrash on drag-resize
    });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, []);

  const fit = useMemo(() => {
    const clampTo = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const knobsFor = (f) => ({
      rowZoom: clampTo(rowZoom * f, 0.4, 1.4),
      pillHeight: clampTo(pillHeight * f, 0.4, 1.4),
      markerScale: clampTo(markerScale * f, 0.5, 1.3),
      labelScale: clampTo(labelScale * f, 0.5, 1.3),
    });
    if (!autoFitRows || rowsViewportH <= 0 || aircraft.length === 0) {
      return { active: false, knobs: knobsFor(1 / Math.max(1e-6, 1)), factor: 1, fits: true };
    }
    const szl = (v) => Math.round(v * scale);
    // Same window + timeline-width derivation as the render below — lane
    // counts must match what actually draws (the lane gap is a fraction of
    // timelinePx, so a fake width would over/under-count lanes).
    const ws = new Date(windowStartUtc || '').getTime();
    const we = new Date(windowEndUtc || '').getTime();
    const fitWindowStartMs = Number.isFinite(ws) ? ws : Date.now() - 6 * 3600_000;
    const fitWindowDurationMs = Number.isFinite(we) && we > fitWindowStartMs ? we - fitWindowStartMs : 24 * 3600_000;
    const fitTimelinePx = (fitWindowDurationMs / 3600_000) * (visibleTimelineWidth / (10 / scale / timeZoom));
    // Lane counts are horizontal-overlap facts — independent of vertical
    // sizing, so they can be computed once per aircraft per window.
    const laneCounts = aircraft.map((ac) => {
      try {
        return assignFlightLanes(ac.flights || [], { windowStartMs: fitWindowStartMs, windowDurationMs: fitWindowDurationMs, timelinePx: fitTimelinePx }).lanes || 1;
      } catch { return 1; }
    });
    const totalFor = (f) => {
      const k = knobsFor(f);
      const V = pillVerticalMetrics(scale, k.rowZoom, { pillHeight: k.pillHeight, markerScale: k.markerScale, labelScale: k.labelScale });
      const step = V.total + Math.max(2, Math.round(12 * scale * k.rowZoom));
      return laneCounts.reduce(
        (sum, lanes) => sum + Math.max(step + szl(24), szl(20) + lanes * step) + 1, // +1 row border
        0
      );
    };
    // Monotone in f → binary search the largest factor that still fits
    // (grows on tall viewports, shrinks on cramped ones).
    let lo = 0.25, hi = 1.6;
    if (totalFor(lo) > rowsViewportH) {
      const k = knobsFor(lo);
      return { active: true, knobs: k, factor: lo, fits: false, requiredPx: totalFor(lo), availPx: rowsViewportH };
    }
    for (let i = 0; i < 22; i += 1) {
      const mid = (lo + hi) / 2;
      if (totalFor(mid) <= rowsViewportH) lo = mid;
      else hi = mid;
    }
    const factor = Math.round(lo * 100) / 100;
    return { active: true, knobs: knobsFor(factor), factor, fits: true, requiredPx: totalFor(factor), availPx: rowsViewportH };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFitRows, rowsViewportH, aircraft, rowZoom, pillHeight, markerScale, labelScale, scale, timeZoom, visibleTimelineWidth, windowStartUtc, windowEndUtc]);

  const effRowZoom = fit.active ? fit.knobs.rowZoom : rowZoom;
  const effPillHeight = fit.active ? fit.knobs.pillHeight : pillHeight;
  const effMarkerScale = fit.active ? fit.knobs.markerScale : markerScale;
  const effLabelScale = fit.active ? fit.knobs.labelScale : labelScale;

  // Read-only readout for the console — only when the numbers change.
  const lastComputedRef = useRef('');
  useEffect(() => {
    if (!onAutoFitComputed) return;
    const payload = fit.active
      ? { factor: fit.factor, fits: fit.fits, ...fit.knobs, availPx: fit.availPx ?? null, requiredPx: fit.requiredPx ?? null, at: new Date().toISOString() }
      : null;
    const key = JSON.stringify(payload && { ...payload, at: null });
    if (key !== lastComputedRef.current) {
      lastComputedRef.current = key;
      onAutoFitComputed(payload);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit]);

  // rowZoom (vertical size slider) thins lane/pill HEIGHTS only — text stays
  // on the display scale. Metrics come from the pill so lane maths and the
  // rendered pill can never drift apart.
  const pillV = pillVerticalMetrics(scale, effRowZoom, { pillHeight: effPillHeight, markerScale: effMarkerScale, labelScale: effLabelScale });
  const FLIGHT_PILL_HEIGHT = pillV.total;
  const FLIGHT_LANE_GAP = Math.max(2, Math.round(12 * scale * effRowZoom));
  const FLIGHT_LANE_STEP = FLIGHT_PILL_HEIGHT + FLIGHT_LANE_GAP;
  const parsedStartMs = new Date(windowStartUtc || '').getTime();
  const parsedEndMs = new Date(windowEndUtc || '').getTime();
  const fallbackStart = Date.now() - 6 * 60 * 60 * 1000;
  const windowStartMs = Number.isFinite(parsedStartMs) ? parsedStartMs : fallbackStart;
  const windowEndMs = Number.isFinite(parsedEndMs) && parsedEndMs > windowStartMs
    ? parsedEndMs
    : windowStartMs + 24 * 60 * 60 * 1000;
  const windowDurationMs = Math.max(60 * 60 * 1000, windowEndMs - windowStartMs);
  const timelineHours = Math.max(1, Math.ceil(windowDurationMs / (60 * 60 * 1000)));
  const pxPerHour = visibleTimelineWidth / VIEWPORT_HOURS;
  const timelinePx = timelineHours * pxPerHour;
  const nowStr = nowTimeStr(nowMs);
  const nowX = nowFracUtc(nowMs, windowStartMs, windowDurationMs) * timelinePx;
  const nowMarkerLeft = AC_LABEL_W + BEFORE_NOW_HOURS * pxPerHour;

  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const body = bodyScrollRef.current;
    if (!body) return;

    const updateSize = () => {
      const next = Math.max(200, body.clientWidth - AC_LABEL_W);
      setVisibleTimelineWidth(next);
    };
    updateSize();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateSize);
      observer.observe(body);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  useEffect(() => {
    hasCenteredInitiallyRef.current = false;
  }, [windowStartUtc, windowEndUtc]);

  useEffect(() => {
    const header = headerScrollRef.current;
    const body = bodyScrollRef.current;
    if (!header || !body) return;

    let syncing = false;
    const syncFromHeader = () => {
      if (syncing) return;
      syncing = true;
      body.scrollLeft = header.scrollLeft;
      requestAnimationFrame(() => { syncing = false; });
    };
    const syncFromBody = () => {
      if (syncing) return;
      syncing = true;
      header.scrollLeft = body.scrollLeft;
      requestAnimationFrame(() => { syncing = false; });
    };

    header.addEventListener('scroll', syncFromHeader, { passive: true });
    body.addEventListener('scroll', syncFromBody, { passive: true });
    return () => {
      header.removeEventListener('scroll', syncFromHeader);
      body.removeEventListener('scroll', syncFromBody);
    };
  }, []);

  function centerNowInView() {
    const header = headerScrollRef.current;
    const body = bodyScrollRef.current;
    if (!header || !body) return;
    const width = Math.max(0, body.clientWidth - AC_LABEL_W);
    const maxScroll = Math.max(0, (timelinePx + END_PAD_PX) - width);
    const nextScroll = Math.max(0, Math.min(maxScroll, nowX - BEFORE_NOW_HOURS * pxPerHour));
    body.scrollLeft = nextScroll;
    header.scrollLeft = nextScroll;
  }

  // ── Auto-return to "now" (Item 3) ─────────────────────────────────────────
  // After AUTO_RETURN_TO_NOW_MS with no user interaction while scrolled away
  // from "now", smooth-scroll back. The timer arms only on USER interaction
  // (wheel/touch/pointer or a scroll that we didn't initiate), so it never
  // fights the initial jump-centering above or the data refresh.
  const nowScrollRef = useRef({ target: 0 });
  nowScrollRef.current.target = (() => {
    const body = bodyScrollRef.current;
    const width = body ? Math.max(0, body.clientWidth - AC_LABEL_W) : visibleTimelineWidth;
    const maxScroll = Math.max(0, (timelinePx + END_PAD_PX) - width);
    return Math.max(0, Math.min(maxScroll, nowX - BEFORE_NOW_HOURS * pxPerHour));
  })();

  useEffect(() => {
    const body = bodyScrollRef.current;
    const header = headerScrollRef.current;
    if (!body || !header) return;

    // CONTINUOUS idle monitor, not a gesture-armed timer. The old version
    // only armed its 10s timer on a user gesture — so the common wall case
    // (nobody touches anything, "now" slowly drifts out of view over hours,
    // or a one-off programmatic scroll) never triggered a return. This
    // 1s monitor owns the whole decision: away from "now" AND idle for
    // AUTO_RETURN_TO_NOW_MS → smooth return. Repeats forever; any
    // interaction (wheel/touch/pointer/scroll we didn't initiate) resets
    // the idle clock; our own animation is ignored via the flag.
    let lastInteractionAt = 0; // epoch 0 => an untouched wall still corrects drift
    let autoScrolling = false;
    let animationFrame = null;
    let settleTimer = null;

    // Own rAF animation instead of native scrollTo({behavior:'smooth'}):
    // any direct scrollLeft write (e.g. the header<->body sync echo) CANCELS
    // a native smooth scroll mid-flight, which chopped long returns into
    // stuttering 10s-apart segments. Writing the position ourselves every
    // frame is uncancellable and completes as ONE fast sweep.
    const RETURN_ANIMATION_MS = 600;
    const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
    const animateReturn = (target) => {
      const from = body.scrollLeft;
      const startedAt = performance.now();
      autoScrolling = true;
      const step = (now) => {
        if (!autoScrolling) return; // user gesture aborted the return
        const t = Math.min(1, (now - startedAt) / RETURN_ANIMATION_MS);
        body.scrollLeft = from + (target - from) * easeInOutCubic(t);
        if (t < 1) {
          animationFrame = requestAnimationFrame(step);
        } else {
          body.scrollLeft = target;
          // brief settle so the trailing scroll/sync events don't read as
          // user interaction, then hand control back to the monitor.
          clearTimeout(settleTimer);
          settleTimer = setTimeout(() => { autoScrolling = false; }, 150);
        }
      };
      animationFrame = requestAnimationFrame(step);
    };

    const onUserInput = () => {
      autoScrolling = false; // a real gesture cancels an in-flight return
      cancelAnimationFrame(animationFrame);
      lastInteractionAt = Date.now();
    };
    const onScroll = () => {
      if (autoScrolling) return; // our own animation — not user interaction
      lastInteractionAt = Date.now();
    };

    const monitor = setInterval(() => {
      if (autoScrolling) return;
      if (Date.now() - lastInteractionAt < AUTO_RETURN_TO_NOW_MS) return;
      const target = nowScrollRef.current.target;
      // 40px dead-band: minute-hand drift re-centres in one gentle nudge
      // every ~10-15 min instead of a constant micro-scroll.
      if (Math.abs(body.scrollLeft - target) < 40) return;
      animateReturn(target);
    }, 1000);

    for (const el of [body, header]) {
      el.addEventListener('wheel', onUserInput, { passive: true });
      el.addEventListener('touchstart', onUserInput, { passive: true });
      el.addEventListener('pointerdown', onUserInput, { passive: true });
      el.addEventListener('scroll', onScroll, { passive: true });
    }
    return () => {
      clearInterval(monitor);
      cancelAnimationFrame(animationFrame);
      clearTimeout(settleTimer);
      for (const el of [body, header]) {
        el.removeEventListener('wheel', onUserInput);
        el.removeEventListener('touchstart', onUserInput);
        el.removeEventListener('pointerdown', onUserInput);
        el.removeEventListener('scroll', onScroll);
      }
    };
  }, []);

  useEffect(() => {
    const header = headerScrollRef.current;
    const body = bodyScrollRef.current;
    if (!header || !body || hasCenteredInitiallyRef.current) return;
    centerNowInView();
    hasCenteredInitiallyRef.current = true;
  }, [timelinePx, END_PAD_PX, windowStartMs, windowDurationMs, nowX]);

  // Sidebar list = the manual text limitations only (NTM/WX/IMP are pill
  // markers, not sidebar entries). Numbers link sidebar cards to pill badges.
  const allLims = Array.isArray(limitations) ? limitations : [];
  const limIndexMap = {};
  allLims.forEach((l, i) => {
    limIndexMap[l.id] = i + 1;
  });

  const showNow = true;

  return (
    <div style={s.outer}>

      {/* ── LEFT PANEL: STATUS LEGEND + LIMITATIONS (view-only, readable at
             distance: full text always visible, no click-to-expand) ── */}
      <div style={s.leftPanel}>
        <div style={s.panelTitle}>STATUS</div>
        <div style={s.legendGrid}>
          {LEGEND.map(l => (
            <div key={l.status} style={s.legendItem}>
              <div style={{
                ...s.legendSwatch,
                background: l.hatch
                  ? `repeating-linear-gradient(-45deg,${l.color} 0,${l.color} 3px,rgba(20,24,36,.9) 3px,rgba(20,24,36,.9) 8px)`
                  : l.color,
                border: l.hatch ? '1px dashed rgba(200,80,80,.4)' : 'none',
              }} />
              <span style={s.legendLabel}>{l.label}</span>
            </div>
          ))}
        </div>

        <div style={{ ...s.panelTitle, marginTop: 22 }}>LIMITATIONS</div>
        <div style={s.limList}>
          {allLims.length === 0 && <div style={s.limEmpty}>None active</div>}
          {allLims.map((l, i) => {
            // Reworked model (Item 9): no type taxonomy — one neutral accent;
            // scope = the OR-matched targets (flights, airports, countries),
            // plus the active window / permanent flag.
            const match = l.match || {};
            const scope = [
              ...(match.flights || []).map((f) => f.label || f.nid),
              ...(match.airportIcaos || l.airportIcaos || []),
              ...(match.countries || l.countries || []),
            ].join(' · ');
            const window = l.isPermanent
              ? null
              : [l.startDate ? `from ${l.startDate}` : null, l.endDate ? `until ${l.endDate}` : null]
                  .filter(Boolean)
                  .join(' ');
            return (
              <div key={l.id} style={{ ...s.limCard, borderLeft: '5px solid #f0c060' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
                  <span style={{ ...s.limBadgeNum, borderColor: 'rgba(240,177,59,.4)', color: '#f0c060' }}>{i + 1}</span>
                  {l.isPermanent && <span style={{ ...s.limType, color: '#f0c060' }}>PERMANENT</span>}
                  {window && <span style={{ ...s.limScope, marginTop: 0 }}>{window}</span>}
                </div>
                <div style={s.limTitle}>{l.title}</div>
                {l.description && <div style={s.limDesc}>{l.description}</div>}
                {scope && <div style={s.limScope}>{scope}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── MAIN BOARD ── */}
      <div style={s.main}>

        {/* Timeline tick header */}
        <div style={s.timeHeader}>
          <div style={s.acSpacer} />
          <div className="timeline-scroll timeline-scroll--header" style={s.timeScroll} ref={headerScrollRef}>
            <div style={{ ...s.timeInner, width: timelinePx + END_PAD_PX }}>
              {Array.from({ length: timelineHours }, (_, i) => {
                const tick = new Date(windowStartMs + i * 60 * 60 * 1000);
                const hour = `${p2(tick.getUTCHours())}:00`;
                return <div key={i} style={{ ...s.tick, width: pxPerHour }}>{hour}</div>;
              })}
              <div style={{ width: END_PAD_PX, flexShrink: 0 }} />
            </div>
          </div>
          {showNow && (
            <div style={{ ...s.nowHeaderPin, left: nowMarkerLeft }}>
              <div style={s.nowTimeLabel}>{nowStr}</div>
              <div style={s.nowTriangle} />
            </div>
          )}
          {/* The wall is strictly view-only: no interactive controls. The
              view auto-centers on "now" whenever the window changes. */}
        </div>

        <div className="timeline-scroll timeline-scroll--body" style={s.rowsWrap} ref={bodyScrollRef}>
          <div style={{ width: AC_LABEL_W + timelinePx + END_PAD_PX, position: 'relative' }}>
            <div style={s.board} ref={boardRef}>
              {aircraft.map(ac => {
                const laneData = assignFlightLanes(ac.flights || [], {
                  windowStartMs,
                  windowDurationMs,
                  timelinePx,
                });
                const rowHeight = Math.max(FLIGHT_LANE_STEP + sz(24), sz(20) + laneData.lanes * FLIGHT_LANE_STEP);
                return (
                <div key={ac.id || ac.reg} style={{ ...s.row, height: rowHeight }}>

                  {/* AC label */}
                  <div style={s.acLabel}>
                    <span style={s.reg}>{ac.reg}</span>
                    <span style={s.acType}>{ac.type}</span>
                  </div>

                  {/* Timeline track */}
                  <div style={{ display: 'flex', width: timelinePx + END_PAD_PX }}>
                  <div style={{ ...s.timeline, width: timelinePx }}>
                    <SoftGrid hours={timelineHours} />

                    {/* AOG band */}
                    {ac.aog && laneData.flights[0] && (() => {
                      const fl = laneData.flights[0];
                      const x1 = clamp((toMs(fl.startUtcMs, windowStartMs) - windowStartMs) / windowDurationMs);
                      const x2 = clamp((toMs(fl.endUtcMs, windowStartMs) - windowStartMs) / windowDurationMs);
                      return (
                        <div style={{
                          position: 'absolute', top: 0, bottom: 0,
                          left: (x1 * 100).toFixed(2) + '%',
                          width: ((x2 - x1) * 100).toFixed(2) + '%',
                          background: `repeating-linear-gradient(-45deg,
                            rgba(180,60,60,.13) 0,rgba(180,60,60,.13) 5px,
                            transparent 5px,transparent 11px)`,
                          borderLeft: '1px dashed rgba(200,80,80,.35)',
                          borderRight: '1px dashed rgba(200,80,80,.35)',
                        }}>
                          <span style={s.aogLabel}>AOG</span>
                          {Array.isArray(fl.limitationIds) && limIndexMap[fl.limitationIds[0]] && (
                            <div
                              style={{
                                position: 'absolute', top: '50%', right: 8,
                                transform: 'translateY(-50%)',
                                ...s.limBadgeInline,
                                background: 'rgba(240,177,59,.2)',
                              }}
                            >
                              {limIndexMap[fl.limitationIds[0]]}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Flight pills */}
                    {!ac.aog && laneData.flights.map(fl => (
                      <FlightPill
                        key={fl.id}
                        flight={fl}
                        lane={fl.__lane || 0}
                        neighborGapPx={fl.__nextGapFrac != null ? fl.__nextGapFrac * timelinePx : null}
                        laneStep={FLIGHT_LANE_STEP}
                        windowStartMs={windowStartMs}
                        windowDurationMs={windowDurationMs}
                        timelinePx={timelinePx}
                        scale={scale}
                        rowZoom={effRowZoom}
                        pillHeight={effPillHeight}
                        markerScale={effMarkerScale}
                        labelScale={effLabelScale}
                        limIndices={(fl.limitationIds || []).map((id) => limIndexMap[id]).filter(Boolean)}
                      />
                    ))}
                  </div>
                  <div style={s.timelineEndPad} />
                  </div>
                </div>
              )})}
            </div>
          </div>
          {aircraft.length === 0 && (
            <div style={s.emptyState}>No flights available for the selected period.</div>
          )}
        </div>
        {showNow && <div style={{ ...s.nowFixedLine, left: nowMarkerLeft }} />}
      </div>
    </div>
  );
}

function makeStyles(sz, szSide = sz) {
  return {
  outer: {
    display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0,
  },

  // Left panel — sized for reading the full limitation text from across the
  // ops room; the panel scrolls when entries exceed the height. Everything
  // here uses szSide (the independent sidebar scale), not the board scale.
  leftPanel: {
    width: szSide(330), flexShrink: 0, background: '#141926',
    borderRight: '1px solid #222840',
    display: 'flex', flexDirection: 'column',
    padding: '14px 0', overflowY: 'auto',
  },
  panelTitle: {
    fontSize: szSide(11), fontWeight: 700, letterSpacing: '2.5px',
    color: '#5a6a94', padding: `0 ${szSide(16)}px`, marginBottom: szSide(10),
  },
  legendGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${szSide(3)}px ${szSide(8)}px`,
    padding: `0 ${szSide(12)}px`, marginBottom: szSide(4),
  },
  legendItem: { display: 'flex', alignItems: 'center', gap: szSide(8), padding: `${szSide(3)}px ${szSide(4)}px` },
  legendSwatch: { width: szSide(24), height: szSide(11), borderRadius: 3, flexShrink: 0 },
  legendLabel: { fontSize: szSide(12.5), color: '#a7b3d4', whiteSpace: 'nowrap' },
  limList: { display: 'flex', flexDirection: 'column', gap: szSide(10), padding: `0 ${szSide(12)}px ${szSide(14)}px` },
  limEmpty: { fontSize: szSide(14), color: '#5a6a94', padding: '6px 4px' },
  limCard: {
    background: '#1a2130',
    borderRadius: 12,
    padding: `${szSide(14)}px ${szSide(16)}px`,
  },
  limBadgeNum: {
    width: szSide(24), height: szSide(24), borderRadius: '50%', flexShrink: 0,
    border: '1px solid',
    background: 'rgba(255,255,255,.06)',
    fontSize: szSide(13), fontWeight: 700,
    fontFamily: "'IBM Plex Mono',monospace",
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  limType: { fontSize: szSide(14), fontWeight: 800, letterSpacing: '1.5px' },
  limTitle: {
    fontSize: szSide(21), fontWeight: 800, color: '#f6f8fd',
    lineHeight: 1.2, marginBottom: 7,
  },
  limDesc: { fontSize: szSide(17), lineHeight: 1.45, color: '#d7dce6', whiteSpace: 'pre-wrap' },
  limScope: {
    fontSize: szSide(13), fontFamily: "'IBM Plex Mono',monospace",
    color: '#8f99ab', marginTop: 9,
  },

  // Main
  main: { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', position: 'relative' },

  timeHeader: {
    display: 'flex', height: sz(42), flexShrink: 0,
    borderBottom: '1px solid #222840', background: '#161b26',
    position: 'relative',
  },
  acSpacer: { width: sz(150), flexShrink: 0, borderRight: '1px solid #222840' },
  timeScroll: { flex: 1, overflowX: 'auto', overflowY: 'hidden' },
  timeInner: { position: 'relative', display: 'flex', minWidth: '100%' },
  tick: {
    width: 72, flexShrink: 0, display: 'flex', alignItems: 'center', paddingLeft: 6,
    borderRight: '1px solid #222840',
    fontFamily: "'IBM Plex Mono',monospace", fontSize: sz(12), fontWeight: 600, color: '#8794b8',
  },

  // NOW header marker
  nowHeaderPin: {
    position: 'absolute', top: 0, bottom: 0,
    transform: 'translateX(-50%)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 40, pointerEvents: 'none',
  },
  nowTimeLabel: {
    fontFamily: "'IBM Plex Mono',monospace", fontSize: sz(11.5), fontWeight: 600,
    color: '#6dc4ff', letterSpacing: '.5px',
    background: '#161b26', padding: '1px 5px', borderRadius: 3,
    border: '1px solid rgba(95,181,255,.3)',
  },
  nowTriangle: {
    width: 0, height: 0, marginTop: 2,
    borderLeft: '4px solid transparent',
    borderRight: '4px solid transparent',
    borderTop: '5px solid rgba(95,181,255,.6)',
  },
  nowFixedLine: {
    position: 'absolute',
    top: sz(42),
    bottom: 0,
    width: 2,
    background: 'linear-gradient(to bottom, rgba(95,181,255,.98) 0%, rgba(95,181,255,.55) 100%)',
    boxShadow: '0 0 10px rgba(95,181,255,.65)',
    zIndex: 95,
    pointerEvents: 'none',
  },

  // Board rows
  rowsWrap: { flex: 1, position: 'relative', overflow: 'auto' },
  board: { minHeight: '100%' },
  row: { display: 'flex', height: 64, borderBottom: '1px solid #1e243580' },
  acLabel: {
    width: sz(150), flexShrink: 0,
    position: 'sticky',
    left: 0,
    zIndex: 35,
    background: '#151a27',
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    padding: '0 12px', borderRight: '1px solid #222840',
  },
  reg:    { fontSize: sz(15), fontWeight: 700, letterSpacing: '.3px', color: '#f2f5fb' },
  acType: { fontSize: sz(11.5), color: '#8090b8', marginTop: 2 },
  timeline: { flex: 1, position: 'relative', overflow: 'hidden' },
  timelineEndPad: { width: sz(260), flexShrink: 0 },
  aogLabel: {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    left: 10, fontSize: sz(12), color: 'rgba(220,120,120,.8)',
    whiteSpace: 'nowrap', pointerEvents: 'none',
  },
  limBadgeInline: {
    width: 16, height: 16, borderRadius: '50%',
    border: '1px solid rgba(240,177,59,.5)',
    color: '#f0b13b', fontSize: 9, fontWeight: 700,
    fontFamily: "'IBM Plex Mono',monospace",
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', transition: 'background .15s',
  },
  emptyState: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#8b98bb',
    fontSize: sz(15),
    background: 'rgba(16,20,30,.35)',
    zIndex: 5,
    pointerEvents: 'none',
  },
};
}
