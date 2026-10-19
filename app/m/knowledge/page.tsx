"use client";

// The knowledge base on a phone (Tier 2 › list that opens a detail): read what the agent knows. Documents with their
// status; the detail shows the record and opens the file. Approving and rejecting are developer actions
// (agent.kb.approve) and are offered to developers for documents awaiting approval; uploads stay on a desk.
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useIdentity } from "@/components/portal/Shell";
import { usePhonePage } from "@/components/m/chrome";
import { InputSheet } from "@/components/m/pick";
import { MError } from "@/components/m/ui";
import { T2Chips, T2Detail, T2Groups, T2Page, type Tone } from "@/components/m/tier2";
import { AGENT_BASE } from "@/components/agent/types";
import { agentUrl, dayTime, getJson, matches, useAction, useResource } from "@/lib/m/t2";

type Doc = { id: string; title?: string; filename?: string; mime?: string; bytes?: number; source?: string; version?: string; effective_date?: string | null; country?: string | null; icao?: string | null; tier?: string | null; proposed_tier?: string | null; proposed_reason?: string | null; status: string; uploaded_by_email?: string | null; approved_by_email?: string | null; approved_at?: string | null; rejected_reason?: string | null; created_at?: string; updated_at?: string };
const STATUS: Record<string, { label: string; tone: Tone }> = { uploaded: { label: "Uploaded", tone: "neutral" }, classified: { label: "Classified", tone: "neutral" }, awaiting_approval: { label: "Awaiting approval", tone: "warn" }, approved: { label: "Approved", tone: "ok" }, indexed: { label: "Indexed", tone: "ok" }, rejected: { label: "Rejected", tone: "bad" }, failed: { label: "Failed", tone: "bad" } };
const kb = (bytes?: number) => (bytes ? `${Math.max(1, Math.round(bytes / 1024))} KB` : "");

export default function KnowledgePhonePage() {
  const search = useSearchParams(); const router = useRouter();
  const openId = search.get("id");
  const { isDeveloper, email } = useIdentity();
  const r = useResource<{ documents?: Doc[] }>(agentUrl("/knowledge/documents"), { fallback: "The agent did not answer." });
  const act = useAction("The agent did not accept that. Try again.");
  const [filter, setFilter] = useState<"all" | "waiting" | "live" | "failed">("all");
  const [rejecting, setRejecting] = useState(false);
  const docs = useMemo(() => (r.data?.documents ?? []).slice().sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "")), [r.data]);
  const picked = openId ? docs.find((d) => d.id === openId) : null;
  usePhonePage({ title: picked ? "Document" : "Knowledge base", subtitle: picked ? (STATUS[picked.status]?.label ?? picked.status) : docs.length ? `${docs.length} documents` : null, back: picked ? () => router.replace("/m/knowledge") : null, tab: "agent", tabs: !picked });
  const waiting = docs.filter((d) => d.status === "awaiting_approval"), live = docs.filter((d) => d.status === "indexed" || d.status === "approved"), failed = docs.filter((d) => d.status === "failed" || d.status === "rejected");
  const shown = filter === "waiting" ? waiting : filter === "live" ? live : filter === "failed" ? failed : docs;
  const approve = (d: Doc) => act.run("approve", async () => { await getJson(agentUrl(`/knowledge/documents/${encodeURIComponent(d.id)}/approve`), { json: { tier: d.proposed_tier ?? d.tier ?? "tier2" } }); await r.reload(); });
  const reject = (d: Doc, reason: string) => act.run("reject", async () => { await getJson(agentUrl(`/knowledge/documents/${encodeURIComponent(d.id)}/reject`), { json: { reason } }); setRejecting(false); await r.reload(); });

  if (picked) { const own = Boolean(email && picked.uploaded_by_email && email.toLowerCase() === picked.uploaded_by_email.toLowerCase()); const canDecide = isDeveloper && picked.status === "awaiting_approval" && !own; return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      {act.failed && <MError title="Not done." icon="library" onRetry={act.clear}>{act.failed}</MError>}
      <T2Detail title={picked.title || picked.filename || picked.id} rows={[{ k: "Status", v: STATUS[picked.status]?.label ?? picked.status }, { k: "File", v: `${picked.filename ?? "—"}${picked.bytes ? ` · ${kb(picked.bytes)}` : ""}`, mono: true }, { k: "Tier", v: picked.tier ? (picked.tier === "tier1" ? "Authoritative" : "Reference") : picked.proposed_tier ? `Proposed: ${picked.proposed_tier === "tier1" ? "authoritative" : "reference"}${picked.proposed_reason ? ` — ${picked.proposed_reason}` : ""}` : "—" }, ...(picked.country || picked.icao ? [{ k: "Covers", v: [picked.icao, picked.country].filter(Boolean).join(" · "), mono: true }] : []), ...(picked.effective_date ? [{ k: "Effective", v: picked.effective_date, mono: true }] : []), { k: "Uploaded", v: `${picked.uploaded_by_email ?? "—"} · ${dayTime(picked.created_at)}` }, ...(picked.approved_at ? [{ k: "Approved", v: `${picked.approved_by_email ?? "—"} · ${dayTime(picked.approved_at)}` }] : []), ...(picked.rejected_reason ? [{ k: "Rejected because", v: picked.rejected_reason }] : [])]}
        actions={[{ label: "Open the file", href: `${AGENT_BASE}/api/knowledge/documents/${encodeURIComponent(picked.id)}/file` }, ...(canDecide ? [{ label: "Approve", kind: "primary" as const, onClick: () => void approve(picked), busy: act.busy === "approve", disabled: act.busy !== null }, { label: "Reject", kind: "danger" as const, onClick: () => setRejecting(true), disabled: act.busy !== null }] : [])]} />
      {isDeveloper && picked.status === "awaiting_approval" && own && <span className="px-0.5 text-[13px] text-cw-text-muted">You uploaded this one, so someone else approves it.</span>}
      <InputSheet open={rejecting} onClose={() => setRejecting(false)} title="Reject this document" label="Why (shown to whoever uploaded it)" value="" onSave={(v) => void reject(picked, v)} busy={act.busy === "reject"} failed={act.failed} saveLabel="Reject" />
    </div>
  ); }
  return (
    <T2Page loading={r.loading && !r.data} error={r.error} stale={Boolean(r.data)} empty={docs.length === 0} emptyCopy={["No documents", "Documents uploaded to the agent on a desk appear here."]} errorCopy={["Couldn’t load the knowledge base", "Try again in a moment."]} onRetry={r.reload}
      top={<T2Chips value={filter} onChange={setFilter} chips={[{ k: "all", label: "All", n: docs.length }, { k: "waiting", label: "Waiting", n: waiting.length }, { k: "live", label: "Live", n: live.length }, { k: "failed", label: "Failed", n: failed.length }]} />}>
      <T2Groups groups={[{ h: filter === "waiting" ? "AWAITING APPROVAL" : "DOCUMENTS", count: shown.length, rows: shown.filter((d) => matches("", d.title)).map((d) => ({ key: d.id, title: d.title || d.filename || d.id, sub: [d.icao ?? d.country, d.tier ? (d.tier === "tier1" ? "authoritative" : "reference") : null, d.uploaded_by_email, dayTime(d.updated_at ?? d.created_at)].filter(Boolean).join(" · "), badge: [STATUS[d.status]?.label ?? d.status, STATUS[d.status]?.tone ?? "neutral"], href: `/m/knowledge?id=${encodeURIComponent(d.id)}` })) }]} />
    </T2Page>
  );
}
