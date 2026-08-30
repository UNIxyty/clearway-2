"use client";

// Dashboard region C — "Server health" (audit §6.5). ADMIN-ONLY: the parent
// hides this region for non-admins (same /api/admin/status probe the Shell
// uses — fail closed). Consumes the sibling agent's GET /api/admin/metrics,
// defensively: 404 / available:false → "collector offline". CPU/temp/RAM
// bars, per-volume disk bars (>=80% amber, >=90% red), containers with
// unhealthy highlighted, warnings banner on top. Polls every 30s.
import MaskIcon from "@/components/portal/Icon";
import { PButton } from "@/components/portal/ui";
import { LoadingRows, RegionCard, RegionNote, formatBytes, usePoll } from "./shared";

type Metrics = {
  available?: boolean;
  cpu?: { load1?: number; load5?: number; cores?: number };
  tempC?: number | null;
  ram?: { totalB?: number; availB?: number };
  disks?: Array<{ mount?: string; sizeB?: number; usedB?: number; pct?: number }>;
  containers?: Array<{ name?: string; state?: string; status?: string; cpuPct?: number; memB?: number }>;
  warnings?: string[];
};

const GREEN = "#16a34a";
const AMBER = "#f59e0b";
const RED = "#e5484d";

function barColor(pct: number, amberAt: number, redAt: number) {
  if (pct >= redAt) return RED;
  if (pct >= amberAt) return AMBER;
  return GREEN;
}

