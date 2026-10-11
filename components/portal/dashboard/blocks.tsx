"use client";

// The dashboard's blocks (portal redesign, stage 3 — "Page Dashboard"). Each block loads on its own: it draws its own
// skeleton while loading and its own error with a retry, so one failing source never blanks the others (§3.10). The
// frame around each block carries the customise controls (handle, S/M/L, remove) when the page is being edited.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import MaskIcon from "@/components/portal/Icon";
import { Button, IconButton, Segmented, Skeleton } from "@/components/kit";
import type { BlockSize } from "@/lib/dashboard-layout";
import { formatBytes, timeAgo, usePoll } from "./shared";

/** "15:53:10Z" — times on the dashboard are UTC, like the rest of the portal. */
const utcClock = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : `${d.toISOString().slice(11, 19)}Z`; };

export type FrameControls = {
  edit: boolean;
  size: BlockSize;
  onSize: (s: BlockSize) => void;
  onRemove: () => void;
  /** The drag handle (a button: arrow keys move the block too). */
  handle: ReactNode;
};

export function BlockFrame({ title, icon, meta, actions, link, frame, children }: {
  title: string; icon: string; meta?: ReactNode; actions?: ReactNode; link?: { href: string; label: string; external?: boolean }; frame: FrameControls; children: ReactNode;
}) {
  return (
    <section aria-label={title} className={`relative h-full overflow-hidden rounded-[14px] bg-cw-bg-surface shadow-cw-1 ${frame.edit ? "border border-dashed border-cw-border-strong" : "border border-cw-border"}`}>
      <header className="flex h-12 items-center gap-2.5 border-b border-cw-divider pl-4 pr-3">
        {frame.edit && frame.handle}
        <MaskIcon name={icon} size={15} color="var(--cw-text-muted)" />
        <h2 className="m-0 min-w-0 truncate text-[14.5px] font-bold text-cw-text">{title}</h2>
        {/* While arranging, the header holds the controls instead of the note. */}
        {meta && !frame.edit && <span className="min-w-0 truncate text-[12.5px] text-cw-text-muted">{meta}</span>}
        <span className="flex-1" />
        {frame.edit ? (
          <IconButton icon="x" label={`Remove ${title}`} size="sm" onClick={frame.onRemove} />
        ) : (
          <>
            {actions}
            {link && (link.external
              ? <a href={link.href} className="whitespace-nowrap text-[12.5px] font-semibold text-cw-text-link no-underline hover:text-cw-primary-hover">{link.label}</a>
              : <Link href={link.href} className="whitespace-nowrap text-[12.5px] font-semibold text-cw-text-link no-underline hover:text-cw-primary-hover">{link.label}</Link>)}
          </>
        )}
      </header>
      {frame.edit && (
        <div className="flex items-center gap-2.5 border-b border-cw-divider bg-cw-bg-sunken px-4 py-1.5 text-[12.5px] text-cw-text-muted">
          Width
          <Segmented size="sm" label={`Width of ${title}`} value={frame.size} onChange={frame.onSize} options={[{ value: "S", label: "S" }, { value: "M", label: "M" }, { value: "L", label: "L" }]} />
        </div>
      )}
      {children}
    </section>
  );
}

function Loading({ lines = 3 }: { lines?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3 p-4">
      {["70%", "55%", "62%", "48%", "66%"].slice(0, lines).map((w, i) => <Skeleton key={i} w={w} />)}
    </div>
  );
}

function Failed({ what, detail, onRetry }: { what: string; detail?: string | null; onRetry: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2.5 p-4 text-[13px]">
      <MaskIcon name="cloud-off" size={16} color="var(--cw-danger-text)" />
      <span className="min-w-0 flex-1 text-cw-text-body">
        {what}
        {detail && <span className="mt-0.5 block font-mono text-[11.5px] text-cw-text-muted">{detail}</span>}
      </span>
      <Button size="sm" loading={busy} loadingLabel="Retrying…" onClick={async () => { setBusy(true); try { await onRetry(); } finally { setBusy(false); } }}>Retry</Button>
    </div>
  );
}

function Quiet({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-5 py-8 text-center">
      <MaskIcon name={icon} size={20} color="var(--cw-text-muted)" />
      <div className="text-[14px] font-bold text-cw-text">{title}</div>
      {children && <div className="max-w-[380px] text-[13px] leading-normal text-cw-text-muted">{children}</div>}
    </div>
  );
}

