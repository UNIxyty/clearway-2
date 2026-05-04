"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  COUNTRY_SERVICE_STATE_META,
  COUNTRY_SERVICE_STATES,
  type CountryServiceState,
  type CountryServiceSummaryResponse,
} from "@/lib/country-service-status-shared";

type EditableRow = {
  country: string;
  state: CountryServiceState;
  note: string;
  runningDebug: boolean;
};

export default function AdminCountryServiceStatusPage() {
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingCountry, setSavingCountry] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/country-service-status", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as CountryServiceSummaryResponse;
        if (!cancelled) {
          setRows(
            payload.countries.map((row) => ({
              country: row.country,
              state: row.state,
              note: row.note || "",
              runningDebug: row.runningDebug,
            }))
          );
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(String((e as Error).message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const id = window.setInterval(load, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.country.toLowerCase().includes(q));
  }, [rows, query]);

  const updateRow = (country: string, patch: Partial<EditableRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.country === country ? { ...row, ...patch } : row))
    );
  };

  const saveRow = async (row: EditableRow) => {
    setSavingCountry(row.country);
    try {
      const res = await fetch("/api/admin/country-service-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: row.country,
          state: row.state,
          note: row.note,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setError(null);
    } catch (e) {
      setError(`Failed to save ${row.country}: ${String((e as Error).message || e)}`);
    } finally {
      setSavingCountry(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Country Service Status</h1>
        <p className="text-sm text-muted-foreground">
          Manage portal readiness statuses by country. Updates appear on the main portal banner without page reload.
        </p>
      </div>

      <Input
        placeholder="Search country..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="rounded-md border p-3 text-xs text-muted-foreground grid grid-cols-1 md:grid-cols-2 gap-1">
        {COUNTRY_SERVICE_STATES.map((state) => (
          <div key={state} className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${COUNTRY_SERVICE_STATE_META[state].dotClass}`} />
            <span>{COUNTRY_SERVICE_STATE_META[state].description}</span>
          </div>
        ))}
      </div>

      {error && <div className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-2">Country</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Note</th>
                <th className="text-left p-2">Debug</th>
                <th className="text-right p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.country} className="border-t align-top">
                  <td className="p-2">{row.country}</td>
                  <td className="p-2">
                    <select
                      className="h-9 rounded border bg-background px-2 text-sm"
                      value={row.state}
                      onChange={(e) =>
                        updateRow(row.country, { state: e.target.value as CountryServiceState })
                      }
                    >
                      {COUNTRY_SERVICE_STATES.map((state) => (
                        <option key={state} value={state}>
                          {COUNTRY_SERVICE_STATE_META[state].label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <Input
                      value={row.note}
                      onChange={(e) => updateRow(row.country, { note: e.target.value })}
                      placeholder="Optional note for this country"
                    />
                  </td>
                  <td className="p-2">
                    {row.runningDebug ? (
                      <span className="text-amber-600">Debug running</span>
                    ) : (
                      <span className="text-muted-foreground">Idle</span>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    <Button
                      size="sm"
                      disabled={savingCountry === row.country}
                      onClick={() => saveRow(row)}
                    >
                      {savingCountry === row.country ? "Saving..." : "Save"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