function MetricTile({
  label,
  value,
  sub,
  pct,
  amberAt = 70,
  redAt = 90,
}: {
  label: string;
  value: string;
  sub?: string;
  pct: number | null;
  amberAt?: number;
  redAt?: number;
}) {
  const clamped = pct == null ? null : Math.max(0, Math.min(100, pct));
  const warn = clamped != null && clamped >= amberAt;
  const color = clamped == null ? GREEN : barColor(clamped, amberAt, redAt);
  return (
    <div
      className="rounded-[11px] border p-[13px]"
      style={{
        borderColor: warn ? (clamped >= redAt ? "#f3c9c9" : "#f4d9ae") : "#eceef0",
        background: warn ? (clamped >= redAt ? "#fef7f7" : "#fffaf2") : "#fbfbfc",
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-[0.1em] text-cw-muted">{label}</span>
        {warn && <MaskIcon name="triangle-alert" size={14} color="#d97706" />}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[21px] font-semibold" style={{ color: warn ? (clamped >= redAt ? "#b91c1c" : "#b45309") : "#17181c" }}>
          {value}
        </span>
        {sub && <span className="text-xs text-cw-faint">{sub}</span>}
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded bg-[#eceef0]">
        <div
          className="h-full rounded"
          style={{ width: `${clamped ?? 0}%`, background: color }}
        />
      </div>
    </div>
  );
}

export default function ServerHealthCard() {
  const { data, loading, offline, error, refresh } = usePoll<Metrics>("/api/admin/metrics", 30_000);

  const collectorOffline = offline || data?.available === false;

  return (
    <RegionCard
      icon="server"
      title="Server health"
      headerRight={
        <span className="rounded-[5px] bg-[#dbeafe] px-[7px] py-[3px] text-[11px] font-bold tracking-[0.06em] text-[#1d4ed8]">
          ADMIN
        </span>
      }
    >
      {collectorOffline ? (
        <RegionNote
          icon="server"
          title="Checker offline"
          body="The metrics collector isn't answering — once /api/admin/metrics is live, host CPU, RAM, disk and container health appear here."
        />
      ) : loading && !data ? (
        <LoadingRows count={4} height={60} />
      ) : error && !data ? (
        <RegionNote
          icon="triangle-alert"
          iconColor="#e5484d"
          title="Couldn't load server metrics"
          body={error}
          action={
            <PButton size="sm" className="mt-1.5" onClick={() => refresh()}>
              Try again
            </PButton>
          }
        />
      ) : (
        <div className="pb-4">
          {(data?.warnings?.length ?? 0) > 0 && (
            <div className="mx-5 mt-4 flex flex-col gap-1 rounded-[10px] border border-[#f4d9ae] bg-[#fffaf2] px-3.5 py-2.5">
              {data!.warnings!.map((warning, i) => (
                <div key={i} className="flex items-start gap-2 text-[12.5px] font-medium text-[#b45309]">
                  <MaskIcon name="triangle-alert" size={14} color="#d97706" className="mt-px" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3.5 px-5 pt-4 sm:grid-cols-3">
            {(() => {
              const cores = data?.cpu?.cores ?? 0;
              const load1 = data?.cpu?.load1;
              const cpuPct = load1 != null && cores > 0 ? (load1 / cores) * 100 : null;
              return (
                <MetricTile
                  label="CPU LOAD"
                  value={load1 != null ? load1.toFixed(2) : "—"}
                  sub={cores ? `of ${cores} cores` : undefined}
                  pct={cpuPct}
                  amberAt={70}
                  redAt={90}
                />
              );
            })()}
            <MetricTile
              label="CPU TEMP"
              value={data?.tempC != null ? `${Math.round(data.tempC)}°C` : "—"}
              pct={data?.tempC != null ? (data.tempC / 95) * 100 : null}
              amberAt={70}
              redAt={87}
            />
            {(() => {
              const total = data?.ram?.totalB ?? 0;
              const avail = data?.ram?.availB ?? 0;
              const used = Math.max(0, total - avail);
              const pct = total > 0 ? (used / total) * 100 : null;
              return (
                <MetricTile
                  label="RAM"
                  value={total > 0 ? formatBytes(used) : "—"}
                  sub={total > 0 ? `of ${formatBytes(total)}` : undefined}
                  pct={pct}
                  amberAt={80}
                  redAt={92}
                />
              );
            })()}
          </div>

          {(data?.disks?.length ?? 0) > 0 && (
            <>
              <div className="px-5 pb-1 pt-4 text-[11px] font-bold tracking-[0.12em] text-cw-faint">
                DISK BY VOLUME
              </div>
              {data!.disks!.map((disk, i) => {
                const pct = Math.max(
                  0,
                  Math.min(
                    100,
                    disk.pct ?? (disk.sizeB ? ((disk.usedB ?? 0) / disk.sizeB) * 100 : 0),
                  ),
                );
                const hot = pct >= 80;
                const critical = pct >= 90;
                const fg = critical ? "#b91c1c" : hot ? "#b45309" : "#3a3d44";
                return (
                  <div key={disk.mount ?? i} className="flex items-center gap-3 border-t border-[#f4f5f6] px-5 py-2">
                    <span className="w-[110px] flex-none truncate font-mono text-[12.5px] font-medium" style={{ color: fg }} title={disk.mount}>
                      {disk.mount ?? "?"}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-[5px] bg-[#eceef0]">
                      <span
                        className="block h-full"
                        style={{ width: `${pct}%`, background: barColor(pct, 80, 90) }}
                      />
                    </span>
                    <span className="w-[118px] flex-none text-right font-mono text-[12.5px]" style={{ color: fg }}>
                      {formatBytes(disk.usedB ?? 0)} / {formatBytes(disk.sizeB ?? 0)}
                    </span>
                    {hot && (
                      <span
                        className="flex-none rounded-md px-2 py-[3px] text-[11px] font-bold tracking-[0.05em]"
                        style={{
                          color: critical ? "#b91c1c" : "#b45309",
                          background: critical ? "#fee2e2" : "#fef3e2",
                        }}
                      >
                        {Math.round(pct)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {(data?.containers?.length ?? 0) > 0 && (
            <>
              <div className="px-5 pb-1 pt-3.5 text-[11px] font-bold tracking-[0.12em] text-cw-faint">
                CONTAINERS
              </div>
              <div className="flex flex-col gap-1.5 px-3.5 pt-1.5">
                {data!.containers!.map((container, i) => {
                  const state = String(container.state ?? "").toLowerCase();
                  const status = String(container.status ?? "");
                  const unhealthy = state !== "running" || /unhealthy|restarting|dead/i.test(status);
                  return (
                    <div
                      key={container.name ?? i}
                      className="flex items-center gap-[11px] rounded-[10px] border px-3 py-[7px]"
                      style={{
                        borderColor: unhealthy ? "#f3c9c9" : "#eceef0",
                        background: unhealthy ? "#fef7f7" : "#fff",
                      }}
                    >
                      <span
                        className="h-2 w-2 flex-none rounded-full"
                        style={{ background: unhealthy ? RED : GREEN }}
                      />
                      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] font-medium text-cw-ink">
                        {container.name ?? "?"}
                      </span>
                      {container.memB != null && (
                        <span className="hidden flex-none font-mono text-[11.5px] text-cw-faint sm:inline">
                          {formatBytes(container.memB)}
                        </span>
                      )}
                      <span className="hidden max-w-[160px] flex-none truncate text-xs text-cw-muted md:inline" title={status}>
                        {status}
                      </span>
                      <span
                        className="flex-none rounded-md px-[9px] py-[3px] text-[11px] font-bold tracking-[0.05em]"
                        style={{
                          color: unhealthy ? "#b91c1c" : "#15803d",
                          background: unhealthy ? "#fee2e2" : "#e7f6ec",
                        }}
                      >
                        {unhealthy ? (state !== "running" ? state.toUpperCase() || "DOWN" : "UNHEALTHY") : "RUNNING"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </RegionCard>
  );
}
