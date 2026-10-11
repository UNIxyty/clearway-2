"use client";

// Agent mailbox (§M): shared bits — status and delivery tones, address parsing, cards, empty states, the mask
// chip and a plain text input with live value. Colours only from ../ui/tokens.

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { INTAKE, TONE, mono, type Tone } from "../ui/tokens";
import { Icon } from "../ui/primitives";
import type { MailStatus } from "./api";
import { cw } from "@/lib/portal-tokens";

export const MASK = "••••••••";
export const MARKER = /\u0000M(\d+)\u0000/g;

export type StatusMeta = { label: string; tone: Tone; icon?: string; pulse?: boolean; edge?: string };
export const STATUS: Record<MailStatus, StatusMeta> = {
  processed: { label: "Processed", tone: TONE.green, icon: "circle-check" },
  not_recognised: { label: "Not recognised", tone: TONE.red, icon: "circle-help", edge: cw.danger },
  failed: { label: "Failed", tone: TONE.red, icon: "circle-x", edge: cw.danger },
  reply: { label: "Reply", tone: TONE.blue, icon: "reply" },
  ignored: { label: "Ignored", tone: TONE.slate, icon: "circle-minus" },
  waiting: { label: "Waiting", tone: TONE.amber, pulse: true, edge: INTAKE.amberIcon },
  sent: { label: "Sent", tone: TONE.slate, icon: "arrow-up-right" },
};
export const statusMeta = (s: string): StatusMeta => STATUS[s as MailStatus] ?? { label: s, tone: TONE.slate, icon: "circle-dot" };

export type DeliveryMeta = StatusMeta & { heading: string; needs: boolean };
/** Resend delivery_status → pill (§M13). `captured` is the rig / test mode: stored, never sent. */
export function deliveryMeta(d: string | null | undefined): DeliveryMeta {
  switch (d) {
    case "delivered": return { label: "Delivered", tone: TONE.green, icon: "circle-check", heading: "Delivered", needs: false };
    case "delivery_delayed": return { label: "Delayed", tone: TONE.amber, icon: "clock", edge: INTAKE.amberIcon, heading: "Delayed · Resend is retrying", needs: true };
    case "bounced": return { label: "Bounced", tone: TONE.red, icon: "circle-x", edge: cw.danger, heading: "Bounced · this email never arrived", needs: true };
    case "complained": return { label: "Marked as spam", tone: TONE.red, icon: "shield-alert", edge: cw.danger, heading: "Marked as spam by the recipient", needs: true };
    case "captured": return { label: "Captured, not sent", tone: TONE.slate, icon: "circle-dot", heading: "Captured, not sent · test mode", needs: false };
    case "failed": return { label: "Failed", tone: TONE.red, icon: "circle-x", edge: cw.danger, heading: "Failed · Resend refused it", needs: true };
    default: return { label: "Queued", tone: TONE.slate, icon: "circle-dot", heading: "Queued · waiting for Resend", needs: false };
  }
}

/** `"A. Dispatcher" <a@b.c>` → { name, addr }. Either may be missing. */
export function parseAddr(s: string | null | undefined): { name: string; addr: string | null } {
  const v = String(s ?? "").trim();
  const m = /^"?([^"<]*?)"?\s*<([^>]*)>\s*$/.exec(v);
  if (m) { const addr = m[2].trim() || null; return { name: m[1].trim() || addr || "(no sender)", addr: addr && addr.includes("@") ? addr : null }; }
  const clean = v.replace(/"/g, "").trim();
  if (clean.includes("@")) return { name: clean, addr: clean };
  return { name: clean || "(no sender)", addr: null };
}
export const localPart = (addr: string) => `${addr.split("@")[0]}@`;
export const hostOf = (addr: string) => addr.split("@")[1] ?? addr;

export function rangeWords(days: number) { return days === 1 ? "today" : `the last ${days} days`; }

export function esc(s: string) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string); }

export function Card({ children, style, pad = "16px 18px", className }: { children: ReactNode; style?: CSSProperties; pad?: string | number; className?: string }) {
  return <section className={className} style={{ background: cw.bgSurface, border: `1px solid ${cw.border}`, borderRadius: 14, padding: pad, ...style }}>{children}</section>;
}

export function SmallEyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: cw.textMuted, textTransform: "uppercase", ...style }}>{children}</span>;
}

