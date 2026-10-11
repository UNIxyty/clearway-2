"use client";

// Field rows (§I6.2) and the timezone block (§I6.5). Value is always a real text input; every state is drawn
// by border, background and words (Unknown / Not given / Zero never rely on colour alone).

import { useState, type CSSProperties, type ReactNode } from "react";
import { INTAKE, TONE, mono } from "../ui/tokens";
import { Icon, hmZ } from "../ui/primitives";
import { Tag, TextInput } from "./controls";
import type { Field, FieldState, Leg } from "./api";
import { COLHEAD, HATCH, fieldOf, fmtMin, hm, sourceLabel } from "./intake-shared";
import { cw } from "@/lib/portal-tokens";

export type Apply = (body: Record<string, unknown>) => Promise<boolean>;
export const FGRID = "104px 184px minmax(0,1fr) minmax(0,1.15fr)";

type Look = { border: string; bg: string; rowBg: string; bar: string; tags: { l: string; fg: string; bg: string }[]; chip?: { text: string; color: string }; label?: string };
const RED = { fg: cw.dangerText, bg: TONE.red.bg };
function look(f: Field): Look {
  const base: Look = { border: `1px solid ${cw.borderControl}`, bg: cw.bgSurface, rowBg: cw.bgSurface, bar: "transparent", tags: [] };
  const redRow = { rowBg: INTAKE.fieldRed, bar: cw.danger, border: `1.5px solid ${cw.danger}` };
  const s: FieldState = f.state;
  switch (s) {
    case "converted": return { ...base, tags: [{ l: "CONVERTED", fg: cw.neutralText, bg: cw.neutralTint }] };
    case "cross_checked": return { ...base, tags: [{ l: "CROSS-CHECKED", fg: cw.successText, bg: cw.successTint }] };
    case "checked": return { ...base, tags: [{ l: "CHECKED", fg: cw.successText, bg: cw.successTint }] };
    case "low_confidence": return { ...base, border: `1.5px solid ${INTAKE.amberIcon}`, rowBg: cw.warningTint, bar: INTAKE.amberIcon, tags: [{ l: "LOW CONFIDENCE", fg: TONE.amber.fg, bg: TONE.amber.bg }] };
    case "unknown": return { ...base, border: `1px dashed ${INTAKE.unknownDash}`, bg: HATCH, tags: [{ l: "UNKNOWN", fg: INTAKE.unknownInk, bg: INTAKE.slateBorder }], chip: { text: `Unknown · "${tbaWord(f.said)}" in the request`, color: INTAKE.unknownInk } };
    case "not_given": return { ...base, border: `1.5px dashed ${cw.danger}`, bg: INTAKE.fieldRed, rowBg: INTAKE.fieldRed, bar: cw.danger, tags: [{ l: "NOT GIVEN", ...RED }], chip: { text: "Not given", color: cw.dangerText } };
    case "edited": return { ...base, border: `1px solid ${cw.citeOutline}`, rowBg: cw.primaryTint, bar: cw.primary, tags: [{ l: "EDITED", fg: cw.textLink, bg: cw.primaryWash }] };
    case "invalid": return { ...base, ...redRow, tags: [{ l: "INVALID", ...RED }] };
    case "tz_unknown": return { ...base, ...redRow, tags: [{ l: "TIMEZONE UNKNOWN", fg: cw.textOnPrimary, bg: cw.dangerSolid }] };
    case "not_read": return { ...base, border: `1px dashed ${cw.borderControl}`, tags: [{ l: "NOT READ YET", fg: cw.neutralText, bg: cw.neutralTint }], chip: { text: "Not read yet", color: cw.textMuted } };
    case "leon_refused": return { ...base, ...redRow, tags: [{ l: "LEON REFUSED", ...RED }] };
    case "conflict": return { ...base, ...redRow, tags: [{ l: "SOURCES DIFFER", ...RED }] };
    case "extra": return { ...base, bg: cw.bgPage, tags: [{ l: "NOT SENT", fg: cw.neutralText, bg: cw.neutralTint }], label: cw.textMuted };
    default: return base; // extracted, zero
  }
}
function tbaWord(said: string | null) { const m = /\b(TBA|TBC|TBD|N\/A|unknown)\b/i.exec(said ?? ""); return m ? m[1].toUpperCase() : "Unknown"; }

