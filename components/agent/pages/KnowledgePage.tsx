"use client";

// Knowledge base (design spec §10): what the agent may quote and what it may
// only reference, and the human approval step in front of the authoritative
// tier. The approver signs off the EXTRACTED text that will be quoted — it is
// in front of them clause by clause — and the uploader cannot approve their
// own document. Approvals and rejections land in the Activity log.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PortalShell, { useIdentity } from "@/components/portal/Shell";
import { EmptyState, FieldLabel, LoadingRows, TextArea, TextInput } from "@/components/console-kit";
import { mono } from "../ui/tokens";
import { Button, Icon, IconButton, IconTile, Tag, hmZ, kb } from "../ui/primitives";
import { RevisionTag } from "../thread/RevisionTag";
import type { RevisionInfo } from "../types";
import AgentStyles from "../ui/AgentStyles";
import DateField from "../ui/DateField";
import { AGENT_BASE } from "../types";
import { useOpenDocument } from "../viewer/useOpenDocument";
import { cw } from "@/lib/portal-tokens";
import { ShownError, apiMessage, personText, shownText } from "../ui/errorText";

type Doc = {
  id: string; title: string; filename: string; mime: string | null; bytes: number | null; source: string | null; version: string | null;
  effective_date: string | null; country: string | null; icao: string | null; tier: "tier1" | "tier2" | null; proposed_tier: "tier1" | "tier2" | null; revision?: RevisionInfo | null; fileMissing?: boolean;
  proposed_reason: string | null; status: "uploaded" | "classified" | "awaiting_approval" | "approved" | "rejected" | "indexed" | "failed";
  uploaded_by: string | null; uploaded_by_email: string | null; approved_by_email: string | null; approved_at: string | null; rejected_reason: string | null; created_at: string; updated_at: string | null;
};
type Clause = { reference: string; text: string };
type Decision = { kind: "approved" | "reference" | "rejected"; at: string; clauses?: number };

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const dateShort = (iso: string | null | undefined) => { if (!iso) return "—"; const d = new Date(iso); if (Number.isNaN(d.getTime())) return "—"; return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const dayTime = (iso: string | null | undefined) => { if (!iso) return ""; const d = new Date(iso); return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()][0]}${MONTHS[d.getUTCMonth()].slice(1).toLowerCase()} ${hmZ(iso)}`; };
const ext = (name: string) => (name.split(".").pop() || "").toUpperCase().slice(0, 4) || "FILE";
const isPending = (d: Doc) => d.status === "awaiting_approval" || d.status === "classified" || d.status === "uploaded";

const STATUS: Record<Doc["status"], { text: string; dot: string; fg: string }> = {
  indexed: { text: "Indexed", dot: cw.success, fg: cw.successText }, approved: { text: "Indexed", dot: cw.success, fg: cw.successText },
  awaiting_approval: { text: "Awaiting approval", dot: cw.warning, fg: cw.warningText }, classified: { text: "Awaiting approval", dot: cw.warning, fg: cw.warningText }, uploaded: { text: "Awaiting approval", dot: cw.warning, fg: cw.warningText },
  failed: { text: "Failed · no text", dot: cw.danger, fg: cw.dangerText }, rejected: { text: "Rejected", dot: cw.danger, fg: cw.dangerText },
};

async function agentFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${AGENT_BASE}${path}`, { credentials: "same-origin", cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// A proposal's reason is a sentence from the classifier. Documents uploaded before 2026-10-14 can hold the
// classifier's error text instead ("Could not classify automatically (…)"); that is shown in our words.
const UNCLASSIFIED = "It could not be classified automatically, so it is proposed as reference. Check it before you approve it.";
const proposalReason = (reason: string) => (/^Could not classify automatically/i.test(reason) ? UNCLASSIFIED : personText(reason, UNCLASSIFIED));

export default function KnowledgePage() {
  const { email, isDeveloper } = useIdentity();
  const od = useOpenDocument("Knowledge base");
  const [rows, setRows] = useState<Doc[] | null>(null);
  const [stats, setStats] = useState<{ authoritative: number; clauses: number; reference: number; awaiting: number; oldestWaitingDays: number | null; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});

  const load = useCallback(async () => {
    const [d, s] = await Promise.all([agentFetch("/api/knowledge/documents"), agentFetch("/api/knowledge/stats")]);
    if (d.status === 401 || d.status === 403) { setError("The knowledge base needs agent access."); setRows([]); return; }
    if (!d.body?.ok) { setError(apiMessage(d.body, "Could not load the documents. Try again.")); setRows([]); return; }
    setRows(d.body.documents ?? []); if (s.body?.ok) setStats(s.body.stats);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const list = rows ?? [];
  const current = useMemo(() => list.find((r) => r.id === selected) ?? list.find(isPending) ?? null, [list, selected]);

  const statCard = (label: string, color: string, border: string, value: number | string, sub: string) => (
    <div style={{ background: cw.bgSurface, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 12.5, color: cw.textMuted }}>{sub}</div>
    </div>
  );

  return (
    <PortalShell crumb="Ops Agent" title="Knowledge base"
      subtitle="Documents the agent can read. Authoritative documents are quoted verbatim and need an approver. Reference documents are searched and cited, never quoted as approved text."
      headerRight={isDeveloper ? <Button variant="primary" size="lg" icon="upload" style={{ borderRadius: 10 }} onClick={() => setUploadOpen((v) => !v)}>Upload</Button> : undefined}>
      <AgentStyles />
      <div style={{ padding: "30px 32px", display: "flex", flexDirection: "column", gap: 18 }}>
        {error && <div role="alert" style={{ fontSize: 13, color: cw.dangerText }}>{error}</div>}
        {uploadOpen && <UploadCard onDone={async () => { setUploadOpen(false); await load(); }} onCancel={() => setUploadOpen(false)} />}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
          {statCard("AUTHORITATIVE", cw.text, cw.text, stats?.authoritative ?? "—", stats ? `quoted verbatim · ${stats.clauses} clause${stats.clauses === 1 ? "" : "s"}` : "quoted verbatim")}
          {statCard("REFERENCE", cw.textMuted, cw.border, stats?.reference ?? "—", "searched and cited")}
          {statCard("AWAITING APPROVAL", cw.warningText, cw.warningBorder, stats?.awaiting ?? "—", stats?.oldestWaitingDays != null ? `oldest ${stats.oldestWaitingDays} day${stats.oldestWaitingDays === 1 ? "" : "s"}` : "nothing waiting")}
          {statCard("NEEDS ATTENTION", cw.dangerText, cw.dangerBorder, stats?.failed ?? "—", stats?.failed ? "indexing failed" : "nothing failed")}
        </div>

        <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
          {/* Document table */}
          <div style={{ flex: 1, minWidth: 0, background: cw.bgSurface, border: `1px solid ${cw.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2.2fr) 1.1fr 1fr 1.1fr 1fr", gap: 12, padding: "10px 18px", background: cw.bgPage, borderBottom: `1px solid ${cw.divider}` }}>
              {["DOCUMENT", "TIER", "STATUS", "OWNER", "UPDATED"].map((h) => <span key={h} style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: cw.textMuted }}>{h}</span>)}
            </div>
            {rows === null && <div style={{ padding: 18 }}><LoadingRows rows={4} /></div>}
            {rows !== null && list.length === 0 && <EmptyState title="No documents yet">{isDeveloper ? "Upload the first one with the button above." : "Nothing has been uploaded for the agent to read."}</EmptyState>}
            {list.map((d) => {
              const st = STATUS[d.status] ?? STATUS.uploaded; const sel = current?.id === d.id;
              const tier = d.tier === "tier1" && !isPending(d) && d.status !== "rejected" ? "auth" : d.proposed_tier === "tier1" && isPending(d) ? "requested" : "reference";
              return (
                <button key={d.id} type="button" onClick={() => setSelected(d.id)} aria-pressed={sel} className="ag-row-hover ag-focus"
                  style={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(0,2.2fr) 1.1fr 1fr 1.1fr 1fr", gap: 12, alignItems: "center", padding: "12px 18px", border: "none", borderBottom: `1px solid ${cw.divider}`, background: sel ? cw.warningTint : "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: cw.text }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span style={{ width: 30, height: 36, borderRadius: 5, background: cw.bgSunken, border: `1px solid ${cw.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: cw.textMuted, flex: "none" }}>{ext(d.filename)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
                      <span style={{ ...mono({ fontSize: 11.5 }), color: cw.textMuted }}>{d.id.slice(0, 8).toUpperCase()}{d.bytes ? ` · ${kb(d.bytes)}` : ""}</span>
                      {d.fileMissing && <span data-file-missing style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: cw.dangerText, background: cw.dangerTint, border: `1px solid ${cw.dangerBorder}`, borderRadius: 5, padding: "1px 6px" }}>File missing</span>}
                    </span>
                  </span>
                  <span>{tier === "auth" ? <Tag fg={cw.onInk} bg={cw.ink}>AUTHORITATIVE</Tag> : tier === "requested" ? <Tag fg={cw.text} bg={cw.bgSurface} style={{ border: `1px solid ${cw.text}` }}>AUTH · REQUESTED</Tag> : <Tag fg={cw.textBody} bg={cw.bgSurface} style={{ border: `1px solid ${cw.borderControl}` }}>REFERENCE</Tag>}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: st.fg }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: st.dot, flex: "none" }} />{st.text}</span>
                  <span style={{ fontSize: 12.5, color: cw.textBody, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.uploaded_by_email ?? "—"}</span>
                  <span style={{ ...mono({ fontSize: 12 }), color: cw.textMuted, display: "inline-flex", alignItems: "center", gap: 8 }}>{dateShort(d.updated_at ?? d.created_at)}
                    <span role="button" tabIndex={0} aria-label={`Open ${d.title}`} className="ag-kb-open ag-focus" onClick={(e) => { e.stopPropagation(); void od.openKnowledge(d.id, e.currentTarget as HTMLElement); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); void od.openKnowledge(d.id, e.currentTarget as HTMLElement); } }} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: cw.textLink, background: cw.bgSurface, border: `1px solid ${cw.primaryTintBorder}`, borderRadius: 7, padding: "5px 9px", opacity: 0, fontFamily: "inherit", cursor: "pointer" }}><Icon name="eye" size={12} color={cw.textLink} />Open</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Approval panel */}
          {current && <ApprovalPanel key={current.id} doc={current} me={email} canApprove={isDeveloper} decision={decisions[current.id] ?? null} onDecided={async (dec) => { setSelected(current.id); setDecisions((m) => ({ ...m, [current.id]: dec })); await load(); }} />}
        </div>
      </div>
    </PortalShell>
  );
}

