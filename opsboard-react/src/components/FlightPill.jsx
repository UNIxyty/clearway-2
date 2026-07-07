import { clamp } from '../data';
import Icon from './console/icons';

// Pill body fill = flight state, derived from real Leon semantics
// (digital-wall/LEON-PILL-MAPPING.md):
//   white  = scheduled (not flying, on time)     yellow = delayed, not departed
//   purple = active CTOT/slot, not yet airborne  blue   = flying
//   pink   = arrived (landed / block-on)
// Softened ops-room palette (Part 2): desaturated, dusty tones — same state
// semantics, easier on the eyes across a shift. All fills are mid-light so a
// single dark ink stays legible on every state (contrast ≥ ~7:1 at scale).
const STATUS = {
  scheduled: { bg: '#dde1ea', text: '#1a1e2a' },
  delayed:   { bg: '#c9ab62', text: '#221c08' },
  ctot:      { bg: '#9d8cc2', text: '#1e1930' },
  airborne:  { bg: '#7d9cc4', text: '#101a28' },
  arrived:   { bg: '#bd8ba4', text: '#26121d' }, // dusty mauve (reference tone)
  cancelled: { bg: 'rgba(90,97,120,.45)', text: '#a7aec4' },
  // legacy aliases (older cached data)
  boarding:  { bg: '#dde1ea', text: '#1a1e2a' },
  slot:      { bg: '#9d8cc2', text: '#1e1930' },
};