function defaultNote(f: Field): string | null {
  if (f.state === "zero") return f.note ?? "Zero, stated in the request";
  if (f.state === "unknown") return f.note ?? "Stated as TBA. Not the same as 0.";
  if (f.state === "not_given") return f.note ?? (f.required ? "Not in the request. Required: blocks confirm." : "Not in the request.");
  if (f.state === "checked" && f.checked) return `Checked by ${f.checked.by}, ${hmZ(f.checked.at)}`;
  return f.note;
}

export function FieldHeader() {
  return (
    <div aria-hidden style={{ display: "grid", gridTemplateColumns: FGRID, gap: 12, padding: "6px 18px", ...COLHEAD }}>
      <span>Field</span><span>Value · editable</span><span>The source said</span><span>Checks</span>
    </div>
  );
}

/** One field row. `editable` false = read-only (leg in Leon, request closed). */
export function FieldRow({ f, leg, editable, apply }: { f: Field; leg: Leg; editable: boolean; apply: Apply }) {
  const lk = look(f);
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const isTime = f.kind === "time";
  const monoText = ["flightNo", "airport", "date", "time", "type", "registration", "count"].includes(f.kind);
  const readOnly = !editable || f.state === "not_read" || f.state === "extra";
  const act = async (key: string, body: Record<string, unknown>) => { setBusy(key); await apply({ ...body, leg: leg.index, key: f.key }); setBusy(null); };
  const note = defaultNote(f);
  const inputStyle: CSSProperties = { border: lk.border, background: lk.bg };
  return (
    <div className="cw-t-field" style={{ display: "grid", gridTemplateColumns: FGRID, gap: 12, padding: "7px 18px 7px 15px", borderTop: `1px solid ${cw.divider}`, borderLeft: `3px solid ${lk.bar}`, alignItems: "start", background: lk.rowBg }}>
      <span style={{ fontSize: 12.5, color: lk.label ?? cw.textMuted, paddingTop: 8 }}>{f.label}{f.required && f.state === "not_given" ? <span style={{ color: cw.dangerText }}> *</span> : null}</span>
      <div style={{ position: "relative" }} onFocusCapture={() => setFocused(true)} onBlurCapture={() => setFocused(false)}>
        <TextInput value={f.value} ariaLabel={`Leg ${leg.index + 1} ${f.label}`} readOnly={readOnly} monoText={monoText}
          suffix={isTime ? (f.state === "tz_unknown" ? { text: "TZ ?", tone: "tz" } : { text: "UTC", tone: "utc" }) : undefined}
          style={inputStyle}
          onCommit={(v) => { const val = ["airport", "registration", "type", "flightNo"].includes(f.kind) ? v.toUpperCase() : v; void apply({ op: "field", leg: leg.index, key: f.key, value: val }); }} />
        {lk.chip && !f.value && !focused && (
          <span aria-hidden style={{ position: "absolute", left: 10, top: 0, bottom: 0, display: "flex", alignItems: "center", gap: 5, pointerEvents: "none", fontSize: 12, fontWeight: 700, color: lk.chip.color }}>{lk.chip.text}</span>
        )}
        {lk.chip && !f.value && <span className="ag-sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{lk.chip.text}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 5, minWidth: 0 }}>
        {f.said && !f.saidSame && <span style={{ ...mono({ fontSize: 12 }), color: cw.text, background: cw.bgHover, borderRadius: 5, padding: "2px 6px", alignSelf: "flex-start", maxWidth: "100%", overflowWrap: "anywhere" }}>{f.said}</span>}
        <span style={{ fontSize: 11.5, color: cw.textMuted }}>{f.said && f.saidSame ? "Same as the value · " : ""}{sourceLabel(f.source, leg)}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 6, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          {lk.tags.map((t) => <Tag key={t.l} tone={t}>{t.l}</Tag>)}
          {f.state === "edited" && f.edited ? (
            <span style={{ fontSize: 12, lineHeight: 1.4, color: cw.textBody }}>was <span style={mono()}>{f.edited.was}</span> · edited by {f.edited.by}, {hmZ(f.edited.at)}</span>
          ) : note ? <span style={{ fontSize: 12, lineHeight: 1.4, color: f.state === "leon_refused" || f.state === "invalid" || f.state === "tz_unknown" ? cw.dangerText : cw.textBody }}>{note}</span> : null}
          {f.state === "low_confidence" && editable && (
            <SmallButton busy={busy === "ok"} onClick={() => void act("ok", { op: "looks_right" })}>Looks right</SmallButton>
          )}
          {f.state === "leon_refused" && editable && (
            <SmallButton busy={busy === "ack"} onClick={() => void act("ack", { op: "ack_refusal" })}>Resend unchanged</SmallButton>
          )}
        </div>
        {f.state === "edited" && f.note && !/^was /.test(f.note) && <span style={{ fontSize: 12, lineHeight: 1.4, color: cw.textMuted }}>{f.note}</span>}
        {f.state === "conflict" && f.conflict && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <ConflictChoice who="The email says" value={f.conflict.body} label="Use the email's value" disabled={!editable} busy={busy === "body"} onClick={() => void act("body", { op: "conflict", use: "body" })} />
            <ConflictChoice who={`${f.conflict.attachmentName ?? "The attachment"} says`} value={f.conflict.attachment} label={`Use ${f.conflict.attachmentName ?? "the attachment"}'s value`} disabled={!editable} busy={busy === "attachment"} onClick={() => void act("attachment", { op: "conflict", use: "attachment" })} />
          </div>
        )}
      </div>
    </div>
  );
}

