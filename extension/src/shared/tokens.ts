// The side panel's colours and mono style, exactly as the extension was built with them before the portal redesign
// (2026-10-11) moved the portal to CSS variables and dropped these two exports from components/agent/ui/tokens.ts.
// Same source as before: shared/design-tokens.json (read-only here; it belongs to the wall). Without this file the
// extension did not build at all from 2026-10-11. Moving the panel to the portal's new tokens is a design change,
// not done here.
import type React from "react";
import tokens from "@/shared/design-tokens.json";

const c = tokens.color as typeof tokens.color & Record<string, string>;
const FONT = { sans: tokens.font.sans, mono: tokens.font.mono } as const;

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
  neutral: c.slate, neutralTint: c.greyTint, info: c.sky, infoTint: c.skyTint, infoBorder: c.skyBorder, quoteTint: c.quoteTint,
  stop: c.stop, stopTint: c.stopTint, stopBorder: c.stopBorder, stopSquare: c.stopSquare,
  rowExpanded: c.rowExpanded, rowRecord: c.rowRecord, warnWash: c.amberWash, okWash: c.greenWash, dangerWash: c.redWash, toggleOff: c.toggleOff, navSubBorder: c.navSubBorder, suggestHover: c.suggestHover, searchMatch: c.searchMatch, searchCurrent: c.searchCurrent, citeHighlight: c.citeHighlight, citeClaim: c.citeClaim, citeOutline: c.citeOutline, viewerCanvas: c.viewerCanvas, viewerCanvasImage: c.viewerCanvasImage, viewerPageScan: c.viewerPageScan, violetTint2: c.violetTint2, violetBorder: c.violetBorder, tabHover: c.tabHover, companyDeep: c.companyDeep, dangerWashSoft: c.redWashSoft, warnWashSoft: c.amberWashSoft, highlight: c.highlight,
} as const;

export const mono = (extra: React.CSSProperties = {}): React.CSSProperties => ({ fontFamily: FONT.mono, fontVariantNumeric: "tabular-nums", ...extra });
