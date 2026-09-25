// Ops Agent tokens — read from THE shared token source (shared/design-tokens.json).
//
// Nothing here is a literal the design invented separately: every value is
// either a name that already existed in the shared file (page, border, text,
// primary, the status colours…) or one the agent spec added to it in this
// build (tier colours, voice, wall surfaces, tints, shadows, motion). Inlining
// a hex here would be a defect — the console imports the same file, and a
// value edited in one place must move everywhere.

import tokens from "@/shared/design-tokens.json";

export const T = tokens;
const c = tokens.color as typeof tokens.color & Record<string, string>;

/** Colour — spec §2.1, mapped onto the shared names. */
export const C = {
  ink: c.text, body: c.textBody, muted: c.textMuted, faint: c.textFaint, disabled: c.textDisabled,
  border: c.border, borderControl: c.borderControl, divider: c.borderInner, dividerRow: c.dividerRow,
  page: c.page, surface: c.card, sidebar: c.sidebar, navActive: c.navActive, hover: c.hover,
  bubbleUser: c.bubbleUser, disabledFill: c.disabledFill,
  primary: c.primary, primaryHover: c.primaryDeep, primaryTint: c.primaryTint, primaryTint2: c.primaryWash,
  primaryTint3: c.primaryTint3, primaryLine: c.primaryLine, primaryBorder: c.primaryBorder, primaryOnTint: c.primaryOnTint,
  sendEmpty: c.sendEmpty, primaryFocus: c.primaryFocus, primaryHalo: c.primaryHalo,
  warn: c.amberDeep, warnTint: c.amberTint, warnBorder: c.amberBorder, warnDot: c.amber, warnStrong: c.amberStrong, warnStrongTint: c.amberStrongTint,
  danger: c.redDeep, dangerBadge: c.red, dangerTint: c.redTintSoft, dangerBorder: c.redBorder, dangerDisabled: c.dangerDisabled,
  ok: c.greenDeep, okTint: c.greenTint, okBorder: c.greenBorder, okDot: c.green,
  neutral: c.slate, neutralTint: c.greyTint, info: c.sky, infoTint: c.skyTint, infoBorder: c.skyBorder,
  stop: c.stop, stopTint: c.stopTint, stopBorder: c.stopBorder, stopSquare: c.stopSquare,
  rowExpanded: c.rowExpanded, rowRecord: c.rowRecord, warnWash: c.amberWash, okWash: c.greenWash, dangerWash: c.redWash, toggleOff: c.toggleOff, navSubBorder: c.navSubBorder, suggestHover: c.suggestHover, searchMatch: c.searchMatch, searchCurrent: c.searchCurrent, citeHighlight: c.citeHighlight, citeClaim: c.citeClaim, citeOutline: c.citeOutline, viewerCanvas: c.viewerCanvas, viewerCanvasImage: c.viewerCanvasImage, viewerPageScan: c.viewerPageScan, violetTint2: c.violetTint2, violetBorder: c.violetBorder, tabHover: c.tabHover, companyDeep: c.companyDeep, dangerWashSoft: c.redWashSoft, warnWashSoft: c.amberWashSoft, highlight: c.highlight,
} as const;

/** Source tiers — §3 rule 5: fixed, never themed, never swapped. */
export const TIER = tokens.tier as Record<"internal" | "company" | "web" | "attachment", { fg: string; bg: string; underline: string; strip: string; claimBg?: string; tint2?: string; border?: string }>;
export const TIER_META: Record<keyof typeof TIER, { label: string; icon: string }> = {
  internal: { label: "Internal", icon: "database" },
  company: { label: "Company", icon: "book-open" },
  web: { label: "Web", icon: "globe" },
  attachment: { label: "Attachment", icon: "paperclip" },
};

export const VOICE = tokens.voice as { uncertainUnderline: string; uncertainBg: string };
export const WALL = tokens.wall as Record<string, string>;
export const SHADOW = tokens.shadow as Record<string, string>;
export const MOTION = tokens.motion as { easeOut: string; easeIn: string; easeInOut: string; fast: number; base: number; hover: number };
export const RADIUS = tokens.radius as Record<string, number>;
export const VIEWER = tokens.viewer as { tabStrip: number; header: number; toolbar: number; searchRow: number; thumbRail: number; pageMax: number; panelNarrowBelow: number; citationOffset: number; viewLimitBytes: number; progressiveBytes: number; progressivePages: number; maxTabs: number; cachedDocs: number };
export const PANEL = tokens.agentPanel as { width: number; minWidth: number; maxWidth: number; headerHeight: number; pushMinContent: number; overlayBelow: number };
export const FONT = { sans: tokens.font.sans, mono: tokens.font.mono } as const;

/** Type scale — §2.2. `mono` marks the rows the mono rule applies to. */
export const TYPE = {
  pageTitle: { fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" },
  emptyTitleFull: { fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" },
  emptyTitlePanel: { fontSize: 19, fontWeight: 800, lineHeight: 1.3, letterSpacing: "-0.01em" },
  overlayTranscript: { fontSize: 19, fontWeight: 400, lineHeight: 1.5 },
  threadTitle: { fontSize: 16, fontWeight: 700 },
  verbatim: { fontSize: 15.5, fontWeight: 500, lineHeight: 1.65 },
  verbatimPanel: { fontSize: 14, fontWeight: 500, lineHeight: 1.6 },
  body: { fontSize: 15, fontWeight: 400, lineHeight: 1.6 },
  bodyPanel: { fontSize: 14, fontWeight: 400, lineHeight: 1.55 },
  cardTitle: { fontSize: 14, fontWeight: 700 },
  label: { fontSize: 13.5, fontWeight: 600 },
  small: { fontSize: 13, fontWeight: 400, lineHeight: 1.5 },
  meta: { fontSize: 12.5, fontWeight: 400, lineHeight: 1.5 },
  caption: { fontSize: 12, fontWeight: 400, lineHeight: 1.5 },
  timestamp: { fontFamily: FONT.mono, fontSize: 11, fontWeight: 400 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const },
  eyebrowSm: { fontSize: 10.5, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase" as const },
  verbatimHeader: { fontSize: 11.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const },
  verbatimHeaderPanel: { fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const },
} as const;

/** Mono rule (§2.2, §3 rule 14): anything read character by character. */
export const mono = (extra: React.CSSProperties = {}): React.CSSProperties => ({ fontFamily: FONT.mono, fontVariantNumeric: "tabular-nums", ...extra });
