"use client";

// Admin → Agent sites: the organisation's site list for the Clearway Ops Agent
// Chrome extension (spec addendum §E12 S4/S4b, §E14 item 8). Three sections:
// requests waiting for a decision, the approved list (revoke, add), and the
// last decisions. Plain console admin pattern (see app/admin/users/page.tsx);
// the design file names this screen but never drew it, so it is kept minimal
// for design to pick up. Data comes from the agent service, which enforces
// the admin check itself — non-admins get its 403 message here.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import PortalShell from "@/components/portal/Shell";
import { PCard, PButton, PChip, PMono, PTh } from "@/components/portal/ui";
import { C } from "@/components/agent/ui/tokens";

const AGENT_BASE = process.env.NEXT_PUBLIC_AGENT_BASE_URL || "/agent";

type Site = { host: string; includeSubdomains: boolean; approvedBy: string | null; approvedAt: string | null; note: string | null };
type SiteRequest = { id: string; host: string; includeSubdomains: boolean; reason: string | null; status: "pending" | "approved" | "declined"; requestedBy: string | null; requestedByName: string | null; requestedAt: string | null; decidedBy: string | null; decidedAt: string | null; note: string | null };

const STATUS_CHIP: Record<SiteRequest["status"], { color: string; bg: string }> = {
  approved: { color: C.ok, bg: C.okTint },
  declined: { color: C.neutral, bg: C.neutralTint },
  pending: { color: C.warn, bg: C.warnTint },
};

function whenZ(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}Z`;
}

async function agentPost(path: string, body: unknown): Promise<{ ok: boolean; message?: string } & Record<string, unknown>> {
  const res = await fetch(`${AGENT_BASE}${path}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.ok) throw new Error(payload?.message || `Request failed (${res.status})`);
  return payload;
}

