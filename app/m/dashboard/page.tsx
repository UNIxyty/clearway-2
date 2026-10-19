"use client";

// The dashboard on a phone (mobile-portal-spec.md › Tier 2 › blocks): the blocks the person chose, in their order,
// each full width. The numbers are the desktop's: today's flights from the wall, the NOTAM round, open reports, the
// service monitors, the server's health (admins), quick links and the changelog.
import Link from "next/link";
import { useIdentity } from "@/components/portal/Shell";
import { usePhonePage } from "@/components/m/chrome";
import { T2Blocks, T2Page, T2Rows, Badge, type T2Block, type Tone } from "@/components/m/tier2";
import { DEFAULT_LAYOUT, sanitizeLayout, type Layout } from "@/lib/dashboard-layout";
import { ago, useResource, wallUrl } from "@/lib/m/t2";

type Check = { id: string; label: string; state: "operational" | "degraded" | "down" | "unknown"; lastChecked?: string | null; latencyMs?: number | null };
type Entry = { kind: "edit" | "error"; source?: string; summary: string; actor?: string | null; at: string };
const STATE_TONE: Record<Check["state"], Tone> = { operational: "ok", degraded: "warn", down: "bad", unknown: "neutral" };
const STATE_LABEL: Record<Check["state"], string> = { operational: "Working", degraded: "Degraded", down: "Down", unknown: "Unknown" };
const LINKS = [{ icon: "search", label: "Airport search", href: "/m/airport" }, { icon: "activity", label: "Service status", href: "/m/service-status" }, { icon: "monitor", label: "Wall", href: "/m/wall" }, { icon: "shield-check", label: "NOTAM check", href: "/m/notam-check" }, { icon: "life-buoy", label: "Report a problem", href: "/m/help" }];
const day = () => new Date().toISOString().slice(0, 10);

