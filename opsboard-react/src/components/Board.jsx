import { useState, useEffect, useRef } from 'react';
import { p2, clamp } from '../data';
import FlightPill from './FlightPill';

const LEGEND = [
  { status: 'scheduled', label: 'Scheduled',   color: 'rgba(72,82,115,.95)'  },
  { status: 'boarding',  label: 'Boarding',    color: 'rgba(170,125,35,.9)'  },
  { status: 'airborne',  label: 'Airborne',    color: 'rgba(48,110,175,.9)'  },
  { status: 'arrived',   label: 'Arrived',     color: 'rgba(38,108,78,.9)'   },
  { status: 'delayed',   label: 'Delayed',     color: 'rgba(145,62,62,.9)'   },
  { status: 'slot',      label: 'Slot / CTOT', color: 'rgba(112,82,168,.9)'  },
  { status: 'aog',       label: 'AOG',         color: 'rgba(180,60,60,.4)',   hatch: true },
];

const LIM_TYPE_COLOR = {
  AOG:  { bg: 'rgba(239,106,106,.18)', text: '#ef8080', border: 'rgba(239,106,106,.35)' },
  WX:   { bg: 'rgba(95,181,255,.15)',  text: '#7ec8ff', border: 'rgba(95,181,255,.3)'   },
  CREW: { bg: 'rgba(240,177,59,.15)',  text: '#f0c060', border: 'rgba(240,177,59,.3)'   },
  PAX:  { bg: 'rgba(58,165,122,.15)',  text: '#60c898', border: 'rgba(58,165,122,.3)'   },
  CTOT: { bg: 'rgba(184,140,255,.15)', text: '#c8a8ff', border: 'rgba(184,140,255,.3)'  },
};

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

function collectLims(aircraft) {
  const lims = [];
  aircraft.forEach(ac => {
    ac.flights.forEach(fl => {
      if (fl.lim) lims.push({ ...fl.lim, ac: ac.reg, fn: fl.fn });
    });
  });
  return lims;
}