// ── Today ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Counters from the Digital Wall, read with the person's own session through the gateway. Each counter is its own
// request: one that fails shows a dash and says why, the others still count.

type Counter = { id: string; label: string; href: string; value: number | null; of?: number | null; tone?: "warning" | "danger"; error?: string | null };
const WALL = "/digital-wall/api";
async function wallJson<T>(path: string): Promise<{ data: T | null; error: string | null }> {
  const res = await fetch(`${WALL}${path}`, { cache: "no-store", credentials: "include" }).catch(() => null);
  const body = res ? await res.json().catch(() => null) : null;
  if (!res || !res.ok || body?.ok === false) return { data: null, error: body?.error ? String(body.error) : `${res?.status ?? "network"} · GET ${WALL}${path.split("?")[0]}` };
  return { data: body as T, error: null };
}

export function TodayBlock({ frame }: { frame: FrameControls }) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, loading, refresh } = usePollFn(async (): Promise<Counter[]> => {
    const [flights, delayed, notam, reports] = await Promise.all([
      wallJson<{ total: number }>(`/flights/normalized?date=${today}&limit=1`),
      wallJson<{ total: number }>(`/flights/normalized?date=${today}&limit=1&status=delayed`),
      wallJson<{ done: number; total: number }>("/notam-check/today"),
      wallJson<{ reports: Array<{ status?: string }> }>("/reports"),
    ]);
    const open = reports.data ? reports.data.reports.filter((r) => r.status !== "done" && r.status !== "impossible").length : null;
    const left = notam.data ? Math.max(0, (notam.data.total ?? 0) - (notam.data.done ?? 0)) : null;
    return [
      { id: "flights", label: "Flights today", href: "/digital-wall/console/flights", value: flights.data?.total ?? null, error: flights.error },
      { id: "delayed", label: "Delayed", href: "/digital-wall/console/flights", value: delayed.data?.total ?? null, tone: "warning", error: delayed.error },
      { id: "notam", label: "NOTAM checks left", href: "/digital-wall/console/notam-check", value: left, of: notam.data?.total ?? null, tone: "danger", error: notam.error },
      { id: "reports", label: "Open reports", href: "/digital-wall/console/reports", value: open, error: reports.error },
    ];
  }, 60_000);
  const failed = data?.every((c) => c.error);
  return (
    <BlockFrame title="Today" icon="gauge" meta="from the Digital Wall" frame={frame}>
      {loading && !data ? <Loading lines={4} /> : failed ? (
        <Failed what="Couldn't reach the Digital Wall." detail={data?.[0]?.error} onRetry={refresh} />
      ) : (
        <div className="grid grid-cols-2">
          {(data ?? []).map((c) => (
            <a key={c.id} href={c.href} title={c.error ? `Couldn't load: ${c.error}` : undefined}
              className="flex flex-col gap-1 border-b border-r border-cw-divider px-4 py-3.5 text-cw-text no-underline outline-none hover:bg-cw-bg-hover focus-visible:shadow-[inset_0_0_0_2px_var(--cw-focus)] [&:nth-child(2n)]:border-r-0">
              <span className="text-[12.5px] text-cw-text-muted">{c.label}</span>
              <span className={`font-mono text-[26px] font-semibold leading-tight ${c.value && c.tone === "warning" ? "text-cw-warning-text" : c.value && c.tone === "danger" ? "text-cw-danger-text" : "text-cw-text"}`}>
                {c.value ?? "—"}{c.value != null && c.of ? <span className="text-[13px] font-normal text-cw-text-muted"> of {c.of}</span> : null}
              </span>
              {c.error && <span className="text-[11.5px] text-cw-danger-text">Couldn&apos;t load</span>}
            </a>
          ))}
        </div>
      )}
    </BlockFrame>
  );
}

/** usePoll for a block that combines several requests: the function resolves to the block's data. */
function usePollFn<T>(fn: () => Promise<T>, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(async () => { try { setData(await fnRef.current()); } finally { setLoading(false); } }, []);
  useEffect(() => {
    void run();
    const t = window.setInterval(() => void run(), intervalMs);
    return () => window.clearInterval(t);
  }, [run, intervalMs]);
  return { data, loading, refresh: run };
}

