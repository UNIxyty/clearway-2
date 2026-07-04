import { clamp } from '../data';

// Brighter pill colors
// Pill body fill = flight state, derived from real Leon semantics
// (digital-wall/LEON-PILL-MAPPING.md):
//   white  = scheduled (not flying, on time)     yellow = delayed, not departed
//   purple = active CTOT/slot, not yet airborne  blue   = flying
//   pink   = arrived (landed / block-on)
const STATUS = {
  scheduled: { bg: '#eef1f8', text: '#151a26' },
  delayed:   { bg: '#e7c443', text: '#221a04' },
  ctot:      { bg: '#8b5cf6', text: '#f6f1ff' },
  airborne:  { bg: '#3b82f6', text: '#ecf4ff' },
  arrived:   { bg: '#ef7fae', text: '#2b0e1c' },
  cancelled: { bg: 'rgba(90,97,120,.45)', text: '#a7aec4' },
  // legacy aliases (older cached data)
  boarding:  { bg: '#eef1f8', text: '#151a26' },
  slot:      { bg: '#8b5cf6', text: '#f6f1ff' },
};

// Leon checklist colors can be arbitrary; on the dark board a too-dark ID
// would vanish, so guard minimum luminance and fall back to the default.
function readableIdColor(hex, fallback) {
  const value = String(hex || '').trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(value.replace('#', '').length === 3
    ? value.replace('#', '').split('').map((c) => c + c).join('')
    : value);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.35 ? fallback : `#${m[1]}`;
}

// Auto-derived per-flight markers (Feature 6 alerts). These render as small
// type badges on the pill — they are NOT sidebar entries.
const ALERT_MARK = {
  NTM: { text: '#ffab73', border: 'rgba(255,145,80,.5)', bg: 'rgba(255,145,80,.18)' },
  WX:  { text: '#7ec8ff', border: 'rgba(95,181,255,.5)', bg: 'rgba(95,181,255,.16)' },
};

