"use client";

// Admin → Agent sites (portal redesign, stage 3 — "Page Agent Sites"; spec addendum §E12 S4/S4b, §E14 item 8): the
// organisation's site list for the Clearway Ops Agent Chrome extension. Requests waiting for a decision — each with a
// scope choice, this host only or host and subdomains, which may differ from what was asked — the approved list
// (revoke, add) and the decision log. Data comes from the agent service, which enforces the admin check itself.

import { useCallback, useEffect, useState } from "react";
import PortalShell from "@/components/portal/Shell";
import MaskIcon from "@/components/portal/Icon";
import { Badge, Button, Card, Checkbox, ConfirmDialog, CountBadge, DataTable, EmptyState, ErrorState, Modal, RadioGroup, SkeletonRows, TableCard, TextArea, TextInput, errorDetail, useToast, type Column } from "@/components/kit";
import { dayTimeZ } from "@/lib/time";
import { personText } from "@/components/agent/ui/errorText";
import { ShownError, TRY_AGAIN, shownText } from "@/lib/error-text";

const AGENT_BASE = process.env.NEXT_PUBLIC_AGENT_BASE_URL || "/agent";

type Site = { host: string; includeSubdomains: boolean; approvedBy: string | null; approvedAt: string | null; note: string | null };
type SiteRequest = { id: string; host: string; includeSubdomains: boolean; grantedSubdomains?: boolean | null; reason: string | null; status: "pending" | "approved" | "declined"; requestedBy: string | null; requestedByName: string | null; requestedAt: string | null; decidedBy: string | null; decidedAt: string | null; note: string | null };
type Scope = "host" | "subdomains";

function whenZ(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dayTimeZ(iso, { alwaysDate: true }) || "—";
}
const scopeLabel = (sub: boolean) => (sub ? "+ subdomains" : "This site only");

