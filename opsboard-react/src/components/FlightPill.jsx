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

// Light-theme marker palette (console lists): same semantics as the wall
// chips, colours flipped for a white/card background — dark readable text on
// a soft tint instead of bright text on dark.
const WX_CATEGORY_LIGHT = {
  VFR:  { text: '#15803d', border: 'rgba(21,128,61,.45)',  bg: 'rgba(63,191,111,.14)' },
  MVFR: { text: '#b45309', border: 'rgba(180,83,9,.45)',   bg: 'rgba(232,163,61,.16)' },
  IFR:  { text: '#b91c1c', border: 'rgba(185,28,28,.45)',  bg: 'rgba(229,72,77,.13)' },
  LIFR: { text: '#a21caf', border: 'rgba(162,28,175,.45)', bg: 'rgba(176,58,160,.13)' },
};
const MARK_LIGHT = {
  IMP: { text: '#92500b', border: 'rgba(180,120,20,.5)',  bg: 'rgba(240,177,59,.18)' },
  CAA: { text: '#0f766e', border: 'rgba(47,158,143,.6)',  bg: 'rgba(47,158,143,.13)' },
  NTM: { text: '#b3541e', border: 'rgba(200,100,40,.5)',  bg: 'rgba(255,145,80,.16)' },
};

