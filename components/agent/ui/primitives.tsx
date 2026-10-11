"use client";

// Buttons, pills, badges, keycaps, the static ring mark, icons and the time
// formats (design spec §4.27, §4.1 static mark, §1 times). Everything in the
// agent surfaces that is not a card is one of these.

import { forwardRef, type CSSProperties, type ReactNode, type ButtonHTMLAttributes } from "react";
import { FONT, mono } from "./tokens";
import { cw } from "@/lib/portal-tokens";
import { Button as KitButton, Toggle as KitToggle, type ButtonVariant as KitVariant } from "@/components/kit";

/** Lucide icon as a CSS mask so it takes any colour. Served from /icons — never a CDN. */
export function Icon({ name, size = 16, color = cw.textMuted, style = {} }: { name: string; size?: number; color?: string; style?: CSSProperties }) {
  const mask = `url(/icons/${name}.svg) center/contain no-repeat`;
  return <span aria-hidden style={{ width: size, height: size, display: "inline-block", flex: "none", background: color, mask, WebkitMask: mask, ...style }} />;
}

/** The static CSS ring mark (§4.1 last row): circle with a border and a centre dot. */
export function RingMark({ size = 18, color = cw.text, border = 2, dot }: { size?: number; color?: string; border?: number; dot?: number }) {
  const d = dot ?? Math.round(size / 3);
  return (
    <span aria-hidden style={{ width: size, height: size, borderRadius: "50%", border: `${border}px solid ${color}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none", boxSizing: "border-box" }}>
      <span style={{ width: d, height: d, borderRadius: "50%", background: color }} />
    </span>
  );
}

/** Keycap inside a button (§4.27): mono 11 at 70–75 % opacity. */
export function Keycap({ children, standalone = false, color }: { children: ReactNode; standalone?: boolean; color?: string }) {
  if (standalone) {
    return <span style={{ ...mono({ fontSize: 10.5, fontWeight: 600 }), color: color ?? cw.textMuted, background: cw.bgSurface, border: `1px solid ${cw.borderControl}`, borderRadius: 5, padding: "1px 5px", lineHeight: 1.4 }}>{children}</span>;
  }
  return <span style={{ ...mono({ fontSize: 11 }), opacity: 0.72, marginLeft: 6 }}>{children}</span>;
}

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "lg" | "md" | "sm" | "xs";
const KIT_VARIANT: Record<Variant, KitVariant> = { primary: "primary", secondary: "secondary", ghost: "quiet", destructive: "danger" };
const KIT_SIZE: Record<Size, "md" | "sm"> = { lg: "md", md: "md", sm: "sm", xs: "sm" };

/** §4.27 buttons — drawn by the portal kit (components/kit, portal redesign §2.1); this keeps the agent's props. */
export const Button = forwardRef<HTMLButtonElement, { variant?: Variant; size?: Size; icon?: string; keycap?: ReactNode; spinning?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>>(function Button({
  variant = "secondary", size = "md", icon, keycap, children, spinning = false, ...rest
}, ref) {
  return (
    <KitButton ref={ref} variant={KIT_VARIANT[variant]} size={KIT_SIZE[size]} icon={icon} loading={spinning} {...rest}>
      {children}
      {keycap && <Keycap>{keycap}</Keycap>}
    </KitButton>
  );
});

/** Confirm-button loading state (§4.15, spec default): a 14 px spinner replaces the label. */
export function Spinner({ color = cw.textMuted, size = 14 }: { color?: string; size?: number }) {
  return <span className="ag-spin" aria-label="Working" style={{ width: size, height: size, borderRadius: "50%", border: `2px solid ${color}`, borderTopColor: "transparent", display: "inline-block", flex: "none" }} />;
}

/** Status pill (§4.27): 12/600, padding 4×10, radius 999. */
export function Pill({ children, fg, bg, border, icon, style = {} }: { children: ReactNode; fg: string; bg: string; border?: string; icon?: string; style?: CSSProperties }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: fg, background: bg, border: border ? `1px solid ${border}` : "none", borderRadius: 999, padding: "4px 10px", lineHeight: 1.3, ...style }}>
      {icon && <Icon name={icon} size={12} color={fg} />}
      {children}
    </span>
  );
}

/** Small tag (§4.27): 10.5–11/700, padding 2×6–7, radius 4–5. */
export function Tag({ children, fg, bg, monoText = false, style = {} }: { children: ReactNode; fg: string; bg: string; monoText?: boolean; style?: CSSProperties }) {
  return <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, color: fg, background: bg, borderRadius: 5, padding: "2px 7px", lineHeight: 1.35, ...(monoText ? mono() : {}), ...style }}>{children}</span>;
}

/** Section eyebrow (§2.2 type.eyebrow / .sm). */
export function Eyebrow({ children, small = false, color = cw.textMuted, icon, style = {} }: { children: ReactNode; small?: boolean; color?: string; icon?: string; style?: CSSProperties }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: small ? 10.5 : 11, fontWeight: 700, letterSpacing: small ? "0.10em" : "0.12em", textTransform: "uppercase", color, ...style }}>
      {icon && <Icon name={icon} size={12} color={color} />}
      {children}
    </span>
  );
}

/** Header status pill (full page, §4.27 last row). */
export function HeaderPill({ children, icon, iconColor = cw.textBody }: { children: ReactNode; icon: string; iconColor?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: cw.textBody, background: cw.bgSunken, border: `1px solid ${cw.border}`, borderRadius: 999, padding: "5px 10px" }}>
      <Icon name={icon} size={13} color={iconColor} />
      {children}
    </span>
  );
}

/** 30×30 icon tile used by error cards, pickers and menus. */
export function IconTile({ icon, fg, bg, size = 30, iconSize = 16, radius = 8 }: { icon: string; fg: string; bg: string; size?: number; iconSize?: number; radius?: number }) {
  return <span style={{ width: size, height: size, borderRadius: radius, background: bg, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name={icon} size={iconSize} color={fg} /></span>;
}

/** Settings toggle (§12) — the portal kit's switch (32 × 18, primary when on; portal redesign §2.2). */
export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string }) {
  return <KitToggle checked={on} onChange={onChange} disabled={disabled} ariaLabel={label} />;
}

/** Icon button 30×30 (panel header) / 34×34 (composer toolbar) / 36×36 (full-page header). */
export function IconButton({ icon, title, onClick, size = 30, iconSize = 16, color = cw.textMuted, bordered = false, style = {}, disabled }: { icon: string; title: string; onClick?: () => void; size?: number; iconSize?: number; color?: string; bordered?: boolean; style?: CSSProperties; disabled?: boolean }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} className="ag-hover ag-focus ag-icon-button"
      style={{ width: size, height: size, borderRadius: size >= 36 ? 10 : 8, border: bordered ? `1px solid ${cw.border}` : "none", background: "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: disabled ? "not-allowed" : "pointer", flex: "none", opacity: disabled ? 0.5 : 1, ...style }}>
      <Icon name={icon} size={iconSize} color={color} />
    </button>
  );
}

// ── Times (§1): UTC, Z suffix, mono. ─────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export function hmZ(iso: string | null | undefined): string {
  if (!iso) return ""; const d = new Date(iso); if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;
}
export function hmsZ(iso: string | null | undefined): string {
  if (!iso) return ""; const d = new Date(iso); if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}
/** `23 SEP 18:10Z` — or just `18:10Z` when it is today (UTC). */
export function dayTimeZ(iso: string | null | undefined, { alwaysDate = false } = {}): string {
  if (!iso) return ""; const d = new Date(iso); if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth() && d.getUTCDate() === now.getUTCDate();
  return sameDay && !alwaysDate ? hmZ(iso) : `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${hmZ(iso)}`;
}
/** `02 Sep 2026` for approval footers. */
export function dateLong(iso: string | null | undefined): string {
  if (!iso) return ""; const d = new Date(iso); if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()][0]}${MONTHS[d.getUTCMonth()].slice(1).toLowerCase()} ${d.getUTCFullYear()}`;
}
export function kb(bytes: number | null | undefined): string {
  if (bytes == null) return ""; if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`; return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
export const monoStyle = mono;
export { FONT };
