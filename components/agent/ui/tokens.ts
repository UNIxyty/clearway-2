// Ops Agent tokens (portal redesign, stage 1). Colours are the portal's --cw-* tokens (lib/portal-tokens.ts →
// shared/portal-tokens.json), so every value here follows the light/dark theme; nothing in this file is a colour
// literal. The sizes, radii and motion below are the agent design's own (they used to be read from
// shared/design-tokens.json, which is the Digital Wall's file — the portal no longer imports it).

import { cw } from "@/lib/portal-tokens";

/** Source tiers — §3 rule 5: each tier keeps its own colour family; in dark mode the family's dark values. */
type TierLook = { fg: string; bg: string; underline: string; strip: string; claimBg?: string; tint2?: string; border?: string };
export const TIER: Record<"internal" | "company" | "web" | "attachment", TierLook> = {
  internal: { fg: cw.tierInternalFg, bg: cw.tierInternalBg, underline: cw.tierInternalLine, strip: cw.tierInternalStrip },
  company: { fg: cw.tierCompanyFg, bg: cw.tierCompanyBg, underline: cw.tierCompanyLine, strip: cw.tierCompanyStrip, tint2: cw.tierCompanyTint, border: cw.tierCompanyBorder },
  web: { fg: cw.tierWebFg, bg: cw.tierWebBg, underline: cw.tierWebLine, strip: cw.tierWebStrip, claimBg: cw.tierWebClaim },
  attachment: { fg: cw.tierAttachmentFg, bg: cw.tierAttachmentBg, underline: cw.tierAttachmentLine, strip: cw.tierAttachmentStrip },
};
export const TIER_META: Record<keyof typeof TIER, { label: string; icon: string }> = {
  internal: { label: "Internal", icon: "database" },
  company: { label: "Company", icon: "book-open" },
  web: { label: "Web", icon: "globe" },
  attachment: { label: "Attachment", icon: "paperclip" },
};

export const VOICE = {
  uncertainUnderline: cw.warning,
  uncertainBg: cw.warningTint,
  overlayScrim: cw.bgScrim,
  readingHighlight: cw.primaryTint,
  popoverShadow: cw.shadowPop,
  shortCardShadow: cw.shadow2,
  errorShadow: cw.shadow2,
} as const;
/** The wall's dark surface, where the agent's voice bar sits inside the wall console (same in both themes). */
export const WALL = { accent: cw.wallAccent } as const;
const focusRing = `0 0 0 3px ${cw.focusHalo}`;
export const SHADOW: Record<string, string> = {
  frame: cw.shadow2, composer: cw.shadow1, menu: cw.shadowPop, menuPanel: cw.shadowPop, voicebar: cw.shadow2, voicebarPage: cw.shadow2,
  overlay: cw.shadowPop, modal: cw.shadowPop, modalLight: cw.shadowPop, panelOverlay: cw.shadowPanel, panelMinimised: cw.shadow2,
  focus: focusRing, pending: focusRing,
};
export const MOTION = { easeOut: "cubic-bezier(0.2, 0, 0, 1)", easeIn: "cubic-bezier(0.4, 0, 1, 1)", easeInOut: "ease-in-out", fast: 120, base: 200, hover: 120 } as const;
export const RADIUS: Record<string, number> = { card: 13, control: 9, chip: 999, menu: 11, xs: 4, sm: 6, md: 8, lg: 10, cardLg: 14, composer: 16, overlay: 22 };
export const VIEWER = { tabStrip: 40, header: 68, toolbar: 46, searchRow: 48, thumbRail: 132, pageMax: 900, panelNarrowBelow: 1400, citationOffset: 96, viewLimitBytes: 104857600, progressiveBytes: 10485760, progressivePages: 60, maxTabs: 6, cachedDocs: 20 } as const;
/** The agent panel: 400 wide by default (portal redesign §4), resizable between min and max. */
// At 1280 and wider the panel takes its width from the page (§4.3: 632px of page is left at 1280 with the full sidebar);
// it only overlays there if a wide panel would leave the page narrower than pushMinContent.
export const PANEL = { width: 400, minWidth: 360, maxWidth: 600, headerHeight: 56, pushMinContent: 480, overlayBelow: 1280 } as const;
export const FONT = { sans: "var(--font-sans), 'Public Sans', system-ui, sans-serif", mono: "var(--font-mono), 'IBM Plex Mono', monospace" } as const;

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


/** Flight intake + Agent mailbox (§I, §M): the extra values, and the five status tones. */
export const INTAKE = {
  amberIcon: cw.warning, slateIcon: cw.neutral, slateBorder: cw.border, unknownInk: cw.textBody, unknownDash: cw.neutral,
  hatchA: cw.bgSunken, hatchB: cw.bgHover, fieldRed: cw.dangerTint, conditionalBg: cw.neutralTint, answerBorder: cw.primaryTintBorder,
  answerBg: cw.bgSelected, scrimDrawer: cw.bgScrim, scrimDialog: cw.bgScrim, drawerShadow: cw.shadowPanel, flashBlue: cw.primaryTint,
  flashRed: cw.dangerTint, pulse: "1100ms",
} as const;
export type Tone = { fg: string; bg: string; bd: string; ic: string };
export const TONE: Record<"red" | "amber" | "green" | "blue" | "slate", Tone> = {
  red: { fg: cw.dangerText, bg: cw.dangerTint, bd: cw.dangerBorder, ic: cw.danger },
  amber: { fg: cw.warningText, bg: cw.warningTint, bd: cw.warningBorder, ic: cw.warning },
  green: { fg: cw.successText, bg: cw.successTint, bd: cw.successBorder, ic: cw.success },
  blue: { fg: cw.textLink, bg: cw.primaryTint, bd: cw.primaryTintBorder, ic: cw.primary },
  slate: { fg: cw.neutralText, bg: cw.neutralTint, bd: cw.border, ic: cw.neutral },
};