function hmUtc(ms) {
  const dt = new Date(ms);
  if (!Number.isFinite(dt.getTime())) return '--:--';
  const h = String(dt.getUTCHours()).padStart(2, '0');
  const m = String(dt.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export default function FlightPill({
  flight,
  limIndices = [],
  windowStartMs,
  windowDurationMs,
  timelinePx = 0,
  lane = 0,
  laneStep = 42,
}) {
  const { fn, dep, arr, etd, eta, depDelayMin = 0, arrDelayMin = 0, status } = flight;
  // NTM / WX markers come from the flight's own decorated limitations.
  const alertTypes = [
    ...new Set(
      (flight.limitations || [])
        .filter((lim) => lim.source === 'alert' && ALERT_MARK[lim.type])
        .map((lim) => lim.type)
    ),
  ];
  // IMP renders as ONE icon with no count — the wall only signals that
  // important limitations apply; the full text is read in the Console.
  const hasImp = (flight.limitations || []).some((lim) => lim.type === 'IMP');

  // The fill comes straight from the Leon-derived movement state — a delayed
  // AIRBORNE flight is blue (the leading dashed segment still shows the
  // delay); "delayed" (yellow) means delayed and not yet departed.
  const theme = STATUS[status] || STATUS.scheduled;

  const depMs = Number(flight.startUtcMs) || 0;
  const schedArrMs = Number(flight.scheduledEndUtcMs) || depMs;
  const actualDepMs = Number(flight.delayedStartUtcMs) || (depMs + depDelayMin * 60_000);
  const actualArrMs = Number(flight.endUtcMs) || (schedArrMs + arrDelayMin * 60_000);

  const depCrossEndMs = Math.max(depMs, actualDepMs);
  const arrCrossStartMs = Math.max(depCrossEndMs, schedArrMs);
  const arrCrossEndMs = Math.max(arrCrossStartMs, actualArrMs);
  const renderEndMs = arrCrossEndMs;

  const frac = (ms) => (ms - windowStartMs) / windowDurationMs;
  const depF = clamp(frac(depMs));
  const depCrossF = clamp(frac(depCrossEndMs));
  const arrCrossStartF = clamp(frac(arrCrossStartMs));
  const arrCrossEndF = clamp(frac(arrCrossEndMs));

  const totalF = Math.max(arrCrossEndF - depF, 0.005);
  const depCrossSectionF = depDelayMin > 0 ? Math.max(depCrossF - depF, 0) : 0;
  const mainSectionF = Math.max(arrCrossStartF - depCrossF, 0.003);
  const arrCrossSectionF = arrDelayMin > 0 ? Math.max(arrCrossEndF - arrCrossStartF, 0) : 0;

  const depCrossPct = ((depCrossSectionF / totalF) * 100).toFixed(2) + '%';
  const mainPct = ((mainSectionF / totalF) * 100).toFixed(2) + '%';
  const arrCrossPct = ((arrCrossSectionF / totalF) * 100).toFixed(2) + '%';

  // Delay renders as a DASHED leading segment sized to the delay magnitude:
  // the span between the scheduled time and the actual/estimated departure
  // (or between STA and the delayed arrival on the trailing side). Dashes
  // use the state color so the delay reads as "this pill, not yet solid".
  const delayDashBg = `repeating-linear-gradient(
    90deg,
    ${theme.bg} 0px, ${theme.bg} 8px,
    rgba(10,13,22,.15) 8px, rgba(10,13,22,.15) 15px
  )`;

  // ID text: Leon checklist color (contrast-guarded on the dark board),
  // italic when the trip is not CONFIRMED (Option/Opportunity).
  const idColor = readableIdColor(flight.checklistColor, '#c3cde8');
  const idStyle = flight.isConfirmed === false ? 'italic' : 'normal';

  // ── Pixel-aware layout (anti-overlap) ──────────────────────────────────
  // The pill knows its rendered width, so narrow pills switch layout instead
  // of letting text collide: below COMPACT_PX the timing labels leave the
  // absolute-positioned row for one combined label, and the ICAO codes drop
  // from "ADEP | ADES" to ADEP-only to none as space runs out. Boundary
  // (delay-crossing) labels render only when their segment is wide enough to
  // keep a real gap from the endpoint labels.
  const pillPx = totalF * timelinePx;
  // Rendered width of the pill's main (non-hatched) section. The render uses
  // a floored fraction so hairline sections stay visible; label GEOMETRY
  // below must use the real time positions instead.
  const mainPx = (mainSectionF / totalF) * pillPx;

  const COMPACT_PX = 110;
  const compactTimes = timelinePx > 0 && pillPx < COMPACT_PX;
  const showBadgesInside = mainPx >= 90;
  const showFull = timelinePx > 0 ? mainPx >= (showBadgesInside && limIndices.length > 0 ? 100 : 74) : (mainSectionF / totalF) > 0.14;
  const showRoute = timelinePx > 0 ? mainPx >= 34 : (mainSectionF / totalF) > 0.08;

  // Boundary (delay-crossing) labels position by REAL times. Each label is
  // ~24px wide, so it needs ~34px from the pill's endpoint labels and the
  // two boundary labels need ~40px from each other — otherwise the label is
  // dropped rather than allowed to collide. Compact mode replaces the whole
  // row with one combined label.
  const depBoundaryPx = ((depCrossF - depF) / totalF) * pillPx;
  const arrBoundaryPx = ((arrCrossStartF - depF) / totalF) * pillPx;
  const showDepBoundaryLabel =
    !compactTimes && depDelayMin > 0 && depBoundaryPx >= 34 && pillPx - depBoundaryPx >= 34;
  const showArrBoundaryLabel =
    !compactTimes &&
    arrDelayMin > 0 &&
    arrBoundaryPx >= 34 &&
    pillPx - arrBoundaryPx >= 34 &&
    (!showDepBoundaryLabel || arrBoundaryPx - depBoundaryPx >= 40);
  const depBoundaryPct = `${((depCrossF - depF) / totalF) * 100}%`;
  const arrBoundaryPct = `${((arrCrossStartF - depF) / totalF) * 100}%`;

  return (
    <div style={{
      position: 'absolute',
      left: (depF * 100).toFixed(3) + '%',
      width: (totalF * 100).toFixed(3) + '%',
      top: 4 + lane * laneStep,
      transform: 'none',
      minHeight: 52,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
    }}>
      <div style={s.fnOutsideRow}>
        <span style={{ ...s.fnOutside, color: idColor, fontStyle: idStyle }}>{fn}</span>
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          {hasImp && (
            <span title="Important limitation — details in the Console" style={s.impMark}>
              !
            </span>
          )}
          {alertTypes.map((type) => (
            <span
              key={type}
              title={type === 'NTM' ? 'NOTAM alert' : 'Weather alert'}
              style={{
                ...s.alertMark,
                color: ALERT_MARK[type].text,
                borderColor: ALERT_MARK[type].border,
                background: ALERT_MARK[type].bg,
              }}
            >
              {type}
            </span>
          ))}
          {Array.isArray(limIndices) && limIndices.length > 0 && (
            <span style={s.fnLimCount}>LIM {limIndices.join(',')}</span>
          )}
        </span>
      </div>
      <div style={s.frame}>
        <div style={{ display: 'flex', width: '100%', alignItems: 'center', overflow: 'hidden' }}>

          {depDelayMin > 0 && depCrossSectionF > 0 && (
            <div style={{
              width: depCrossPct, height: 24, flexShrink: 0,
              borderRadius: '99px 0 0 99px',
              background: delayDashBg,
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.25)',
              overflow: 'hidden',
            }} />
          )}

          <div style={{
            width: mainPct, height: 24, flexShrink: 0,
            borderRadius:
              depDelayMin > 0 && depCrossSectionF > 0
                ? (arrDelayMin > 0 && arrCrossSectionF > 0 ? '0' : '0 99px 99px 0')
                : (arrDelayMin > 0 && arrCrossSectionF > 0 ? '99px 0 0 99px' : '99px'),
            background: theme.bg,
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.1)',
            display: 'flex', alignItems: 'center',
            padding: '0 8px', position: 'relative',
            cursor: 'default', transition: 'filter .12s',
            gap: 8,
            overflow: 'hidden',
          }}>
            <div style={s.pillMain}>
              {showRoute ? (
                <>
                  <span style={{ ...s.airport, color: theme.text }}>{dep}</span>
                  {showFull && (
                    <>
                      <span style={{ width: 1, background: 'rgba(0,0,0,.25)', height: 10, flexShrink: 0 }} />
                      <span style={{ ...s.airport, color: theme.text }}>{arr}</span>
                    </>
                  )}
                </>
              ) : (
                <span style={{ ...s.airport, color: theme.text }}>{dep}</span>
              )}
            </div>

            {showBadgesInside && Array.isArray(limIndices) && limIndices.length > 0 && (
              <div style={s.limBadgeRow}>
                {limIndices.slice(0, 3).map((indexValue, idx) => (
                  <div key={`${fn}-lim-${indexValue}-${idx}`} style={s.limBadgeInline} title="Limitation">
                    {indexValue}
                  </div>
                ))}
                {limIndices.length > 3 && <span style={s.moreLim}>+{limIndices.length - 3}</span>}
              </div>
            )}
          </div>

          {arrDelayMin > 0 && arrCrossSectionF > 0 && (
            <div style={{
              width: arrCrossPct,
              height: 24,
              flexShrink: 0,
              borderRadius: '0 99px 99px 0',
              background: delayDashBg,
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.25)',
              overflow: 'hidden',
            }} />
          )}
        </div>
      </div>
      {compactTimes ? (
        // Narrow pill: one combined label instead of colliding absolute ones.
        <div style={s.timesRowCompact}>
          {etd}–{arrDelayMin > 0 ? hmUtc(renderEndMs) : eta}
        </div>
      ) : (
        <div style={s.timesRow}>
          <span style={{ ...s.time, left: 0, transform: 'none' }}>{etd}</span>
          {showDepBoundaryLabel && <span style={{ ...s.time, left: depBoundaryPct }}>{hmUtc(depCrossEndMs)}</span>}
          {arrDelayMin > 0 ? (
            <>
              {showArrBoundaryLabel && <span style={{ ...s.time, left: arrBoundaryPct }}>{eta}</span>}
              <span style={{ ...s.time, right: 0, left: 'auto', transform: 'none' }}>{hmUtc(renderEndMs)}</span>
            </>
          ) : (
            <span style={{ ...s.time, right: 0, left: 'auto', transform: 'none' }}>{eta}</span>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  fnOutsideRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 2,
  },
  fnOutside: {
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: 9,
    color: '#5b6d98',
    fontWeight: 700,
    letterSpacing: '.4px',
    whiteSpace: 'nowrap',
  },
  fnLimCount: {
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: 8,
    color: '#f0c06b',
    border: '1px solid rgba(240,177,59,.35)',
    borderRadius: 999,
    padding: '1px 6px',
    lineHeight: '10px',
  },
  alertMark: {
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: 8,
    fontWeight: 700,
    border: '1px solid',
    borderRadius: 4,
    padding: '1px 4px',
    lineHeight: '10px',
    letterSpacing: '.5px',
  },
  impMark: {
    width: 13,
    height: 13,
    borderRadius: 4,
    background: 'rgba(240,177,59,.22)',
    border: '1px solid rgba(240,177,59,.55)',
    color: '#f0b13b',
    fontSize: 9,
    fontWeight: 800,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  frame: {
    width: '100%',
    height: 24,
    background: 'transparent',
    border: 'none',
    borderRadius: 99,
    padding: 0,
    boxShadow: 'none',
    overflow: 'hidden',
  },
  pillMain: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  airport: {
    fontFamily: "'IBM Plex Mono',monospace", fontSize: 9,
    fontWeight: 700, letterSpacing: '.5px', whiteSpace: 'nowrap', flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1,
  },
  limBadgeInline: {
    flexShrink: 0,
    width: 16, height: 16, borderRadius: '50%',
    background: 'rgba(240,177,59,.25)', border: '1px solid rgba(240,177,59,.5)',
    color: '#f0b13b', fontSize: 9, fontWeight: 700,
    fontFamily: "'IBM Plex Mono',monospace",
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', transition: 'background .15s',
  },
  limBadgeRow: {
    marginLeft: 4,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  moreLim: {
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: 8,
    color: '#b9c8e7',
  },
  timesRow: {
    position: 'relative',
    height: 14,
    marginTop: 2,
  },
  timesRowCompact: {
    height: 14,
    marginTop: 2,
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: 8,
    color: '#5d709e',
    lineHeight: '14px',
    whiteSpace: 'nowrap',
  },
  time: {
    position: 'absolute',
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: 8,
    color: '#5d709e',
    lineHeight: '14px',
    transform: 'translateX(-50%)',
    whiteSpace: 'nowrap',
  },
};
