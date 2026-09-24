"use client";

// Agent knowledge base — upload, the proposed tier, and the Tier-1 approval
// queue. Developer-only, like agent access.
//
// Until this page existed, Tier 1 could only be fed by a developer running a
// script against the agent's API. The rule it enforces is the one the brief
// insists on: nothing enters the verbatim tier without a person reading the
// exact records and approving them by name. Tier 2 is a single click; Tier 1
// is a form where every record's text is in front of the approver.
//
// Built on components/console-kit — no browser-default controls — and it
// talks to the agent service directly under /agent/api, which cloudflared
// routes to the container with the user's own session cookie.

import { useCallback, useEffect, useState } from "react";
import PortalShell from "@/components/portal/Shell";
import {
  Button, Card, ConfirmDialog, ConsoleStyles, EmptyState, ErrorBanner, FieldLabel,
  InfoBanner, LoadingRows, ReasonDialog, StatusPill, TextArea, TextInput, t,
} from "@/components/console-kit";

const AGENT_BASE = process.env.NEXT_PUBLIC_AGENT_BASE_URL || "/agent";

type DocumentRow = {
  id: string;
  title: string;
  filename: string;
  mime: string | null;
  bytes: number | null;
  source: string | null;
  version: string | null;
  effective_date: string | null;
  country: string | null;
  icao: string | null;
  tier: "tier1" | "tier2" | null;
  proposed_tier: "tier1" | "tier2" | null;
  proposed_reason: string | null;
  status: "uploaded" | "classified" | "awaiting_approval" | "approved" | "rejected" | "indexed" | "failed";
  uploaded_by_email: string | null;
  approved_by_email: string | null;
  created_at: string;
};

type Tier1Record = { reference: string; title: string; text: string };

const STATUS: Record<DocumentRow["status"], { label: string; color: string; bg: string }> = {
  uploaded: { label: "Uploaded", color: "#475569", bg: "#eef1f5" },
  classified: { label: "Classified", color: "#475569", bg: "#eef1f5" },
  awaiting_approval: { label: "Awaiting approval", color: "#b45309", bg: "#fef3e2" },
  approved: { label: "Approved", color: "#15803d", bg: "#e7f6ec" },
  indexed: { label: "Indexed", color: "#15803d", bg: "#e7f6ec" },
  rejected: { label: "Rejected", color: "#b42318", bg: "#fdf2f2" },
  failed: { label: "Failed", color: "#b42318", bg: "#fdf2f2" },
};

