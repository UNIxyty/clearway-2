// Wall colour tokens — the ONE source every wall surface reads (Settings
// Colours tab item: contrast/colour came back in four consecutive bug
// reports; ops now tune colours from the console, per-account, live).
//
// Defaults are EXACTLY the shipped post-bug-report-4 palette: until someone
// edits a token, the wall renders byte-identically. Settings deliver
// overrides as { colors: { <key>: "#rrggbb" } }; resolveWallColors() merges
// them over these defaults. Alpha variants stay in code (withAlpha) so a
// single hex edit updates every derived tint — semantics never move here,
// only hues.

export const WALL_COLOR_GROUPS = [
  {
    id: "states",
    label: "Flight states (pill fills)",
    tokens: [
      { key: "stateScheduled", label: "Not departed", def: "#f2f5fb", text: true },
      { key: "stateAirborne", label: "Airborne", def: "#74aef0" },
      { key: "stateDelayed", label: "Delayed", def: "#e9bd45" },
      { key: "stateCtot", label: "CTOT", def: "#af92e8" },
      { key: "stateArrived", label: "Arrived", def: "#dd93bd" },
      { key: "stateAog", label: "AOG hatch", def: "#b43c3c" },
      // Shipped legend outline is the muted airborne tone, not #8fb6e8.
      { key: "estimatedOutline", label: "Estimated (legend outline)", def: "#7d9cc4" },
      // Cancelled renders as withAlpha(stateCancelled, .45) with its own text.
      { key: "stateCancelled", label: "Cancelled fill", def: "#5a6178" },
      { key: "textCancelled", label: "Cancelled text", def: "#a7aec4", onBoard: true },
    ],
  },
  {
    id: "hatch",
    label: "Delay hatch stripes",
    tokens: [
      { key: "hatchLight", label: "Stripe A (light)", def: "#eef1f8" },
      { key: "hatchDark", label: "Stripe B (dark)", def: "#0c0f18" },
    ],
  },
  {
    id: "text",
    label: "Timeline text",
    tokens: [
      { key: "textCallsign", label: "Callsign (no checklist colour)", def: "#f2f5fb", onBoard: true },
      { key: "textIcao", label: "Airport ICAO codes", def: "#f2f6ff", onBoard: true },
      { key: "textTimes", label: "Times", def: "#e2e9f8", onBoard: true },
      { key: "textDeltaLate", label: "Delay delta (late +)", def: "#ffb224", onBoard: true },
      { key: "textDeltaEarly", label: "Delay delta (early −)", def: "#3fe97a", onBoard: true },
      { key: "textRegistration", label: "Aircraft registration", def: "#ffffff", onBoard: true },
      { key: "textOperator", label: "Operator name", def: "#aab8da", onBoard: true },
      { key: "textTicks", label: "Hour ruler labels", def: "#b9c6e6", onBoard: true },
    ],
  },
  {
    id: "markers",
    label: "Markers",
    tokens: [
      { key: "markerImp", label: "IMP marker", def: "#f5c064", onBoard: true },
      { key: "markerNtm", label: "NTM marker", def: "#ff9150", onBoard: true },
      // Shipped CAA chip frame/tint base is teal #2f9e8f (the bright #5eead4
      // is only the chip's letter/dot accent — see SHIPPED_MARKER_CHIPS).
      { key: "markerCaa", label: "CAA marker", def: "#2f9e8f", onBoard: true },
      { key: "limUnchecked", label: "Limitation circle (unchecked)", def: "#ff3b30", onBoard: true },
      { key: "limChecked", label: "Limitation circle (checked)", def: "#ff7d6e", onBoard: true },
      { key: "mvtRing", label: "MVT flash ring", def: "#ff5f5f", onBoard: true },
    ],
  },
  {
    id: "wx",
    label: "Weather categories",
    // One token drives BOTH the ICAO colouring (bright on dark, derived
    // dark variant on light pill fills) and the sidebar WX agenda chips.
    tokens: [
      { key: "wxVfr", label: "VFR — good", def: "#41e277", onBoard: true },
      { key: "wxMvfr", label: "MVFR — marginal", def: "#ffb224", onBoard: true },
      { key: "wxIfr", label: "IFR — bad", def: "#ff4d55", onBoard: true },
      { key: "wxLifr", label: "LIFR — worst", def: "#d84ad0", onBoard: true },
    ],
  },
  {
    id: "chrome",
    label: "Board chrome",
    tokens: [
      { key: "boardBg", label: "Board background", def: "#10141f" },
      { key: "rowAltTint", label: "Alternating row tint", def: "#94a3c4" },
      { key: "gridLines", label: "Gridlines / borders", def: "#222840" },
      { key: "nowLine", label: "Now line", def: "#ffffff" },
      // Shipped badge is dark chrome with white text (white was the TEXT).
      { key: "nowBadgeBg", label: "Now badge background", def: "#161b26" },
      { key: "sidebarBg", label: "Sidebar / AC column background", def: "#151a27" },
      { key: "sidebarText", label: "Sidebar text", def: "#b7c2dc" },
    ],
  },
  {
    id: "table",
    label: "Upcoming Flight Table",
    tokens: [
      { key: "tableText", label: "Row text", def: "#ccd6ee", onBoard: true },
      // Leon checklist hexes are normalised onto these three at render time
      // (FF0000→red, FFA500→orange, 86BF53→green) so ops control them too.
      { key: "tableRed", label: "Status red", def: "#ff0000", onBoard: true },
      { key: "tableOrange", label: "Status orange", def: "#ffa500", onBoard: true },
      { key: "tableGreen", label: "Status green", def: "#86bf53", onBoard: true },
    ],
  },
];

