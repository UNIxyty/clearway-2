"use client";

import { useEffect, useMemo, useState } from "react";
import {
  COUNTRY_SERVICE_STATE_META,
  COUNTRY_SERVICE_STATES,
  type CountryServiceSummaryResponse,
} from "@/lib/country-service-status-shared";
import { cw } from "@/lib/portal-tokens";

type Props = {
  currentCountry?: string | null;
};

function normalizeCountry(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export default function CountryServiceStatusBanner({ currentCountry }: Props) {
  const [data, setData] = useState<CountryServiceSummaryResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/country-service-status", { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            if (!cancelled) setData(null);
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const payload = (await res.json()) as CountryServiceSummaryResponse;
        if (!cancelled) {
          setError(false);
          setData(payload);
        }
      } catch {
        if (!cancelled) setError(true);
      }

    };

    load();
    const id = window.setInterval(load, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const currentCountryState = useMemo(() => {
    if (!data || !currentCountry) return null;
    const target = normalizeCountry(currentCountry);
    return data.countries.find((row) => normalizeCountry(row.country) === target) || null;
  }, [data, currentCountry]);
  const rows = data?.countries ?? [];
  const runningCountries = useMemo(
    () => rows.filter((row) => row.runningDebug).map((row) => row.country),
    [rows]
  );
  const hasAnyRunningDebug = runningCountries.length > 0 || Boolean(data?.hasGlobalRunningDebug);

  const warning = useMemo(() => {
    if (!data) return null;
    if (runningCountries.length > 0) {
      const shown = runningCountries.slice(0, 6).join(", ");
      const extra = runningCountries.length > 6 ? ` +${runningCountries.length - 6} more` : "";
      return `Currently debug script is running for: ${shown}${extra}. You may experience troubles and bugs.`;
    }
    if (currentCountryState?.runningDebug) {
      return `Currently debug script is running for ${currentCountryState.country}, you may experience troubles and bugs.`;
    }
    if (data.hasGlobalRunningDebug) {
      return "Currently debug script is running for all countries, you may experience troubles and bugs.";
    }
    return null;
  }, [data, currentCountryState, runningCountries]);
  const statusCounts = useMemo(() => {
    const counts = {
      not_checked: 0,
      in_work: 0,
      partially_works: 0,
      operational: 0,
      issues: 0,
    };
    for (const row of rows) counts[row.state] += 1;
    return counts;
  }, [rows]);
  const totalStatuses = useMemo(
    () => COUNTRY_SERVICE_STATES.reduce((sum, s) => sum + statusCounts[s], 0),
    [statusCounts]
  );
  const pieBackground = useMemo(() => {
    if (totalStatuses === 0) return `conic-gradient(${cw.neutral} 0deg 360deg)`;
    let cursor = 0;
    const segments: string[] = [];
    const colors: Record<(typeof COUNTRY_SERVICE_STATES)[number], string> = {
      not_checked: cw.neutral,
      in_work: cw.orange,
      partially_works: cw.warning,
      operational: cw.success,
      issues: cw.danger,
    };
    for (const state of COUNTRY_SERVICE_STATES) {
      const value = statusCounts[state];
      if (value <= 0) continue;
      const sweep = (value / totalStatuses) * 360;
      const next = cursor + sweep;
      segments.push(`${colors[state]} ${cursor.toFixed(2)}deg ${next.toFixed(2)}deg`);
      cursor = next;
    }
    return `conic-gradient(${segments.join(", ")})`;
  }, [statusCounts, totalStatuses]);

  if (!data && !error) return null;

  return (
    <div
      className="fixed top-3 left-3 z-[70]"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        className={`w-[300px] rounded-md border px-2.5 py-1.5 shadow-md backdrop-blur text-[10px] ${
          hasAnyRunningDebug
            ? "border-cw-orange-border bg-cw-orange-tint/95 text-cw-orange-text"
            : "bg-cw-bg-page/95 text-cw-text-muted"
        }`}
      >
        <div className="font-medium text-cw-text text-[11px]">Portal Service Status</div>
        <div className="flex items-center gap-1 my-0.5">
          {COUNTRY_SERVICE_STATES.map((state) => (
            <span
              key={state}
              className={`inline-block h-2 w-2 rounded-full ${COUNTRY_SERVICE_STATE_META[state].dotClass}`}
            />
          ))}
        </div>
        <div>
          You can use the portal for your needs, but keep in mind that we are actively working on parts of it.
        </div>
        {warning && <div className="mt-1 text-cw-warning-text text-[10px]">{warning}</div>}
      </div>

      <div
        className={`absolute left-0 mt-1.5 w-[360px] max-h-[60vh] overflow-hidden rounded-md border bg-cw-bg-page shadow-xl transition-all duration-200 ease-out origin-top-left ${
          open
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
        }`}
      >
        <div className="border-b px-3 py-2 text-sm font-medium">Country service statuses</div>
        {hasAnyRunningDebug && (
          <div className="border-b px-3 py-2 text-xs text-cw-warning-text bg-cw-warning-tint/70">
            {data?.hasGlobalRunningDebug
              ? "Debug is currently running globally for all countries."
              : `Debug is currently running for: ${runningCountries.join(", ")}`}
          </div>
        )}
        <div className="border-b px-3 py-2 flex items-center gap-3">
          <div
            className="h-12 w-12 rounded-full border shrink-0"
            style={{ background: pieBackground }}
            title="Portal status distribution"
          />
          <div className="text-[11px] text-cw-text-muted grid grid-cols-1 gap-0.5">
            {COUNTRY_SERVICE_STATES.map((state) => {
              const count = statusCounts[state];
              const percent = totalStatuses > 0 ? Math.round((count / totalStatuses) * 100) : 0;
              return (
                <div key={state} className="flex items-center gap-2">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${COUNTRY_SERVICE_STATE_META[state].dotClass}`} />
                  <span>{COUNTRY_SERVICE_STATE_META[state].label}: {count} ({percent}%)</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="border-b px-3 py-2 text-xs text-cw-text-muted grid grid-cols-1 gap-1">
          {COUNTRY_SERVICE_STATES.map((state) => (
            <div key={state} className="flex items-center gap-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${COUNTRY_SERVICE_STATE_META[state].dotClass}`} />
              <span>{COUNTRY_SERVICE_STATE_META[state].description}</span>
            </div>
          ))}
        </div>
        <div className="max-h-[32vh] overflow-auto px-3 py-2 text-xs">
          {rows.map((row) => (
            <div key={row.country} className="flex items-center justify-between gap-2 py-1 border-b last:border-b-0">
              <div className="min-w-0">
                <div className="truncate text-cw-text">{row.country}</div>
                {row.runningDebug && (
                  <div className="text-cw-warning-text">
                    Currently debug script is running for this country, you may experience troubles and bugs.
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${COUNTRY_SERVICE_STATE_META[row.state].dotClass}`} />
                <span className="text-cw-text-muted">{COUNTRY_SERVICE_STATE_META[row.state].label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
