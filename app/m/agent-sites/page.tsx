"use client";

// Agent sites on a phone (Tier 2 › list): approve or revoke a site the agent asked to read. Requests on top with
// Review; the detail says who asked and why, and offers Approve / Decline — or Revoke for an approved site. All are
// agent.extension.sites (admins). Adding a site by hand stays on a desk.
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePhonePage } from "@/components/m/chrome";
import { MError } from "@/components/m/ui";
import { T2Detail, T2Groups, T2Page } from "@/components/m/tier2";
import { agentUrl, dayTime, getJson, useAction, useResource } from "@/lib/m/t2";

type Approved = { host: string; includeSubdomains?: boolean; approvedBy?: string | null; approvedAt?: string | null; note?: string | null };
type Request = { id: string; host: string; includeSubdomains?: boolean; reason?: string | null; status: "pending" | "approved" | "declined"; requestedBy?: string | null; requestedByName?: string | null; requestedAt?: string | null; decidedBy?: string | null; decidedAt?: string | null; note?: string | null };

export default function AgentSitesPhonePage() {
  const search = useSearchParams(); const router = useRouter();
  const openReq = search.get("req"); const openHost = search.get("host");
  const r = useResource<{ approved?: Approved[]; requests?: Request[] }>(agentUrl("/extension/sites/admin"), { fallback: "The agent did not answer." });
  const act = useAction("The agent did not accept that. Try again.");
  const pending = useMemo(() => (r.data?.requests ?? []).filter((q) => q.status === "pending"), [r.data]);
  const approved = useMemo(() => (r.data?.approved ?? []).slice().sort((a, b) => a.host.localeCompare(b.host)), [r.data]);
  const req = openReq ? (r.data?.requests ?? []).find((q) => q.id === openReq) : null;
  const site = openHost ? approved.find((a) => a.host === openHost) : null;
  usePhonePage({ title: req ? req.host : site ? site.host : "Agent sites", subtitle: req ? "Asked to read" : site ? "Approved" : pending.length ? `${pending.length} waiting` : null, mono: Boolean(req || site), back: req || site ? () => router.replace("/m/agent-sites") : null, tab: "more", tabs: !req && !site });
  const decide = (q: Request, decision: "approve" | "decline") => act.run(decision, async () => { await getJson(agentUrl("/extension/sites/decide"), { json: { id: q.id, decision, includeSubdomains: Boolean(q.includeSubdomains) } }); await r.reload(); router.replace("/m/agent-sites"); });
  const revoke = (host: string) => act.run("revoke", async () => { await getJson(agentUrl("/extension/sites/revoke"), { json: { host } }); await r.reload(); router.replace("/m/agent-sites"); });
  if (r.status === 401 || r.status === 403) return <MError title="Agent sites is for admins" icon="globe">The agent asks an admin before it opens a new site.</MError>;

  if (req) return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      {act.failed && <MError title="Not done." icon="globe" onRetry={act.clear}>{act.failed}</MError>}
      <T2Detail title={req.host} mono rows={[{ k: "Asked by", v: `${req.requestedByName || req.requestedBy || "the agent"} · ${dayTime(req.requestedAt)}` }, { k: "Why", v: req.reason || "No reason given" }, { k: "Scope", v: req.includeSubdomains ? "This host and its subdomains" : "This host only" }, { k: "Status", v: req.status === "pending" ? "Waiting for a decision" : `${req.status}${req.decidedBy ? ` · ${req.decidedBy} · ${dayTime(req.decidedAt)}` : ""}` }]}
        actions={req.status === "pending" ? [{ label: "Approve", kind: "primary", onClick: () => void decide(req, "approve"), busy: act.busy === "approve", disabled: act.busy !== null }, { label: "Decline", kind: "danger", onClick: () => void decide(req, "decline"), busy: act.busy === "decline", disabled: act.busy !== null }] : []} />
      <span className="px-0.5 text-[13px] leading-normal text-cw-text-muted">Approving lets the agent read pages on this site when someone asks it to. It never writes to a site.</span>
    </div>
  );
  if (site) return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      {act.failed && <MError title="Not done." icon="globe" onRetry={act.clear}>{act.failed}</MError>}
      <T2Detail title={site.host} mono rows={[{ k: "Approved", v: `${site.approvedBy || "—"} · ${dayTime(site.approvedAt)}` }, { k: "Scope", v: site.includeSubdomains ? "This host and its subdomains" : "This host only" }, ...(site.note ? [{ k: "Note", v: site.note }] : [])]}
        actions={[{ label: "Revoke access", kind: "danger", onClick: () => void revoke(site.host), busy: act.busy === "revoke", disabled: act.busy !== null }]} />
    </div>
  );
  return (
    <T2Page loading={r.loading && !r.data} error={r.error} stale={Boolean(r.data)} empty={pending.length === 0 && approved.length === 0} emptyCopy={["No sites", "The agent asks before it opens a new site; requests appear here."]} errorCopy={["Couldn’t load sites", "The agent keeps its current access."]} onRetry={r.reload}>
      <T2Groups groups={[
        { h: "WAITING", count: pending.length, tone: pending.length ? "warning" : undefined, rows: pending.map((q) => ({ key: q.id, title: q.host, mono: true, sub: `${q.requestedByName || q.requestedBy || "the agent"} · ${q.reason || "no reason given"}`, action: { label: "Review", href: `/m/agent-sites?req=${encodeURIComponent(q.id)}` } })) },
        { h: "APPROVED", count: approved.length, rows: approved.map((a) => ({ key: a.host, title: a.host, mono: true, sub: `${a.includeSubdomains ? "With subdomains · " : ""}since ${dayTime(a.approvedAt)}`, href: `/m/agent-sites?host=${encodeURIComponent(a.host)}` })) },
      ]} />
    </T2Page>
  );
}
