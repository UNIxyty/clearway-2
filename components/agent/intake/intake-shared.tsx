"use client";

// Shared pieces for the Flight intake page (§I3–§I11): Leon leg states (one set of words everywhere, §I2.3),
// the list status pills, leg squares, durations and small layout constants. Colours only from tokens.

import type { CSSProperties, ReactNode } from "react";
import { C, INTAKE, TONE, mono, type Tone } from "../ui/tokens";
import { Icon } from "../ui/primitives";
import { PulseDot, StatusPill } from "./controls";
import { ApiError, type Leg, type LeonLegState, type ListRow, type UiStatusKey } from "./api";

// ── Layout constants ───────────────────────────────────────────────────────────────────────────────────
export const CARD: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14 };
export const EYEBROW: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase" };
export const COLHEAD: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: C.faint, textTransform: "uppercase" };
export const HATCH = `repeating-linear-gradient(135deg, ${INTAKE.hatchA} 0 6px, ${INTAKE.hatchB} 6px 12px)`;

// ── List status (§I3 table) ────────────────────────────────────────────────────────────────────────────
export const STATUS: Record<UiStatusKey, { tone: Tone; icon?: string; pulse?: boolean; edge: string | null; stage: "red" | "amber" | null }> = {
  needs_you: { tone: TONE.red, icon: "circle-alert", edge: TONE.red.ic, stage: "red" },
  needs_review: { tone: TONE.amber, icon: "clipboard-check", edge: TONE.amber.ic, stage: "amber" },
  waiting: { tone: TONE.amber, icon: "hourglass", edge: TONE.amber.ic, stage: "amber" },
  stuck: { tone: TONE.amber, icon: "circle-pause", edge: TONE.amber.ic, stage: "amber" },
  in_progress: { tone: TONE.blue, pulse: true, edge: null, stage: null },
  loaded: { tone: TONE.green, icon: "circle-check", edge: null, stage: null },
  skipped: { tone: TONE.slate, icon: "circle-minus", edge: null, stage: null },
  cancelled: { tone: TONE.slate, icon: "circle-minus", edge: null, stage: null },
  handled: { tone: TONE.slate, icon: "circle-minus", edge: null, stage: null },
};
export function RowStatusPill({ k, label }: { k: UiStatusKey; label: string }) {
  const s = STATUS[k] ?? STATUS.in_progress;
  return <StatusPill tone={s.tone} icon={s.icon} pulse={s.pulse}>{label}</StatusPill>;
}

// ── Leon state per leg (§I6.3). The same words in every place. ─────────────────────────────────────────
export type LegKey = ListRow["legs"][number]["state"] | "sending";
export function legKeyOf(leg: Leg): LegKey {
  if (leg.removed) return "removed";
  switch (leg.leon?.state) {
    case "in_leon": return "in";
    case "not_in_leon": return "not";
    case "unknown": return "unknown";
    case "sending": return "sending";
    default: return "none";
  }
}
export function writeKey(state: LeonLegState["state"]): LegKey {
  return state === "in_leon" ? "in" : state === "not_in_leon" ? "not" : state === "unknown" ? "unknown" : state === "sending" ? "sending" : "none";
}
export const LEG_WORD: Record<LegKey, string> = { in: "In Leon", not: "NOT in Leon", none: "Not sent", unknown: "Unknown · checking", removed: "Removed", sending: "Waiting for Leon" };
const LEG_LOOK: Record<LegKey, { fg: string; bg: string; bd: string; ic: string; icon: string | null; pulse?: boolean }> = {
  in: { fg: TONE.green.fg, bg: TONE.green.bg, bd: TONE.green.bd, ic: TONE.green.ic, icon: "circle-check" },
  not: { fg: C.surface, bg: C.danger, bd: C.danger, ic: C.surface, icon: "circle-x" },
  none: { fg: C.muted, bg: C.sidebar, bd: C.border, ic: C.muted, icon: "circle-dashed" },
  unknown: { fg: TONE.amber.fg, bg: TONE.amber.bg, bd: TONE.amber.bd, ic: TONE.amber.ic, icon: "circle-help" },
  removed: { fg: TONE.slate.fg, bg: TONE.slate.bg, bd: TONE.slate.bd, ic: TONE.slate.ic, icon: "circle-minus" },
  sending: { fg: TONE.blue.fg, bg: TONE.blue.bg, bd: TONE.blue.bd, ic: TONE.blue.ic, icon: null, pulse: true },
};
export function LeonPill({ k, id, size = "md" }: { k: LegKey; id?: string | number | null; size?: "md" | "lg" }) {
  const l = LEG_LOOK[k];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: size === "lg" ? 12.5 : 12, fontWeight: 700, color: l.fg, background: l.bg, border: `1px solid ${l.bd}`, borderRadius: 999, padding: size === "lg" ? "4px 11px 4px 8px" : "3px 9px 3px 7px", whiteSpace: "nowrap" }}>
      {l.pulse ? <PulseDot color={l.ic} /> : l.icon ? <Icon name={l.icon} size={size === "lg" ? 13 : 12} color={l.ic} /> : null}
      {LEG_WORD[k]}
      {k === "in" && id != null && <span style={mono({ fontWeight: 600 })}>· {id}</span>}
    </span>
  );
}
/** 13×13 leg square (§I6.3): filled green / red ✕ / amber ? / grey outline. */
export function LegSquare({ k, size = 13 }: { k: LegKey; size?: number }) {
  const look: Record<LegKey, { bg: string; bd: string; g: string; gc: string; dashed?: boolean }> = {
    in: { bg: C.okDot, bd: C.okDot, g: "", gc: C.surface },
    not: { bg: C.surface, bd: C.dangerBadge, g: "✕", gc: C.dangerBadge },
    unknown: { bg: TONE.amber.bg, bd: TONE.amber.ic, g: "?", gc: TONE.amber.fg },
    sending: { bg: TONE.blue.bg, bd: TONE.blue.ic, g: "", gc: TONE.blue.fg },
    none: { bg: C.surface, bd: C.disabledFill, g: "", gc: C.muted },
    removed: { bg: C.surface, bd: C.disabledFill, g: "", gc: C.muted, dashed: true },
  };
  const s = look[k];
  return <span aria-hidden style={{ width: size, height: size, flex: "none", boxSizing: "border-box", borderRadius: 3, background: s.bg, border: `1.5px ${s.dashed ? "dashed" : "solid"} ${s.bd}`, color: s.gc, fontSize: size * 0.62, fontWeight: 800, lineHeight: `${size - 3}px`, textAlign: "center", display: "inline-block", opacity: s.dashed ? 0.6 : 1 }}>{s.g}</span>;
}