// ── Recently used ────────────────────────────────────────────────────────────────────────────────────────────────────

type RecentItem = { resource: string; service: string; action: "Searched" | "Opened"; when: string; href: string };

export function RecentBlock({ frame }: { frame: FrameControls }) {
  const { data, loading, error, refresh } = usePoll<{ recents?: RecentItem[] }>("/api/dashboard/recents", 60_000);
  const recents = data?.recents ?? [];
  const cols = frame.size === "L" ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2";
  return (
    <BlockFrame title="Recently used" icon="history" meta="Pick up where you left off" frame={frame}>
      {loading && !data ? <Loading /> : error && !data ? <Failed what="Couldn't load your recent activity." detail={error} onRetry={refresh} /> : recents.length === 0 ? (
        <Quiet icon="history" title="Nothing recent yet">Airports you search or open appear here, so you can jump straight back in. <Link href="/aip" className="font-semibold text-cw-text-link">Search an airport</Link></Quiet>
      ) : (
        <div className={`grid ${cols}`}>
          {recents.slice(0, 8).map((r) => (
            <Link key={`${r.resource}-${r.when}`} href={r.href} className="flex flex-col gap-1 border-b border-r border-cw-divider px-4 py-3 text-cw-text no-underline outline-none hover:bg-cw-bg-hover focus-visible:shadow-[inset_0_0_0_2px_var(--cw-focus)]">
              <span className="flex items-center gap-2"><span className="font-mono text-[15px] font-semibold">{r.resource}</span><span className="text-[11px] text-cw-text-muted">{r.service}</span></span>
              <span className="font-mono text-[12px] text-cw-text-muted">{r.action} · {timeAgo(r.when)}</span>
            </Link>
          ))}
        </div>
      )}
    </BlockFrame>
  );
}

// ── Service monitors ─────────────────────────────────────────────────────────────────────────────────────────────────

type Check = { id: string; label: string; state: "operational" | "degraded" | "down" | "unknown"; lastChecked?: string | null; lastError?: string | null; latencyMs?: number | null };
const STATE_ORDER: Record<string, number> = { down: 0, degraded: 1, unknown: 2, operational: 3 };
const STATE_LOOK: Record<Check["state"], { dot: string; text: string; label: string }> = {
  operational: { dot: "bg-cw-success", text: "text-cw-success-text", label: "Operational" },
  degraded: { dot: "bg-cw-warning", text: "text-cw-warning-text", label: "Degraded" },
  down: { dot: "bg-cw-danger", text: "text-cw-danger-text", label: "Down" },
  unknown: { dot: "bg-cw-neutral", text: "text-cw-neutral-text", label: "Unknown" },
};