export const WALL_COLOR_DEFAULTS = Object.fromEntries(
  WALL_COLOR_GROUPS.flatMap((g) => g.tokens.map((t) => [t.key, t.def]))
);

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Merge saved overrides over the shipped defaults; invalid values ignored. */
export function resolveWallColors(overrides) {
  const out = { ...WALL_COLOR_DEFAULTS };
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (key in out && typeof value === "string" && HEX_RE.test(value.trim())) {
      out[key] = value.trim().toLowerCase();
    }
  }
  return out;
}

/** "#rrggbb" + alpha -> rgba() string (keeps coded tints tied to the token). */
export function withAlpha(hex, alpha) {
  const n = parseInt(String(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Darken toward black (0..1) — derives on-light-fill ICAO variants etc. */
export function darken(hex, amount) {
  const n = parseInt(String(hex).slice(1), 16);
  const f = (v) => Math.max(0, Math.round(v * (1 - amount)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG relative luminance (0..1) of a "#rrggbb" colour. */
export function luminance(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const chan = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * chan((n >> 16) & 255) + 0.7152 * chan((n >> 8) & 255) + 0.0722 * chan(n & 255)
  );
}

/** WCAG relative-luminance contrast ratio between two hex colours. */
export function contrastRatio(hexA, hexB) {
  const [hi, lo] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shipped-value bridges.
//
// Several shipped colours are NOT plain tokens or withAlpha/darken derivations
// of one (hand-tuned inks, muted legend swatches, odd chrome shades). Those
// exact literals live HERE — component files stay literal-free — and apply
// only while the driving token still equals its default. The moment ops
// overrides the token, the value is derived from the override instead, so a
// single hex edit really does move every dependent surface.
// ─────────────────────────────────────────────────────────────────────────────

const isDefault = (colors, key) => (colors?.[key] ?? WALL_COLOR_DEFAULTS[key]) === WALL_COLOR_DEFAULTS[key];

/**
 * Shipped exact value while `key` is still the default; otherwise the token
 * itself (or `derive(token)` when a derivation is given).
 */
export function tokenOr(colors, key, shipped, derive) {
  if (isDefault(colors, key)) return shipped;
  return derive ? derive(colors[key]) : colors[key];
}

// Light ink used on dark fills across the wall (also the auto in-pill text).
const LIGHT_INK = "#f2f5fb";

// ── Flight-state pill text ───────────────────────────────────────────────────
// The five shipped per-state dark inks (hand-tuned per fill). They apply ONLY
// while that state's fill is still the shipped default; an overridden fill
// gets automatic text: luminance > .45 → darken(fill, .9), else light ink.
export const SHIPPED_STATE_TEXT = {
  stateScheduled: "#141824",
  stateDelayed: "#221c08",
  stateCtot: "#1e1930",
  stateAirborne: "#0c1622",
  stateArrived: "#26121d",
};

/** In-pill text colour for a state fill token (see SHIPPED_STATE_TEXT). */
export function stateTextFor(colors, key) {
  if (isDefault(colors, key) && SHIPPED_STATE_TEXT[key]) return SHIPPED_STATE_TEXT[key];
  const fill = colors[key];
  return luminance(fill) > 0.45 ? darken(fill, 0.9) : LIGHT_INK;
}

/** The pill STATUS map ({bg,text} per movement state, incl. legacy aliases). */
export function statusThemesFor(colors) {
  const state = (key) => ({ bg: colors[key], text: stateTextFor(colors, key) });
  const scheduled = state("stateScheduled");
  const ctot = state("stateCtot");
  return {
    scheduled,
    delayed: state("stateDelayed"),
    ctot,
    airborne: state("stateAirborne"),
    arrived: state("stateArrived"),
    cancelled: { bg: withAlpha(colors.stateCancelled, 0.45), text: colors.textCancelled },
    // legacy aliases (older cached data)
    boarding: scheduled,
    slot: ctot,
  };
}

// ── Weather categories ───────────────────────────────────────────────────────
/** CheckWX flight_category → marker/chip colour (the four wx tokens). */
export function wxCategoryColorsFor(colors) {
  return { VFR: colors.wxVfr, MVFR: colors.wxMvfr, IFR: colors.wxIfr, LIFR: colors.wxLifr };
}

// Shipped dark ICAO inks (on light pill fills) — hand-tuned, not a uniform
// darken of the category colour, so they ride the shipped-map pattern.
export const SHIPPED_WX_ICAO_DARK = { VFR: "#166534", MVFR: "#92400e", LIFR: "#b91c1c", IFR: null };
// Shipped bright LIFR ICAO ink is deliberately RED (bug report 2 item 1:
// "LIFR red") while the LIFR category chip is magenta — kept while wxLifr is
// unchanged; an override drives both.
export const SHIPPED_WX_ICAO_BRIGHT = { LIFR: "#ff5d5d" };
const WX_TOKEN = { VFR: "wxVfr", MVFR: "wxMvfr", IFR: "wxIfr", LIFR: "wxLifr" };

/** Dark ICAO variants for light pill fills (IFR stays uncoloured — semantic). */
export function wxDarkFor(colors) {
  const pick = (cat) =>
    tokenOr(colors, WX_TOKEN[cat], SHIPPED_WX_ICAO_DARK[cat], (v) => darken(v, 0.55));
  return { VFR: pick("VFR"), MVFR: pick("MVFR"), LIFR: pick("LIFR"), IFR: null };
}

/** Bright ICAO variants for text on the dark board (IFR stays uncoloured). */
export function wxBrightFor(colors) {
  return {
    VFR: colors.wxVfr,
    MVFR: colors.wxMvfr,
    LIFR: tokenOr(colors, "wxLifr", SHIPPED_WX_ICAO_BRIGHT.LIFR),
    IFR: null,
  };
}

/** Light-theme (console list) WX chip palette, derived from the wx tokens. */
export function wxLightFor(colors) {
  const chip = (key) => {
    const ink = darken(colors[key], 0.5);
    return { text: ink, border: withAlpha(ink, 0.45), bg: withAlpha(colors[key], 0.14) };
  };
  return { VFR: chip("wxVfr"), MVFR: chip("wxMvfr"), IFR: chip("wxIfr"), LIFR: chip("wxLifr") };
}

// ── Marker chips (IMP / CAA / NTM) ──────────────────────────────────────────
// Shipped wall chips mix two hues (e.g. CAA teal frame #2f9e8f + bright
// #5eead4 letters) — exact values kept while the token is default, otherwise
// text = token, tint/border = withAlpha(token).
export const SHIPPED_MARKER_CHIPS = {
  IMP: { text: "#f5c064", border: "rgba(240,177,59,.55)", bg: "rgba(240,177,59,.22)" },
  CAA: { text: "#5eead4", border: "#2f9e8f", bg: "rgba(47,158,143,.18)" },
  NTM: { text: "#ffab73", border: "rgba(255,145,80,.5)", bg: "rgba(255,145,80,.18)" },
};

/** Wall marker chip styles ({text,border,bg} per marker). */
export function markerChipsFor(colors) {
  const chip = (mark, key, borderAlpha, bgAlpha) => {
    if (isDefault(colors, key)) return SHIPPED_MARKER_CHIPS[mark];
    const v = colors[key];
    return {
      text: v,
      border: borderAlpha == null ? v : withAlpha(v, borderAlpha),
      bg: withAlpha(v, bgAlpha),
    };
  };
  return {
    IMP: chip("IMP", "markerImp", 0.55, 0.22),
    CAA: chip("CAA", "markerCaa", null, 0.18), // shipped CAA border is solid
    NTM: chip("NTM", "markerNtm", 0.5, 0.18),
  };
}

/** Light-theme (console list) marker chip palette, derived from the tokens. */
export function markerLightFor(colors) {
  const chip = (key, bgAlpha) => {
    const ink = darken(colors[key], 0.45);
    return { text: ink, border: withAlpha(ink, 0.5), bg: withAlpha(colors[key], bgAlpha) };
  };
  return { IMP: chip("markerImp", 0.18), CAA: chip("markerCaa", 0.13), NTM: chip("markerNtm", 0.16) };
}

// ── Limitation circles ──────────────────────────────────────────────────────
export const SHIPPED_LIM = {
  uncheckedText: "#ffffff", // auto: white as shipped on the red circle
  checkedBorder: "rgba(255,95,80,.6)", // hand-tuned, not withAlpha(limChecked)
};

/** LIM circle colours (unchecked solid / checked outlined). */
export function limStylesFor(colors) {
  const uncheckedAuto =
    luminance(colors.limUnchecked) > 0.45
      ? darken(colors.limUnchecked, 0.9)
      : SHIPPED_LIM.uncheckedText;
  return {
    uncheckedBg: colors.limUnchecked,
    uncheckedText: isDefault(colors, "limUnchecked") ? SHIPPED_LIM.uncheckedText : uncheckedAuto,
    checkedBorder: tokenOr(colors, "limChecked", SHIPPED_LIM.checkedBorder, (v) => withAlpha(v, 0.6)),
    checkedText: withAlpha(colors.limChecked, 0.9),
  };
}

// ── Sidebar legends ─────────────────────────────────────────────────────────
// The shipped TIMELINE AGENDA swatches are hand-muted variants of the pill
// fills (deliberate: less glare in the sidebar) — kept while the state token
// is default, replaced by the token itself on override.
export const SHIPPED_LEGEND_STATE = {
  stateScheduled: "#dde1ea",
  stateAirborne: "#7d9cc4",
  stateDelayed: "#c9ab62",
  stateCtot: "#9d8cc2",
  stateArrived: "#bd8ba4",
};

/** Timeline-agenda swatch colours (states + estimated + AOG). */
export function legendSwatchesFor(colors) {
  const st = (key) => tokenOr(colors, key, SHIPPED_LEGEND_STATE[key]);
  return {
    scheduled: st("stateScheduled"),
    airborne: st("stateAirborne"),
    delayed: st("stateDelayed"),
    ctot: st("stateCtot"),
    arrived: st("stateArrived"),
    estimatedOutline: colors.estimatedOutline,
    estimatedFill: withAlpha(colors.estimatedOutline, 0.14),
    aogFill: withAlpha(colors.stateAog, 0.4),
    aogStripe: tokenOr(colors, "boardBg", "rgba(20,24,36,.9)", (v) => withAlpha(v, 0.9)),
    aogBorder: tokenOr(colors, "stateAog", "rgba(200,80,80,.4)", (v) => withAlpha(v, 0.4)),
  };
}

// WX AGENDA swatches: same muted-variant treatment as the state legend. The
// IFR/no-forecast chip is deliberately UNCOLOURED (that's its meaning), so it
// stays neutral chrome and never follows wxIfr.
export const SHIPPED_WX_LEGEND = {
  VFR: "#3fbf6f",
  MVFR: "#e8a33d",
  LIFR: "#ef6a6a",
  ifrFill: "rgba(222,225,234,.9)",
  ifrBorder: "1px solid rgba(160,170,200,.4)",
};

/** WX-agenda swatch colours. */
export function wxLegendSwatchesFor(colors) {
  return {
    VFR: tokenOr(colors, "wxVfr", SHIPPED_WX_LEGEND.VFR),
    MVFR: tokenOr(colors, "wxMvfr", SHIPPED_WX_LEGEND.MVFR),
    LIFR: tokenOr(colors, "wxLifr", SHIPPED_WX_LEGEND.LIFR),
    ifrFill: SHIPPED_WX_LEGEND.ifrFill,
    ifrBorder: SHIPPED_WX_LEGEND.ifrBorder,
  };
}

// ── AOG band (aircraft-row treatment) ───────────────────────────────────────
/** AOG row band: hatch fill (pure derivation) + hand-tuned border/label. */
export function aogStylesFor(colors) {
  const tint = withAlpha(colors.stateAog, 0.13);
  return {
    band: `repeating-linear-gradient(-45deg, ${tint} 0,${tint} 5px, transparent 5px,transparent 11px)`,
    border: tokenOr(colors, "stateAog", "rgba(200,80,80,.35)", (v) => withAlpha(v, 0.35)),
    label: tokenOr(colors, "stateAog", "rgba(220,120,120,.8)", (v) => withAlpha(v, 0.8)),
  };
}

// ── Board / header / table chrome ───────────────────────────────────────────
// Shipped chrome uses a family of near-identical dark shades around the
// sidebar/board tokens plus a few fixed inks. Everything funnels through
// chromeFor() so the four wall component files carry no literals at all.
export const SHIPPED_CHROME = {
  panelBg: "#141926", // left legend/limitations panel
  headerBg: "#161b26", // clock bar, time ruler, now-badge chrome
  insetBg: "#1a2130", // sidebar description tab
  thBg: "#151a29", // upcoming-table header cells
  thBorder: "#232e45",
  rowBorder: "#1e243580", // board row divider (hex+alpha form as shipped)
  softGrid: "rgba(255,255,255,0.05)", // in-row hour gridlines
  scrollThumb: "rgba(150,165,205,.28)",
  nowEdge: "rgba(10,14,24,.55)", // dark edge that keeps the now line visible
  emptyText: "#8b98bb",
  emptyBg: "rgba(16,20,30,.35)",
  sidebarMuted: "#5a6a94", // panel titles, empty states, chevrons
  legendLabel: "#a7b3d4",
  sidebarHeading: "#f2f5fb", // sidebar date
  limTitle: "#f6f8fd",
  limNum: "#ff6b60", // sidebar limitation number circle
  limNumBorder: "rgba(255,90,80,.5)",
  ghost: "rgba(255,255,255,.06)",
  amber: "#f0b13b", // AOG inline lim badge + desc-tab accent (IMP family)
  amberBorder: "rgba(240,177,59,.5)",
  amberBg: "rgba(240,177,59,.2)",
  headerCity: "#7f8cb0",
  headerTime: "#f2f5fb",
  accent: "#6dc4ff", // home-clock time + open-info outline
  tableTitle: "#8fa0c4",
  tableHeadText: "#7a89ad",
  tableMuted: "#3d476a", // table placeholder dots/dashes
  tableFlightFallback: "#e7ecf7",
  tableDeltaLate: "#e8a33d", // shipped table delta amber/green (muted variants
  tableDeltaEarly: "#4ade80", // of textDeltaLate/-Early — see chromeFor)
  tableAlt: "rgba(255,255,255,.025)",
  wxDotFallback: "#8fa0c4",
  error: "#ef9a9a",
};

/** Every chrome colour the wall surfaces render, resolved from the tokens. */
export function chromeFor(colors) {
  return {
    boardBg: colors.boardBg,
    sidebarBg: colors.sidebarBg,
    sidebarText: colors.sidebarText,
    gridLine: colors.gridLines,
    panelBg: tokenOr(colors, "sidebarBg", SHIPPED_CHROME.panelBg),
    headerBg: tokenOr(colors, "sidebarBg", SHIPPED_CHROME.headerBg),
    insetBg: tokenOr(colors, "sidebarBg", SHIPPED_CHROME.insetBg),
    thBg: tokenOr(colors, "sidebarBg", SHIPPED_CHROME.thBg),
    thBorder: tokenOr(colors, "gridLines", SHIPPED_CHROME.thBorder),
    rowBorder: tokenOr(colors, "gridLines", SHIPPED_CHROME.rowBorder, (v) => withAlpha(v, 0.5)),
    tdBorder: withAlpha(colors.gridLines, 0.5),
    rowAlt: withAlpha(colors.rowAltTint, 0.07),
    tableAlt: tokenOr(colors, "rowAltTint", SHIPPED_CHROME.tableAlt, (v) => withAlpha(v, 0.04)),
    softGrid: tokenOr(colors, "gridLines", SHIPPED_CHROME.softGrid, (v) => withAlpha(v, 0.5)),
    scrollThumb: SHIPPED_CHROME.scrollThumb,
    nowLine: colors.nowLine,
    nowLineGradient: `linear-gradient(to bottom, ${withAlpha(colors.nowLine, 0.92)} 0%, ${withAlpha(colors.nowLine, 0.5)} 100%)`,
    nowLineShadow: `0 0 0 1px ${SHIPPED_CHROME.nowEdge}, 0 0 10px ${withAlpha(colors.nowLine, 0.35)}`,
    nowBadgeBg: colors.nowBadgeBg,
    nowBadgeText:
      luminance(colors.nowBadgeBg) > 0.45
        ? darken(colors.nowBadgeBg, 0.9)
        : SHIPPED_LIM.uncheckedText, // auto: white on dark badges (as shipped)
    nowBadgeBorder: withAlpha(colors.nowLine, 0.45),
    nowTriangle: withAlpha(colors.nowLine, 0.75),
    tickText: colors.textTicks,
    reg: colors.textRegistration,
    operator: colors.textOperator,
    sidebarMuted: tokenOr(colors, "sidebarText", SHIPPED_CHROME.sidebarMuted, (v) => withAlpha(v, 0.6)),
    legendLabel: tokenOr(colors, "sidebarText", SHIPPED_CHROME.legendLabel),
    sidebarHeading: tokenOr(colors, "sidebarText", SHIPPED_CHROME.sidebarHeading),
    limTitle: tokenOr(colors, "sidebarText", SHIPPED_CHROME.limTitle),
    limNum: tokenOr(colors, "limUnchecked", SHIPPED_CHROME.limNum),
    limNumBorder: tokenOr(colors, "limUnchecked", SHIPPED_CHROME.limNumBorder, (v) => withAlpha(v, 0.5)),
    ghost: SHIPPED_CHROME.ghost,
    amber: tokenOr(colors, "markerImp", SHIPPED_CHROME.amber),
    amberBorder: tokenOr(colors, "markerImp", SHIPPED_CHROME.amberBorder, (v) => withAlpha(v, 0.5)),
    amberBg: tokenOr(colors, "markerImp", SHIPPED_CHROME.amberBg, (v) => withAlpha(v, 0.2)),
    emptyText: tokenOr(colors, "sidebarText", SHIPPED_CHROME.emptyText),
    emptyBg: tokenOr(colors, "boardBg", SHIPPED_CHROME.emptyBg, (v) => withAlpha(v, 0.35)),
    headerCity: tokenOr(colors, "sidebarText", SHIPPED_CHROME.headerCity),
    headerTime: tokenOr(colors, "sidebarText", SHIPPED_CHROME.headerTime),
    accent: SHIPPED_CHROME.accent,
    tableText: colors.tableText,
    tableTitle: tokenOr(colors, "tableText", SHIPPED_CHROME.tableTitle),
    tableHeadText: tokenOr(colors, "tableText", SHIPPED_CHROME.tableHeadText),
    tableMuted: tokenOr(colors, "tableText", SHIPPED_CHROME.tableMuted, (v) => withAlpha(v, 0.45)),
    tableFlightFallback: tokenOr(colors, "tableText", SHIPPED_CHROME.tableFlightFallback),
    tableDeltaLate: tokenOr(colors, "textDeltaLate", SHIPPED_CHROME.tableDeltaLate),
    tableDeltaEarly: tokenOr(colors, "textDeltaEarly", SHIPPED_CHROME.tableDeltaEarly),
    wxDotFallback: tokenOr(colors, "tableText", SHIPPED_CHROME.wxDotFallback),
    error: SHIPPED_CHROME.error,
  };
}

// ── Pill-local shipped chrome (edges, dividers, neutral chips) ──────────────
export const PILL_SHIPPED = {
  edgeInset: "inset 0 0 0 1px rgba(12,16,26,.22)", // solid pill inner edge
  hatchEdge: "inset 0 0 0 1px rgba(255,255,255,.28)", // delay-hatch edge
  divider: "rgba(0,0,0,.28)", // between the two in-pill ICAOs
  dotEdge: "0 0 0 1px rgba(10,13,22,.5)", // marker dots' dark ring
  countBorder: "rgba(160,175,210,.45)", // "+N" cluster chip border
  clippedArrIcao: "#ccd6ee", // shipped arr-ICAO ink in clipped mode
  // ICAO-type chip: neutral slate, deliberately never an alarm colour.
  icaoChip: {
    lightBorder: "1px solid rgba(71,85,105,.55)",
    darkBorder: "1px solid rgba(220,228,245,.25)",
    lightText: "#f8fafc",
    darkText: "#10141f",
    lightBg: "#64748b",
    darkBg: "#aab6cc",
  },
};

// ── Upcoming Flight Table: Leon checklist normalisation ─────────────────────
/**
 * Normalise a Leon checklist hex onto the table tokens at render time:
 * #ff0000→tableRed, #ffa500→tableOrange, #86bf53→tableGreen (case-insensitive,
 * with or without '#'); anything else passes through untouched.
 */
export function leonChecklistColor(colors, value) {
  const raw = String(value ?? "").trim().toLowerCase().replace(/^#/, "");
  if (raw === "ff0000") return colors.tableRed;
  if (raw === "ffa500") return colors.tableOrange;
  if (raw === "86bf53") return colors.tableGreen;
  return value || null;
}