function toMs(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function assignFlightLanes(flights) {
  const MIN_VISUAL_DURATION_MS = 20 * 60 * 1000;
  const sorted = [...(flights || [])].sort((a, b) => toMs(a.startUtcMs) - toMs(b.startUtcMs));
  const laneEnds = [];
  const withLanes = [];

  for (const flight of sorted) {
    const start = toMs(flight.startUtcMs);
    const end = Math.max(start + MIN_VISUAL_DURATION_MS, toMs(flight.endUtcMs, start));
    let lane = laneEnds.findIndex((laneEnd) => start >= laneEnd);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    withLanes.push({ ...flight, __lane: lane });
  }

  return {
    flights: withLanes,
    lanes: Math.max(1, laneEnds.length),
  };
}

export default function Board({ aircraft = [], windowStartUtc, windowEndUtc }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [activeLim, setActiveLim] = useState(null);
  const [visibleTimelineWidth, setVisibleTimelineWidth] = useState(720);
  const boardRef = useRef(null);
  const headerScrollRef = useRef(null);
  const bodyScrollRef = useRef(null);
  const hasCenteredInitiallyRef = useRef(false);
  const END_PAD_PX = 260;
  const VIEWPORT_HOURS = 10;
  const BEFORE_NOW_HOURS = 3;
  const FLIGHT_PILL_HEIGHT = 24;
  const FLIGHT_LANE_GAP = 8;
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
  const nowMarkerLeft = 130 + BEFORE_NOW_HOURS * pxPerHour;

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
      const next = Math.max(200, body.clientWidth - 130);
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
  }, []);

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
    const width = Math.max(0, body.clientWidth - 130);
    const maxScroll = Math.max(0, (timelinePx + END_PAD_PX) - width);
    const nextScroll = Math.max(0, Math.min(maxScroll, nowX - BEFORE_NOW_HOURS * pxPerHour));
    body.scrollLeft = nextScroll;
    header.scrollLeft = nextScroll;
  }

  useEffect(() => {
    const header = headerScrollRef.current;
    const body = bodyScrollRef.current;
    if (!header || !body || hasCenteredInitiallyRef.current) return;
    centerNowInView();
    hasCenteredInitiallyRef.current = true;
  }, [timelinePx, END_PAD_PX, windowStartMs, windowDurationMs, nowX]);

  const allLims    = collectLims(aircraft);
  const limIndexMap = {};
  allLims.forEach((l, i) => { limIndexMap[l.fn] = i + 1; });

  function handleLimClick(lim, fn) {
    setActiveLim(prev => (prev?.fn === fn ? null : { lim, fn }));
  }

  const showNow = true;

  return (
    <div style={s.outer}>

      {/* ── LEFT PANEL: STATUS LEGEND + LIMITATIONS ── */}
      <div style={s.leftPanel}>
        <div style={s.panelTitle}>STATUS</div>
        <div style={s.legendList}>
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

        <div style={{ ...s.panelTitle, marginTop: 20 }}>LIMITATIONS</div>
        <div style={s.limList}>
          {allLims.length === 0 && <div style={s.limEmpty}>None active</div>}
          {allLims.map((l, i) => {
            const theme    = LIM_TYPE_COLOR[l.type] || LIM_TYPE_COLOR.AOG;
            const isActive = activeLim?.fn === l.fn;
            return (
              <div
                key={l.fn}
                style={{
                  ...s.limItem,
                  background: isActive ? theme.bg : 'transparent',
                  border: `1px solid ${isActive ? theme.border : 'rgba(255,255,255,.06)'}`,
                  opacity: isActive ? 1 : 0.45,
                  cursor: 'pointer',
                }}
                onClick={() => handleLimClick(l, l.fn)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                    background: isActive ? theme.bg : 'rgba(255,255,255,.08)',
                    border: `1px solid ${theme.border}`,
                    color: theme.text, fontSize: 9, fontWeight: 700,
                    fontFamily: "'IBM Plex Mono',monospace",
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{i + 1}</span>
                  <span style={{ ...s.limType, color: theme.text }}>{l.type}</span>
                  <span style={s.limAc}>{l.ac}</span>
                </div>
                <div style={s.limFn}>{l.fn}</div>
                {isActive && <div style={{ ...s.limMsg, color: theme.text }}>{l.msg}</div>}
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
          <div style={s.timeScroll} ref={headerScrollRef}>
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
          <button style={s.nowBtn} onClick={centerNowInView} type="button">
            Now
          </button>
        </div>

        <div style={s.rowsWrap} ref={bodyScrollRef}>
          <div style={{ width: 130 + timelinePx + END_PAD_PX, position: 'relative' }}>
            <div style={s.board} ref={boardRef}>
              {aircraft.map(ac => {
                const laneData = assignFlightLanes(ac.flights || []);
                const rowHeight = Math.max(72, 14 + laneData.lanes * FLIGHT_LANE_STEP);
                return (
                <div key={ac.reg} style={{ ...s.row, height: rowHeight }}>

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
                          <span style={s.aogLabel}>AOG · {fl.lim?.msg?.split('—')[0]?.trim()}</span>
                          {fl.lim && (
                            <div
                              style={{
                                position: 'absolute', top: '50%', right: 8,
                                transform: 'translateY(-50%)',
                                ...s.limBadgeInline,
                                background: activeLim?.fn === fl.fn
                                  ? 'rgba(240,177,59,.35)' : 'rgba(240,177,59,.2)',
                              }}
                              onClick={() => handleLimClick(fl.lim, fl.fn)}
                            >
                              {limIndexMap[fl.fn]}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Flight pills */}
                    {!ac.aog && laneData.flights.map(fl => (
                      <FlightPill
                        key={fl.fn}
                        flight={fl}
                        lane={fl.__lane || 0}
                        laneStep={FLIGHT_LANE_STEP}
                        windowStartMs={windowStartMs}
                        windowDurationMs={windowDurationMs}
                        limIndex={fl.lim ? limIndexMap[fl.fn] : undefined}
                        onLimClick={handleLimClick}
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

const s = {
  outer: {
    display: 'flex', flex: 1, overflow: 'hidden',
    height: 'calc(100vh - 76px)',
  },

  // Left panel
  leftPanel: {
    width: 170, flexShrink: 0, background: '#141926',
    borderRight: '1px solid #222840',
    display: 'flex', flexDirection: 'column',
    padding: '14px 0', overflowY: 'auto',
  },
  panelTitle: {
    fontSize: 9, fontWeight: 600, letterSpacing: '2px',
    color: '#404d6e', padding: '0 14px', marginBottom: 10,
  },
  legendList: { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 10px', marginBottom: 4 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px' },
  legendSwatch: { width: 24, height: 10, borderRadius: 3, flexShrink: 0 },
  legendLabel: { fontSize: 10.5, color: '#8090b8' },
  limList: { display: 'flex', flexDirection: 'column', gap: 4, padding: '0 10px' },
  limEmpty: { fontSize: 10, color: '#404d6e', padding: '4px 4px' },
  limItem: { borderRadius: 7, padding: '7px 8px', transition: 'all .18s' },
  limType: { fontSize: 9, fontWeight: 700, letterSpacing: '1px' },
  limAc:   { fontSize: 9, color: '#505d80', fontFamily: "'IBM Plex Mono',monospace", marginLeft: 'auto' },
  limFn:   { fontSize: 9, color: '#505d80', fontFamily: "'IBM Plex Mono',monospace" },
  limMsg:  { fontSize: 10, lineHeight: 1.5, marginTop: 5 },

  // Main
  main: { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', position: 'relative' },

  timeHeader: {
    display: 'flex', height: 34, flexShrink: 0,
    borderBottom: '1px solid #222840', background: '#161b26',
    position: 'relative',
  },
  acSpacer: { width: 130, flexShrink: 0, borderRight: '1px solid #222840' },
  timeScroll: { flex: 1, overflowX: 'auto', overflowY: 'hidden' },
  timeInner: { position: 'relative', display: 'flex', minWidth: '100%' },
  tick: {
    width: 72, flexShrink: 0, display: 'flex', alignItems: 'center', paddingLeft: 6,
    borderRight: '1px solid #222840',
    fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: '#404d6e',
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
    fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, fontWeight: 500,
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
  nowBtn: {
    position: 'absolute',
    right: 8,
    top: 5,
    height: 22,
    padding: '0 8px',
    borderRadius: 6,
    border: '1px solid #2b3f68',
    background: '#1a2740',
    color: '#b8d9ff',
    fontSize: 11,
    cursor: 'pointer',
    zIndex: 50,
  },
  nowFixedLine: {
    position: 'absolute',
    top: 34,
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
    width: 130, flexShrink: 0,
    position: 'sticky',
    left: 0,
    zIndex: 35,
    background: '#151a27',
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    padding: '0 12px', borderRight: '1px solid #222840',
  },
  reg:    { fontSize: 12.5, fontWeight: 600, letterSpacing: '.3px', color: '#e8ebf5' },
  acType: { fontSize: 9.5, color: '#404d6e', marginTop: 2 },
  timeline: { flex: 1, position: 'relative', overflow: 'hidden' },
  timelineEndPad: { width: 260, flexShrink: 0 },
  aogLabel: {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    left: 10, fontSize: 9, color: 'rgba(210,100,100,.65)',
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
    color: '#647196',
    fontSize: 13,
    background: 'rgba(16,20,30,.35)',
    zIndex: 5,
    pointerEvents: 'none',
  },
};