export function MonitorsBlock({ frame }: { frame: FrameControls }) {
  const { data, loading, offline, error, refresh } = usePoll<{ checks?: Check[]; lastSweep?: string | null }>("/api/service-checks", 30_000);
  const [rechecking, setRechecking] = useState(false);
  const checks = [...(data?.checks ?? [])].sort((a, b) => (STATE_ORDER[a.state] ?? 2) - (STATE_ORDER[b.state] ?? 2) || a.label.localeCompare(b.label));
  const ok = checks.filter((c) => c.state === "operational").length;
  const bad = checks.length - ok;
  const recheck = async () => {
    setRechecking(true);
    try { await fetch("/api/service-checks/recheck", { method: "POST", credentials: "include" }); await refresh(); } catch { /* the next poll picks it up */ } finally { setRechecking(false); }
  };
  return (
    <BlockFrame title="Service monitors" icon="activity" meta={data?.lastSweep ? <>checked <span className="font-mono">{utcClock(data.lastSweep)}</span></> : undefined}
      actions={!offline && data ? <IconButton icon="refresh-cw" label="Re-check now" size="sm" loading={rechecking} onClick={() => void recheck()} /> : undefined} frame={frame}>
      {offline ? <Quiet icon="activity" title="The service checker isn't running">Once it is deployed, each service&apos;s health appears here.</Quiet>
        : loading && !data ? <Loading lines={5} />
        : error && !data ? <Failed what="Couldn't reach the service checker." detail={error} onRetry={refresh} />
        : checks.length === 0 ? <Quiet icon="activity" title="No checks configured">The checker answered but reported no services yet.</Quiet>
        : (
          <>
            <div className="flex items-baseline gap-2 border-b border-cw-divider px-4 py-3">
              <span className="font-mono text-[22px] font-semibold text-cw-text">{ok}</span>
              <span className="text-[13px] text-cw-text-muted">of {checks.length} operational</span>
              {bad > 0 && <span className="ml-auto inline-flex h-[22px] items-center gap-1.5 self-center rounded-[6px] bg-cw-warning-tint px-2 text-[12px] font-semibold text-cw-warning-text"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-cw-warning" />{bad} need attention</span>}
            </div>
            <ul className="m-0 list-none p-0">
              {checks.map((c) => {
                const look = STATE_LOOK[c.state] ?? STATE_LOOK.unknown;
                const note = c.state === "operational" ? (c.latencyMs != null ? `${Math.round(c.latencyMs)} ms` : "") : c.lastError || "";
                return (
                  <li key={c.id} className="flex min-h-9 items-center gap-2.5 border-b border-cw-divider px-4 py-1.5 text-[13px] last:border-b-0">
                    <span aria-hidden className={`h-[7px] w-[7px] flex-none rounded-full ${look.dot}`} />
                    <span className="min-w-0 flex-1 truncate text-cw-text" title={c.label}>{c.label}</span>
                    {note && <span className="max-w-[40%] truncate font-mono text-[11.5px] text-cw-text-muted" title={note}>{note}</span>}
                    <span className={`w-[84px] flex-none text-right text-[12px] font-semibold ${look.text}`}>{look.label}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
    </BlockFrame>
  );
}

// ── Server health (admins) ───────────────────────────────────────────────────────────────────────────────────────────

type Metrics = {
  available?: boolean;
  cpu?: { load1?: number; cores?: number };
  tempC?: number | null;
  ram?: { totalB?: number; availB?: number };
  disks?: Array<{ mount?: string; sizeB?: number; usedB?: number; pct?: number }>;
  containers?: Array<{ name?: string; state?: string; status?: string }>;
  warnings?: string[];
};
const level = (pct: number | null, amber: number, red: number) => (pct == null ? "ok" : pct >= red ? "red" : pct >= amber ? "amber" : "ok");
const BAR = { ok: "bg-cw-success", amber: "bg-cw-warning", red: "bg-cw-danger" } as const;
const FG = { ok: "text-cw-text", amber: "text-cw-warning-text", red: "text-cw-danger-text" } as const;

export function HealthBlock({ frame }: { frame: FrameControls }) {
  const { data, loading, offline, error, refresh } = usePoll<Metrics>("/api/admin/metrics", 30_000);
  const collectorOffline = offline || data?.available === false;
  const cores = data?.cpu?.cores ?? 0, load1 = data?.cpu?.load1;
  const total = data?.ram?.totalB ?? 0, used = Math.max(0, total - (data?.ram?.availB ?? 0));
  const tiles = [
    { label: "CPU LOAD", value: load1 != null ? load1.toFixed(2) : "—", unit: cores ? `of ${cores}` : "", pct: load1 != null && cores ? (load1 / cores) * 100 : null, amber: 70, red: 90 },
    { label: "CPU TEMP", value: data?.tempC != null ? String(Math.round(data.tempC)) : "—", unit: data?.tempC != null ? "°C" : "", pct: data?.tempC != null ? (data.tempC / 95) * 100 : null, amber: 70, red: 87 },
    { label: "RAM", value: total ? formatBytes(used).replace(/ GB$/, "") : "—", unit: total ? `of ${formatBytes(total)}` : "", pct: total ? (used / total) * 100 : null, amber: 80, red: 92 },
  ];
  const disks = (data?.disks ?? []).map((d) => ({ ...d, pct: Math.max(0, Math.min(100, d.pct ?? (d.sizeB ? ((d.usedB ?? 0) / d.sizeB) * 100 : 0))) }));
  const unhealthy = (data?.containers ?? []).filter((c) => String(c.state ?? "").toLowerCase() !== "running" || /unhealthy|restarting|dead/i.test(String(c.status ?? "")));
  return (
    <BlockFrame title="Server health" icon="server" meta="admins only" frame={frame}>
      {collectorOffline ? <Quiet icon="server" title="The metrics collector isn't answering">Once it is live, CPU, memory, disk and container health appear here.</Quiet>
        : loading && !data ? <Loading />
        : error && !data ? <Failed what="Couldn't reach the server monitor." detail={error} onRetry={refresh} />
        : (
          <>
            {(data?.warnings?.length ?? 0) > 0 && (
              <ul className="m-0 flex list-none flex-col gap-1 border-b border-cw-warning-border bg-cw-warning-tint px-4 py-2.5">
                {data!.warnings!.slice(0, 3).map((w, i) => <li key={i} className="flex items-start gap-2 text-[12.5px] font-medium text-cw-warning-text"><MaskIcon name="triangle-alert" size={14} color="var(--cw-warning-text)" className="mt-px flex-none" /><span className="min-w-0">{w}</span></li>)}
                {data!.warnings!.length > 3 && <li className="pl-[22px] text-[12.5px] font-semibold text-cw-warning-text">and {data!.warnings!.length - 3} more</li>}
              </ul>
            )}
            <div className="grid grid-cols-3">
              {tiles.map((t) => {
                const lv = level(t.pct, t.amber, t.red);
                return (
                  <div key={t.label} className="border-r border-cw-divider px-4 py-3.5 last:border-r-0">
                    <div className="text-[11px] font-bold tracking-[0.08em] text-cw-text-muted">{t.label}</div>
                    <div className={`mt-1 font-mono text-[20px] font-semibold ${FG[lv]}`}>{t.value}<span className="text-[12px] font-normal text-cw-text-muted"> {t.unit}</span></div>
                    <span className="mt-2 block h-1 overflow-hidden rounded-sm bg-cw-bg-active"><span className={`block h-full ${BAR[lv]}`} style={{ width: `${Math.max(0, Math.min(100, t.pct ?? 0))}%` }} /></span>
                  </div>
                );
              })}
            </div>
            {disks.length > 0 && (
              <ul aria-label="Disk by volume" className="m-0 list-none border-t border-cw-divider p-0">
                {disks.filter((d) => d.pct >= 80).map((d, i) => {
                  const lv = level(d.pct, 80, 90);
                  return (
                    <li key={d.mount ?? i} className="flex min-h-9 items-center gap-3 border-b border-cw-divider px-4 text-[12.5px] last:border-b-0">
                      <span className={`w-[96px] flex-none truncate font-mono ${FG[lv]}`} title={d.mount}>{d.mount ?? "?"}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-sm bg-cw-bg-active"><span className={`block h-full ${BAR[lv]}`} style={{ width: `${d.pct}%` }} /></span>
                      <span className={`flex-none whitespace-nowrap text-right font-mono ${FG[lv]}`}>{formatBytes(d.usedB ?? 0)} / {formatBytes(d.sizeB ?? 0)}</span>
                    </li>
                  );
                })}
                {disks.some((d) => d.pct < 80) && (
                  <li className="flex min-h-9 items-center gap-2 px-4 text-[12.5px] text-cw-text-body"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-cw-success" />{disks.filter((d) => d.pct >= 80).length ? `${disks.filter((d) => d.pct < 80).length} other ${disks.filter((d) => d.pct < 80).length === 1 ? "volume" : "volumes"} under 80% full` : `All ${disks.length} volumes under 80% full`}</li>
                )}
              </ul>
            )}
            {(data?.containers?.length ?? 0) > 0 && (
              <div className="border-t border-cw-divider px-4 py-2.5 text-[12.5px] text-cw-text-body">
                {unhealthy.length === 0 ? <span className="flex items-center gap-2"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-cw-success" />All {data!.containers!.length} containers running</span> : (
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {unhealthy.slice(0, 3).map((c, i) => <li key={c.name ?? i} className="flex items-center gap-2 text-cw-danger-text"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-cw-danger" /><span className="font-mono">{c.name ?? "?"}</span><span className="truncate text-cw-text-muted">{c.status || c.state}</span></li>)}
                    {unhealthy.length > 3 && <li className="pl-3.5 font-semibold text-cw-danger-text">and {unhealthy.length - 3} more not running · {data!.containers!.length - unhealthy.length} running</li>}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
    </BlockFrame>
  );
}

// ── Quick links ──────────────────────────────────────────────────────────────────────────────────────────────────────

const LINKS: Array<{ icon: string; label: string; href: string; external?: boolean }> = [
  { icon: "search", label: "Airport search", href: "/aip" },
  { icon: "activity", label: "Service status", href: "/aip/service-status" },
  { icon: "monitor", label: "Digital Wall", href: "/digital-wall/timeline/", external: true },
  { icon: "file-check", label: "NOTAM check", href: "/digital-wall/console/notam-check", external: true },
  { icon: "bug", label: "Report a problem", href: "/help" },
];

export function LinksBlock({ frame }: { frame: FrameControls }) {
  const cls = "flex h-9 items-center gap-2.5 rounded-[8px] px-2.5 text-[13.5px] font-medium text-cw-text no-underline outline-none hover:bg-cw-bg-hover focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]";
  return (
    <BlockFrame title="Quick links" icon="link" frame={frame}>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-2">
        {LINKS.map((l) => {
          const inner = <><MaskIcon name={l.icon} size={15} color="var(--cw-text-muted)" /><span className="flex-1">{l.label}</span><MaskIcon name="arrow-up-right" size={14} color="var(--cw-text-muted)" /></>;
          return <li key={l.href}>{l.external ? <a href={l.href} className={cls}>{inner}</a> : <Link href={l.href} className={cls}>{inner}</Link>}</li>;
        })}
      </ul>
    </BlockFrame>
  );
}

// ── Changelog ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type ChangeEntry = { kind: "edit" | "error"; source: string; summary: string; actor: string | null; at: string };
export const SOURCE_ICON: Record<string, string> = {
  Airports: "plane", "Bug reports": "bug", Maintenance: "wrench", Email: "mail", "Debug runner": "terminal",
  "Wall — Important": "megaphone", "Wall — Reports": "clipboard-list", "Wall — Leon webhooks": "webhook",
};

export function ChangeRow({ e }: { e: ChangeEntry }) {
  const err = e.kind === "error";
  return (
    <li className={`grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-2.5 border-b border-cw-divider px-4 py-2.5 last:border-b-0 ${err ? "bg-cw-danger-tint" : ""}`}>
      <MaskIcon name={err ? "triangle-alert" : SOURCE_ICON[e.source] ?? "pencil"} size={14} color={err ? "var(--cw-danger-text)" : "var(--cw-text-muted)"} className="mt-0.5" />
      <span className="min-w-0">
        <span className={`block truncate text-[13px] leading-[1.45] text-cw-text ${err ? "font-semibold" : ""}`} title={e.summary}>{e.summary}</span>
        <span className="mt-0.5 block truncate text-[11.5px] text-cw-text-muted">{err ? "Error · " : ""}{e.source}{e.actor ? ` · ${e.actor}` : ""}</span>
      </span>
      <span className="font-mono text-[11.5px] text-cw-text-muted" title={e.at}>{timeAgo(e.at)}</span>
    </li>
  );
}

export function ChangelogBlock({ frame }: { frame: FrameControls }) {
  const { data, loading, error, refresh } = usePoll<{ entries?: ChangeEntry[]; scope?: "mine" | "everyone" }>("/api/dashboard/changelog?filter=all", 60_000);
  const entries = data?.entries ?? [];
  const everyone = data?.scope === "everyone";
  return (
    <BlockFrame title={everyone ? "Changelog — everyone" : "Your changelog"} icon="scroll-text" meta={entries.length > 6 ? "latest 6" : undefined}
      link={{ href: "/dashboard/changelog", label: "Full changelog" }} frame={frame}>
      {loading && !data ? <Loading lines={5} /> : error && !data ? <Failed what="Couldn't load the changelog." detail={error} onRetry={refresh} /> : entries.length === 0 ? (
        <Quiet icon="scroll-text" title="Nothing logged yet">{everyone ? "Edits to airports, bulletins, reports and settings appear here as they happen." : "Your edits to airports, reports and settings appear here as they happen."}</Quiet>
      ) : (
        <ul className="m-0 list-none p-0">{entries.slice(0, 6).map((e, i) => <ChangeRow key={`${e.at}-${i}`} e={e} />)}</ul>
      )}
    </BlockFrame>
  );
}