// Leon checklist colors can be arbitrary; on the dark board a too-dark ID
// would vanish. NEVER discard the hue (a red = unfinished checklist is the
// most important signal in the room — cwy-cwy returns FF0000): instead mix
// the color toward white until it clears the legibility threshold.
function readableIdColor(hex, fallback) {
  const raw = String(hex || '').trim().replace('#', '');
  const expanded = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const m = /^([0-9a-f]{6})$/i.exec(expanded);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const luminance = () => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  for (let step = 0; luminance() < 0.55 && step < 8; step += 1) {
    r = Math.round(r + (255 - r) * 0.25);
    g = Math.round(g + (255 - g) * 0.25);
    b = Math.round(b + (255 - b) * 0.25);
  }
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Auto-derived per-flight markers (Feature 6 alerts). These render as small
// type badges ABOVE the pill — they are NOT sidebar entries. WX markers
// (per-airport CheckWX categories) share the same row and chip treatment.
const ALERT_MARK = {
  NTM: { text: '#ffab73', border: 'rgba(255,145,80,.5)', bg: 'rgba(255,145,80,.18)' },
};

// CheckWX flight_category → marker colour. STANDARD aviation mapping (green =
// good), deliberately NOT the inverted mapping from the original request:
// painting good weather red is unsafe at a glance. LIFR gets a deep magenta
// so "worst" is distinguishable from plain IFR red. Adjust here if ops wants
// different hues.
export const WX_CATEGORY_COLORS = {
  VFR:  '#3fbf6f', // good
  MVFR: '#e8a33d', // marginal
  IFR:  '#e5484d', // bad
  LIFR: '#b03aa0', // worst — deep magenta, never green
};

/** Hex -> rgba with alpha, for the marker chip border/backing. */
function hexA(hex, alpha) {
  const n = parseInt(String(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * Per-airport weather marker ABOVE the pill (Item 6) — same row, size and
 * chip treatment as the NTM marker, coloured by that airport's
 * flight_category. ADEP chip renders before the ADES chip, and each carries
 * a departure/arrival glyph so it's clear which airport it refers to.
 */
function WxMark({ category, icao, side, sz }) {
  const color = WX_CATEGORY_COLORS[category];
  if (!color) return null;
  const isDep = side === 'dep';
  return (
    <span
      title={`${icao} ${category} (CheckWX, ${isDep ? 'departure' : 'arrival'})`}
      style={{
        fontFamily: "'IBM Plex Mono',monospace",
        fontSize: sz(9.5),
        fontWeight: 700,
        border: '1px solid',
        borderRadius: 4,
        padding: `1px ${sz(4)}px`,
        lineHeight: `${sz(12)}px`,
        letterSpacing: '.5px',
        color,
        borderColor: hexA(color, 0.55),
        background: hexA(color, 0.16),
        display: 'inline-flex',
        alignItems: 'center',
        gap: sz(3),
      }}
    >
      <Icon name={isDep ? 'plane-takeoff' : 'plane-landing'} size={sz(10)} strokeWidth={2.4} />
      WX
    </span>
  );
}

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

  // Delay renders as a DIAGONAL-HATCH segment sized to the delay magnitude:
  // the span between the scheduled time and the actual/estimated departure
  // (or between STA and the delayed arrival on the trailing side). Parallel
  // 45° lines over the muted state colour (reference-image treatment) so the
  // delay reads as "this pill, not yet solid".
  const delayDashBg = `repeating-linear-gradient(
    45deg,
    ${theme.bg} 0px, ${theme.bg} ${sz(6)}px,
    rgba(10,13,22,.30) ${sz(6)}px, rgba(10,13,22,.30) ${sz(10)}px
  )`;

  // ID text: Leon checklist color (contrast-guarded on the dark board),
  // italic when the trip is not CONFIRMED (Option/Opportunity).
  const idColor = readableIdColor(flight.checklistColor, '#d4ddf2');
  const idStyle = flight.isConfirmed === false ? 'italic' : 'normal';

  // ── Timing labels (Item 6): delayed flights show planned AND actual ─────
  // Departure: "ETD 08:00" at the pill start, "ATD 08:35" at the end of the
  // hatched delay segment (plain time when the flight hasn't departed yet —
  // the hatch end is then only an estimate, and we never invent an actual).
  // Arrival: "ETA 11:30" at the boundary, "ATA 11:52" at the right end.
  // On-time ends keep the plain untagged time.
  const depTagged = depDelayMin > 0;
  const arrTagged = arrDelayMin > 0;
  const startLabel = depTagged ? `ETD ${etd}` : etd;
  const depBoundaryText = depTagged
    ? (flight.atdHm ? `ATD ${flight.atdHm}` : hmUtc(depCrossEndMs))
    : hmUtc(depCrossEndMs);
  const arrBoundaryText = arrTagged ? `ETA ${eta}` : eta;
  const endLabel = arrTagged
    ? (flight.ataHm ? `ATA ${flight.ataHm}` : hmUtc(renderEndMs))
    : eta;

  // ── Pixel-aware layout (anti-overlap) ──────────────────────────────────
  // Narrow pills switch layout instead of letting text collide. All
  // thresholds scale with the type size: a "00:00" label is ~3.1× the times
  // font wide; tagged labels ("ATD 00:00") are ~1.8× wider, so clearances
  // derive from the widest label actually in play.
  const pillPx = totalF * timelinePx;
  const mainPx = (mainSectionF / totalF) * pillPx;
  const plainLabelW = F.times * 3.2;
  const labelW = depTagged || arrTagged ? plainLabelW * 1.8 : plainLabelW;

  // ── Degradation priority (Item 10): ICAOs beat timings ────────────────────
  // When space is tight the pill drops content in this order:
  //   1. inside badges (LIM circles) — they yield before the second ICAO,
  //   2. the times row below the pill (timings drop FIRST among text),
  //   3. the arrival ICAO (both → dep-only),
  //   4. the departure ICAO (dep-only → none) — only when truly no room.
  // A missing ICAO in the DATA ('UNK') is a data gap, rendered dimmed — it is
  // never dropped because a timing is missing, and vice versa.
  const compactTimes = timelinePx > 0 && pillPx < labelW * 4.2;
  const icaoW = F.icao * 2.6;
  // Both codes need room for the divider and paddings — otherwise fall back
  // to ADEP-only rather than ellipsizing ("EV…"). Badges are NOT reserved
  // space here: they only render once both ICAOs already fit comfortably.
  const showFull = timelinePx > 0
    ? mainPx >= icaoW * 2 + sz(22)
    : (mainSectionF / totalF) > 0.14;
  const showRoute = timelinePx > 0 ? mainPx >= icaoW + sz(6) : (mainSectionF / totalF) > 0.08;
  const showBadgesInside = mainPx >= icaoW * 2 + sz(58);
  // Timings drop before ICAOs: on a pill too narrow for even the compact
  // combined label, render no times row at all (details live in the overlay).
  const showTimes = timelinePx > 0 ? pillPx >= labelW * 1.15 : true;

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
          <WxMark category={flight.wxDep} icao={dep} side="dep" sz={sz} />
          <WxMark category={flight.wxArr} icao={arr} side="arr" sz={sz} />
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
                  <span style={{ ...icaoStyle(F.icao), color: theme.text, opacity: dep === 'UNK' ? 0.55 : 1 }}>{dep}</span>
                  {showFull && (
                    <>
                      <span style={{ width: 1, background: 'rgba(0,0,0,.28)', height: F.icao + 2, flexShrink: 0 }} />
                      <span style={{ ...icaoStyle(F.icao), color: theme.text, opacity: arr === 'UNK' ? 0.55 : 1 }}>{arr}</span>
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

      {!showTimes ? (
        <div style={{ height: F.timesRow, marginTop: sz(2) }} />
      ) : compactTimes ? (
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
          <span style={{ ...timeStyle, left: 0, transform: 'none' }}>{startLabel}</span>
          {showDepBoundaryLabel && <span style={{ ...timeStyle, left: depBoundaryPct }}>{depBoundaryText}</span>}
          {arrDelayMin > 0 ? (
            <>
              {showArrBoundaryLabel && <span style={{ ...timeStyle, left: arrBoundaryPct }}>{arrBoundaryText}</span>}
              <span style={{ ...timeStyle, right: 0, left: 'auto', transform: 'none' }}>{endLabel}</span>
            </>
          ) : (
            <span style={{ ...timeStyle, right: 0, left: 'auto', transform: 'none' }}>{endLabel}</span>
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
