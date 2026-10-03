"use client";

// The review screen (§I6–§I10): what the agent read, which file it treated as the request, leg tabs, field
// rows, services, crew and passengers, and the confirm bar. Every change is saved per field and returns the
// full request; nothing reaches Leon until the confirmation dialog.

import { useRef, useState, type KeyboardEvent } from "react";
import { C, TONE, mono } from "../ui/tokens";
import { Button, Icon, hmsZ, kb } from "../ui/primitives";
import { Tag } from "./controls";
import type { AttachmentRole, Leg, People, RequestDetail, intakeApi } from "./api";
import { CARD, EYEBROW, LeonPill, LegSquare, Notice, SectionHead, legDate, legDirection, legKeyOf, legNo, legRoute, plural } from "./intake-shared";
import { ExtraRow, FieldHeader, FieldRow, SmallButton, TzBlock, type Apply } from "./intake-fields";
import { Services, type Def } from "./intake-services";
import { PeopleSection, type RevealState } from "./intake-people";

export function legIssues(leg: Leg) {
  const fix = leg.fields.filter((f) => (f.state === "not_given" && f.required) || f.state === "invalid" || f.state === "conflict" || f.state === "leon_refused" || (f.state === "unknown" && f.required && f.sent)).length;
  const check = leg.fields.filter((f) => f.state === "low_confidence").length + leg.services.filter((s) => s.lowConfidence && !s.checked && s.decision !== "decline").length;
  const tz = leg.fields.some((f) => f.state === "tz_unknown");
  return { fix, check, tz };
}

export type ReviewProps = {
  detail: RequestDetail; apply: Apply; defs: Def[] | null; legPos: number; setLegPos: (n: number) => void; closed: boolean;
  people: People | null; peopleError: string | null; reveal: RevealState; setReveal: (r: RevealState) => void; doReveal: (section: string) => void;
  editPeople: (body: Parameters<typeof intakeApi.editPeople>[1]) => Promise<void>;
  reprocess: (attachmentId: string | null) => Promise<void>; reprocessing: string | null; reprocessMsg: string | null;
  onPrepare: () => void; preparing: boolean; prepareError: string | null;
};