export default function DashboardPhonePage() {
  const { role, display } = useIdentity();
  usePhonePage({ title: "Dashboard", subtitle: display ? `Good day, ${display.split(" ")[0]}` : null, tab: "more" });
  const prefs = useResource<{ preferences?: { dashboard_layout?: unknown } }>("/api/user/preferences");
  const layout: Layout = sanitizeLayout(prefs.data?.preferences?.dashboard_layout) ?? DEFAULT_LAYOUT;
  const flights = useResource<{ total?: number }>(wallUrl(`/flights/normalized?date=${day()}&limit=1`), { poll: 60_000 });
  const delayed = useResource<{ total?: number }>(wallUrl(`/flights/normalized?date=${day()}&limit=1&status=delayed`), { poll: 60_000 });
  const notam = useResource<{ done?: number; total?: number }>(wallUrl("/notam-check/today"), { poll: 60_000 });
  const reports = useResource<{ reports?: Array<{ status: string }> }>(wallUrl("/reports"), { poll: 60_000 });
  const recents = useResource<{ recents?: Array<{ resource: string; service?: string; action: string; when: string; href: string }> }>("/api/dashboard/recents");
  const monitors = useResource<{ checks?: Check[]; lastSweep?: string | null }>("/api/service-checks", { poll: 30_000 });
  const health = useResource<{ available?: boolean; cpu?: { load1: number; cores: number }; tempC?: number | null; ram?: { totalB: number; availB: number }; disks?: Array<{ mount: string; pct: number }>; warnings?: string[] }>(role === "admin" ? "/api/admin/metrics" : null, { poll: 60_000 });
  const changelog = useResource<{ entries?: Entry[] }>("/api/dashboard/changelog?filter=all");
  const openReports = (reports.data?.reports ?? []).filter((r) => r.status !== "done" && r.status !== "impossible").length;
  const n = (v: number | undefined | null) => (v === undefined || v === null ? "—" : String(v));

  const blocks: T2Block[] = [];
  for (const item of layout) {
    if (item.id === "today") blocks.push({ key: "today", title: "Today", href: "/m/wall", rows: [["Flights", n(flights.data?.total)], ["Delayed", n(delayed.data?.total)], ["NOTAM round", notam.data ? `${notam.data.done ?? 0} of ${notam.data.total ?? 0}` : "—"], ["Open reports", reports.data ? String(openReports) : "—"]] });
    if (item.id === "monitors") { const checks = monitors.data?.checks ?? []; blocks.push({ key: "monitors", title: "Services", href: "/m/service-status", rows: checks.length ? checks.map((c) => [c.label, <Badge key={c.id} tone={STATE_TONE[c.state]} small>{STATE_LABEL[c.state]}</Badge>]) : [["Checks", monitors.loading ? "…" : "none yet"]] }); }
    if (item.id === "health" && role === "admin") { const h = health.data; blocks.push({ key: "health", title: "Server", rows: h?.available === false ? [["Metrics", "not available"]] : [["Load", h?.cpu ? `${h.cpu.load1.toFixed(2)} / ${h.cpu.cores}` : "—"], ["Memory free", h?.ram ? `${Math.round((h.ram.availB / h.ram.totalB) * 100)} %` : "—"], ...(h?.disks ?? []).slice(0, 2).map((d): [string, string] => [`Disk ${d.mount}`, `${d.pct} %`]), ...(h?.tempC != null ? [["Temperature", `${Math.round(h.tempC)} °C`] as [string, string]] : [])] }); }
  }
  const recentRows = (recents.data?.recents ?? []).slice(0, 6);
  const entries = (changelog.data?.entries ?? []).slice(0, 8);
  const loading = prefs.loading; // the layout decides what is drawn, so until it is known the page is a skeleton

  return (
    <T2Page loading={loading} error={prefs.error && !prefs.data ? prefs.error : null} empty={false} emptyCopy={["No blocks on your dashboard", "Add blocks on a wider screen."]} errorCopy={["Couldn’t load your dashboard", "The other pages still work."]} onRetry={prefs.reload}>
      <T2Blocks blocks={blocks} />
      {layout.some((l) => l.id === "recent") && (
        <div className="flex flex-col gap-1.5"><span className="px-0.5 pt-1 text-[12px] font-bold tracking-[.06em] text-cw-text-muted">RECENT</span>
          {recentRows.length ? <T2Rows rows={recentRows.map((r, i) => ({ key: `${r.href}-${i}`, title: r.resource, mono: /^[A-Z]{4}$/.test(r.resource), sub: `${r.action}${r.service ? ` · ${r.service}` : ""}`, meta: ago(r.when), href: r.href.startsWith("/aip/") && /^\/aip\/[A-Za-z0-9]{4}$/.test(r.href) ? `/m/airport/${r.href.slice(5).toUpperCase()}` : r.href }))} /> : <span className="px-0.5 py-2 text-[14px] text-cw-text-muted">{recents.loading ? "…" : "Airports and pages you open appear here."}</span>}
        </div>
      )}
      {layout.some((l) => l.id === "links") && (
        <div className="flex flex-col gap-1.5"><span className="px-0.5 pt-1 text-[12px] font-bold tracking-[.06em] text-cw-text-muted">QUICK LINKS</span>
          <div className="overflow-hidden rounded-[14px] border border-cw-border bg-cw-bg-surface">{LINKS.map((l) => <Link key={l.href} href={l.href} className="flex min-h-12 items-center gap-3 border-t border-cw-divider px-3.5 text-[15px] font-medium text-cw-text first:border-t-0"><span className="flex-1">{l.label}</span></Link>)}</div>
        </div>
      )}
      {layout.some((l) => l.id === "changelog") && (
        <div className="flex flex-col gap-1.5"><span className="px-0.5 pt-1 text-[12px] font-bold tracking-[.06em] text-cw-text-muted">WHAT CHANGED</span>
          {entries.length ? <T2Rows rows={entries.map((e, i) => ({ key: `${e.at}-${i}`, title: e.summary, sub: [e.source, e.actor].filter(Boolean).join(" · "), meta: ago(e.at), badge: e.kind === "error" ? ["Error", "bad"] : undefined }))} /> : <span className="px-0.5 py-2 text-[14px] text-cw-text-muted">{changelog.loading ? "…" : "Nothing changed recently."}</span>}
        </div>
      )}
    </T2Page>
  );
}
