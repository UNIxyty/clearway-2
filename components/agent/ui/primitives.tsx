"use client";

// Buttons, pills, badges, keycaps, the static ring mark, icons and the time
// formats (design spec §4.27, §4.1 static mark, §1 times). Everything in the
// agent surfaces that is not a card is one of these.

import { forwardRef, type CSSProperties, type ReactNode, type ButtonHTMLAttributes } from "react";
import { C, FONT, mono } from "./tokens";

/** Lucide icon as a CSS mask so it takes any colour. Served from /icons — never a CDN. */
export function Icon({ name, size = 16, color = C.muted, style = {} }: { name: string; size?: number; color?: string; style?: CSSProperties }) {
  const mask = `url(/icons/${name}.svg) center/contain no-repeat`;
  return <span aria-hidden style={{ width: size, height: size, display: "inline-block", flex: "none", background: color, mask, WebkitMask: mask, ...style }} />;
}

/** The static CSS ring mark (§4.1 last row): circle with a border and a centre dot. */
export function RingMark({ size = 18, color = C.ink, border = 2, dot }: { size?: number; color?: string; border?: number; dot?: number }) {
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
    return <span style={{ ...mono({ fontSize: 10.5, fontWeight: 600 }), color: color ?? C.muted, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: 5, padding: "1px 5px", lineHeight: 1.4 }}>{children}</span>;
  }
  return <span style={{ ...mono({ fontSize: 11 }), opacity: 0.72, marginLeft: 6 }}>{children}</span>;
}

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "lg" | "md" | "sm" | "xs";
const SIZES: Record<Size, CSSProperties> = {
  lg: { fontSize: 14, padding: "10px 16px", borderRadius: 9 },
  md: { fontSize: 13.5, padding: "9px 14px", borderRadius: 9 },
  sm: { fontSize: 13, padding: "8px 12px", borderRadius: 8 },
  xs: { fontSize: 12.5, padding: "6px 11px", borderRadius: 7 },
};

/** §4.27 buttons. Disabled: 50 % opacity + not-allowed (spec default); destructive disabled uses its own fill. */
export const Button = forwardRef<HTMLButtonElement, { variant?: Variant; size?: Size; icon?: string; keycap?: ReactNode; spinning?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>>(function Button({
  variant = "secondary", size = "md", icon, keycap, children, disabled, style = {}, spinning = false, ...rest
}, ref) {
  const base: CSSProperties = { fontFamily: "inherit", fontWeight: 600, border: "1px solid transparent", cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, lineHeight: 1.2, whiteSpace: "nowrap", ...SIZES[size] };
  const look: Record<Variant, CSSProperties> = {
    primary: { background: C.primary, color: C.surface },
    secondary: { background: C.surface, color: C.ink, borderColor: C.borderControl, padding: `calc(${SIZES[size].padding?.toString().split(" ")[0]} - 1px) ${SIZES[size].padding?.toString().split(" ")[1]}` },
    ghost: { background: "transparent", color: C.body },
    destructive: { background: disabled ? C.dangerDisabled : C.dangerBadge, color: C.surface },
  };
  const iconColor = variant === "primary" || variant === "destructive" ? C.surface : C.body;
  return (
    <button
      ref={ref}
      type="button"
      className={`ag-hover ag-focus ${variant === "primary" ? "ag-btn-primary" : variant === "ghost" ? "ag-btn-ghost" : variant === "secondary" ? "ag-btn-secondary" : ""}`}
      disabled={disabled}
      style={{ ...base, ...look[variant], ...(disabled && variant !== "destructive" ? { opacity: 0.5 } : {}), ...style }}
      {...rest}
    >
      {spinning ? <Spinner color={iconColor} /> : icon ? <Icon name={icon} size={size === "lg" ? 15 : 14} color={iconColor} /> : null}
      {!spinning && children}
      {!spinning && keycap && <Keycap>{keycap}</Keycap>}
    </button>
  );
});

/** Confirm-button loading state (§4.15, spec default): a 14 px spinner replaces the label. */
export function Spinner({ color = C.muted, size = 14 }: { color?: string; size?: number }) {
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
export function Eyebrow({ children, small = false, color = C.faint, icon, style = {} }: { children: ReactNode; small?: boolean; color?: string; icon?: string; style?: CSSProperties }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: small ? 10.5 : 11, fontWeight: 700, letterSpacing: small ? "0.10em" : "0.12em", textTransform: "uppercase", color, ...style }}>
      {icon && <Icon name={icon} size={12} color={color} />}
      {children}
    </span>
  );
}

/** Header status pill (full page, §4.27 last row). */
export function HeaderPill({ children, icon, iconColor = C.body }: { children: ReactNode; icon: string; iconColor?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.body, background: C.sidebar, border: `1px solid ${C.border}`, borderRadius: 999, padding: "5px 10px" }}>
      <Icon name={icon} size={13} color={iconColor} />
      {children}
    </span>
  );
}

/** 30×30 icon tile used by error cards, pickers and menus. */
export function IconTile({ icon, fg, bg, size = 30, iconSize = 16, radius = 8 }: { icon: string; fg: string; bg: string; size?: number; iconSize?: number; radius?: number }) {
  return <span style={{ width: size, height: size, borderRadius: radius, background: bg, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name={icon} size={iconSize} color={fg} /></span>;
}

/** Settings toggle (§12): 44×26, knob 20, on = green. Knob moves 18 px in 150 ms (T1). */
export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className="ag-focus"
      style={{ width: 44, height: 26, borderRadius: 999, border: "none", padding: 3, background: on ? C.okDot : C.toggleOff, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, flex: "none", display: "flex" }}>
      <span className="ag-knob" style={{ width: 20, height: 20, borderRadius: "50%", background: C.surface, boxShadow: "0 1px 3px rgba(0,0,0,.2)", transform: on ? "translateX(18px)" : "translateX(0)" }} />
    </button>
  );
}

/** Icon button 30×30 (panel header) / 34×34 (composer toolbar) / 36×36 (full-page header). */
export function IconButton({ icon, title, onClick, size = 30, iconSize = 16, color = C.muted, bordered = false, style = {}, disabled }: { icon: string; title: string; onClick?: () => void; size?: number; iconSize?: number; color?: string; bordered?: boolean; style?: CSSProperties; disabled?: boolean }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} className="ag-hover ag-focus ag-icon-button"
      style={{ width: size, height: size, borderRadius: size >= 36 ? 10 : 8, border: bordered ? `1px solid ${C.border}` : "none", background: "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: disabled ? "not-allowed" : "pointer", flex: "none", opacity: disabled ? 0.5 : 1, ...style }}>
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