function ApprovalPanel({ doc, me, canApprove, decision, onDecided }: { doc: Doc; me: string | null; canApprove: boolean; decision: Decision | null; onDecided: (d: Decision) => Promise<void> }) {
  const [clauses, setClauses] = useState<Clause[] | null>(null);
  const [extracted, setExtracted] = useState<boolean | null>(null);
  const [i, setI] = useState(0);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pending = isPending(doc) && !decision;
  const own = Boolean(me && doc.uploaded_by_email && me.toLowerCase() === doc.uploaded_by_email.toLowerCase());

  useEffect(() => {
    if (!pending || !canApprove) return;
    let alive = true;
    agentFetch(`/api/knowledge/documents/${encodeURIComponent(doc.id)}/clauses`).then(({ body }) => { if (!alive) return; setClauses(body?.ok ? body.clauses : []); setExtracted(body?.ok ? Boolean(body.extracted) : false); });
    return () => { alive = false; };
  }, [doc.id, pending, canApprove]);

  const state = decision?.kind === "approved" || (!pending && doc.tier === "tier1" && (doc.status === "indexed" || doc.status === "approved")) ? "approved"
    : decision?.kind === "rejected" || (!pending && doc.status === "rejected") ? "rejected"
    : decision?.kind === "reference" || (!pending && doc.tier === "tier2") ? "reference" : "pending";
  const look = {
    pending: { border: cw.warningBorder, bg: cw.warningTint, icon: "shield-alert", color: cw.warningText, title: "Approval needed · authoritative tier" },
    approved: { border: cw.successBorder, bg: cw.successTint, icon: "shield-check", color: cw.successText, title: `Approved as authoritative · by ${doc.approved_by_email && me && doc.approved_by_email.toLowerCase() === me.toLowerCase() ? "you" : doc.approved_by_email ?? "an approver"}${doc.approved_at || decision?.at ? ` ${hmZ(decision?.at ?? doc.approved_at)}` : ""}${decision?.clauses != null ? ` · ${decision.clauses} clause${decision.clauses === 1 ? "" : "s"} now quotable` : ""}` },
    reference: { border: cw.border, bg: cw.bgPage, icon: "book-open", color: cw.textBody, title: "Added as reference only · agent will cite, not quote" },
    rejected: { border: cw.dangerBorder, bg: cw.dangerTint, icon: "x-circle", color: cw.dangerText, title: `Rejected${doc.uploaded_by_email ? ` · ${doc.uploaded_by_email} can see your note` : ""}` },
  }[state];
  const requestedTier = doc.proposed_tier === "tier1" ? "Authoritative" : "Reference";
  const shownTitle = state === "pending" && doc.proposed_tier !== "tier1" ? "Review · reference tier proposed" : look.title;

  async function decide(kind: Decision["kind"]) {
    if (busy) return; setBusy(kind); setError(null);
    try {
      if (kind === "rejected") {
        const { status, body } = await agentFetch(`/api/knowledge/documents/${encodeURIComponent(doc.id)}/reject`, { method: "POST", body: JSON.stringify({ reason: note.trim() }) });
        if (status !== 200 || !body?.ok) throw new ShownError(apiMessage(body, "The document was not rejected. Try again."));
        await onDecided({ kind, at: new Date().toISOString() });
      } else {
        const payload: Record<string, unknown> = { tier: kind === "approved" ? "tier1" : "tier2" };
        if (kind === "approved") payload.records = (clauses ?? []).map((c) => ({ reference: c.reference, title: doc.title, text: c.text }));
        const { status, body } = await agentFetch(`/api/knowledge/documents/${encodeURIComponent(doc.id)}/approve`, { method: "POST", body: JSON.stringify(payload) });
        if (status !== 200 || !body?.ok) throw new ShownError(apiMessage(body, "The document was not approved. Try again."));
        await onDecided({ kind, at: new Date().toISOString(), clauses: kind === "approved" ? body.records?.length ?? 0 : undefined });
      }
    } catch (e) { setError(shownText(e, "The decision was not saved. Check the connection and try again.")); } finally { setBusy(null); }
  }

  const n = clauses?.length ?? 0; const clause = clauses?.[i] ?? null;
  const approveDisabled = !canApprove || own || busy !== null || !clauses || n === 0;
  const approveTitle = !canApprove ? "Approving needs the developer role" : own ? "You uploaded this document — someone else must approve it" : !clauses || n === 0 ? "No clauses could be extracted to approve" : undefined;

  return (
    <aside aria-label="Approval" style={{ width: 440, flex: "none", background: cw.bgSurface, borderRadius: 14, border: `1.5px solid ${look.border}`, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: look.bg, borderBottom: `1px solid ${cw.divider}` }}>
        <Icon name={look.icon} size={15} color={look.color} />
        <span style={{ fontSize: 13.5, fontWeight: 700, flex: 1, minWidth: 0 }}>{shownTitle}</span>
        <span style={{ ...mono({ fontSize: 11.5 }), color: cw.textMuted }}>{doc.id.slice(0, 8).toUpperCase()}</span>
      </div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{doc.title}</div>
          <div style={{ fontSize: 12.5, color: cw.textMuted, marginTop: 2 }}>Uploaded by {doc.uploaded_by_email ?? "—"} · {dayTime(doc.created_at)} · requested tier {requestedTier}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", rowGap: 7, columnGap: 8, fontSize: 13 }}>
          <span style={{ color: cw.textMuted }}>Extracted</span><span>{clauses ? `${n} clause${n === 1 ? "" : "s"}${extracted === false ? " · no text could be read" : ""}` : canApprove && pending ? "…" : doc.proposed_reason ? proposalReason(doc.proposed_reason) : "—"}</span>
          <span style={{ color: cw.textMuted }}>Applies to</span><span style={mono({ fontSize: 12.5 })}>{doc.icao ?? doc.country ?? "—"}</span>
          {doc.fileMissing && <span style={{ gridColumn: "1 / -1" }}><MissingFile doc={doc} canFix={canApprove} onFixed={onDecided ? () => onDecided(decision as never) : undefined} /></span>}
          <span style={{ color: cw.textMuted }}>Revision</span><span><RevisionTag revision={doc.revision} showCurrent /></span>
          {doc.effective_date && <><span style={{ color: cw.textMuted }}>Effective</span><span style={mono({ fontSize: 12.5 })}>{dateShort(doc.effective_date)}</span></>}
          {doc.source && <><span style={{ color: cw.textMuted }}>Source</span><span>{doc.source}{doc.version ? ` · ${doc.version}` : ""}</span></>}
          <span style={{ color: cw.textMuted }}>File</span><span style={mono({ fontSize: 12.5 })}>{doc.filename}{doc.bytes ? ` · ${kb(doc.bytes)}` : ""}</span>
        </div>

        {pending && canApprove && clauses && n > 0 && (
          <div style={{ border: `1px solid ${cw.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: cw.bgPage, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}>
              <span style={{ flex: 1, minWidth: 0 }}>CHECK THE EXTRACTED TEXT — CLAUSE {all ? "ALL" : `${i + 1} OF ${n}`}</span>
              {!all && <span style={{ display: "inline-flex", gap: 2, flex: "none" }}><IconButton icon="arrow-left" title="Previous clause" size={24} iconSize={13} disabled={i === 0} onClick={() => setI((x) => x - 1)} /><IconButton icon="arrow-right" title="Next clause" size={24} iconSize={13} disabled={i >= n - 1} onClick={() => setI((x) => x + 1)} /></span>}
            </div>
            <div style={{ padding: "10px 12px", fontSize: 13.5, lineHeight: 1.6, maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
              {(all ? clauses : clause ? [clause] : []).map((c, k) => <div key={k} style={{ whiteSpace: "pre-wrap" }}>{c.text}</div>)}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: `1px solid ${cw.divider}`, fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: cw.successText, flex: 1 }}>Extracted from {doc.filename}</span>
              <button type="button" onClick={() => setAll((v) => !v)} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: cw.textLink, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>{all ? "One at a time" : `Compare all ${n}`}</button>
            </div>
          </div>
        )}
        {pending && canApprove && clauses && n === 0 && <div style={{ fontSize: 13, color: cw.dangerText }}>No text could be extracted, so nothing can enter the authoritative tier from this file. Reference indexing also needs text.</div>}
        {pending && !canApprove && <div style={{ fontSize: 12.5, color: cw.textMuted }}>Waiting for an approver. Approving needs the developer role.</div>}

        {pending && <div style={{ fontSize: 12.5, lineHeight: 1.5, color: cw.textMuted }}>Approving puts these clauses in the verbatim tier: the agent will quote them exactly and cite you as approver. The uploader can&apos;t approve their own document.</div>}
        {error && <div role="alert" style={{ fontSize: 13, color: cw.dangerText }}>{error}</div>}

        {pending && !rejecting && (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={approveDisabled} title={approveTitle} onClick={() => void decide("approved")} className="ag-focus"
              style={{ flex: 1, fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: cw.onInk, background: cw.ink, padding: "10px 14px", borderRadius: 9, border: "none", cursor: approveDisabled ? "not-allowed" : "pointer", opacity: approveDisabled ? 0.4 : 1 }}>
              {busy === "approved" ? "Approving…" : "Approve as authoritative"}
            </button>
            <Button variant="secondary" size="md" disabled={!canApprove || busy !== null} spinning={busy === "reference"} onClick={() => void decide("reference")}>Reference only</Button>
            <button type="button" disabled={!canApprove || busy !== null} onClick={() => setRejecting(true)} className="ag-focus" style={{ fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: cw.dangerText, background: cw.dangerTint, padding: "10px 14px", borderRadius: 9, border: "none", cursor: canApprove ? "pointer" : "not-allowed" }}>Reject</button>
          </div>
        )}
        {pending && rejecting && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <FieldLabel>Note to the uploader</FieldLabel>
            <TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this must not be used — recorded in the activity log" />
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="destructive" size="md" disabled={!note.trim() || busy !== null} spinning={busy === "rejected"} onClick={() => void decide("rejected")}>Reject with note</Button>
              <Button variant="ghost" size="md" onClick={() => setRejecting(false)}>Back</Button>
            </div>
          </div>
        )}
        {!pending && (
          <div style={{ background: cw.bgPage, border: `1px solid ${cw.border}`, borderRadius: 9, padding: "10px 12px", fontSize: 13 }}>{look.title}{state === "rejected" && doc.rejected_reason ? <div style={{ color: cw.textMuted, marginTop: 4 }}>“{doc.rejected_reason}”</div> : null}</div>
        )}
        {!pending && <div><IconTile icon="download" fg={cw.textMuted} bg={cw.bgSunken} /> <a href={`${AGENT_BASE}/api/knowledge/documents/${encodeURIComponent(doc.id)}/file`} style={{ fontSize: 12.5, color: cw.textLink, verticalAlign: "middle", marginLeft: 6 }}>Original file</a></div>}
      </div>
    </aside>
  );
}

/** Upload (§10 says the flow is not drawn; this is the console form that already existed, kept as the spec default). */
function UploadCard({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(""); const [source, setSource] = useState(""); const [version, setVersion] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(""); const [country, setCountry] = useState(""); const [icao, setIcao] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  async function upload() {
    if (!file || busy) return; setBusy(true); setError(null); setProgress(0);
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error("Files are limited to 100 MB.");
      const q = new URLSearchParams({ name: file.name, title: title.trim() || file.name });
      for (const [k, v] of [["source", source.trim()], ["version", version.trim()], ["effectiveDate", effectiveDate], ["country", country.trim()], ["icao", icao.trim().toUpperCase()]] as const) if (v) q.set(k, v);
      // Raw body with progress — a manual-sized PDF never fits a JSON body.
      const { status, body } = await new Promise<{ status: number; body: { ok?: boolean; message?: string; proposal?: { tier: string; confidence?: number | null; reason: string } | null } | null }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${AGENT_BASE}/api/knowledge/documents?${q.toString()}`);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.withCredentials = true;
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => { let parsed = null; try { parsed = JSON.parse(xhr.responseText); } catch { parsed = null; } resolve({ status: xhr.status, body: parsed }); };
        xhr.onerror = () => reject(new ShownError("The upload failed — check the connection and try again."));
        xhr.send(file);
      });
      if (status !== 200 || !body?.ok) throw new ShownError(apiMessage(body, "The upload failed. Try again."));
      const p = body.proposal;
      setNotice(p ? `Uploaded. Proposed ${p.tier === "tier1" ? "authoritative" : "reference"}${p.confidence != null ? ` at ${Math.round(p.confidence * 100)}% confidence` : ""}: ${proposalReason(p.reason)}` : "Uploaded. Text could not be extracted automatically — review before approving.");
      await onDone();
    } catch (e) { setError(shownText(e, "The upload failed. Try again.")); } finally { setBusy(false); setProgress(null); }
  }
  return (
    <div style={{ background: cw.bgSurface, border: `1px solid ${cw.border}`, borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14.5, fontWeight: 700 }}>Upload a document</div>
      <div style={{ fontSize: 12.5, color: cw.textMuted, lineHeight: 1.5 }}>Text, Markdown, CSV or JSON is classified automatically and proposes a tier. Anything else is stored and waits for an approver to read it. The original is always kept. Up to 100 MB.</div>
      {progress !== null && <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} style={{ height: 6, borderRadius: 999, background: cw.bgHover, overflow: "hidden" }}><div style={{ width: `${progress}%`, height: "100%", background: cw.primary, transition: "width 120ms linear" }} /></div>}
      {notice && <div style={{ fontSize: 13, color: cw.successText }}>{notice}</div>}
      {error && <div role="alert" style={{ fontSize: 13, color: cw.dangerText }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <FieldLabel>File</FieldLabel>
          <label style={{ display: "flex", alignItems: "center", gap: 10, border: `1px dashed ${cw.borderControl}`, borderRadius: 9, padding: "10px 12px", cursor: "pointer", fontSize: 13 }}>
            <input type="file" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, "")); }} />
            <span style={{ fontWeight: 600, color: cw.textLink }}>{progress !== null ? `Uploading ${progress}%` : "Choose file"}</span>
            <span style={{ color: file ? cw.text : cw.textMuted }}>{file ? `${file.name} · ${kb(file.size)}` : "no file chosen"}</span>
          </label>
        </div>
        <div><FieldLabel>Title</FieldLabel><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ground Handling Manual" /></div>
        <div><FieldLabel>Source</FieldLabel><TextInput value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. airBaltic OM-A" /></div>
        <div><FieldLabel>Version</FieldLabel><TextInput value={version} onChange={(e) => setVersion(e.target.value)} placeholder="optional" /></div>
        <div><FieldLabel>Effective date</FieldLabel><DateField value={effectiveDate} onChange={setEffectiveDate} placeholder="Optional" label="Effective date" /></div>
        <div><FieldLabel>Country</FieldLabel><TextInput value={country} onChange={(e) => setCountry(e.target.value)} placeholder="optional" /></div>
        <div><FieldLabel>ICAO</FieldLabel><TextInput mono value={icao} onChange={(e) => setIcao(e.target.value.toUpperCase())} placeholder="optional" maxLength={4} /></div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="primary" size="md" spinning={busy} disabled={busy || !file} onClick={() => void upload()}>Upload and classify</Button>
        <Button variant="ghost" size="md" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

