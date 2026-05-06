"use client";

import { useEffect, useMemo, useState } from "react";
import {
  COUNTRY_SERVICE_STATE_META,
  COUNTRY_SERVICE_STATES,
  type CountryServiceSummaryResponse,
} from "@/lib/country-service-status-shared";
import type { BugReportRow } from "@/lib/bug-reports-shared";
import BugReportModal from "@/components/bug-report-modal";
import BugReportBanner from "@/components/bug-report-banner";

type Props = {
  currentCountry?: string | null;
  currentIcao?: string | null;
};

function normalizeCountry(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export default function CountryServiceStatusBanner({ currentCountry, currentIcao }: Props) {
  const [data, setData] = useState<CountryServiceSummaryResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const [reports, setReports] = useState<BugReportRow[]>([]);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);

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

      try {
        const res = await fetch("/api/bug-reports", { cache: "no-store" });
        if (!res.ok) return;
        const payload = (await res.json()) as { reports?: BugReportRow[] };
        if (!cancelled) {
          setReports(Array.isArray(payload.reports) ? payload.reports : []);
        }
      } catch {
        // best-effort UI, ignore fetch failures
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
    if (totalStatuses === 0) return "conic-gradient(#9ca3af 0deg 360deg)";
    let cursor = 0;
    const segments: string[] = [];
    const colors: Record<(typeof COUNTRY_SERVICE_STATES)[number], string> = {
      not_checked: "#9ca3af",
      in_work: "#f97316",
      partially_works: "#f59e0b",
      operational: "#22c55e",
      issues: "#ef4444",
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

  async function submitReport(payload: { airportIcao: string; description: string }) {
    setReportSubmitting(true);
    setReportError(null);
    try {
      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; report?: BugReportRow };
      if (!res.ok || !body.report) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setReports((prev) => [body.report!, ...prev]);
      setReportModalOpen(false);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Failed to send bug report");
    } finally {
      setReportSubmitting(false);
    }
  }

  return (
    <div
      className="fixed top-3 left-3 z-[70]"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        className={`max-w-[300px] rounded-md border px-2.5 py-1.5 shadow-md backdrop-blur text-[10px] ${
          hasAnyRunningDebug
            ? "border-orange-300 bg-orange-50/95 text-orange-900 dark:border-orange-700 dark:bg-orange-950/70 dark:text-orange-200"
            : "bg-background/95 text-muted-foreground"
        }`}
      >
        <div className="font-medium text-foreground text-[11px]">Portal Service Status</div>
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
        <div className="mt-1">
          <button
            type="button"
            className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-muted"
            onClick={() => setReportModalOpen(true)}
          >
            Found a bug
          </button>
        </div>
        {warning && <div className="mt-1 text-amber-600 text-[10px]">{warning}</div>}
      </div>

      <div
        className={`absolute left-0 mt-1.5 w-[360px] max-h-[60vh] overflow-hidden rounded-md border bg-background shadow-xl transition-all duration-200 ease-out origin-top-left ${
          open
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
        }`}
      >
        <div className="border-b px-3 py-2 text-sm font-medium">Country service statuses</div>
        {hasAnyRunningDebug && (
          <div className="border-b px-3 py-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/40">
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
          <div className="text-[11px] text-muted-foreground grid grid-cols-1 gap-0.5">
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
        <div className="border-b px-3 py-2 text-xs text-muted-foreground grid grid-cols-1 gap-1">
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
                <div className="truncate text-foreground">{row.country}</div>
                {row.runningDebug && (
                  <div className="text-amber-600">
                    Currently debug script is running for this country, you may experience troubles and bugs.
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${COUNTRY_SERVICE_STATE_META[row.state].dotClass}`} />
                <span className="text-muted-foreground">{COUNTRY_SERVICE_STATE_META[row.state].label}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t px-3 py-2">
          <BugReportBanner reports={reports} />
        </div>
      </div>
      <BugReportModal
        open={reportModalOpen}
        initialIcao={currentIcao}
        submitting={reportSubmitting}
        error={reportError}
        onClose={() => setReportModalOpen(false)}
        onSubmit={submitReport}
      />
    </div>
  );
}
