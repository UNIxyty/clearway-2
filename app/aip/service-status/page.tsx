"use client";

// Service status — the floating "Portal Service Status" banner re-homed as a
// proper page (portal redesign), now living under the AIP topic at
// /aip/service-status (audit §5.2; the old /status is a thin redirect).
// Same data source and 10-second poll as the old overlay:
// GET /api/country-service-status (Supabase statuses + all known countries
// + live debug-runner countries). Read-only here; admins still edit states
// at /admin/country-service-status.

import { useEffect, useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";
import PortalShell from "@/components/portal/Shell";
import { PCard, PSectionTitle, PTh } from "@/components/portal/ui";
import {
  COUNTRY_SERVICE_STATES,
  COUNTRY_SERVICE_STATE_META,
  type CountryServiceState,
} from "@/lib/country-service-status-shared";

type Row = {
  country: string;
  state: CountryServiceState;
  note?: string;
  updatedAt?: string | null;
  runningDebug?: boolean;
};

export default function ServiceStatusPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [stateFilter, setStateFilter] = useState<CountryServiceState | "all">("all");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/country-service-status", { cache: "no-store" });
        if (!res.ok) throw new Error(`Status request failed (${res.status})`);
        const data = await res.json();
        if (alive && Array.isArray(data.countries)) {
          setRows(data.countries);
          setError("");
        }
      } catch (err) {
        if (alive && !rows) setError(err instanceof Error ? err.message : String(err));
      }
    };
    load();
    const timer = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const map = Object.fromEntries(COUNTRY_SERVICE_STATES.map((s) => [s, 0])) as Record<
      CountryServiceState,
      number
    >;
    for (const row of rows ?? []) if (map[row.state] !== undefined) map[row.state] += 1;
    return map;
  }, [rows]);

  const total = (rows ?? []).length;

  // Same computation as the old banner: one conic-gradient sweep per state,
  // proportional to its share, in COUNTRY_SERVICE_STATES order.
  const pie = useMemo(() => {
    if (!total) return "#d6d8dc";
    let acc = 0;
    const stops: string[] = [];
    for (const state of COUNTRY_SERVICE_STATES) {
      const share = (counts[state] / total) * 360;
      if (share <= 0) continue;
      stops.push(`${COUNTRY_SERVICE_STATE_META[state].hex} ${acc}deg ${acc + share}deg`);
      acc += share;
    }
    return `conic-gradient(${stops.join(",")})`;
  }, [counts, total]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (rows ?? [])
      .filter((r) => (stateFilter === "all" ? true : r.state === stateFilter))
      .filter((r) => (q ? r.country.toLowerCase().includes(q) : true));
  }, [rows, filter, stateFilter]);

  const anyDebug = (rows ?? []).some((r) => r.runningDebug);

  return (
    <PortalShell
      title="Service status"
      crumb="/aip/service-status"
      subtitle="Where AIP retrieval currently works, by country. States are set by the Clearway team as services are verified."
    >
      <div className="max-w-[1560px] px-[30px] pb-10 pt-[26px]">
        {error && !rows && (
          <PCard className="mb-5 border-[#f6cdcf] bg-[#fdf2f2] px-4 py-3 text-sm text-[#a12a2e]">
            {error}
          </PCard>
        )}

        {anyDebug && (
          <PCard className="mb-5 flex items-center gap-3.5 border-l-4 border-l-amber-500 px-[18px] py-3.5">
            <span className="h-2.5 w-2.5 flex-none animate-pulse rounded-full bg-amber-500" />
            <div className="flex-1 text-[14.5px] text-[#3a3d44]">
              A debug script is currently running — some countries may briefly report errors while
              it works.
            </div>
          </PCard>
        )}

        <div className="flex flex-wrap items-start gap-5">
          <PCard className="max-w-[400px] flex-[1_1_340px] p-[22px]">
            <PSectionTitle className="mb-[18px]">COUNTRY SERVICE STATUSES</PSectionTitle>
            <div className="mb-5 flex justify-center">
              <div
                className="flex h-[196px] w-[196px] items-center justify-center rounded-full"
                style={{ background: pie }}
              >
                <div className="flex h-[132px] w-[132px] flex-col items-center justify-center rounded-full bg-white">
                  <div className="font-mono text-3xl font-semibold leading-none">{total}</div>
                  <div className="mt-[5px] text-xs text-[#9aa0a8]">countries</div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-[9px]">
              {COUNTRY_SERVICE_STATES.map((state) => {
                const meta = COUNTRY_SERVICE_STATE_META[state];
                const n = counts[state];
                const pct = total ? Math.round((n / total) * 100) : 0;
                return (
                  <div key={state} className="flex items-center gap-[11px]" title={meta.description}>
                    <span
                      className="h-[11px] w-[11px] flex-none rounded-[3px]"
                      style={{ background: meta.hex }}
                    />
                    <span className="flex-1 text-[13.5px] text-[#3a3d44]">{meta.label}</span>
                    <span className="font-mono text-[13px] font-semibold">{n}</span>
                    <span className="w-11 text-right font-mono text-xs text-[#9aa0a8]">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </PCard>

          <PCard className="min-w-0 flex-[1_1_480px] overflow-hidden">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-[#eef0f2] px-[18px] py-3.5">
              <div className="flex h-[38px] min-w-[200px] flex-1 items-center gap-[9px] rounded-[10px] border border-[#d6d8dc] bg-white px-3">
                <SearchIcon className="h-[15px] w-[15px] text-[#9aa0a8]" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter countries…"
                  className="flex-1 border-none bg-transparent font-sans text-[13.5px] outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setStateFilter("all")}
                  className={`inline-flex cursor-pointer items-center gap-[7px] rounded-full border px-3 py-[7px] text-[12.5px] font-semibold ${
                    stateFilter === "all"
                      ? "border-[#2563eb] bg-[#eef4ff] text-[#1d4ed8]"
                      : "border-[#e6e7ea] bg-white text-[#6c7079]"
                  }`}
                >
                  All
                </button>
                {COUNTRY_SERVICE_STATES.map((state) => {
                  const meta = COUNTRY_SERVICE_STATE_META[state];
                  const on = stateFilter === state;
                  return (
                    <button
                      key={state}
                      onClick={() => setStateFilter(on ? "all" : state)}
                      className={`inline-flex cursor-pointer items-center gap-[7px] rounded-full border px-3 py-[7px] text-[12.5px] font-semibold ${
                        on
                          ? "border-[#2563eb] bg-[#eef4ff] text-[#1d4ed8]"
                          : "border-[#e6e7ea] bg-white text-[#6c7079]"
                      }`}
                      title={meta.description}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: meta.hex }} />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-[1.4fr_1.2fr_1fr] border-b border-[#eef0f2] bg-[#fbfbfc] px-[18px] py-2.5">
              <PTh>COUNTRY</PTh>
              <PTh>STATUS</PTh>
              <PTh className="text-right">NOTE</PTh>
            </div>
            <div className="max-h-[560px] overflow-auto">
              {visible.map((row) => {
                const meta = COUNTRY_SERVICE_STATE_META[row.state] ?? COUNTRY_SERVICE_STATE_META.not_checked;
                return (
                  <div
                    key={row.country}
                    className="grid grid-cols-[1.4fr_1.2fr_1fr] items-center border-b border-[#f2f3f5] px-[18px] py-3"
                  >
                    <div className="text-sm font-medium">{row.country}</div>
                    <div>
                      <span
                        className="inline-flex items-center gap-[7px] rounded-full px-2.5 py-1 text-xs font-semibold"
                        style={{ color: meta.hex, background: `${meta.hex}1a` }}
                      >
                        <span className="h-[7px] w-[7px] rounded-full" style={{ background: meta.hex }} />
                        {meta.label}
                        {row.runningDebug && <span className="text-[10px] text-amber-600">· debug running</span>}
                      </span>
                    </div>
                    <div className="text-right">
                      {row.note ? (
                        <span
                          title={row.note}
                          className="rounded-md bg-[#f0f1f3] px-2 py-[3px] text-[11.5px] text-[#6c7079]"
                        >
                          info
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {rows && visible.length === 0 && (
                <div className="px-[18px] py-8 text-center text-sm text-[#9aa0a8]">
                  No countries match.
                </div>
              )}
              {!rows && !error && (
                <div className="px-[18px] py-8 text-center text-sm text-[#9aa0a8]">Loading…</div>
              )}
            </div>
          </PCard>
        </div>
      </div>
    </PortalShell>
  );
}