/** The record exists but its bytes are not in storage (§15): say so, and let a developer put the file back. */
function MissingFile({ doc, canFix, onFixed }: { doc: Doc; canFix: boolean; onFixed?: () => void }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<{ busy: boolean; message: string | null; error: boolean }>({ busy: false, message: null, error: false });
  async function upload(file: File) {
    setState({ busy: true, message: null, error: false });
    try {
      const r = await fetch(`${AGENT_BASE}/api/knowledge/documents/${encodeURIComponent(doc.id)}/file`, { method: "PUT", credentials: "same-origin", headers: { "content-type": file.type || "application/octet-stream" }, body: file });
      const b = await r.json().catch(() => null);
      if (!r.ok || !b?.ok) { setState({ busy: false, message: apiMessage(b, "The file could not be restored. Try again."), error: true }); return; }
      setState({ busy: false, message: apiMessage(b, "File restored."), error: !b.sameContent });
      onFixed?.();
    } catch { setState({ busy: false, message: "The file could not be uploaded — check the connection and try again.", error: true }); }
  }
  return (
    <div role="alert" style={{ display: "flex", flexDirection: "column", gap: 6, background: cw.dangerTint, border: `1px solid ${cw.dangerBorder}`, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: cw.textBody }}>
      <span><b style={{ color: cw.dangerText }}>File missing.</b> The record is here but its file is not in storage, so it cannot be opened or downloaded. The approved clauses still show, but they cannot be checked against the source until the file is back.</span>
      {canFix ? (
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input ref={input} type="file" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
          <Button variant="secondary" size="xs" icon="upload" disabled={state.busy} onClick={() => input.current?.click()}>{state.busy ? "Uploading…" : `Re-upload ${doc.filename}`}</Button>
          {state.message && <span style={{ color: state.error ? cw.dangerText : cw.successText }}>{state.message}</span>}
        </span>
      ) : <span style={{ color: cw.textMuted }}>Ask a developer to re-upload it.</span>}
    </div>
  );
}