export function AddrChip({ addr }: { addr: string }) {
  return <span style={{ ...mono({ fontSize: 10.5, fontWeight: 500 }), color: cw.textBody, background: cw.bgHover, borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap", flex: "none" }}>{localPart(addr)}</span>;
}

/** Masked personal value (§M14.2): mono 12.5 on neutral tint, muted, padding 0 5px, radius 4. */
export function MaskChip() {
  return <span aria-label="Personal data, hidden" style={{ ...mono({ fontSize: 12.5 }), background: cw.neutralTint, color: cw.textMuted, padding: "0 5px", borderRadius: 4 }}>{MASK}</span>;
}
/** Revealed value: amber tint; in print the mask shows instead (IntakeStyles print rule). */
export function RevealedValue({ value }: { value: string }) {
  return (
    <>
      <span className="cw-reveal-value" style={{ ...mono({ fontSize: 12.5 }), background: cw.warningTint, color: cw.text, padding: "0 5px", borderRadius: 4 }}>{value}</span>
      <span className="cw-reveal-mask" style={{ display: "none", ...mono({ fontSize: 12.5 }), background: cw.neutralTint, color: cw.textMuted, padding: "0 5px", borderRadius: 4 }}>{MASK}</span>
    </>
  );
}

export function EmptyState({ icon, heading, children, action, tone = "plain" }: { icon: string; heading: string; children?: ReactNode; action?: ReactNode; tone?: "plain" | "red" }) {
  const red = tone === "red";
  return (
    <div className="cw-fade" style={{ padding: "48px 28px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8 }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, background: red ? cw.dangerTint : cw.bgSunken, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={20} color={red ? cw.dangerText : cw.textMuted} /></span>
      <div style={{ fontSize: 15, fontWeight: 700, color: red ? cw.dangerText : cw.text }}>{heading}</div>
      {children && <div style={{ fontSize: 13, lineHeight: 1.5, color: cw.textBody, maxWidth: 360 }}>{children}</div>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}

/** Plain text input with a live value (the dialogs need the value before blur). Always type="text". */
export function FieldInput({ value, onChange, placeholder, ariaLabel, monoText = false, invalid, autoFocus, id }: { value: string; onChange: (v: string) => void; placeholder?: string; ariaLabel: string; monoText?: boolean; invalid?: boolean; autoFocus?: boolean; id?: string }) {
  return (
    <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={ariaLabel} aria-invalid={invalid || undefined} spellCheck={false} autoComplete="off" className="ag-focus" data-autofocus={autoFocus ? "" : undefined}
      style={{ width: "100%", boxSizing: "border-box", height: 34, borderRadius: 8, border: `${invalid ? 1.5 : 1}px solid ${invalid ? cw.danger : cw.borderControl}`, padding: "0 10px", fontFamily: "inherit", fontSize: 13.5, color: cw.text, background: cw.bgSurface, outline: "none", ...(monoText ? mono({ fontSize: 13 }) : {}) }} />
  );
}
export function FieldArea({ value, onChange, placeholder, ariaLabel, invalid, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; ariaLabel: string; invalid?: boolean; rows?: number }) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={ariaLabel} aria-invalid={invalid || undefined} rows={rows} className="ag-focus"
      style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, border: `${invalid ? 1.5 : 1}px solid ${invalid ? cw.danger : cw.borderControl}`, padding: "8px 10px", fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.45, color: cw.text, background: cw.bgSurface, outline: "none", resize: "vertical" }} />
  );
}

/** Small anchor styled as a secondary button (navigation stays a real link). */
export function LinkAsButton({ href, children, icon, primary, newTab, onClick }: { href: string; children: ReactNode; icon?: string; primary?: boolean; newTab?: boolean; onClick?: () => void }) {
  return (
    <a href={href} className="ag-focus ag-hover" onClick={onClick} {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, borderRadius: 9, padding: primary ? "7px 12px" : "6px 11px", textDecoration: "none", whiteSpace: "nowrap", background: primary ? cw.primary : cw.bgSurface, color: primary ? cw.textOnPrimary : cw.text, border: primary ? "none" : `1px solid ${cw.borderControl}` }}>
      {icon && <Icon name={icon} size={14} color={primary ? cw.textOnPrimary : cw.textBody} />}{children}
    </a>
  );
}

/** A reference link `REF →` to the intake page. */
export function RefLink({ refText, requestId, size = 11.5 }: { refText: string; requestId: string | null; size?: number }) {
  const style: CSSProperties = { ...mono({ fontSize: size, fontWeight: 600 }), color: cw.textLink, textDecoration: "none", whiteSpace: "nowrap", flex: "none", position: "relative", zIndex: 1 };
  if (!requestId) return <span style={{ ...style, color: cw.textBody }}>{refText}</span>;
  return <a href={`/agent/intake?r=${encodeURIComponent(requestId)}`} className="ag-focus" style={style} onClick={(e) => e.stopPropagation()}>{refText} →</a>;
}

/** Copy to clipboard with a short "Copied" state. */
export function useCopy() {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(t); }, [copied]);
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } };
  return { copied, copy };
}
