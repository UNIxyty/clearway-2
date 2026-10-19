"use client";

// Webhooks on a phone (Tier 2 › list that opens a detail): is a delivery failing? One row per operator with its
// health; the detail lists each event with its state and a toggle (wall.webhooks.toggle), the last deliveries, and
// Re-register (wall.webhooks.reregister). The health rule is the console's (WebhooksPage.jsx › healthOf).
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePhonePage } from "@/components/m/chrome";
import { MError } from "@/components/m/ui";
import { T2Detail, T2Groups, T2Page, T2Rows, Toggle, type Tone } from "@/components/m/tier2";
import { useWallUser, userCan } from "@/lib/m/wall";
import { dayTime, getJson, useAction, useResource, wallUrl } from "@/lib/m/t2";

type Tenant = { enabledEvents?: Record<string, boolean>; eventStates?: Record<string, { state: "live" | "notAvailable" | "needsAttention" }>; lastEventAt?: Record<string, string>; allEnabledLive?: boolean | null; remoteError?: string | null };
type Data = { tenants?: Record<string, Tenant>; events?: Record<string, { description?: string }> };
type Operator = { id: string; oprId: string; name: string };
function healthOf(t: Tenant): { label: string; tone: Tone } {
  const enabled = Object.entries(t.enabledEvents ?? {}).filter(([, on]) => on).map(([e]) => e);
  if (enabled.length === 0) return { label: "Off", tone: "neutral" };
  if (t.allEnabledLive === null && t.remoteError) return { label: "Leon unreachable", tone: "warn" };
  const st = t.eventStates ?? {};
  const attention = enabled.filter((e) => st[e]?.state === "needsAttention").length;
  if (attention) return { label: `${attention} need${attention === 1 ? "s" : ""} attention`, tone: "bad" };
  const notAvailable = enabled.filter((e) => st[e]?.state === "notAvailable").length;
  if (notAvailable) return { label: `${notAvailable} not available`, tone: "warn" };
  return { label: "Healthy", tone: "ok" };
}