// ── Values ─────────────────────────────────────────────────────────────────────────────────────────────
export const fieldOf = (leg: Leg, key: string) => leg.fields.find((f) => f.key === key);
export const legNo = (leg: Leg) => leg.index + 1;
export function legRoute(leg: Leg) { const a = fieldOf(leg, "departure")?.value || "····"; const b = fieldOf(leg, "arrival")?.value || "····"; return `${a} → ${b}`; }
export function legDate(leg: Leg) { return fieldOf(leg, "date")?.value || ""; }
export function legDirection(leg: Leg) { return leg.direction ? leg.direction.toUpperCase() : ""; }
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** `03 Sep` from an ISO time (UTC). */
export function ddMon(iso: string | null | undefined) { if (!iso) return ""; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ""; return `${String(d.getUTCDate()).padStart(2, "0")} ${MON[d.getUTCMonth()]}`; }
/** `03–04 Sep` / `30 Sep–02 Oct` from the legs' Date fields ("03 Sep 2026"). */
export function dateRange(legs: Leg[]) {
  const ds = legs.filter((l) => !l.removed).map(legDate).filter(Boolean).map((s) => s.split(" ")).filter((p) => p.length >= 2);
  if (!ds.length) return "";
  const a = ds[0], b = ds[ds.length - 1];
  if (a[0] === b[0] && a[1] === b[1]) return `${a[0]} ${a[1]}`;
  return a[1] === b[1] ? `${a[0]}–${b[0]} ${a[1]}` : `${a[0]} ${a[1]}–${b[0]} ${b[1]}`;
}
/** `23 s`, `1.6 s`, `8 min 31 s`, `6 h`. */
export function fmtDur(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return "";
  const s = ms / 1000;
  if (s < 10) return `${Math.max(0.1, Math.round(s * 10) / 10)} s`;
  if (s < 60) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  if (m < 60) return r ? `${m} min ${r} s` : `${m} min`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm ? `${h} h ${mm} min` : `${h} h`;
}
/** `3 h 3 min` from minutes; null when past. */
export function fmtMin(min: number | null | undefined) {
  if (min == null || min < 0) return null;
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}
/** `HH:MM` of an ISO time, UTC. */
export function hm(iso: string | null | undefined) { if (!iso) return ""; const t = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso.replace(" ", "T")}Z`); if (Number.isNaN(t)) return ""; const d = new Date(t); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; }
export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return ""; const s = Math.round((now - Date.parse(iso)) / 1000); if (!Number.isFinite(s)) return "";
  if (s < 60) return "just now"; const m = Math.round(s / 60); if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); if (h < 48) return `${h} h ago`; return `${Math.round(h / 24)} days ago`;
}
export function plural(n: number, one: string, many = `${one}s`) { return `${n} ${n === 1 ? one : many}`; }
export function listWords(xs: (string | number)[]) { const a = xs.map(String); return a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`; }
export function errText(e: unknown) { return e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong."; }
export function sourceLabel(src: string | null | undefined, leg?: Leg) {
  if (!src) return "";
  if (src === "body") return leg?.direction ? `Email · ${leg.direction.toUpperCase()}` : "Email body";
  if (src === "subject") return "Email · subject";
  return src;
}

// ── Small building blocks ──────────────────────────────────────────────────────────────────────────────
export function SectionHead({ heading, sub, right }: { heading: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ padding: "14px 18px 8px", display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
      <span style={EYEBROW}>{heading}</span>
      {sub != null && <span style={{ fontSize: 12, color: C.muted, flex: 1 }}>{sub}</span>}
      {right}
    </div>
  );
}
export function Notice({ tone, icon, heading, children, style }: { tone: "red" | "amber" | "blue" | "green" | "slate"; icon?: string; heading?: ReactNode; children?: ReactNode; style?: CSSProperties }) {
  const t = TONE[tone];
  return (
    <div role={tone === "red" ? "alert" : undefined} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 9, padding: "9px 12px", ...style }}>
      {icon && <Icon name={icon} size={15} color={t.ic} style={{ marginTop: 1 }} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
        {heading && <span style={{ fontSize: 12.5, fontWeight: 700, color: t.fg }}>{heading}</span>}
        {children && <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.body }}>{children}</div>}
      </div>
    </div>
  );
}