/** Hex -> rgba with alpha, for the marker chip border/backing. */
function hexA(hex, alpha) {
  const n = parseInt(String(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * Vertical metrics shared by the Board (lane maths) and the pill itself.
 * rowZoom thins/thickens ONLY heights — fonts stay on the display scale so
 * text remains legible — and every row floors at its font size + padding so
 * the extreme slider positions can't clip text or the marker chips.
 */
export function pillVerticalMetrics(scale, rowZoom = 1) {
  const sz = (v) => Math.round(v * scale);
  const vz = (v, floor) => Math.max(floor, Math.round(v * scale * rowZoom));
  const id = sz(12.5);
  const icao = sz(12);
  const times = sz(11);
  const labelRow = vz(18, Math.max(id + sz(4), sz(16) + 2)); // markers are sz(16) tall
  const body = vz(30, icao + sz(8));
  const timesRow = vz(17, times + sz(4));
  // top offset 4 + label row + 3 + body + 2 + times row (see render)
  const total = labelRow + sz(3) + body + sz(2) + timesRow;
  return { labelRow, body, timesRow, total };
}

/**
 * Per-airport weather marker ABOVE the pill (Item 6) — same row, size and
 * chip treatment as the NTM marker, coloured by that airport's
 * flight_category. ADEP chip renders before the ADES chip, and each carries
 * a departure/arrival glyph so it's clear which airport it refers to.
 */
function WxMark({ category, icao, side, sz, variant = 'wall', iconOnly = false }) {
  const color = WX_CATEGORY_COLORS[category];
  if (!color) return null;
  const light = variant === 'light' ? WX_CATEGORY_LIGHT[category] : null;
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
        color: light ? light.text : color,
        borderColor: light ? light.border : hexA(color, 0.55),
        background: light ? light.bg : hexA(color, 0.16),
        display: 'inline-flex',
        alignItems: 'center',
        gap: sz(3),
      }}
    >
      <Icon name={isDep ? 'plane-takeoff' : 'plane-landing'} size={sz(10)} strokeWidth={2.4} />
      {iconOnly ? null : 'WX'}
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

/**
 * The flight's marker row — IMP, CAA, WX (dep/arr with category colours and
 * takeoff/landing glyphs) and NTM — shared by the wall pill and the console
 * flight lists so both surfaces always agree. State rules live in the
 * DECORATION (NTM only while unreviewed, WX only for today's flights, CAA
 * per its flags): this component just renders what the flight carries.
 */
/** The markers a flight carries, as data — shared by renderer and budgeter. */
export function markerListOf(flight) {
  const list = [];
  if ((flight.limitations || []).some((lim) => lim.type === 'IMP')) list.push({ key: 'IMP', color: '#f5c064', label: 'Important' });
  if ((flight.limitations || []).some((lim) => lim.type === 'CAA')) list.push({ key: 'CAA', color: '#5eead4', label: 'CAA details' });
  if (flight.wxDep && WX_CATEGORY_COLORS[flight.wxDep]) list.push({ key: 'WXD', color: WX_CATEGORY_COLORS[flight.wxDep], label: `Departure WX ${flight.wxDep}` });
  if (flight.wxArr && WX_CATEGORY_COLORS[flight.wxArr]) list.push({ key: 'WXA', color: WX_CATEGORY_COLORS[flight.wxArr], label: `Arrival WX ${flight.wxArr}` });
  for (const type of new Set((flight.limitations || []).filter((l) => l.source === 'alert' && ALERT_MARK[l.type]).map((l) => l.type))) {
    list.push({ key: type, color: ALERT_MARK[type].text, label: 'Unreviewed NOTAM' });
  }
  return list;
}

/**
 * Estimated pixel widths per degradation mode (design 1B) — mono-font
 * heuristics consistent with the pill's other width maths.
 */
export function markerRowWidthEstimate(flight, sz, mode, extraMarkers = []) {
  const markers = [...markerListOf(flight), ...extraMarkers];
  if (markers.length === 0) return 0;
  const gap = 4;
  if (mode === 'dots') return markers.length * (sz(8) + gap);
  if (mode === 'count') return sz(26);
  const per = (m) => {
    if (mode === 'icons') {
      return m.key === 'IMP' ? sz(16) : m.key.startsWith('WX') ? sz(20) : sz(16);
    }
    // full chips
    if (m.key === 'IMP') return sz(16);
    if (m.key === 'CAA') return sz(30);
    if (m.key.startsWith('WX')) return sz(36);
    return sz(32); // NTM
  };
  return markers.reduce((total, m) => total + per(m) + gap, 0);
}

/**
 * ICAO aircraft-type chip (C56X, E55P…) — informational, deliberately neutral
 * so it never reads as an alert. Lowest marker priority: the pill shows it
 * only in 'full' mode when it fits AFTER every alert marker, and drops it
 * first when space tightens (it never joins dots or the +N count — those are
 * alert summaries).
 */
export function AcftTypeChip({ code, sz = (v) => Math.round(v), variant = 'wall' }) {
  if (!code) return null;
  const light = variant === 'light';
  return (
    <span
      title={`Aircraft type ${code}`}
      style={{
        fontFamily: "'IBM Plex Mono',monospace",
        fontSize: sz(9.5),
        fontWeight: 600,
        border: `1px solid ${light ? 'rgba(100,116,139,.4)' : 'rgba(148,163,184,.35)'}`,
        borderRadius: 4,
        padding: `1px ${sz(4)}px`,
        lineHeight: `${sz(12)}px`,
        letterSpacing: '.5px',
        color: light ? '#475569' : '#94a3b8',
        background: light ? 'rgba(100,116,139,.08)' : 'rgba(148,163,184,.10)',
        flexShrink: 0,
      }}
    >
      {code}
    </span>
  );
}

export function FlightMarkers({ flight, sz = (v) => Math.round(v), wrap = false, variant = 'wall', mode = 'full', extraMarkers = [], typeChip = null }) {
  const light = variant === 'light';
  // Degraded wall modes (1B): icons drop chip text, dots collapse each
  // marker to a coloured dot, count folds everything into one +N chip.
  // Colour meaning survives at every level.
  if (variant === 'wall' && (mode === 'dots' || mode === 'count')) {
    const markers = [...markerListOf(flight), ...(extraMarkers || [])];
    if (markers.length === 0) return null;
    if (mode === 'count') {
      return (
        <span
          title={markers.map((m) => m.label).join(' · ')}
          style={{
            fontFamily: "'IBM Plex Mono',monospace",
            fontSize: sz(9.5),
            fontWeight: 800,
            color: '#aeb9d6',
            border: '1px solid rgba(160,175,210,.45)',
            borderRadius: 4,
            padding: `1px ${sz(4)}px`,
            lineHeight: `${sz(12)}px`,
            flexShrink: 0,
          }}
        >
          +{markers.length}
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
        {markers.map((m) => (
          <span
            key={m.key}
            title={m.label}
            style={{ width: sz(8), height: sz(8), borderRadius: '50%', background: m.color, flexShrink: 0, boxShadow: '0 0 0 1px rgba(10,13,22,.5)' }}
          />
        ))}
      </span>
    );
  }
  const iconsOnly = variant === 'wall' && mode === 'icons';
  const alertTypes = [
    ...new Set(
      (flight.limitations || [])
        .filter((lim) => lim.source === 'alert' && ALERT_MARK[lim.type])
        .map((lim) => lim.type)
    ),
  ];
  const hasImp = (flight.limitations || []).some((lim) => lim.type === 'IMP');
  const hasCaa = (flight.limitations || []).some((lim) => lim.type === 'CAA');
  const dep = flight.adep?.icao ?? flight.dep ?? 'UNK';
  const arr = flight.ades?.icao ?? flight.arr ?? 'UNK';
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', ...(wrap ? { flexWrap: 'wrap', rowGap: 3 } : {}) }}>
      {hasImp && (
        <span
          title="Important limitation — details in the Console"
          style={{
            width: sz(16),
            height: sz(16),
            borderRadius: 4,
            background: light ? MARK_LIGHT.IMP.bg : 'rgba(240,177,59,.22)',
            border: `1px solid ${light ? MARK_LIGHT.IMP.border : 'rgba(240,177,59,.55)'}`,
            color: light ? MARK_LIGHT.IMP.text : '#f5c064',
            fontSize: sz(11),
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          !
        </span>
      )}
      {hasCaa && (
        <span
          title="CAA authority details apply — contact block in the flight overlay"
          style={{
            fontFamily: "'IBM Plex Mono',monospace",
            fontSize: sz(9.5),
            fontWeight: 800,
            border: `1px solid ${light ? MARK_LIGHT.CAA.border : '#2f9e8f'}`,
            borderRadius: 4,
            padding: `1px ${sz(4)}px`,
            lineHeight: `${sz(12)}px`,
            letterSpacing: '.5px',
            color: light ? MARK_LIGHT.CAA.text : '#5eead4',
            background: light ? MARK_LIGHT.CAA.bg : 'rgba(47,158,143,.18)',
            flexShrink: 0,
          }}
        >
          {iconsOnly ? 'C' : 'CAA'}
        </span>
      )}
      <WxMark category={flight.wxDep} icao={dep} side="dep" sz={sz} variant={variant} iconOnly={iconsOnly} />
      <WxMark category={flight.wxArr} icao={arr} side="arr" sz={sz} variant={variant} iconOnly={iconsOnly} />
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
            color: light ? MARK_LIGHT.NTM.text : ALERT_MARK[type].text,
            borderColor: light ? MARK_LIGHT.NTM.border : ALERT_MARK[type].border,
            background: light ? MARK_LIGHT.NTM.bg : ALERT_MARK[type].bg,
            flexShrink: 0,
          }}
        >
          {iconsOnly ? type.slice(0, 1) : type}
        </span>
      ))}
      <AcftTypeChip code={typeChip} sz={sz} variant={variant} />
    </span>
  );
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
  rowZoom = 1,
  neighborGapPx = null,
}) {
  const { fn, dep, arr, etd, eta, depDelayMin = 0, arrDelayMin = 0, status } = flight;
  // Ops-room legibility: every metric scales with the display scale setting.
  // Heights additionally follow rowZoom (vertical thinning) via
  // pillVerticalMetrics; fonts deliberately don't.
  const sz = (v) => Math.round(v * scale);
  const V = pillVerticalMetrics(scale, rowZoom);
  const F = {
    id: sz(12.5),
    times: sz(11),
    icao: sz(12),
    body: V.body,
    badge: sz(18),
    labelRow: V.labelRow,
    timesRow: V.timesRow,
  };

  // NTM/WX/IMP/CAA markers render via the shared <FlightMarkers> row.

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

  // ── Neighbour-aware width budget (1B/2A) ──────────────────────────────
  // Everything anchored at this pill's left edge (marker row, below-pill
  // text) may extend past the pill into EMPTY space — but never into the
  // next flight's content. The budget is the distance to the next flight's
  // start in this lane (minus a safety gap), or effectively unlimited when
  // there is no neighbour.
  const budgetPx = Number.isFinite(neighborGapPx)
    ? Math.max(pillPx, neighborGapPx) - sz(10)
    : Number.POSITIVE_INFINITY;

  // Marker row degradation (design 1B): full chips → icon-only chips →
  // coloured dots → one "+N" cluster, chosen against the space left after
  // the flight ID. Colour meaning survives at every level; +N counts ALL
  // hidden markers (incl. the LIM cluster, folded in as an amber marker).
  const monoW = (chars, size) => chars * size * 0.62;
  const idW = monoW(String(fn ?? '').length, F.id) + sz(6);
  const hasLim = Array.isArray(limIndices) && limIndices.length > 0;
  const limExtra = hasLim
    ? [{ key: 'LIM', color: '#f0c06b', label: `Limitations ${limIndices.join(',')}` }]
    : [];
  const limChipW = hasLim ? monoW(4 + limIndices.join(',').length, sz(9.5)) + sz(14) : 0;
  const markerBudget = budgetPx - idW;
  const markerMode = (() => {
    if (markerRowWidthEstimate(flight, sz, 'full') + limChipW <= markerBudget) return 'full';
    if (markerRowWidthEstimate(flight, sz, 'icons') + limChipW <= markerBudget) return 'icons';
    if (markerRowWidthEstimate(flight, sz, 'dots', limExtra) <= markerBudget) return 'dots';
    return 'count';
  })();
  const showLimChip = hasLim && (markerMode === 'full' || markerMode === 'icons');
  // ICAO aircraft-type chip: informational → lowest priority. Only rendered
  // when the row is already comfortable ('full' mode) AND the chip still fits
  // inside the budget after every alert marker + LIM chip; the first thing
  // dropped when space tightens. Never folded into dots/+N (alert summaries).
  const acftType = flight.acftTypeIcao || null;
  const typeChipW = acftType ? monoW(acftType.length, sz(9.5)) + sz(12) : 0;
  const showTypeChip =
    !!acftType &&
    markerMode === 'full' &&
    markerRowWidthEstimate(flight, sz, 'full') + limChipW + typeChipW <= markerBudget;

  // Route below the pill (design 2A): when both ICAOs don't fully fit
  // INSIDE the pill, the pill stays clean and the route renders below with
  // the times — never truncated. Budgeted like the marker row; when tight,
  // the times drop FIRST and the route survives (route > times).
  const routeText = `${dep}→${arr}`;
  const timesText = `${etd}–${arrDelayMin > 0 ? hmUtc(renderEndMs) : eta}`;
  const belowBudget = budgetPx - sz(4);
  const belowMode = (() => {
    if (showFull) return 'anchored'; // ICAOs inside — keep the classic times row
    if (monoW(routeText.length + 3 + timesText.length, F.times) <= belowBudget) return 'combined';
    if (monoW(routeText.length, F.times) <= belowBudget) return 'route-only';
    return 'none';
  })();

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
          <FlightMarkers flight={flight} sz={sz} mode={markerMode} extraMarkers={markerMode === 'dots' || markerMode === 'count' ? limExtra : []} typeChip={showTypeChip ? acftType : null} />
          {showLimChip && (
            <span
              style={{
                fontFamily: "'IBM Plex Mono',monospace",
                fontSize: sz(9.5),
                color: '#f0c06b',
                border: '1px solid rgba(240,177,59,.4)',
                borderRadius: 999,
                padding: `1px ${sz(6)}px`,
                lineHeight: `${sz(12)}px`,
                whiteSpace: 'nowrap',
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
            {/* Design 2A: ICAOs render inside ONLY when both fit completely;
                a pill too narrow stays clean and the route moves below —
                never a truncated "L…". */}
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flex: 1, overflow: 'hidden', justifyContent: 'space-between' }}>
              {showFull && (
                <>
                  <span style={{ ...icaoStyle(F.icao), color: theme.text, opacity: dep === 'UNK' ? 0.55 : 1 }}>{dep}</span>
                  <span style={{ width: 1, background: 'rgba(0,0,0,.28)', height: F.icao + 2, flexShrink: 0 }} />
                  <span style={{ ...icaoStyle(F.icao), color: theme.text, opacity: arr === 'UNK' ? 0.55 : 1 }}>{arr}</span>
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

      {belowMode === 'combined' || belowMode === 'route-only' ? (
        // Design 2A: route lives BELOW the pill (with the times when they
        // fit) so pill width never truncates an ICAO. Budgeted against the
        // neighbour; overflows the pill into safe empty space only.
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
          <span style={{ color: '#ccd6ee', fontWeight: 700 }}>{routeText}</span>
          {belowMode === 'combined' && <span> · {timesText}</span>}
        </div>
      ) : belowMode === 'none' ? (
        <div style={{ height: F.timesRow, marginTop: sz(2) }} />
      ) : !showTimes ? (
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