export default function WebhooksPhonePage() {
  const search = useSearchParams(); const router = useRouter();
  const openOpr = search.get("opr");
  const r = useResource<Data>(wallUrl("/webhooks"), { poll: 30_000, fallback: "The wall did not answer." });
  const ops = useResource<{ operators?: Operator[] }>(wallUrl("/operators?includeInactive=true"));
  const log = useResource<{ results?: Array<{ at: string; action?: string; change?: string; callsign?: string; flightNid?: string }> }>(openOpr ? wallUrl(`/webhooks/log?oprId=${encodeURIComponent(openOpr)}`) : null);
  const user = useWallUser();
  const act = useAction("The wall did not accept that. Try again.");
  const nameOf = (oprId: string) => ops.data?.operators?.find((o) => o.oprId === oprId)?.name ?? oprId;
  const tenants = useMemo(() => Object.entries(r.data?.tenants ?? {}).sort(([a], [b]) => nameOf(a).localeCompare(nameOf(b))), [r.data, ops.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const picked = openOpr && r.data?.tenants?.[openOpr] ? { oprId: openOpr, t: r.data.tenants[openOpr] } : null;
  usePhonePage({ title: picked ? nameOf(picked.oprId) : "Webhooks", subtitle: picked ? picked.oprId : tenants.length ? `${tenants.filter(([, t]) => healthOf(t).tone === "ok").length} of ${tenants.length} healthy` : null, monoSubtitle: Boolean(picked), back: picked ? () => router.replace("/m/webhooks") : null, tab: "more", tabs: !picked });
  const canToggle = userCan(user ?? null, "wall.webhooks.toggle"), canRereg = userCan(user ?? null, "wall.webhooks.reregister");
  const toggle = (oprId: string, event: string, enabled: boolean) => act.run(`${oprId}:${event}`, async () => { await getJson(wallUrl("/webhooks/toggle"), { json: { oprId, event, enabled } }); await r.reload(); });
  const rereg = (oprId: string) => act.run("rereg", async () => { await getJson(wallUrl("/webhooks/reregister"), { json: { oprId } }); await r.reload(); });

  if (picked) { const h = healthOf(picked.t); const events = Object.keys(r.data?.events ?? picked.t.enabledEvents ?? {}); return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      {act.failed && <MError title="Not done." icon="webhook" onRetry={act.clear}>{act.failed}</MError>}
      <T2Detail title={nameOf(picked.oprId)} rows={[{ k: "Health", v: h.label }, ...(picked.t.remoteError ? [{ k: "Leon says", v: picked.t.remoteError }] : [])]} actions={canRereg ? [{ label: "Re-register all triggers with Leon", onClick: () => void rereg(picked.oprId), busy: act.busy === "rereg", disabled: act.busy !== null }] : []}>
        <div className="flex flex-col gap-1.5"><span className="px-0.5 text-[12px] font-bold tracking-[.06em] text-cw-text-muted">TRIGGERS</span>
          <div className="overflow-hidden rounded-[14px] border border-cw-border bg-cw-bg-surface">
            {events.map((e) => { const on = Boolean(picked.t.enabledEvents?.[e]); const st = picked.t.eventStates?.[e]?.state; const last = picked.t.lastEventAt?.[e]; return (
              <div key={e} className="flex min-h-14 items-center gap-3 border-t border-cw-divider py-1.5 pl-3.5 pr-2.5 first:border-t-0">
                <span className="flex min-w-0 flex-1 flex-col"><span className="font-mono text-[14px] font-semibold">{e}</span><span className="text-[12.5px] text-cw-text-muted">{r.data?.events?.[e]?.description ?? ""}{on ? ` · ${st === "needsAttention" ? "needs attention" : st === "notAvailable" ? "not available in Leon" : st === "live" ? "live" : "set"}${last ? ` · last ${dayTime(last)}` : ""}` : ""}</span></span>
                <Toggle on={on} onChange={(v) => void toggle(picked.oprId, e, v)} disabled={!canToggle || act.busy !== null} label={e} />
              </div>
            ); })}
          </div>
        </div>
        <div className="flex flex-col gap-1.5"><span className="px-0.5 text-[12px] font-bold tracking-[.06em] text-cw-text-muted">LAST DELIVERIES</span>
          {log.loading ? <span className="px-0.5 text-[13.5px] text-cw-text-muted">…</span> : (log.data?.results?.length ?? 0) === 0 ? <span className="px-0.5 text-[13.5px] text-cw-text-muted">Nothing delivered yet.</span>
            : <T2Rows rows={(log.data?.results ?? []).slice(0, 12).map((x, i) => ({ key: `${x.at}-${i}`, title: x.callsign || x.flightNid || x.action || "Event", mono: Boolean(x.callsign), sub: [x.action, x.change].filter(Boolean).join(" · "), meta: dayTime(x.at) }))} />}
        </div>
      </T2Detail>
    </div>
  ); }
  return (
    <T2Page loading={r.loading && !r.data} error={r.error} stale={Boolean(r.data)} empty={tenants.length === 0} emptyCopy={["No webhooks", "Each operator’s Leon triggers appear here once the operator is added."]} errorCopy={["Couldn’t load webhooks", "Deliveries continue in the background."]} onRetry={r.reload}>
      <T2Groups groups={[{ h: "OPERATORS", rows: tenants.map(([oprId, t]) => { const h = healthOf(t); const on = Object.values(t.enabledEvents ?? {}).filter(Boolean).length; return { key: oprId, title: nameOf(oprId), sub: `${oprId} · ${on} trigger${on === 1 ? "" : "s"} on`, badge: [h.label, h.tone], href: `/m/webhooks?opr=${encodeURIComponent(oprId)}` }; }) }]} />
    </T2Page>
  );
}
