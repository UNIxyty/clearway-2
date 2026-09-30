"use client";

// What was sent to Leon, and the checklist (§I11), plus the emails the agent sent for this request (§I12).
// A leg's Leon state is shown as Leon reported it; a leg Leon never answered for gets the red strip and the
// two ways to settle it. Resend only ever goes through the confirm bar.

import Link from "next/link";
import { useState } from "react";
import { C, TONE, mono } from "../ui/tokens";
import { Icon, dayTimeZ, hmsZ } from "../ui/primitives";
import { Tag } from "./controls";
import type { Leg, RequestDetail, Write } from "./api";
import { CARD, EYEBROW, LeonPill, fmtDur, legRoute, plural, writeKey } from "./intake-shared";
import { SmallButton } from "./intake-fields";

export function latestWrites(detail: RequestDetail): Write[] {
  const by = new Map<number, Write>();
  for (const w of detail.sent.writes) { const p = by.get(w.leg); if (!p || Date.parse(w.updatedAt ?? w.at) >= Date.parse(p.updatedAt ?? p.at)) by.set(w.leg, w); }
  return [...by.values()].sort((a, b) => a.leg - b.leg);
}

export function SentSection({ detail, rawOpen, setRawOpen, resolveLeg }: { detail: RequestDetail; rawOpen: boolean; setRawOpen: (v: boolean) => void; resolveLeg: (leg: number, action: "check" | "not_in_leon") => Promise<string | null> }) {
  const writes = latestWrites(detail);
  const legs = detail.review?.legs ?? [];
  const legOf = (i: number) => legs.find((l) => l.index === i);
  const dup = !!detail.request.duplicate && !detail.request.duplicate?.error && detail.request.duplicateResolution?.action !== "not_duplicate";
  if (!writes.length) {
    return (
      <section aria-label="What was sent to Leon" style={{ ...CARD, padding: "16px 18px", display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>What was sent to Leon</span>
        <span style={{ fontSize: 12.5, color: C.muted }}>{dup ? "Nothing has been sent to Leon. The agent stopped before building the request." : "Nothing has been sent to Leon."}</span>
      </section>
    );
  }
  const created = writes.filter((w) => w.state === "in_leon").length, refused = writes.filter((w) => w.state === "not_in_leon").length, unknown = writes.filter((w) => w.state === "unknown" || w.state === "sending").length;
  const outcome = [created ? `${created} created` : null, refused ? `${refused} refused` : null, unknown ? `${unknown} not answered` : null].filter(Boolean).join(", ");
  const summary = `One request with ${plural(writes.length, "leg")} · sent ${hmsZ(detail.sent.firstAt ?? writes[0].at)}${detail.sent.lastMs != null ? ` · Leon answered in ${fmtDur(detail.sent.lastMs)}` : ""}: ${outcome}`;
  const checklist = writes.filter((w) => w.state === "in_leon" && w.checklist).flatMap((w) => (w.checklist ?? []).map((c) => ({ ...c, leg: w.leg })));
  const filled = checklist.filter((c) => c.filled).length, notFilled = checklist.length - filled;
  const nPut = checklist.length;
  const http = [...new Set(writes.map((w) => w.httpStatus).filter((x) => x != null))].join("/");
  const rawSum = `Leon GraphQL createTrip / flightCreate${http ? ` · HTTP ${http}` : ""}${detail.sent.lastMs != null ? ` · ${fmtDur(detail.sent.lastMs)}` : ""}${nPut ? ` · then ${nPut} checklist writes` : ""}`;
  const reqJson = JSON.stringify(writes.map((w) => ({ leg: w.leg + 1, ...(w.payload ?? {}) })), null, 2);
  const resJson = JSON.stringify(writes.map((w) => ({ leg: w.leg + 1, state: w.state, httpStatus: w.httpStatus, flightNid: w.flightNid, tripNid: w.tripNid, error: w.error, ms: w.ms, at: w.at })), null, 2);

  return (
    <section aria-label="What was sent to Leon" style={{ ...CARD, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>What was sent to Leon</span>
        <span style={{ fontSize: 12.5, color: C.muted }}>{summary}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        {writes.map((w, i) => {
          const l = legOf(w.leg); const k = writeKey(w.state);
          return (
            <div key={w.leg} style={{ borderTop: i ? `1px solid ${C.dividerRow}` : "none" }}>
              <div style={{ display: "grid", gridTemplateColumns: "64px 180px 190px 1fr", gap: 12, padding: "9px 14px", alignItems: "center" }}>
                <span style={mono({ fontSize: 12, fontWeight: 700 })}>LEG {w.leg + 1}</span>
                <span style={mono({ fontSize: 13, fontWeight: 600 })}>{l ? legRoute(l) : "—"}</span>
                <span style={{ justifySelf: "start" }}><LeonPill k={k} /></span>
                <span style={{ fontSize: 13, color: C.body }}>
                  {w.state === "in_leon" ? <>Created as <span style={mono({ fontWeight: 600 })}>{w.flightNid}</span>{w.by ? <span style={{ color: C.muted }}> · by {w.by}</span> : null}</>
                    : w.state === "not_in_leon" ? <>Refused by Leon. Not created.{w.error ? <span style={{ color: C.danger }}> {w.error}</span> : null}{w.resolvedBy ? <span style={{ color: C.muted }}> · confirmed not in Leon by {w.resolvedBy}</span> : null}</>
                    : w.state === "sending" ? "Waiting for Leon." : w.state === "unknown" ? "Leon did not answer." : "Not sent."}
                </span>
              </div>
              {w.state === "unknown" && l && <UnknownStrip leg={l} resolveLeg={resolveLeg} />}
            </div>
          );
        })}
      </div>

      {checklist.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
            <span style={EYEBROW}>Leon checklist</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: notFilled ? C.danger : C.ok }}>{filled} of {checklist.length} items filled{notFilled ? ` · ${notFilled} not filled` : ""}</span>
          </div>
          <div role="table" aria-label="Leon checklist" style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            {checklist.map((c, i) => (
              <div role="row" key={`${c.leg}-${c.defNid}-${i}`} style={{ display: "grid", gridTemplateColumns: "64px 160px 110px 130px 1fr", gap: 12, padding: "7px 14px", borderTop: i ? `1px solid ${C.dividerRow}` : "none", alignItems: "center", background: c.filled ? C.surface : TONE.red.bg }}>
                <span role="cell" style={mono({ fontSize: 12, fontWeight: 700 })}>LEG {c.leg + 1}</span>
                <span role="cell" style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</span>
                <span role="cell" style={{ fontSize: 12, color: C.muted }}>{c.decision === "provide" ? "Provide" : c.decision === "to_confirm" ? "To confirm" : "Note"}</span>
                <span role="cell" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: c.filled ? C.ok : C.danger }}><Icon name={c.filled ? "circle-check" : "circle-x"} size={12} color={c.filled ? C.okDot : C.dangerBadge} />{c.filled ? "Filled" : "NOT filled"}</span>
                <span role="cell" style={{ fontSize: 12.5, color: c.filled ? C.body : C.danger }}>{c.filled ? c.note ?? "" : c.reason ?? "Leon did not accept it."}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        <button type="button" className="ag-focus" aria-expanded={rawOpen} onClick={() => setRawOpen(!rawOpen)}
          style={{ width: "100%", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", background: C.page, border: "none", textAlign: "left" }}>
          <Icon name={rawOpen ? "chevron-down" : "chevron-right"} size={14} color={C.muted} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Raw request and response</span>
          <span style={{ ...mono({ fontSize: 12 }), color: C.faint, flex: 1 }}>{rawSum}</span>
          <span style={{ fontSize: 12, color: C.faint }}>{rawOpen ? "Hide" : "Show"} <span style={{ ...mono({ fontSize: 11 }), border: `1px solid ${C.borderControl}`, borderRadius: 5, padding: "0 5px" }}>r</span></span>
        </button>
        {rawOpen && (
          <div className="cw-expand" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `1px solid ${C.border}` }}>
            <RawPane heading={`Request · sent ${hmsZ(detail.sent.firstAt ?? writes[0].at)}`} text={reqJson} border />
            <RawPane heading={`Leon response · ${hmsZ(writes[writes.length - 1].updatedAt ?? writes[writes.length - 1].at)}`} text={resJson} />
          </div>
        )}
      </div>
    </section>
  );
}

function RawPane({ heading, text, border }: { heading: string; text: string; border?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ padding: "12px 14px", borderRight: border ? `1px solid ${C.border}` : "none", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ ...EYEBROW, flex: 1 }}>{heading}</span>
        <button type="button" className="ag-focus" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: C.primary, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre style={{ margin: 0, background: C.sidebar, borderRadius: 8, padding: 12, ...mono({ fontSize: 12 }), lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 360, overflowY: "auto" }}>{text}</pre>
    </div>
  );
}

function UnknownStrip({ leg, resolveLeg }: { leg: Leg; resolveLeg: (leg: number, action: "check" | "not_in_leon") => Promise<string | null> }) {
  const [busy, setBusy] = useState<"check" | "not_in_leon" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (a: "check" | "not_in_leon") => { setBusy(a); setMsg(null); const m = await resolveLeg(leg.index, a); setMsg(m); setBusy(null); };
  const n = leg.index + 1;
  return (
    <div style={{ margin: "0 14px 10px", background: TONE.red.bg, border: `1.5px solid ${C.dangerBadge}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <span role="alert" style={{ fontSize: 13, lineHeight: 1.5, color: C.danger, fontWeight: 600 }}>Leon did not answer. The agent could not confirm whether leg {n} exists in Leon. Check Leon before resending.</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <SmallButton icon="search" busyLabel="Checking Leon…" busy={busy === "check"} disabled={busy !== null} onClick={() => void run("check")}>Check Leon for this leg</SmallButton>
        <SmallButton tone="danger" busy={busy === "not_in_leon"} disabled={busy !== null} onClick={() => void run("not_in_leon")}>I checked: it is not in Leon</SmallButton>
      </div>
      {msg && <span style={{ fontSize: 12.5, color: C.body }}>{msg}</span>}
    </div>
  );
}

export function EmailsSection({ detail }: { detail: RequestDetail }) {
  if (!detail.emails.length) return null;
  return (
    <section aria-label="Emails the agent sent" style={{ ...CARD, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Emails the agent sent for this request</span>
        <span style={{ fontSize: 12.5, color: C.muted }}>No personal data in any of them: counts only.</span>
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        {detail.emails.map((e, i) => (
          <Link key={e.id} href={`/agent/mailbox?m=${encodeURIComponent(e.id)}`} className="ag-focus cw-row" style={{ display: "grid", gridTemplateColumns: "150px minmax(0,1fr) 150px 120px", gap: 12, padding: "9px 14px", borderTop: i ? `1px solid ${C.dividerRow}` : "none", alignItems: "center", textDecoration: "none", color: C.ink }}>
            <span><Tag tone={{ fg: C.neutral, bg: C.neutralTint }}>{e.kind}</Tag></span>
            <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.subject}</span>
            <span style={{ ...mono({ fontSize: 12 }), color: C.body }}>{dayTimeZ(e.at, { alwaysDate: true })}</span>
            <span style={{ fontSize: 12, color: e.delivery === "bounced" || e.delivery === "failed" ? C.danger : C.muted }}>{e.delivery ?? "—"}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

