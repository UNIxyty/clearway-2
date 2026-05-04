"use client";

import { useEffect, useMemo, useState } from "react";
import {
  COUNTRY_SERVICE_STATE_META,
  COUNTRY_SERVICE_STATES,
  type CountryServiceSummaryResponse,
} from "@/lib/country-service-status-shared";

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

  const warning = useMemo(() => {
    if (!data) return null;
    if (currentCountryState?.runningDebug) {
      return `Currently debug script is running for ${currentCountryState.country}, you may experience troubles and bugs.`;
    }
    if (data.hasGlobalRunningDebug) {
      return "Currently debug script is running for all countries, you may experience troubles and bugs.";
    }
    return null;
  }, [data, currentCountryState]);
  const rows = data?.countries ?? [];

  if (!data && !error) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[70]"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div className="rounded-md border bg-background/95 px-3 py-2 shadow-md backdrop-blur text-xs text-muted-foreground">
        <div className="font-medium text-foreground">Portal Service Status</div>
        <div>
          You can use the portal for your needs, but keep in mind that we are actively working on parts of it.
        </div>
        {warning && <div className="mt-1 text-amber-600">{warning}</div>}
      </div>

      {open && (
        <div className="mt-2 w-[420px] max-h-[60vh] overflow-hidden rounded-md border bg-background shadow-xl">
          <div className="border-b px-3 py-2 text-sm font-medium">Country service statuses</div>
          <div className="border-b px-3 py-2 text-xs text-muted-foreground grid grid-cols-1 gap-1">
            {COUNTRY_SERVICE_STATES.map((state) => (
              <div key={state} className="flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${COUNTRY_SERVICE_STATE_META[state].dotClass}`} />
                <span>{COUNTRY_SERVICE_STATE_META[state].description}</span>
              </div>
            ))}
          </div>
          <div className="max-h-[44vh] overflow-auto px-3 py-2 text-xs">
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
        </div>
      )}
    </div>
  );
}
