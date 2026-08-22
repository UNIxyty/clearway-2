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

// Bug report 2 item 1: weather colours the AIRPORT CODE itself.
// VFR green, MVFR amber, LIFR red, IFR = default colour (deliberate — the
// sidebar WX agenda explains the scheme, so an uncoloured code reads as
// IFR/no-forecast, not as a rendering failure). Two variants: dark tones
// for light pill fills, bright tones for text on the dark board.
export const WX_ICAO_DARK = { VFR: '#166534', MVFR: '#92400e', LIFR: '#b91c1c', IFR: null };
export const WX_ICAO_BRIGHT = { VFR: '#3fbf6f', MVFR: '#e8a33d', LIFR: '#ef6a6a', IFR: null };

/** Hex -> rgba with alpha, for the marker chip border/backing. */
function hexA(hex, alpha) {
  const n = parseInt(String(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * Vertical metrics shared by the Board (lane maths) and the pill itself.
 * rowZoom thins/thickens the whole band; Item 3 adds independent knobs —
 * pillHeight (body thickness), markerScale (chip row), labelScale (ID /
 * ICAO / times fonts). Every band still floors at its content's size —
 * fonts never drop below 7px, marker chips below 10px — so the extreme
 * slider positions can't clip text or the marker chips; the floors now
 * FOLLOW labelScale/markerScale, which is what actually lets rows get
 * meaningfully thinner than before.
 */
export function pillVerticalMetrics(scale, rowZoom = 1, opts = {}) {
  const pillHeight = Number.isFinite(opts.pillHeight) ? opts.pillHeight : 1;
  const markerScale = Number.isFinite(opts.markerScale) ? opts.markerScale : 1;
  const labelScale = Number.isFinite(opts.labelScale) ? opts.labelScale : 1;
  const sz = (v) => Math.round(v * scale);
  const vz = (v, floor) => Math.max(floor, Math.round(v * scale * rowZoom));
  const id = Math.max(7, Math.round(12.5 * scale * labelScale));
  const icao = Math.max(7, Math.round(12 * scale * labelScale));
  const times = Math.max(7, Math.round(11 * scale * labelScale));
  const markerH = Math.max(10, Math.round(16 * scale * markerScale));
  const body = Math.max(icao + sz(4), Math.round(30 * scale * rowZoom * pillHeight));
  // Old-DigitalWall layout: the callsign (+ LIM circles) sits IN FRONT of
  // the pill and the markers AFTER it — one band instead of a label row
  // above, which is the main vertical saving. The band floors at whatever
  // is tallest on the line.
  const band = Math.max(body, id + 2, markerH);
  const timesRow = vz(17, times + sz(3));
  // top offset 4 + band + 2 + times row (see render)
  const total = band + sz(2) + timesRow;
  return { band, body, timesRow, total, fonts: { id, icao, times }, markerH };
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
  // Wall declutter (Item 2): plain coloured TEXT instead of a chip —
  // "IFR: EGGW" full form, bare "IFR" when degraded to icon width. Less
  // visual weight, still colour-coded and readable at distance.
  if (variant === 'wall') {
    return (
      <span
        title={`${icao} ${category} (CheckWX, ${isDep ? 'departure' : 'arrival'})`}
        style={{
          fontFamily: "'IBM Plex Mono',monospace",
          fontSize: sz(10),
          fontWeight: 700,
          letterSpacing: '.4px',
          color,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {iconOnly ? category : `${category}: ${icao}`}
      </span>
    );
  }
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
export function markerListOf(flight, { wx = true } = {}) {
  const list = [];
  if ((flight.limitations || []).some((lim) => lim.type === 'IMP')) list.push({ key: 'IMP', color: '#f5c064', label: 'Important' });
  if ((flight.limitations || []).some((lim) => lim.type === 'CAA')) list.push({ key: 'CAA', color: '#5eead4', label: 'CAA details' });
  if (wx && flight.wxDep && WX_CATEGORY_COLORS[flight.wxDep]) list.push({ key: 'WXD', color: WX_CATEGORY_COLORS[flight.wxDep], label: `Departure WX ${flight.wxDep}` });
  if (wx && flight.wxArr && WX_CATEGORY_COLORS[flight.wxArr]) list.push({ key: 'WXA', color: WX_CATEGORY_COLORS[flight.wxArr], label: `Arrival WX ${flight.wxArr}` });
  for (const type of new Set((flight.limitations || []).filter((l) => l.source === 'alert' && ALERT_MARK[l.type]).map((l) => l.type))) {
    list.push({ key: type, color: ALERT_MARK[type].text, label: 'Unreviewed NOTAM' });
  }
  return list;
}

/**
 * Estimated pixel widths per degradation mode (design 1B) — mono-font
 * heuristics consistent with the pill's other width maths.
 */
export function markerRowWidthEstimate(flight, sz, mode, extraMarkers = [], { wx = true } = {}) {
  const markers = [...markerListOf(flight, { wx }), ...extraMarkers];
  if (markers.length === 0) return 0;
  const gap = 4;
  if (mode === 'dots') return markers.length * (sz(8) + gap);
  if (mode === 'count') return sz(26);
  const per = (m) => {
    if (mode === 'icons') {
      // WX degraded = bare category text ("LIFR" worst case ~4 chars)
      return m.key === 'IMP' ? sz(16) : m.key.startsWith('WX') ? sz(28) : sz(16);
    }
    // full forms
    if (m.key === 'IMP') return sz(16);
    if (m.key === 'CAA') return sz(30);
    // WX text "MVFR: EGGW" ~10 mono chars at sz(10)
    if (m.key.startsWith('WX')) return sz(64);
    return sz(32); // NTM
  };
  return markers.reduce((total, m) => total + per(m) + gap, 0);
}

/**
 * ICAO flight-type letter (Leon enum IcaoType, the "ICAO type" field OPS set
 * on the Aircraft tab; each flight carries its own value inheriting that
 * default). Informational and deliberately neutral — never alarm styling.
 * On the WALL pill it gets a RESERVED slot beside the flight ID, outside the
 * alert-marker degradation ladder, so it survives even when alert chips
 * degrade to dots/+N. In console lists it rides at the end of the marker row
 * (no width budget there).
 */
export const ICAO_TYPE_MEANING = {
  S: 'Scheduled air service',
  N: 'Non-scheduled air service',
  G: 'General aviation',
  M: 'Military',
  X: 'Other',
};

export function IcaoTypeChip({ letter, size = 12, variant = 'wall' }) {
  const code = String(letter || '').toUpperCase();
  if (!code) return null;
  const light = variant === 'light';
  const font = Math.max(7, Math.round(size));
  return (
    <span
      title={`ICAO type ${code} — ${ICAO_TYPE_MEANING[code] || 'Unknown'}`}
      style={{
        fontFamily: "'IBM Plex Mono',monospace",
        fontSize: font,
        fontWeight: 800,
        // Solid slate fill with dark ink: neutral (clearly not an alarm
        // colour) but high-contrast against the dark board — the old faint
        // tint blended into the background.
        border: light ? '1px solid rgba(71,85,105,.55)' : '1px solid rgba(220,228,245,.25)',
        borderRadius: 3,
        padding: `0px ${Math.max(2, Math.round(font * 0.4))}px`,
        lineHeight: `${font + 3}px`,
        letterSpacing: 0,
        color: light ? '#f8fafc' : '#10141f',
        background: light ? '#64748b' : '#aab6cc',
        flexShrink: 0,
      }}
    >
      {code}
    </span>
  );
}

export function FlightMarkers({ flight, sz = (v) => Math.round(v), wrap = false, variant = 'wall', mode = 'full', extraMarkers = [], icaoType = null }) {
  const light = variant === 'light';
  // Degraded wall modes (1B): icons drop chip text, dots collapse each
  // marker to a coloured dot, count folds everything into one +N chip.
  // Colour meaning survives at every level.
  if (variant === 'wall' && (mode === 'dots' || mode === 'count')) {
    const markers = [...markerListOf(flight, { wx: false }), ...(extraMarkers || [])];
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
      {variant !== 'wall' && <WxMark category={flight.wxDep} icao={dep} side="dep" sz={sz} variant={variant} iconOnly={iconsOnly} />}
      {variant !== 'wall' && <WxMark category={flight.wxArr} icao={arr} side="arr" sz={sz} variant={variant} iconOnly={iconsOnly} />}
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
      <IcaoTypeChip letter={icaoType} size={sz(9.5)} variant={variant} />
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
  pillHeight = 1,
  markerScale = 1,
  labelScale = 1,
  neighborGapPx = null,
  stickyLeftPx = 0,
  nowMs = 0,
  viewportPx = 0,
  mvtThresholdMin = 15,
  mvtFlashSeconds = 1,
  infoOpen = false,
  onToggleInfo = null,
}) {
  const { fn, dep, arr, etd, eta, depDelayMin = 0, arrDelayMin = 0, depDeltaMin = 0, arrDeltaMin = 0, depKind = 'STD', arrKind = 'STA', depHm, arrHm, status } = flight;
  // Info tab (bug report item 1): a flight with IMP/NOTAM/WX/CAA content is
  // click-expandable — click again (or ✕) collapses. No hover involved.
  const hasInfoContent = (flight.limitations || []).length > 0 || Boolean(flight.wxDep || flight.wxArr);
  const clickable = hasInfoContent && typeof onToggleInfo === 'function';
  // Ops-room legibility: every metric scales with the display scale setting.
  // Heights additionally follow rowZoom/pillHeight, marker chips follow
  // markerScale, and the ID/ICAO/times fonts follow labelScale — all via
  // pillVerticalMetrics so lane maths and render can't drift apart.
  const sz = (v) => Math.round(v * scale);
  // Marker-row sizing: everything inside <FlightMarkers> (and the LIM chip,
  // which sits in the same row) draws through this scaled helper.
  const szm = (v) => Math.max(1, Math.round(v * scale * markerScale));
  const V = pillVerticalMetrics(scale, rowZoom, { pillHeight, markerScale, labelScale });
  const F = {
    id: V.fonts.id,
    times: V.fonts.times,
    icao: V.fonts.icao,
    body: V.body,
    band: V.band,
    timesRow: V.timesRow,
  };

  // NTM/WX/IMP/CAA markers render via the shared <FlightMarkers> row.

  // The fill comes straight from the Leon-derived movement state — a delayed
  // AIRBORNE flight is blue (the leading dashed segment still shows the
  // delay); "delayed" (yellow) means delayed and not yet departed.
  const theme = STATUS[status] || STATUS.scheduled;
  // Estimated states (clock-derived, no flight-watch data) render HOLLOW:
  // outline + faint fill in the state's colour. Solid = confirmed by real
  // Leon data; hollow = presumed from the schedule. Drawn with an inset
  // ring (not a border) so geometry — and the overlap audit — is unchanged.
  const hollow = flight.estimated === true && (status === 'airborne' || status === 'arrived');
  // MVT flash (bug report 3 item 7): no T/O `mvtThresholdMin` past the
  // expected departure — reference is CTOT/ETD when set (suppression rule),
  // else STD; that instant IS delayedStartUtcMs under the current mapping.
  // Only the CONTOUR blinks; stops the moment a T/O arrives.
  const mvtRefMs = Number(flight.delayedStartUtcMs) || Number(flight.startUtcMs) || 0;
  const mvtFlashing =
    depKind !== 'T/O' &&
    !flight.atdHm &&
    status !== 'arrived' &&
    !flight.isCnl &&
    mvtRefMs > 0 &&
    Number(nowMs) > mvtRefMs + mvtThresholdMin * 60_000;
  const hollowRing = Math.max(2, Math.round(2 * scale));

  // WX colour for an ICAO: dark tones on solid light fills, bright tones on
  // hollow pills (dark background shows through). null = default colour.
  const wxIcaoColor = (cat) => (cat ? (hollow ? WX_ICAO_BRIGHT[cat] : WX_ICAO_DARK[cat]) ?? null : null);

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
  // Wider than the viewport => both ends can't be on screen at once.
  const pillClipped = viewportPx > 0 && totalF * timelinePx > viewportPx;
  const depCrossSectionF = depDeltaMin > 0 ? Math.max(depCrossF - depF, 0) : 0;
  const mainSectionF = Math.max(arrCrossStartF - depCrossF, 0.003);
  const arrCrossSectionF = arrDeltaMin !== 0 ? Math.max(arrCrossEndF - arrCrossStartF, 0) : 0;

  const depCrossPct = ((depCrossSectionF / totalF) * 100).toFixed(2) + '%';
  const mainPct = ((mainSectionF / totalF) * 100).toFixed(2) + '%';
  const arrCrossPct = ((arrCrossSectionF / totalF) * 100).toFixed(2) + '%';

  // Delay renders as a DIAGONAL-HATCH segment sized to the delay magnitude:
  // the span between the scheduled time and the actual/estimated departure
  // (or between STA and the delayed arrival on the trailing side). Parallel
  // 45° lines over the muted state colour (reference-image treatment) so the
  // delay reads as "this pill, not yet solid".
  // Bug report 3 item 1: WHITE & BLACK stripes (old-DigitalWall), not the
  // state-tinted hatch — the schedule→actual gap reads the same on every
  // pill colour.
  const delayDashBg = `repeating-linear-gradient(
    45deg,
    rgba(238,241,248,.9) 0px, rgba(238,241,248,.9) ${sz(6)}px,
    rgba(12,15,24,.9) ${sz(6)}px, rgba(12,15,24,.9) ${sz(10)}px
  )`;

  // ID text: Leon checklist color (contrast-guarded on the dark board),
  // italic when the trip is not CONFIRMED (Option/Opportunity).
  const idColor = readableIdColor(flight.checklistColor, '#d4ddf2');
  const idStyle = flight.isConfirmed === false ? 'italic' : 'normal';

  // ── Ops timing rules (bug report 7-9) — exact precedence ───────────────
  // Departure label: T/O overrides everything; else the LATER of CTOT/ETD;
  // plain STD time otherwise. Arrival label: LDG once landed, ETA once
  // airborne (or estimated), plain STA time otherwise. BLOFF never shows.
  // The SIGNED delta vs the initial schedule (STD/STA) rides on the labels
  // (+late amber / −early green) so any difference — including EARLY — is
  // explicit, not just the yellow fill; the striped segment marks the same
  // difference on the pill itself.
  const depPrefix = depKind === 'STD' ? '' : `${depKind} `;
  const arrPrefix = arrKind === 'STA' ? '' : `${arrKind} `;
  const startLabel = `${depPrefix}${depHm ?? etd}`;
  const endLabel = `${arrPrefix}${arrHm ?? eta}`;
  const deltaTag = (deltaMin) =>
    deltaMin === 0 ? null : (
      <span style={{ color: deltaMin > 0 ? '#e8a33d' : '#4ade80', fontWeight: 700 }}>
        {' '}{deltaMin > 0 ? '+' : '\u2212'}{Math.abs(deltaMin)}
      </span>
    );

  // ── Pixel-aware layout (anti-overlap) ──────────────────────────────────
  // Narrow pills switch layout instead of letting text collide. All
  // thresholds scale with the type size: a "00:00" label is ~3.1× the times
  // font wide; tagged labels ("ATD 00:00") are ~1.8× wider, so clearances
  // derive from the widest label actually in play.
  const pillPx = totalF * timelinePx;
  const mainPx = (mainSectionF / totalF) * pillPx;
  const plainLabelW = F.times * 3.2;
  const tagged = Boolean(depPrefix || arrPrefix || depDeltaMin !== 0 || arrDeltaMin !== 0);
  const labelW = tagged ? plainLabelW * 2 : plainLabelW;

  // ── Degradation priority (Item 10): ICAOs beat timings ────────────────────
  // When space is tight the pill drops content in this order:
  //   1. inside badges (LIM circles) — they yield before the second ICAO,
  //   2. the times row below the pill (timings drop FIRST among text),
  //   3. the arrival ICAO (both → dep-only),
  //   4. the departure ICAO (dep-only → none) — only when truly no room.
  // A missing ICAO in the DATA ('UNK') is a data gap, rendered dimmed — it is
  // never dropped because a timing is missing, and vice versa.
  // Only two endpoint labels exist now (boundary labels are gone), so the
  // compact threshold is just "both endpoint labels can't clear each other".
  const compactTimes = timelinePx > 0 && pillPx < labelW * 2.3;
  const icaoW = F.icao * 2.6;
  // Both codes need room for the divider and paddings — otherwise fall back
  // to ADEP-only rather than ellipsizing ("EV…"). Badges are NOT reserved
  // space here: they only render once both ICAOs already fit comfortably.
  const showFull = timelinePx > 0
    ? mainPx >= icaoW * 2 + sz(22)
    : (mainSectionF / totalF) > 0.14;
  const showRoute = timelinePx > 0 ? mainPx >= icaoW + sz(6) : (mainSectionF / totalF) > 0.08;
  // Timings drop before ICAOs: on a pill too narrow for even the compact
  // combined label, render no times row at all (details live in the overlay).
  const showTimes = true; // timings always visible (bug report 2 item 3)

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
  // Limitations render as numbered circles IN FRONT of the callsign (old-
  // DigitalWall style) — always visible, never part of marker degradation.
  // The lane assigner reserves the front-text width, so the group can never
  // sit on top of the previous pill.
  const hasLim = Array.isArray(limIndices) && limIndices.length > 0;
  const limCircle = Math.max(10, F.id + sz(3));
  // Markers live AFTER the pill: their budget is the gap between this
  // pill's end and the next flight's front text. 'none' hides them when
  // even a +N cluster can't fit (details stay in the overlay/console).
  const afterGapPx = Number.isFinite(neighborGapPx)
    ? neighborGapPx - pillPx - sz(10)
    : Number.POSITIVE_INFINITY;
  const markerMode = (() => {
    if (markerRowWidthEstimate(flight, szm, 'full', [], { wx: false }) <= afterGapPx) return 'full';
    if (markerRowWidthEstimate(flight, szm, 'icons', [], { wx: false }) <= afterGapPx) return 'icons';
    if (markerRowWidthEstimate(flight, szm, 'dots', [], { wx: false }) <= afterGapPx) return 'dots';
    if (szm(26) <= afterGapPx) return 'count';
    return 'none';
  })();

  // Route below the pill (design 2A): when both ICAOs don't fully fit
  // INSIDE the pill, the pill stays clean and the route renders below with
  // the times — never truncated. Budgeted like the marker row; when tight,
  // the times drop FIRST and the route survives (route > times).
  const routeText = `${dep}→${arr}`;
  const timesText = `${depHm ?? etd}\u2013${arrHm ?? eta}`;
  // Bug report 2 item 3: airport codes and timings are ALWAYS visible.
  // The lane assigner reserves each flight's below-text width, so the
  // combined route+times line always has room — no drop modes.
  const belowMode = showFull ? 'anchored' : 'combined';
  const belowBudget = budgetPx - sz(4); // still used by the compact-label fit check


  const timeStyle = {
    position: 'absolute',
    // (anchored mode overrides position to sticky — see below)
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
      minHeight: F.band + F.timesRow,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
    }}>
      <div style={{ position: 'relative', height: F.band }}>
        {/* Front group: LIM circles + callsign, on the SAME line as the
            pill (old-DigitalWall) — anchored just before the pill start. */}
        <span style={{ position: 'absolute', right: '100%', marginRight: sz(6), top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', alignItems: 'center', gap: sz(4), whiteSpace: 'nowrap' }}>
          {hasLim && limIndices.map((indexValue, idx) => {
            // Checked limitations stay VISIBLE but muted: outlined circle,
            // dim number (chosen visual) — solid amber = needs attention.
            const done = Boolean(flight.checks?.lim);
            return (
              <span
                key={`lim-${indexValue}-${idx}`}
                title={done ? `Limitation ${indexValue} — checked` : `Limitation ${indexValue} — see sidebar list`}
                style={{
                  width: limCircle,
                  height: limCircle,
                  borderRadius: '50%',
                  background: done ? 'transparent' : '#f0c06b',
                  border: done ? '1.5px solid rgba(240,192,107,.55)' : 'none',
                  color: done ? 'rgba(240,192,107,.75)' : '#3a2a06',
                  fontSize: Math.max(7, Math.round(limCircle * 0.62)),
                  fontWeight: 800,
                  fontFamily: "'IBM Plex Mono',monospace",
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                {indexValue}
              </span>
            );
          })}
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
        </span>
        {markerMode !== 'none' && (
          <span style={{ position: 'absolute', left: '100%', marginLeft: sz(6), top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
            <FlightMarkers flight={flight} sz={szm} mode={markerMode} />
          </span>
        )}

      {mvtFlashing && (
        <div
          style={{
            position: 'absolute',
            left: -2,
            right: -2,
            top: Math.max(0, Math.round((F.band - F.body) / 2)) - 2,
            height: F.body + 4,
            borderRadius: 99,
            border: '2px solid #ff5f5f',
            pointerEvents: 'none',
            zIndex: 3,
            animation: `cwmvtblink ${mvtFlashSeconds}s step-start infinite`,
          }}
        />
      )}
      <div
        onClick={clickable ? onToggleInfo : undefined}
        title={clickable ? 'Show limitations / NOTAM / WX / CAA for this flight' : undefined}
        style={{ position: 'absolute', left: 0, right: 0, top: Math.max(0, Math.round((F.band - F.body) / 2)), height: F.body, borderRadius: 99, overflow: 'hidden', cursor: clickable ? 'pointer' : 'default', ...(infoOpen ? { outline: '2px solid #6dc4ff', outlineOffset: 1 } : {}), ...(hollow ? { boxShadow: `inset 0 0 0 ${hollowRing}px ${theme.bg}` } : {}) }}
      >
        <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', overflow: 'hidden' }}>
          {depDeltaMin > 0 && depCrossSectionF > 0 && (
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
                depDeltaMin > 0 && depCrossSectionF > 0
                  ? (arrCrossSectionF > 0 ? '0' : '0 99px 99px 0')
                  : (arrCrossSectionF > 0 ? '99px 0 0 99px' : '99px'),
              background: hollow ? hexA(theme.bg, 0.14) : theme.bg,
              boxShadow: hollow ? 'none' : 'inset 0 0 0 1px rgba(12,16,26,.22)',
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
                  <span style={{ ...icaoStyle(F.icao), color: wxIcaoColor(flight.wxDep) ?? (hollow ? theme.bg : theme.text), opacity: dep === 'UNK' ? 0.55 : 1 }}>{dep}</span>
                  <span style={{ width: 1, background: hollow ? hexA(theme.bg, 0.45) : 'rgba(0,0,0,.28)', height: F.icao + 2, flexShrink: 0 }} />
                  <span style={{ ...icaoStyle(F.icao), color: wxIcaoColor(flight.wxArr) ?? (hollow ? theme.bg : theme.text), opacity: arr === 'UNK' ? 0.55 : 1 }}>{arr}</span>
                </>
              )}
            </div>

          </div>

          {arrDeltaMin !== 0 && arrCrossSectionF > 0 && (
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
          <span style={{ position: 'sticky', left: stickyLeftPx, display: 'inline-block' }}>
            <span style={{ fontWeight: 700 }}>
              <span style={{ color: (flight.wxDep && WX_ICAO_BRIGHT[flight.wxDep]) || '#ccd6ee' }}>{dep}</span>
              <span style={{ color: '#ccd6ee' }}>→</span>
              <span style={{ color: (flight.wxArr && WX_ICAO_BRIGHT[flight.wxArr]) || '#ccd6ee' }}>{arr}</span>
            </span>
            {belowMode === 'combined' && <span> · {timesText}</span>}
          </span>
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
          <span style={{ position: 'sticky', left: stickyLeftPx, display: 'inline-block' }}>
            {monoW(startLabel.length + endLabel.length + 9, F.times) <= belowBudget ? (
              <>
                {startLabel}{deltaTag(depDeltaMin)}<span>–</span>{endLabel}{deltaTag(arrDeltaMin)}
              </>
            ) : (
              <>{depHm ?? etd}–{arrHm ?? eta}</>
            )}
          </span>
        </div>
      ) : (
        // Anchored labels ride the pill's ends — but a pill WIDER than the
        // viewport scrolls them (and its in-body ICAOs) out of sight (bug
        // report 3 item 4). Sticky flex children clamp each label into the
        // visible run of the pill; when clipped, the labels also carry the
        // ICAO codes so the route stays readable mid-flight.
        <div style={{ display: 'flex', justifyContent: 'space-between', height: F.timesRow, marginTop: sz(2), width: `${((arrCrossStartF - depF) / totalF) * 100}%` }}>
          <span style={{ ...timeStyle, position: 'sticky', left: stickyLeftPx, transform: 'none' }}>
            {pillClipped && <span style={{ fontWeight: 700, color: (flight.wxDep && WX_ICAO_BRIGHT[flight.wxDep]) || '#ccd6ee' }}>{dep} </span>}
            {startLabel}{deltaTag(depDeltaMin)}
          </span>
          <span style={{ ...timeStyle, position: 'sticky', right: sz(8), transform: 'none' }}>
            {endLabel}{deltaTag(arrDeltaMin)}
            {pillClipped && <span style={{ fontWeight: 700, color: (flight.wxArr && WX_ICAO_BRIGHT[flight.wxArr]) || '#ccd6ee' }}> {arr}</span>}
          </span>
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