function ConflictChoice({ who, value, label, onClick, disabled, busy }: { who: string; value: string | null; label: string; onClick: () => void; disabled: boolean; busy: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: cw.textMuted }}>{who}</span>
      <span style={{ ...mono({ fontSize: 12, fontWeight: 600 }), background: cw.bgSurface, border: `1px solid ${cw.border}`, borderRadius: 5, padding: "1px 6px" }}>{value ?? "nothing"}</span>
      <SmallButton disabled={disabled} busy={busy} onClick={onClick}>{label}</SmallButton>
    </div>
  );
}

export function SmallButton({ children, onClick, disabled, busy, tone = "neutral", icon, busyLabel = "Saving…" }: { children: ReactNode; onClick: () => void; disabled?: boolean; busy?: boolean; tone?: "neutral" | "danger" | "ink"; icon?: string; busyLabel?: string }) {
  const fg = tone === "danger" ? cw.dangerText : tone === "ink" ? cw.onInk : cw.text;
  return (
    <button type="button" className="ag-focus" disabled={disabled || busy} aria-busy={busy || undefined} onClick={onClick}
      style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: fg, background: tone === "ink" ? cw.ink : cw.bgSurface, border: `1px solid ${tone === "danger" ? TONE.red.bd : tone === "ink" ? cw.text : cw.borderControl}`, borderRadius: 7, padding: "4px 9px", cursor: disabled || busy ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 }}>
      {icon && <Icon name={icon} size={12} color={fg} />}
      {busy ? busyLabel : children}
    </button>
  );
}

/** Extra values under ALSO IN THE REQUEST · NOT SENT TO LEON (read-only). */
export function ExtraRow({ x, leg }: { x: Leg["extra"][number]; leg: Leg }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: FGRID, gap: 12, padding: "7px 18px 7px 15px", borderTop: `1px solid ${cw.divider}`, borderLeft: "3px solid transparent", alignItems: "start" }}>
      <span style={{ fontSize: 12.5, color: cw.textMuted, paddingTop: 8 }}>{x.label}</span>
      <TextInput value={x.value} readOnly monoText={false} ariaLabel={`Leg ${leg.index + 1} ${x.label} (not sent to Leon)`} onCommit={() => {}} style={{ background: cw.bgPage }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 5, minWidth: 0 }}>
        {x.said && x.said !== x.value && <span style={{ ...mono({ fontSize: 12 }), background: cw.bgHover, borderRadius: 5, padding: "2px 6px", alignSelf: "flex-start", maxWidth: "100%", overflowWrap: "anywhere" }}>{x.said}</span>}
        <span style={{ fontSize: 11.5, color: cw.textMuted }}>{sourceLabel(x.source, leg)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", paddingTop: 6 }}>
        <Tag tone={{ fg: cw.neutralText, bg: cw.neutralTint }}>NOT SENT</Tag>
        <span style={{ fontSize: 12, color: cw.textMuted }}>{x.note ?? "No Leon field for this"}</span>
      </div>
    </div>
  );
}