export function ReviewCard(p: ReviewProps) {
  const { detail } = p; const legs = detail.review?.legs ?? [];
  const pos = Math.min(p.legPos, Math.max(0, legs.length - 1));
  const leg = legs[pos] as Leg | undefined;
  const ex = detail.extractions[detail.extractions.length - 1];
  const nAtt = detail.attachments.filter((a) => !a.inline).length;
  const scheduled = detail.request.type === "scheduled";
  const anyInLeon = legs.some((l) => l.inLeon);
  const editableReq = !p.closed;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [addBusy, setAddBusy] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);

  const rec = detail.review?.record ?? null;
  const sub = [
    scheduled && rec ? `Read once from the ${detail.review?.notification?.providerName ?? "provider"} portal at ${hmsZ(rec.readAt)} · record ${rec.quote}` : ex ? `Read from the email${nAtt ? ` and ${plural(nAtt, "attachment")}` : ""} at ${hmsZ(ex.at)}${ex.version > 1 ? ` · extraction ${ex.version}` : ""}` : "Not read yet",
    plural(legs.filter((l) => !l.removed).length, "leg"),
    "all times UTC",
  ].join(" · ");

  const onTabKey = (e: KeyboardEvent) => {
    const k = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!k || !legs.length) return;
    e.preventDefault(); const n = (pos + k + legs.length) % legs.length; p.setLegPos(n); tabRefs.current[n]?.focus();
  };
  const legEditable = !!leg && editableReq && !leg.inLeon && !leg.removed && leg.leon?.state !== "sending" && leg.leon?.state !== "unknown";
  const liveCount = legs.filter((l) => !l.removed).length;

  return (
    <section aria-label={scheduled ? "What the agent collected" : "What the agent read"} style={{ ...CARD, overflow: "hidden", minWidth: 0 }}>
      <div style={{ padding: "16px 18px 12px", display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{scheduled ? "What the agent collected" : "What the agent read"}</span>
          <span style={{ fontSize: 12.5, color: C.muted }}>{sub}</span>
        </div>
        {editableReq && legs.length > 0 && <span style={{ fontSize: 12, color: C.muted, paddingTop: 2 }}>Every value is editable. People&apos;s changes stay marked.</span>}
      </div>

      {scheduled && rec ? (
        <div role="note" style={{ margin: "0 18px 14px", border: `1.5px solid ${TONE.amber.ic}`, background: TONE.amber.bg, borderRadius: 10, padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Icon name="circle-alert" size={16} color={TONE.amber.ic} style={{ marginTop: 2 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12.5, lineHeight: 1.5, color: C.body }}>
            <span style={{ fontWeight: 700, color: TONE.amber.fg }}>Changes the provider makes after this import are not detected.</span>
            <span>The portal was read once, at {hmsZ(rec.readAt)}. If the provider changes the flight afterwards, nobody is told: check the portal yourself before and after confirming. Arrival times are computed from the portal&apos;s Estimated Hours; crew count, passenger names and services are not in the portal and must be entered here.</span>
          </div>
        </div>
      ) : <Sources detail={detail} anyInLeon={anyInLeon} closed={p.closed} reprocess={p.reprocess} reprocessing={p.reprocessing} msg={p.reprocessMsg} />}

      {legs.length === 0 ? (
        <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ border: `1px dashed ${C.borderControl}`, borderRadius: 10, padding: "14px 16px", fontSize: 13.5, lineHeight: 1.55, color: C.muted }}>No values could be read, so there is nothing to review yet.</div>
          {editableReq && <div><Button variant="secondary" size="sm" icon="pencil" disabled={addBusy} onClick={async () => { setAddBusy(true); await p.apply({ op: "leg_add" }); setAddBusy(false); p.setLegPos(0); }}>Enter details by hand</Button></div>}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "0 18px 14px" }}>
            <div role="tablist" aria-label="Legs" onKeyDown={onTabKey} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {legs.map((l, i) => {
                const on = i === pos; const is = legIssues(l); const k = legKeyOf(l);
                const issue = l.removed ? { t: "REMOVED", c: C.faint } : is.tz ? { t: "TIMEZONE ?", c: C.danger } : is.fix ? { t: `${is.fix} to fix`, c: C.danger } : is.check ? { t: `${is.check} to check`, c: TONE.amber.fg } : null;
                return (
                  <button key={l.index} ref={(el) => { tabRefs.current[i] = el; }} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} className="ag-focus" onClick={() => p.setLegPos(i)}
                    aria-label={`Leg ${legNo(l)}, ${legRoute(l)}, ${legDate(l)}, ${k === "removed" ? "removed" : k === "in" ? "In Leon" : k === "not" ? "NOT in Leon" : k === "unknown" ? "Unknown, checking" : "Not sent"}${issue ? `, ${issue.t}` : ""}`}
                    style={{ width: 188, textAlign: "left", fontFamily: "inherit", cursor: "pointer", borderRadius: 10, padding: on ? "8.5px 10.5px" : "9px 11px", background: on ? C.primaryTint3 : C.surface, border: on ? `1.5px solid ${C.primary}` : `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 4, opacity: l.removed ? 0.55 : 1 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", width: "100%" }}>
                      <span style={{ ...mono({ fontSize: 11.5, fontWeight: 700 }), color: C.ink }}>LEG {legNo(l)}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: C.muted, flex: 1 }}>{legDirection(l)}</span>
                      <LegSquare k={k} size={11} />
                    </span>
                    <span style={{ ...mono({ fontSize: 13.5, fontWeight: 600 }), color: C.ink, textDecoration: l.removed ? "line-through" : "none" }}>{legRoute(l)}</span>
                    <span style={{ display: "flex", gap: 6, alignItems: "center", width: "100%" }}>
                      <span style={{ ...mono({ fontSize: 11.5 }), color: C.muted, flex: 1 }}>{legDate(l) || "—"}</span>
                      {issue && <span style={{ fontSize: 11, fontWeight: 700, color: issue.c }}>{issue.t}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            {editableReq && (
              <button type="button" className="ag-focus" disabled={addBusy} onClick={async () => { setAddBusy(true); const ok = await p.apply({ op: "leg_add" }); setAddBusy(false); if (ok) p.setLegPos(legs.length); }}
                style={{ fontFamily: "inherit", width: 120, minHeight: 70, cursor: "pointer", borderRadius: 10, border: `1.5px dashed ${C.disabledFill}`, background: C.surface, color: C.body, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Icon name="plus" size={14} color={C.muted} />{addBusy ? "Adding…" : "Add leg"}
              </button>
            )}
          </div>

          {leg && (
            <div role="tabpanel" aria-label={`Leg ${legNo(leg)}`} key={leg.index} className="cw-fade">
              <LegStrip leg={leg} total={legs.length} canRemove={editableReq && !leg.inLeon && (leg.removed ? true : liveCount > 1)} busy={removeBusy}
                onRemove={async () => { setRemoveBusy(true); await p.apply({ op: leg.removed ? "leg_restore" : "leg_remove", leg: leg.index }); setRemoveBusy(false); }} />
              {leg.removed ? (
                <div style={{ padding: "22px 18px", fontSize: 13.5, color: C.muted, borderTop: `1px solid ${C.divider}` }}>This leg is removed and will not be created in Leon. Its values are kept on this page in case you undo.</div>
              ) : (
                <div>
                  {leg.inLeon && (
                    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 18px", borderTop: `1px solid ${C.divider}`, background: C.sidebar, fontSize: 13, color: C.body }}>
                      <Icon name="lock" size={14} color={C.muted} />This leg is in Leon as flight <span style={mono({ fontWeight: 600 })}>{leg.leon.flightNid}</span>. Values are read-only here; change them in Leon.
                    </div>
                  )}
                  <TzBlock leg={leg} editable={legEditable} apply={p.apply} />
                  <div style={{ padding: "14px 18px 6px", ...EYEBROW }}>Flight · Leg {legNo(leg)}</div>
                  <FieldHeader />
                  {leg.fields.map((f) => <FieldRow key={f.key} f={f} leg={leg} editable={legEditable} apply={p.apply} />)}
                  {leg.extra.length > 0 && (
                    <>
                      <div style={{ padding: "14px 18px 6px", borderTop: `1px solid ${C.divider}`, ...EYEBROW }}>Also in the request · not sent to Leon</div>
                      {leg.extra.map((x) => <ExtraRow key={x.key} x={x} leg={leg} />)}
                    </>
                  )}
                  <Services leg={leg} editable={legEditable} apply={p.apply} defs={p.defs} />
                  <PeopleSection leg={leg} people={p.people} peopleError={p.peopleError} reveal={p.reveal} setReveal={p.setReveal} doReveal={p.doReveal} purged={detail.request.purged} retentionDays={detail.retention.days} editPeople={detail.request.status === "closed" ? null : p.editPeople} />
                </div>
              )}
            </div>
          )}

          {(detail.review?.notes.length ?? 0) > 0 && (
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 10 }}>
              <SectionHead heading="Other notes from the request · not sent to Leon" />
              <ul style={{ margin: 0, padding: "0 18px 12px 36px", display: "flex", flexDirection: "column", gap: 4 }}>
                {(detail.review?.notes ?? []).map((n, i) => <li key={i} style={{ fontSize: 12.5, lineHeight: 1.5, color: C.body }}>{n.text}{n.source && n.source !== "body" && n.source !== "Agent" ? <span style={{ color: C.faint }}> · {n.source}</span> : null}</li>)}
              </ul>
            </div>
          )}
        </>
      )}

      <ConfirmBar detail={detail} closed={p.closed} onPrepare={p.onPrepare} preparing={p.preparing} error={p.prepareError} />
    </section>
  );
}

function LegStrip({ leg, total, canRemove, onRemove, busy }: { leg: Leg; total: number; canRemove: boolean; onRemove: () => void; busy: boolean }) {
  const is = legIssues(leg);
  const n = leg.fields.filter((f) => f.value !== "").length;
  const conv = leg.fields.filter((f) => f.state === "converted").length;
  const low = leg.fields.filter((f) => f.state === "low_confidence").length;
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, background: C.page, padding: "12px 18px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <span style={{ ...mono({ fontSize: 12, fontWeight: 700 }), color: C.ink, background: C.surface, border: `1.5px solid ${C.muted}`, borderRadius: 6, padding: "3px 8px" }}>LEG {legNo(leg)} OF {total}</span>
      {leg.direction && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: C.muted }}>{legDirection(leg)}</span>}
      <span style={{ ...mono({ fontSize: 17, fontWeight: 600 }), whiteSpace: "nowrap", textDecoration: leg.removed ? "line-through" : "none" }}>{legRoute(leg)}</span>
      <span style={{ ...mono({ fontSize: 13 }), color: C.muted, whiteSpace: "nowrap" }}>{legDate(leg)}</span>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 12, color: C.muted }}>{n} values · {conv} converted · {low} low confidence · <span style={{ color: is.fix || is.tz ? C.danger : C.muted, fontWeight: is.fix || is.tz ? 700 : 400 }}>{is.fix + (is.tz ? 1 : 0)} to fix</span></span>
      <LeonPill k={legKeyOf(leg)} id={leg.leon?.flightNid} size="lg" />
      {canRemove && (
        <button type="button" className="ag-focus" disabled={busy} onClick={onRemove} style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: C.danger, background: C.surface, border: `1px solid ${TONE.red.bd}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>{busy ? "Saving…" : leg.removed ? "Undo remove" : "Remove leg"}</button>
      )}
    </div>
  );
}

// ── Attachments: which file is the request, and why (build-round addendum) ─────────────────────────────
const ROLE: Record<AttachmentRole["role"], { l: string; fg: string; bg: string }> = {
  request: { l: "THE REQUEST", fg: C.primaryHover, bg: C.primaryTint2 },
  supporting: { l: "SUPPORTING", fg: C.ok, bg: C.okTint },
  noise: { l: "IGNORED", fg: C.neutral, bg: C.neutralTint },
  unreadable: { l: "COULD NOT READ", fg: C.danger, bg: TONE.red.bg },
};
function Sources({ detail, anyInLeon, closed, reprocess, reprocessing, msg }: { detail: RequestDetail; anyInLeon: boolean; closed: boolean; reprocess: (id: string | null) => Promise<void>; reprocessing: string | null; msg: string | null }) {
  const [asking, setAsking] = useState<string | null>(null);
  const src = detail.requestSource ?? detail.review?.requestSource ?? null;
  const atts = detail.attachments.filter((a) => !a.inline || a.role !== "noise");
  const canSwitch = !anyInLeon && !closed;
  return (
    <div style={{ margin: "0 18px 14px", border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "9px 12px", background: C.page, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={EYEBROW}>Treated as the request</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, ...(src?.attachment ? mono({ fontSize: 12.5 }) : {}) }}>{src?.attachment ?? "The email body"}</span>
        {src?.by && <span style={{ fontSize: 12, color: C.muted }}>· chosen by {src.by}</span>}
        {src?.why && <span style={{ fontSize: 12.5, color: C.body, flexBasis: "100%" }}>{src.why}</span>}
      </div>
      {atts.length === 0 && <div style={{ padding: "9px 12px", fontSize: 12.5, color: C.muted, borderTop: `1px solid ${C.divider}` }}>The email has no attachments.</div>}
      {atts.map((a) => {
        const r = ROLE[a.role] ?? ROLE.supporting; const isReq = a.role === "request" || (!!a.id && a.id === src?.attachmentId);
        return (
          <div key={a.id ?? a.name} style={{ padding: "9px 12px", borderTop: `1px solid ${C.divider}`, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Icon name={a.role === "unreadable" ? "file-x" : "file-text"} size={16} color={a.role === "unreadable" ? C.dangerBadge : C.muted} style={{ marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ ...mono({ fontSize: 12.5, fontWeight: 600 }), overflowWrap: "anywhere" }}>{a.name}</span>
                <Tag tone={isReq ? ROLE.request : r}>{isReq ? ROLE.request.l : r.l}</Tag>
                <span style={{ fontSize: 12, color: C.muted }}>{a.kind} · {kb(a.bytes)}{a.pages ? ` · ${plural(a.pages, "page")}` : ""}{a.byCode ? " · sorted by rule" : ""}</span>
              </div>
              <span style={{ fontSize: 12.5, lineHeight: 1.45, color: C.body }}>{a.role === "noise" ? `Ignored: ${a.why}` : a.why}</span>
              {a.override && <span style={{ fontSize: 12, color: C.muted }}>Chosen by {a.override.by ?? "a person"} at {hmsZ(a.override.at)}</span>}
              {a.personal && <span style={{ fontSize: 12, color: C.muted }}>Contains personal data. Opening one is logged, the same as Show personal data.</span>}
              {asking === a.id && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}>
                  <span style={{ fontSize: 12.5, color: C.body }}>The agent reads the request again, from this file. The values below are replaced by the new reading.</span>
                  <SmallButton tone="ink" busyLabel="Reading the file again…" busy={reprocessing === a.id} onClick={async () => { await reprocess(a.id); setAsking(null); }}>Read it again</SmallButton>
                  <SmallButton onClick={() => setAsking(null)}>Cancel</SmallButton>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "none" }}>
              {!isReq && a.id && a.role !== "unreadable" && asking !== a.id && (
                <SmallButton disabled={!canSwitch || reprocessing !== null} busyLabel="Reading…" busy={reprocessing === a.id} onClick={() => setAsking(a.id)}>Use this file instead</SmallButton>
              )}
              {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="ag-focus" style={{ fontSize: 12.5, fontWeight: 600, color: C.primary, whiteSpace: "nowrap" }}>Open ↗</a>}
            </div>
          </div>
        );
      })}
      {anyInLeon && atts.some((a) => a.role !== "request") && <div style={{ padding: "8px 12px", borderTop: `1px solid ${C.divider}`, fontSize: 12, color: C.muted }}>A leg is already in Leon, so the request cannot be read again from another file.</div>}
      {msg && <div role="alert" style={{ padding: "8px 12px", borderTop: `1px solid ${C.divider}`, fontSize: 12.5, color: C.danger }}>{msg}</div>}
    </div>
  );
}

// ── Confirm bar (§I10) ─────────────────────────────────────────────────────────────────────────────────
export function confirmPlan(detail: RequestDetail) {
  const legs = detail.review?.legs ?? [];
  const live = legs.filter((l) => !l.removed && !l.inLeon);
  const resend = live.length > 0 && live.every((l) => l.leon?.state === "not_in_leon");
  return { live, resend, items: 0, scheduled: detail.request.type === "scheduled" };
}
function ConfirmBar({ detail, closed, onPrepare, preparing, error }: { detail: RequestDetail; closed: boolean; onPrepare: () => void; preparing: boolean; error: string | null }) {
  const legs = detail.review?.legs ?? [];
  const { live, resend, items, scheduled } = confirmPlan(detail);
  if (closed || !detail.review) return null;
  if (detail.request.status === "in_progress" || legs.some((l) => l.leon?.state === "sending")) return null; // a send is running: nothing to confirm until Leon answers
  if (live.length === 0 && (legs.some((l) => l.inLeon) || detail.blockers.length === 0)) return null; // nothing left to send
  const unsettled = live.filter((l) => l.leon?.state === "unknown").map(legNo);
  const blockers = [...detail.blockers, ...(unsettled.length && !detail.blockers.some((b) => /did not answer|Unknown/i.test(b)) ? [`${unsettled.length === 1 ? `Leg ${unsettled[0]}` : `Legs ${unsettled.join(", ")}`}: Leon did not answer. Settle it under What was sent to Leon first.`] : [])];
  const nums = live.map(legNo);
  const title = resend ? `Resends ${nums.length === 1 ? `leg ${nums[0]}` : `legs ${nums.join(", ")}`} to Leon` : scheduled ? `Sends ${plural(live.length, "flight")} to Leon` : `Creates ${plural(live.length, "flight")} in Leon, the request in their OPS notes`;
  const btn = resend ? `Review and resend ${nums.length === 1 ? `leg ${nums[0]}` : "the legs"}` : scheduled ? "Review and send to Leon" : "Review and create in Leon";
  const svc = live.flatMap((l) => l.services);
  const c = (d: string) => svc.filter((s) => !s.isNote && s.decision === d).length;
  const notes = svc.filter((s) => s.isNote).length;
  const edited = live.reduce((n, l) => n + l.fields.filter((f) => f.state === "edited" || !!f.edited).length, 0);
  const removed = legs.some((l) => l.removed);
  const sub = [
    `Services: ${c("provide")} provide · ${c("to_confirm")} to confirm · ${c("decline")} declined · ${notes} note${notes === 1 ? "" : "s"} — recorded in Leon as a note, unactioned; no checklist status is set.`,
    `${edited} value${edited === 1 ? "" : "s"} edited by people.`,
    removed ? "Legs removed on this page are not created." : null,
  ].filter(Boolean).join(" ");
  const blocked = blockers.length > 0;
  const lowCount = detail.warnings.length;
  return (
    <div style={{ borderTop: `1.5px solid ${C.border}`, background: C.page, padding: "14px 18px 16px", display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 240 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
          <span style={{ fontSize: 12.5, lineHeight: 1.5, color: C.muted }}>{sub}</span>
        </div>
        <button type="button" className="ag-focus" disabled={blocked || preparing} aria-busy={preparing || undefined} onClick={onPrepare}
          style={{ fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: blocked ? C.faint : C.surface, background: blocked ? C.border : C.primary, border: "none", borderRadius: 10, padding: "11px 16px", cursor: blocked || preparing ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
          <Icon name="send" size={15} color={blocked ? C.faint : C.surface} />{preparing ? "Preparing…" : btn}
        </button>
      </div>
      {blocked && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, background: TONE.red.bg, border: `1px solid ${TONE.red.bd}`, borderRadius: 9, padding: "9px 12px" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.danger }}>Can&apos;t confirm yet</span>
          {blockers.map((b) => <span key={b} style={{ fontSize: 12.5, color: C.body }}>{b}</span>)}
        </div>
      )}
      {!blocked && lowCount > 0 && (
        <div style={{ fontSize: 12.5, color: TONE.amber.fg }}>{lowCount} value{lowCount === 1 ? "" : "s"} still marked low confidence. You can confirm, but check them first. <span style={{ color: C.muted }}>({detail.warnings.join(" · ")})</span></div>
      )}
      {error && <Notice tone="red" icon="circle-alert" heading="Could not prepare the send">{error}</Notice>}
    </div>
  );
}