export default function AdminAgentSitesPage() {
  const router = useRouter();
  const [approved, setApproved] = useState<Site[]>([]);
  const [requests, setRequests] = useState<SiteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // One inline note box open at a time: {id, decision} for a request, or the host being revoked.
  const [deciding, setDeciding] = useState<{ id: string; decision: "approve" | "decline" } | null>(null);
  const [note, setNote] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);
  const [newHost, setNewHost] = useState("");
  const [newSubdomains, setNewSubdomains] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${AGENT_BASE}/api/extension/sites/admin`, { credentials: "same-origin", cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) throw new Error(payload?.message || (res.status === 403 ? "Approving sites needs an admin." : "Could not load the site list."));
      setApproved(payload.approved ?? []);
      setRequests(payload.requests ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Could not load the site list.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setError(null);
    try { await fn(); await load(); }
    catch (e) { setError((e as Error).message || "That did not work."); }
    finally { setBusy(null); }
  }
  const decide = (id: string, decision: "approve" | "decline") => run(`req:${id}`, async () => { await agentPost("/api/extension/sites/decide", { id, decision, note: note.trim() || null }); setDeciding(null); setNote(""); });
  const revoke = (host: string) => run(`site:${host}`, async () => { await agentPost("/api/extension/sites/revoke", { host }); setRevoking(null); });
  const add = () => run("add", async () => { await agentPost("/api/extension/sites/add", { host: newHost.trim().toLowerCase(), includeSubdomains: newSubdomains }); setNewHost(""); setNewSubdomains(false); });

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending").sort((a, b) => String(b.decidedAt ?? "").localeCompare(String(a.decidedAt ?? ""))).slice(0, 50);
  const muted = { color: C.muted };
  const inputStyle = { fontFamily: "inherit", fontSize: 13, height: 34, borderRadius: 8, border: `1px solid ${C.borderControl}`, padding: "0 10px", background: C.surface, color: C.ink } as const;

  return (
    <PortalShell>
      <div className="max-w-[1560px] px-[30px] pb-10 pt-[26px]">
        <div className="mb-4">
          <PButton type="button" variant="quiet" size="sm" onClick={() => router.push("/admin/maintenance")}>
            <ArrowLeftIcon className="h-4 w-4" />
            Back
          </PButton>
        </div>

        <h1 className="m-0 mb-[5px] text-[26px] font-extrabold tracking-[-0.02em]">Agent sites</h1>
        <p className="m-0 mb-5 text-[15px]" style={muted}>
          Sites the Ops Agent Chrome extension may read from, when someone sends a selection or a page. Nothing is read on a site that is not on this list; capture still works everywhere. Requests come from the extension. Every decision is logged.
        </p>

        {error && (
          <div role="alert" className="mb-4 rounded-[10px] border px-3.5 py-2.5 text-sm" style={{ borderColor: C.dangerBorder, background: C.dangerTint, color: C.danger }}>
            {error}
          </div>
        )}

        {/* Pending requests */}
        <h2 className="m-0 mb-2 mt-2 text-[15px] font-bold">Pending requests{pending.length ? ` · ${pending.length}` : ""}</h2>
        <PCard className="mb-6 overflow-hidden">
          {loading ? (
            <p className="m-0 px-[18px] py-5 text-sm" style={muted}>Loading…</p>
          ) : pending.length === 0 ? (
            <p className="m-0 px-[18px] py-5 text-sm" style={muted}>No requests waiting.</p>
          ) : (
            <>
              <div className="hidden grid-cols-[1.2fr_1fr_1.6fr_150px_auto] items-center gap-3.5 border-b px-[18px] py-2.5 md:grid" style={{ borderColor: C.divider, background: C.page }}>
                <PTh>SITE</PTh><PTh>REQUESTED BY</PTh><PTh>WHY</PTh><PTh>WHEN</PTh><PTh className="text-right">DECISION</PTh>
              </div>
              {pending.map((r) => {
                const isBusy = busy === `req:${r.id}`;
                const open = deciding?.id === r.id ? deciding.decision : null;
                return (
                  <div key={r.id} className="border-b last:border-b-0" style={{ borderColor: C.dividerRow }}>
                    <div className="grid grid-cols-1 items-center gap-2 px-[18px] py-3 md:grid-cols-[1.2fr_1fr_1.6fr_150px_auto] md:gap-3.5">
                      <div className="min-w-0">
                        <PMono className="block truncate text-[13px] font-semibold">{r.host}</PMono>
                        <span className="text-[12px]" style={muted}>{r.includeSubdomains ? "+ subdomains" : "this site only"}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="m-0 truncate text-sm font-semibold">{r.requestedByName || r.requestedBy || "Unknown"}</p>
                        {r.requestedByName && r.requestedBy && <PMono className="block truncate text-[12px]" style={muted}>{r.requestedBy}</PMono>}
                      </div>
                      <p className="m-0 text-[13px] leading-snug" style={{ color: C.body }}>{r.reason || "—"}</p>
                      <PMono className="text-[12.5px]" style={muted}>{whenZ(r.requestedAt)}</PMono>
                      <div className="flex shrink-0 justify-end gap-1.5">
                        <PButton type="button" size="sm" variant="primary" disabled={isBusy} onClick={() => { setDeciding({ id: r.id, decision: "approve" }); setNote(""); }}>Approve</PButton>
                        <PButton type="button" size="sm" variant="secondary" disabled={isBusy} onClick={() => { setDeciding({ id: r.id, decision: "decline" }); setNote(""); }}>Decline</PButton>
                      </div>
                    </div>
                    {open && (
                      <div className="flex flex-wrap items-center gap-2 px-[18px] pb-3" style={{ background: C.page }}>
                        <span className="text-[13px] font-semibold">{open === "approve" ? `Approve ${r.host}` : `Decline ${r.host}`}</span>
                        <input
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          maxLength={400}
                          placeholder={open === "approve" ? "Note (optional)" : "Tell the requester why (recommended)"}
                          aria-label="Note for the requester"
                          style={{ ...inputStyle, flex: "1 1 260px" }}
                        />
                        <PButton type="button" size="sm" variant={open === "approve" ? "primary" : "stop"} disabled={isBusy} onClick={() => void decide(r.id, open)}>
                          {isBusy ? "…" : open === "approve" ? "Confirm approval" : "Confirm decline"}
                        </PButton>
                        <PButton type="button" size="sm" variant="quiet" disabled={isBusy} onClick={() => { setDeciding(null); setNote(""); }}>Cancel</PButton>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </PCard>

        {/* Approved sites */}
        <h2 className="m-0 mb-2 text-[15px] font-bold">Approved sites{approved.length ? ` · ${approved.length}` : ""}</h2>
        <PCard className="mb-6 overflow-hidden">
          {!loading && approved.length > 0 && (
            <div className="hidden grid-cols-[1.4fr_130px_1.2fr_150px_auto] items-center gap-3.5 border-b px-[18px] py-2.5 md:grid" style={{ borderColor: C.divider, background: C.page }}>
              <PTh>HOST</PTh><PTh>SCOPE</PTh><PTh>APPROVED BY</PTh><PTh>WHEN</PTh><PTh className="text-right">ACTIONS</PTh>
            </div>
          )}
          {loading ? (
            <p className="m-0 px-[18px] py-5 text-sm" style={muted}>Loading…</p>
          ) : approved.length === 0 ? (
            <p className="m-0 px-[18px] py-4 text-sm" style={muted}>No sites yet. Add one below, or wait for a request from the extension.</p>
          ) : (
            approved.map((s) => {
              const isBusy = busy === `site:${s.host}`;
              return (
                <div key={s.host} className="grid grid-cols-1 items-center gap-2 border-b px-[18px] py-3 md:grid-cols-[1.4fr_130px_1.2fr_150px_auto] md:gap-3.5" style={{ borderColor: C.dividerRow }}>
                  <PMono className="min-w-0 truncate text-[13px] font-semibold">{s.host}</PMono>
                  <span className="text-[12.5px]" style={muted}>{s.includeSubdomains ? "+ subdomains" : "this site only"}</span>
                  <PMono className="min-w-0 truncate text-[12.5px]" style={muted}>{s.approvedBy || "—"}</PMono>
                  <PMono className="text-[12.5px]" style={muted}>{whenZ(s.approvedAt)}</PMono>
                  <div className="flex shrink-0 items-center justify-end gap-1.5">
                    {revoking === s.host ? (
                      <>
                        <span className="text-[12.5px]" style={muted}>Remove {s.host}? The extension stops reading it at once.</span>
                        <PButton type="button" size="sm" variant="stop" disabled={isBusy} onClick={() => void revoke(s.host)}>{isBusy ? "…" : "Confirm revoke"}</PButton>
                        <PButton type="button" size="sm" variant="quiet" disabled={isBusy} onClick={() => setRevoking(null)}>Cancel</PButton>
                      </>
                    ) : (
                      <PButton type="button" size="sm" variant="danger-quiet" disabled={isBusy} onClick={() => setRevoking(s.host)}>Revoke</PButton>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {/* Add a site */}
          <form
            className="flex flex-wrap items-center gap-2 px-[18px] py-3"
            style={{ background: C.page }}
            onSubmit={(e) => { e.preventDefault(); if (newHost.trim()) void add(); }}
          >
            <span className="text-[13px] font-semibold">Add a site</span>
            <input
              value={newHost}
              onChange={(e) => setNewHost(e.target.value)}
              placeholder="host only, e.g. handling-baltic.lv"
              aria-label="Host to add"
              spellCheck={false}
              autoCapitalize="none"
              style={{ ...inputStyle, flex: "1 1 240px", fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
            />
            <label className="flex items-center gap-1.5 text-[13px]" style={{ color: C.body }}>
              <input type="checkbox" checked={newSubdomains} onChange={(e) => setNewSubdomains(e.target.checked)} />
              include subdomains
            </label>
            <PButton type="submit" size="sm" variant="primary" disabled={busy === "add" || !newHost.trim()}>{busy === "add" ? "…" : "Add"}</PButton>
          </form>
        </PCard>

        {/* Decided */}
        <h2 className="m-0 mb-2 text-[15px] font-bold">Decided</h2>
        <PCard className="overflow-hidden">
          {loading ? (
            <p className="m-0 px-[18px] py-5 text-sm" style={muted}>Loading…</p>
          ) : decided.length === 0 ? (
            <p className="m-0 px-[18px] py-5 text-sm" style={muted}>No decisions yet.</p>
          ) : (
            <>
              <div className="hidden grid-cols-[110px_1.2fr_1fr_1fr_150px_1.4fr] items-center gap-3.5 border-b px-[18px] py-2.5 md:grid" style={{ borderColor: C.divider, background: C.page }}>
                <PTh>STATUS</PTh><PTh>SITE</PTh><PTh>REQUESTED BY</PTh><PTh>DECIDED BY</PTh><PTh>WHEN</PTh><PTh>NOTE</PTh>
              </div>
              <div className="max-h-[560px] overflow-y-auto">
                {decided.map((r) => (
                  <div key={r.id} className="grid grid-cols-1 items-center gap-2 border-b px-[18px] py-3 last:border-b-0 md:grid-cols-[110px_1.2fr_1fr_1fr_150px_1.4fr] md:gap-3.5" style={{ borderColor: C.dividerRow }}>
                    <div><PChip color={STATUS_CHIP[r.status].color} bg={STATUS_CHIP[r.status].bg} className="uppercase tracking-wide text-[10px]">{r.status}</PChip></div>
                    <PMono className="min-w-0 truncate text-[13px] font-semibold">{r.host}{r.includeSubdomains ? " (+ subdomains)" : ""}</PMono>
                    <PMono className="min-w-0 truncate text-[12.5px]" style={muted}>{r.requestedByName || r.requestedBy || "—"}</PMono>
                    <PMono className="min-w-0 truncate text-[12.5px]" style={muted}>{r.decidedBy || "—"}</PMono>
                    <PMono className="text-[12.5px]" style={muted}>{whenZ(r.decidedAt)}</PMono>
                    <p className="m-0 text-[13px] leading-snug" style={{ color: C.body }}>{r.note || "—"}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </PCard>
      </div>
    </PortalShell>
  );
}