function when(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

async function agentFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${AGENT_BASE}${path}`, { credentials: "same-origin", cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export default function KnowledgeAdmin() {
  const [rows, setRows] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Upload form
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [version, setVersion] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [country, setCountry] = useState("");
  const [icao, setIcao] = useState("");

  // Approval
  const [approving, setApproving] = useState<DocumentRow | null>(null);
  const [approveTier, setApproveTier] = useState<"tier1" | "tier2">("tier2");
  const [records, setRecords] = useState<Tier1Record[]>([{ reference: "", title: "", text: "" }]);
  const [rejecting, setRejecting] = useState<DocumentRow | null>(null);

  const load = useCallback(async () => {
    const { status, body } = await agentFetch("/api/knowledge/documents");
    if (status === 403 || status === 401) { setForbidden(true); setRows([]); return; }
    if (status !== 200 || !body?.ok) { setError(body?.message || `Could not load documents (HTTP ${status}).`); setRows([]); return; }
    setRows(body.documents ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function upload() {
    if (!file || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const contentBase64 = toBase64(await file.arrayBuffer());
      const { status, body } = await agentFetch("/api/knowledge/documents", {
        method: "POST",
        body: JSON.stringify({
          filename: file.name, mime: file.type || null, contentBase64,
          title: title.trim() || file.name, source: source.trim() || null, version: version.trim() || null,
          effectiveDate: effectiveDate || null, country: country.trim() || null, icao: icao.trim().toUpperCase() || null,
        }),
      });
      if (status !== 200 || !body?.ok) throw new Error(body?.message || `Upload failed (HTTP ${status}).`);
      const proposal = body.proposal;
      setNotice(proposal
        ? `Uploaded. Proposed ${proposal.tier === "tier1" ? "Tier 1 (verbatim)" : "Tier 2 (reference)"}${proposal.confidence != null ? ` at ${Math.round(proposal.confidence * 100)}% confidence` : ""}: ${proposal.reason}`
        : "Uploaded. Text could not be extracted automatically — review before approving.");
      setFile(null); setTitle(""); setSource(""); setVersion(""); setEffectiveDate(""); setCountry(""); setIcao("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function openApproval(row: DocumentRow) {
    setApproving(row);
    setApproveTier(row.proposed_tier ?? "tier2");
    setRecords([{ reference: "", title: row.title, text: "" }]);
  }

  async function approve() {
    if (!approving || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const payload: Record<string, unknown> = { tier: approveTier };
      if (approveTier === "tier1") {
        const clean = records.map((r) => ({ reference: r.reference.trim(), title: r.title.trim(), text: r.text.trim() })).filter((r) => r.text);
        if (clean.length === 0) throw new Error("Tier 1 approval needs at least one record with its exact text.");
        if (clean.some((r) => !r.reference || !r.title)) throw new Error("Every Tier 1 record needs a reference and a title.");
        payload.records = clean;
      }
      const { status, body } = await agentFetch(`/api/knowledge/documents/${encodeURIComponent(approving.id)}/approve`, { method: "POST", body: JSON.stringify(payload) });
      if (status !== 200 || !body?.ok) throw new Error(body?.message || `Approval failed (HTTP ${status}).`);
      setNotice(approveTier === "tier1"
        ? `Approved ${body.records?.length ?? 0} verbatim record(s) under your name.`
        : `Approved as reference material — ${body.chunks ?? 0} chunk(s) indexed.`);
      setApproving(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function reject(reason: string) {
    if (!rejecting) return;
    setBusy(true); setError(null);
    try {
      const { status, body } = await agentFetch(`/api/knowledge/documents/${encodeURIComponent(rejecting.id)}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
      if (status !== 200 || !body?.ok) throw new Error(body?.message || `Reject failed (HTTP ${status}).`);
      setRejecting(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const queue = (rows ?? []).filter((r) => r.status === "awaiting_approval" || r.status === "classified" || r.status === "uploaded");
  const rest = (rows ?? []).filter((r) => !queue.includes(r));

  return (
    <PortalShell crumb="Developer" title="Agent knowledge" subtitle="What the agent may quote, and what it may only reference. Nothing reaches the verbatim tier without a named approver.">
      <ConsoleStyles />
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "24px 30px", display: "flex", flexDirection: "column", gap: 18 }}>
        {forbidden && <ErrorBanner>Developer role required. This page manages what the agent is allowed to quote.</ErrorBanner>}
        {error && <ErrorBanner>{error}</ErrorBanner>}
        {notice && <InfoBanner>{notice}</InfoBanner>}

        {!forbidden && (
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>Upload a document</div>
              <div style={{ fontSize: 12.5, color: t.muted, lineHeight: 1.5 }}>
                Text, Markdown, CSV or JSON is classified automatically and proposes a tier. Anything else is stored and waits for you to read it. The original is always kept.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <FieldLabel>File</FieldLabel>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, border: `1px dashed ${t.border}`, borderRadius: 9, padding: "10px 12px", cursor: "pointer", fontSize: 13 }}>
                    <input type="file" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, "")); }} />
                    <span style={{ fontWeight: 600, color: t.blue }}>Choose file</span>
                    <span style={{ color: file ? t.ink : t.faint }}>{file ? `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB` : "no file chosen"}</span>
                  </label>
                </div>
                <div><FieldLabel>Title</FieldLabel><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ground Handling Manual" /></div>
                <div><FieldLabel>Source</FieldLabel><TextInput value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. airBaltic OM-A" /></div>
                <div><FieldLabel>Version</FieldLabel><TextInput value={version} onChange={(e) => setVersion(e.target.value)} placeholder="optional" /></div>
                <div><FieldLabel>Effective date</FieldLabel><TextInput type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></div>
                <div><FieldLabel>Country</FieldLabel><TextInput value={country} onChange={(e) => setCountry(e.target.value)} placeholder="optional" /></div>
                <div><FieldLabel>ICAO</FieldLabel><TextInput mono value={icao} onChange={(e) => setIcao(e.target.value.toUpperCase())} placeholder="optional" maxLength={4} /></div>
              </div>
              <div>
                <Button variant="primary" spin={busy} disabled={busy || !file} onClick={() => void upload()}>Upload and classify</Button>
              </div>
            </div>
          </Card>
        )}

        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: t.faint }}>APPROVAL QUEUE · {queue.length}</div>
        {rows === null && <LoadingRows rows={3} />}
        {rows !== null && queue.length === 0 && <EmptyState title="Nothing waiting">Every uploaded document has been approved or rejected.</EmptyState>}
        {queue.map((row) => (
          <Card key={row.id}>
            <DocumentLine row={row} />
            <div style={{ fontSize: 12.5, color: t.body, marginTop: 6 }}>
              Proposed <strong>{row.proposed_tier === "tier1" ? "Tier 1 — verbatim" : "Tier 2 — reference"}</strong>{row.proposed_reason ? ` — ${row.proposed_reason}` : ""}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Button variant="primary" size="sm" disabled={busy} onClick={() => openApproval(row)}>Review and approve</Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRejecting(row)} style={{ color: t.muted }}>Reject</Button>
            </div>
          </Card>
        ))}

        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: t.faint, marginTop: 8 }}>ALL DOCUMENTS · {rest.length}</div>
        {rows !== null && rest.length === 0 && <EmptyState title="No documents yet">Upload the first one above.</EmptyState>}
        {rest.map((row) => (
          <Card key={row.id}><DocumentLine row={row} /></Card>
        ))}
      </div>

      {approving && (
        <ConfirmDialog
          open={Boolean(approving)}
          title={`Approve "${approving.title}"`}
          confirmLabel={approveTier === "tier1" ? "Approve these records verbatim" : "Approve as reference"}
          danger={false}
          busy={busy}
          onCancel={() => setApproving(null)}
          onConfirm={() => void approve()}
          body={
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 520 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {(["tier2", "tier1"] as const).map((tier) => (
                <button
                  key={tier}
                  onClick={() => setApproveTier(tier)}
                  style={{
                    flex: 1, textAlign: "left", cursor: "pointer", borderRadius: 10, padding: "10px 12px", fontFamily: "inherit",
                    border: `1.5px solid ${approveTier === tier ? t.blue : t.border}`, background: approveTier === tier ? "#eef4ff" : "#fff",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{tier === "tier1" ? "Tier 1 — verbatim" : "Tier 2 — reference"}</div>
                  <div style={{ fontSize: 12, color: t.muted, lineHeight: 1.45, marginTop: 2 }}>
                    {tier === "tier1"
                      ? "Quoted word for word, never paraphrased. You approve each record's exact text under your name."
                      : "Indexed for search; the agent may synthesise across it and must cite it."}
                  </div>
                </button>
              ))}
            </div>
            {approveTier === "tier1" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 12.5, color: t.body, lineHeight: 1.5 }}>
                  Paste each rule <strong>exactly as written</strong> in the document. This text is what a dispatcher will be shown as authoritative.
                </div>
                {records.map((r, i) => (
                  <div key={i} style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
                      <div><FieldLabel>Reference</FieldLabel><TextInput mono value={r.reference} onChange={(e) => setRecords((list) => list.map((x, j) => (j === i ? { ...x, reference: e.target.value } : x)))} placeholder="e.g. OM-A 8.3.2" /></div>
                      <div><FieldLabel>Title</FieldLabel><TextInput value={r.title} onChange={(e) => setRecords((list) => list.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} /></div>
                    </div>
                    <div><FieldLabel>Exact text</FieldLabel><TextArea rows={4} value={r.text} onChange={(e) => setRecords((list) => list.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} /></div>
                    {records.length > 1 && (
                      <div><Button variant="ghost" size="sm" onClick={() => setRecords((list) => list.filter((_, j) => j !== i))} style={{ color: t.muted }}>Remove record</Button></div>
                    )}
                  </div>
                ))}
                <div><Button variant="ghost" size="sm" onClick={() => setRecords((list) => [...list, { reference: "", title: approving.title, text: "" }])}>Add another record</Button></div>
              </div>
            )}
          </div>
          }
        />
      )}

      {rejecting && (
        <ReasonDialog
          open={Boolean(rejecting)}
          title={`Reject "${rejecting.title}"`}
          label="Reason"
          confirmLabel="Reject"
          placeholder="Why this must not be used — recorded in the audit log"
          busy={busy}
          onCancel={() => setRejecting(null)}
          onConfirm={(reason) => void reject(reason)}
        />
      )}
    </PortalShell>
  );
}

function DocumentLine({ row }: { row: DocumentRow }) {
  const s = STATUS[row.status] ?? STATUS.uploaded;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</div>
        <div style={{ fontSize: 12, color: t.faint }}>
          {[row.filename, row.source, row.version, row.icao, row.country, `uploaded ${when(row.created_at)}${row.uploaded_by_email ? ` by ${row.uploaded_by_email}` : ""}`, row.approved_by_email ? `approved by ${row.approved_by_email}` : null].filter(Boolean).join(" · ")}
        </div>
      </div>
      {row.tier && <StatusPill color={row.tier === "tier1" ? "#6d28d9" : "#1d4ed8"} bg={row.tier === "tier1" ? "#ede9fe" : "#dbeafe"}>{row.tier === "tier1" ? "VERBATIM" : "REFERENCE"}</StatusPill>}
      <StatusPill color={s.color} bg={s.bg}>{s.label}</StatusPill>
    </div>
  );
}