// ── Timezone unknown (§I6.5) ───────────────────────────────────────────────────────────────────────────
function offWords(off: number) { const h = off / 60; return `UTC${h >= 0 ? "+" : "−"}${Math.abs(h)}`; }
export function TzBlock({ leg, editable, apply }: { leg: Leg; editable: boolean; apply: Apply }) {
  const [busy, setBusy] = useState<"utc" | "local" | null>(null);
  const [changing, setChanging] = useState(false);
  const hasUnknown = leg.fields.some((f) => f.state === "tz_unknown");
  const std = fieldOf(leg, "std"), sta = fieldOf(leg, "sta");
  if (!hasUnknown && leg.tzChoice) {
    return (
      <div style={{ margin: "12px 18px 4px", border: `1px solid ${cw.primaryTintBorder}`, background: cw.primaryTint, borderRadius: 10, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, color: cw.textLink }}>
          <span style={{ fontWeight: 700 }}>Times set as {leg.tzChoice.choice === "utc" ? "UTC" : "local time"} by {leg.tzChoice.by} · STD {std?.value || "—"} UTC, STA {sta?.value || "—"} UTC</span>
          <span style={{ flex: 1 }} />
          {editable && <button type="button" className="ag-focus" aria-expanded={changing} onClick={() => setChanging((v) => !v)} style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: cw.textLink, background: "transparent", border: "none", cursor: "pointer" }}>Change</button>}
        </div>
        {changing && <span style={{ fontSize: 12.5, color: cw.textBody }}>Edit STD and STA below. Both stay marked as edited by you.</span>}
      </div>
    );
  }
  if (!hasUnknown) return null;
  const tz = leg.tz;
  const clocks = `STD ${tz?.stdClock ?? std?.value ?? "—"} and STA ${tz?.staClock ?? sta?.value ?? "—"}`;
  const offs = (tz?.offsets ?? []).filter(Boolean) as { icao: string; off: number }[];
  const sameOff = offs.length === 2 && offs[0].off === offs[1].off;
  const localLabel = sameOff ? `They are local time (${offWords(offs[0].off)})` : "They are local time";
  const offHint = offs.length === 2 ? (sameOff ? `${offs[0].icao} and ${offs[1].icao} are both ${offWords(offs[0].off)} today` : `${offs[0].icao} is ${offWords(offs[0].off)}, ${offs[1].icao} is ${offWords(offs[1].off)} today`) : offs.length === 1 ? `${offs[0].icao} is ${offWords(offs[0].off)} today` : "Local offset not known for these airports";
  const dep = (m: number | null) => { const w = fmtMin(m); return w ? `departs in ${w}` : m == null ? "departure time unknown" : "departure time has passed"; };
  const opts: { k: "utc" | "local"; l: string; v: string; hint: string; ok: boolean }[] = [
    { k: "utc", l: "They are UTC", v: `STD ${hm(tz?.utc.std) || "—"} UTC · STA ${hm(tz?.utc.sta) || "—"} UTC`, hint: cap(dep(tz?.utc.departsInMin ?? null)), ok: !!tz?.utc.std },
    { k: "local", l: localLabel, v: `STD ${hm(tz?.local.std) || "—"} UTC · STA ${hm(tz?.local.sta) || "—"} UTC`, hint: `${offHint} · ${dep(tz?.local.departsInMin ?? null)}`, ok: !!tz?.local.std },
  ];
  return (
    <div role="group" aria-labelledby={`tz-${leg.index}`} style={{ margin: "12px 18px 4px", border: `1.5px solid ${cw.danger}`, background: TONE.red.bg, borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Icon name="clock" size={18} color={cw.dangerText} />
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span id={`tz-${leg.index}`} style={{ fontSize: 15, fontWeight: 700, color: cw.dangerText }}>Which timezone are these times in?</span>
          <span style={{ fontSize: 13, lineHeight: 1.5, color: cw.textBody }}>The request gives {clocks} and no timezone anywhere. The agent will not guess. Choosing sets both times; you can still edit them after.</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingLeft: 28 }}>
        {opts.map((o) => (
          <button key={o.k} type="button" className="ag-focus" disabled={!editable || !o.ok || busy !== null} aria-busy={busy === o.k || undefined}
            onClick={async () => { setBusy(o.k); await apply({ op: "tz", leg: leg.index, choice: o.k }); setBusy(null); }}
            style={{ fontFamily: "inherit", textAlign: "left", cursor: !editable || !o.ok ? "not-allowed" : "pointer", background: cw.bgSurface, border: `1px solid ${cw.borderControl}`, borderRadius: 10, padding: "9px 12px", display: "flex", flexDirection: "column", gap: 3, opacity: !o.ok ? 0.55 : 1 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: cw.text }}>{busy === o.k ? "Setting…" : o.l}</span>
            <span style={{ ...mono({ fontSize: 12 }), color: cw.textBody }}>{o.v}</span>
            <span style={{ fontSize: 11.5, color: cw.textMuted }}>{o.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
function cap(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
