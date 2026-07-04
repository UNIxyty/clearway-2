import { clamp } from '../data';

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
  const raw = String(hex || '').trim().replace('#', '');
  const expanded = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const m = /^([0-9a-f]{6})$/i.exec(expanded);
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
  scale = 1,
}) {
  const { fn, dep, arr, etd, eta, depDelayMin = 0, arrDelayMin = 0, status } = flight;
  // Ops-room legibility: every metric scales with the display scale setting.
  const sz = (v) => Math.round(v * scale);
  const F = {
    id: sz(12.5),
    times: sz(11),
    icao: sz(12),
    body: sz(30),
    badge: sz(18),
    labelRow: sz(18),
    timesRow: sz(17),
  };

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
    ${theme.bg} 0px, ${theme.bg} ${sz(9)}px,
    rgba(10,13,22,.2) ${sz(9)}px, rgba(10,13,22,.2) ${sz(17)}px
  )`;

  // ID text: Leon checklist color (contrast-guarded on the dark board),
  // italic when the trip is not CONFIRMED (Option/Opportunity).
  const idColor = readableIdColor(flight.checklistColor, '#d4ddf2');
  const idStyle = flight.isConfirmed === false ? 'italic' : 'normal';

  // ── Pixel-aware layout (anti-overlap) ──────────────────────────────────
  // Narrow pills switch layout instead of letting text collide. All
  // thresholds scale with the type size: a "00:00" label is ~3.1× the times
  // font wide, so clearances derive from that.
  const pillPx = totalF * timelinePx;
  const mainPx = (mainSectionF / totalF) * pillPx;
  const labelW = F.times * 3.2;

  const compactTimes = timelinePx > 0 && pillPx < labelW * 4.2;
  const showBadgesInside = mainPx >= sz(100);
  const icaoW = F.icao * 2.6;
  // Both codes need room for the divider, paddings and the gap — otherwise
  // fall back to ADEP-only rather than ellipsizing ("EV…").
  const showFull = timelinePx > 0
    ? mainPx >= icaoW * 2 + sz(48) + (showBadgesInside && limIndices.length > 0 ? sz(34) : 0)
    : (mainSectionF / totalF) > 0.14;
  const showRoute = timelinePx > 0 ? mainPx >= icaoW + sz(10) : (mainSectionF / totalF) > 0.08;

  // Boundary (delay-crossing) labels position by REAL times. Each needs
  // clearance from the endpoint labels and from each other — the later one
  // drops rather than colliding. Compact mode replaces the whole row.
  const depBoundaryPx = ((depCrossF - depF) / totalF) * pillPx;
  const arrBoundaryPx = ((arrCrossStartF - depF) / totalF) * pillPx;
  const clearance = labelW * 1.35;
  const showDepBoundaryLabel =
    !compactTimes && depDelayMin > 0 && depBoundaryPx >= clearance && pillPx - depBoundaryPx >= clearance;
  const showArrBoundaryLabel =
    !compactTimes &&
    arrDelayMin > 0 &&
    arrBoundaryPx >= clearance &&
    pillPx - arrBoundaryPx >= clearance &&
    (!showDepBoundaryLabel || arrBoundaryPx - depBoundaryPx >= labelW * 1.55);
  const depBoundaryPct = `${((depCrossF - depF) / totalF) * 100}%`;
  const arrBoundaryPct = `${((arrCrossStartF - depF) / totalF) * 100}%`;

  const timeStyle = {
    position: 'absolute',
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: F.times,
    fontWeight: 600,
    color: '#aeb9d6',
    lineHeight: `${F.timesRow}px`,
    transform: 'translateX(-50%)',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{
      position: 'absolute',
      left: (depF * 100).toFixed(3) + '%',
      width: (totalF * 100).toFixed(3) + '%',
      top: sz(4) + lane * laneStep,
      transform: 'none',
      minHeight: F.labelRow + F.body + F.timesRow,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: sz(3), height: F.labelRow }}>
        <span
          style={{
            fontFamily: "'IBM Plex Mono',monospace",
            fontSize: F.id,
            color: idColor,
            fontStyle: idStyle,
            fontWeight: 700,
            letterSpacing: '.4px',
            whiteSpace: 'nowrap',
          }}
        >
          {fn}
        </span>
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          {hasImp && (
            <span
              title="Important limitation — details in the Console"
              style={{
                width: sz(16),
                height: sz(16),
                borderRadius: 4,
                background: 'rgba(240,177,59,.22)',
                border: '1px solid rgba(240,177,59,.55)',
                color: '#f5c064',
                fontSize: sz(11),
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              !
            </span>
          )}
          {alertTypes.map((type) => (
            <span
              key={type}
              title={type === 'NTM' ? 'NOTAM alert' : 'Weather alert'}
              style={{
                fontFamily: "'IBM Plex Mono',monospace",
                fontSize: sz(9.5),
                fontWeight: 700,
                border: '1px solid',
                borderRadius: 4,
                padding: `1px ${sz(4)}px`,
                lineHeight: `${sz(12)}px`,
                letterSpacing: '.5px',
                color: ALERT_MARK[type].text,
                borderColor: ALERT_MARK[type].border,
                background: ALERT_MARK[type].bg,
              }}
            >
              {type}
            </span>
          ))}
          {Array.isArray(limIndices) && limIndices.length > 0 && (
            <span
              style={{
                fontFamily: "'IBM Plex Mono',monospace",
                fontSize: sz(9.5),
                color: '#f0c06b',
                border: '1px solid rgba(240,177,59,.4)',
                borderRadius: 999,
                padding: `1px ${sz(6)}px`,
                lineHeight: `${sz(12)}px`,
              }}
            >
              LIM {limIndices.join(',')}
            </span>
          )}
        </span>
      </div>

      <div style={{ width: '100%', height: F.body, borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', overflow: 'hidden' }}>
          {depDelayMin > 0 && depCrossSectionF > 0 && (
            <div
              style={{
                width: depCrossPct,
                height: '100%',
                flexShrink: 0,
                borderRadius: '99px 0 0 99px',
                background: delayDashBg,
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.28)',
                overflow: 'hidden',
              }}
            />
          )}

          <div
            style={{
              width: mainPct,
              height: '100%',
              flexShrink: 0,
              borderRadius:
                depDelayMin > 0 && depCrossSectionF > 0
                  ? (arrDelayMin > 0 && arrCrossSectionF > 0 ? '0' : '0 99px 99px 0')
                  : (arrDelayMin > 0 && arrCrossSectionF > 0 ? '99px 0 0 99px' : '99px'),
              background: theme.bg,
              boxShadow: 'inset 0 0 0 1px rgba(12,16,26,.22)',
              display: 'flex',
              alignItems: 'center',
              padding: `0 ${sz(9)}px`,
              position: 'relative',
              cursor: 'default',
              gap: 8,
              overflow: 'hidden',
            }}
          >
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flex: 1, overflow: 'hidden', justifyContent: 'space-between' }}>
              {showRoute && (
                <>
                  <span style={{ ...icaoStyle(F.icao), color: theme.text }}>{dep}</span>
                  {showFull && (
                    <>
                      <span style={{ width: 1, background: 'rgba(0,0,0,.28)', height: F.icao + 2, flexShrink: 0 }} />
                      <span style={{ ...icaoStyle(F.icao), color: theme.text }}>{arr}</span>
                    </>
                  )}
                </>
              )}
            </div>

            {showBadgesInside && Array.isArray(limIndices) && limIndices.length > 0 && (
              <div style={{ marginLeft: 4, display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                {limIndices.slice(0, 3).map((indexValue, idx) => (
                  <div
                    key={`${fn}-lim-${indexValue}-${idx}`}
                    title="Limitation"
                    style={{
                      flexShrink: 0,
                      width: F.badge,
                      height: F.badge,
                      borderRadius: '50%',
                      background: 'rgba(240,177,59,.3)',
                      border: '1px solid rgba(160,110,20,.6)',
                      color: '#5c3d05',
                      fontSize: Math.round(F.badge * 0.58),
                      fontWeight: 700,
                      fontFamily: "'IBM Plex Mono',monospace",
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {indexValue}
                  </div>
                ))}
                {limIndices.length > 3 && (
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: sz(9.5), color: theme.text }}>
                    +{limIndices.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>

          {arrDelayMin > 0 && arrCrossSectionF > 0 && (
            <div
              style={{
                width: arrCrossPct,
                height: '100%',
                flexShrink: 0,
                borderRadius: '0 99px 99px 0',
                background: delayDashBg,
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.28)',
                overflow: 'hidden',
              }}
            />
          )}
        </div>
      </div>

      {compactTimes ? (
        // Narrow pill: one combined label instead of colliding absolute ones.
        <div
          style={{
            height: F.timesRow,
            marginTop: sz(2),
            fontFamily: "'IBM Plex Mono',monospace",
            fontSize: F.times,
            fontWeight: 600,
            color: '#aeb9d6',
            lineHeight: `${F.timesRow}px`,
            whiteSpace: 'nowrap',
          }}
        >
          {etd}–{arrDelayMin > 0 ? hmUtc(renderEndMs) : eta}
        </div>
      ) : (
        <div style={{ position: 'relative', height: F.timesRow, marginTop: sz(2) }}>
          <span style={{ ...timeStyle, left: 0, transform: 'none' }}>{etd}</span>
          {showDepBoundaryLabel && <span style={{ ...timeStyle, left: depBoundaryPct }}>{hmUtc(depCrossEndMs)}</span>}
          {arrDelayMin > 0 ? (
            <>
              {showArrBoundaryLabel && <span style={{ ...timeStyle, left: arrBoundaryPct }}>{eta}</span>}
              <span style={{ ...timeStyle, right: 0, left: 'auto', transform: 'none' }}>{hmUtc(renderEndMs)}</span>
            </>
          ) : (
            <span style={{ ...timeStyle, right: 0, left: 'auto', transform: 'none' }}>{eta}</span>
          )}
        </div>
      )}
    </div>
  );
}

function icaoStyle(fontSize) {
  return {
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize,
    fontWeight: 700,
    letterSpacing: '.5px',
    whiteSpace: 'nowrap',
    flexShrink: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: 1,
  };
}