// The status chooses our sentence. A refused input (400) shows the agent's own validation sentence, such as "Give the
// host only — no scheme, path, port or wildcard", when it passes the agent UI's technical-text check.
async function agentPost(path: string, body: unknown) {
  const res = await fetch(`${AGENT_BASE}${path}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.ok) {
    throw new ShownError(
      res.status === 400 || res.status === 409 || res.status === 422
        ? personText(payload?.message, "The agent service did not accept this. Check the site name and try again.")
        : res.status === 401 || res.status === 403
          ? "Approving sites needs an admin."
          : `The agent service did not answer as expected (${res.status}). ${TRY_AGAIN}`,
    );
  }
  return payload;
}

export default function AdminAgentSitesPage() {
  const toast = useToast();
  const [approved, setApproved] = useState<Site[]>([]);
  const [requests, setRequests] = useState<SiteRequest[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [scopes, setScopes] = useState<Record<string, Scope>>({});
  const [declining, setDeclining] = useState<SiteRequest | null>(null);
  const [note, setNote] = useState("");
  const [revoking, setRevoking] = useState<Site | null>(null);
  const [newHost, setNewHost] = useState("");
  const [newSubdomains, setNewSubdomains] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`${AGENT_BASE}/api/extension/sites/admin`, { credentials: "same-origin", cache: "no-store" }).catch(() => null);
    const payload = res ? await res.json().catch(() => ({})) : {};
    if (res?.status === 401 || res?.status === 403) { setForbidden("Approving sites needs an admin."); setState("ready"); return; }
    if (!res?.ok || !payload?.ok) { setLoadError(errorDetail(res?.status ?? "network", "GET", "/agent/api/extension/sites/admin")); setState("error"); return; }
    setApproved(payload.approved ?? []);
    setRequests(payload.requests ?? []);
    setState("ready");
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    try { const said = await fn(); await load(); toast.show({ tone: "success", title: said }); return true; }
    catch (e) { toast.show({ tone: "danger", title: "That didn't work", body: shownText(e, `The change was not saved. ${TRY_AGAIN}`) }); return false; }
    finally { setBusy(null); }
  }
  const scopeOf = (r: SiteRequest): Scope => scopes[r.id] ?? (r.includeSubdomains ? "subdomains" : "host");
  const approve = (r: SiteRequest) => run(`req:${r.id}`, async () => {
    const sub = scopeOf(r) === "subdomains";
    await agentPost("/api/extension/sites/decide", { id: r.id, decision: "approve", includeSubdomains: sub, note: null });
    return `${r.host} approved${sub ? " with its subdomains" : ""}`;
  });
  const decline = async () => {
    const r = declining!; const ok = await run(`req:${r.id}`, async () => { await agentPost("/api/extension/sites/decide", { id: r.id, decision: "decline", note: note.trim() || null }); return `${r.host} declined`; });
    if (ok) { setDeclining(null); setNote(""); }
  };
  const revoke = async () => { const s = revoking!; const ok = await run(`site:${s.host}`, async () => { await agentPost("/api/extension/sites/revoke", { host: s.host }); return `${s.host} removed — the extension stops reading it now`; }); if (ok) setRevoking(null); };
  const add = () => run("add", async () => { const host = newHost.trim().toLowerCase(); await agentPost("/api/extension/sites/add", { host, includeSubdomains: newSubdomains }); setNewHost(""); setNewSubdomains(false); return `${host} added`; });

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending").sort((a, b) => String(b.decidedAt ?? "").localeCompare(String(a.decidedAt ?? ""))).slice(0, 50);

  const approvedCols: Column<Site>[] = [
    { id: "host", header: "Host", sortValue: (s) => s.host, cell: (s) => <span className="font-mono text-[13.5px] font-medium">{s.host}</span> },
    { id: "scope", header: "Scope", width: "150px", cell: (s) => <Badge tone={s.includeSubdomains ? "info" : "neutral"} dot={false}>{scopeLabel(s.includeSubdomains)}</Badge> },
    { id: "by", header: "Approved by", cell: (s) => <span className="block truncate font-mono text-[12.5px] text-cw-text-body" title={s.approvedBy ?? undefined}>{s.approvedBy || "—"}</span> },
    { id: "at", header: "When (UTC)", width: "170px", sortValue: (s) => s.approvedAt ?? "", cell: (s) => <span className="font-mono text-[12.5px] text-cw-text-body">{whenZ(s.approvedAt)}</span> },
    { id: "revoke", header: <span className="sr-only">Revoke</span>, width: "110px", align: "right", cell: (s) => <Button size="sm" variant="danger-quiet" onClick={() => setRevoking(s)}>Revoke</Button> },
  ];
  const decidedCols: Column<SiteRequest>[] = [
    { id: "decision", header: "Decision", width: "120px", cell: (r) => <Badge tone={r.status === "approved" ? "success" : "neutral"} dot={false}>{r.status === "approved" ? "APPROVED" : "DECLINED"}</Badge> },
    { id: "site", header: "Site", cell: (r) => {
      const granted = r.status === "approved" ? r.grantedSubdomains ?? r.includeSubdomains : r.includeSubdomains;
      const narrowed = r.status === "approved" && r.grantedSubdomains != null && r.grantedSubdomains !== r.includeSubdomains;
      return <span className="block min-w-0 truncate font-mono text-[12.5px] text-cw-text" title={narrowed ? `Asked for ${scopeLabel(r.includeSubdomains).toLowerCase()}` : undefined}>{r.host}{granted ? " (+ subdomains)" : ""}{narrowed && <span className="font-sans text-[11.5px] text-cw-text-muted"> · scope changed</span>}</span>;
    } },
    { id: "req", header: "Requested by", cell: (r) => <span className="block truncate text-[13px] text-cw-text-body">{r.requestedByName || r.requestedBy || "—"}</span> },
    { id: "dec", header: "Decided by", cell: (r) => <span className="block truncate font-mono text-[12px] text-cw-text-body">{r.decidedBy || "—"}</span> },
    { id: "at", header: "When (UTC)", width: "160px", cell: (r) => <span className="font-mono text-[12px] text-cw-text-body">{whenZ(r.decidedAt)}</span> },
    { id: "note", header: "Note", cell: (r) => <span className="line-clamp-2 text-[13px] text-cw-text-body">{r.note || "—"}</span> },
  ];

  return (
    <PortalShell title="Agent sites" subtitle="Sites the Ops Agent Chrome extension may read when someone sends a selection or a page. Nothing is read on a site that isn't listed; capture still works everywhere. Every decision is logged.">
      <div className="flex flex-col gap-5" style={{ padding: "0 var(--cw-page-pad) 40px" }}>
        {forbidden ? <Card><EmptyState icon="lock" title="Agent sites is for admins">{forbidden}</EmptyState></Card> : state === "error" ? (
          <Card padded={false}><ErrorState title="Couldn't load sites" detail={<>The extension keeps using the last list it fetched. <span className="font-mono">{loadError}</span></>} onRetry={() => { setState("loading"); void load(); }} /></Card>
        ) : (
          <>
            <section aria-label="Waiting for a decision" className={`overflow-hidden rounded-[14px] border bg-cw-bg-surface shadow-cw-1 ${pending.length ? "border-cw-warning-border" : "border-cw-border"}`}>
              <header className="flex h-[52px] items-center gap-2.5 border-b border-cw-divider px-5">
                <h2 className="m-0 text-[15px] font-bold text-cw-text">Waiting for a decision</h2>
                {state === "ready" && <CountBadge n={pending.length} tone={pending.length ? "warning" : "neutral"} />}
              </header>
              {state === "loading" ? <SkeletonRows rows={1} avatar={false} label="Loading requests" /> : pending.length === 0 ? (
                <div className="flex items-center gap-3 px-5 py-5 text-[13.5px] text-cw-text-body"><MaskIcon name="circle-check" size={17} color="var(--cw-success)" />No requests waiting. New ones appear here when someone asks from the extension.</div>
              ) : pending.map((r) => (
                <div key={r.id} className="grid items-center gap-4 border-b border-cw-divider px-5 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <span className="font-mono text-[15px] font-semibold text-cw-text">{r.host}</span>
                      <span className="text-[12.5px] text-cw-text-muted">requested by {r.requestedByName || r.requestedBy || "someone"} · <span className="font-mono">{whenZ(r.requestedAt)}</span>{r.includeSubdomains ? " · asked to include subdomains" : ""}</span>
                    </div>
                    {r.reason && <div className="text-[13px] text-cw-text-body">“{r.reason}”</div>}
                    <div className="mt-1"><RadioGroup<Scope> label={`Scope for ${r.host}`} value={scopeOf(r)} onChange={(v) => setScopes((m) => ({ ...m, [r.id]: v }))}
                      options={[{ value: "host", label: "This host only" }, { value: "subdomains", label: "Host and subdomains" }]} className="flex flex-wrap gap-x-5 gap-y-2" /></div>
                  </div>
                  <div className="flex gap-2">
                    <Button disabled={busy === `req:${r.id}`} onClick={() => { setDeclining(r); setNote(""); }}>Decline</Button>
                    <Button variant="primary" icon="check" loading={busy === `req:${r.id}`} loadingLabel="Approving…" onClick={() => void approve(r)}>Approve</Button>
                  </div>
                </div>
              ))}
            </section>

            <section aria-label="Approved sites">
              <TableCard>
                <header className="flex h-[52px] items-center gap-2.5 border-b border-cw-divider px-5"><h2 className="m-0 text-[15px] font-bold text-cw-text">Approved sites</h2>{state === "ready" && <span className="font-mono text-[12.5px] text-cw-text-muted">{approved.length}</span>}</header>
                <DataTable label="Approved sites" columns={approvedCols} rows={approved} rowKey={(s) => s.host} state={state === "loading" ? "loading" : "ready"} defaultSort={{ id: "host", dir: "asc" }}
                  empty={{ icon: "globe", title: "No sites yet", body: "Add one below, or approve a request from the extension." }} />
                <form className="flex flex-wrap items-center gap-3 rounded-b-[14px] border-t border-cw-divider bg-cw-bg-sunken px-5 py-3" onSubmit={(e) => { e.preventDefault(); if (newHost.trim()) void add(); }}>
                  <span className="text-[13.5px] font-semibold text-cw-text">Add a site</span>
                  <span className="min-w-[240px] flex-1"><TextInput mono value={newHost} onChange={(e) => setNewHost(e.target.value)} placeholder="host only, e.g. handling-baltic.lv" aria-label="Host to add" spellCheck={false} autoCapitalize="none" /></span>
                  <Checkbox checked={newSubdomains} onChange={setNewSubdomains} label="Include subdomains" />
                  {newHost.trim() && <Button type="submit" variant="primary" loading={busy === "add"} loadingLabel="Adding…">Add</Button>}
                </form>
              </TableCard>
            </section>

            <section aria-label="Decision log">
              <TableCard>
                <header className="flex h-[52px] items-center gap-2.5 border-b border-cw-divider px-5"><h2 className="m-0 text-[15px] font-bold text-cw-text">Decision log</h2><span className="text-[13px] text-cw-text-muted">Newest first · the last 50</span></header>
                <DataTable label="Decision log" density="dense" columns={decidedCols} rows={decided} rowKey={(r) => r.id} state={state === "loading" ? "loading" : "ready"}
                  empty={{ icon: "scroll-text", title: "No decisions yet", body: "Approvals and declines appear here, with who decided and why." }} />
              </TableCard>
            </section>
          </>
        )}
      </div>

      <Modal open={Boolean(declining)} onClose={() => setDeclining(null)} title={declining ? `Decline ${declining.host}?` : ""} icon="x" tone="danger" busy={Boolean(declining && busy === `req:${declining.id}`)}
        actions={<><Button onClick={() => setDeclining(null)}>Keep it waiting</Button><Button variant="danger" loading={Boolean(declining && busy === `req:${declining.id}`)} loadingLabel="Declining…" onClick={() => void decline()}>Decline</Button></>}>
        <p className="m-0 mb-3">{declining?.requestedByName || declining?.requestedBy || "The requester"} sees it declined, with your note, the next time they open the extension on that site.</p>
        <TextArea aria-label="Note for the requester" value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} rows={3} placeholder="Why — the requester sees this (recommended)" />
      </Modal>
      <ConfirmDialog open={Boolean(revoking)} danger icon="globe" title={revoking ? `Remove ${revoking.host}?` : ""} body="The extension stops reading it at once. People can ask for it again from the extension." confirmLabel="Remove site"
        busy={Boolean(revoking && busy === `site:${revoking.host}`)} busyLabel="Removing…" onCancel={() => setRevoking(null)} onConfirm={() => void revoke()} />
    </PortalShell>
  );
}
