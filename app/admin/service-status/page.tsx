"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";
import PortalShell from "@/components/portal/Shell";
import { PCard, PButton, PChip, PTh } from "@/components/portal/ui";
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
    <PortalShell>
      <div className="max-w-[1560px] px-[30px] pb-10 pt-[26px]">
        <h1 className="m-0 mb-[5px] text-[26px] font-extrabold tracking-[-0.02em]">
          Country Service Status
        </h1>
        <p className="m-0 mb-5 text-[15px] text-[#6c7079]">
          Manage portal readiness statuses by country. Updates appear on the main portal banner without page reload.
        </p>

        <PCard className="mb-4 grid grid-cols-1 gap-2 p-[18px] md:grid-cols-2">
          {COUNTRY_SERVICE_STATES.map((state) => (
            <div key={state} className="flex items-center gap-2.5 text-[12.5px] text-[#6c7079]">
              <span
                className="h-[9px] w-[9px] flex-none rounded-full"
                style={{ background: COUNTRY_SERVICE_STATE_META[state].hex }}
              />
              <span>{COUNTRY_SERVICE_STATE_META[state].description}</span>
            </div>
          ))}
        </PCard>

        {error && (
          <div className="mb-4 rounded-[10px] border border-[#f0d4d4] bg-[#fdf2f2] px-3.5 py-2.5 text-sm text-[#a12a2e]">
            {error}
          </div>
        )}
        {loading ? (
          <div className="text-sm text-[#6c7079]">Loading...</div>
        ) : (
          <PCard className="overflow-hidden">
            <div className="border-b border-[#eef0f2] px-[18px] py-3.5">
              <div className="flex h-[38px] max-w-[360px] items-center gap-2.5 rounded-[10px] border border-[#d6d8dc] bg-white px-3">
                <SearchIcon className="h-[15px] w-[15px] flex-none text-[#9aa0a8]" />
                <input
                  className="min-w-0 flex-1 border-none bg-transparent text-[13.5px] text-[#17181c] outline-none placeholder:text-[#9aa0a8]"
                  placeholder="Search country..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-[#fbfbfc]">
                  <tr>
                    <th className="border-b border-[#eef0f2] px-[18px] py-2.5 text-left">
                      <PTh>COUNTRY</PTh>
                    </th>
                    <th className="border-b border-[#eef0f2] px-3 py-2.5 text-left">
                      <PTh>STATUS</PTh>
                    </th>
                    <th className="border-b border-[#eef0f2] px-3 py-2.5 text-left">
                      <PTh>NOTE</PTh>
                    </th>
                    <th className="border-b border-[#eef0f2] px-3 py-2.5 text-left">
                      <PTh>DEBUG</PTh>
                    </th>
                    <th className="border-b border-[#eef0f2] px-[18px] py-2.5 text-right">
                      <PTh className="text-right">ACTION</PTh>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.country} className="border-t border-[#f2f3f5] align-middle">
                      <td className="px-[18px] py-2.5 font-semibold text-[#17181c]">
                        {row.country}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="h-[9px] w-[9px] flex-none rounded-full"
                            style={{ background: COUNTRY_SERVICE_STATE_META[row.state].hex }}
                          />
                          <select
                            className="h-9 cursor-pointer rounded-[10px] border border-[#d6d8dc] bg-white px-2 text-[13px] text-[#17181c] outline-none focus:border-[#2563eb]"
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
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          className="h-9 w-full min-w-[220px] rounded-[10px] border border-[#d6d8dc] bg-white px-3 text-[13px] text-[#17181c] outline-none placeholder:text-[#9aa0a8] focus:border-[#2563eb]"
                          value={row.note}
                          onChange={(e) => updateRow(row.country, { note: e.target.value })}
                          placeholder="Optional note for this country"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        {row.runningDebug ? (
                          <PChip color="#c2703b" bg="#fdf1e8">Debug running</PChip>
                        ) : (
                          <PChip color="#6c7079" bg="#f0f1f3">Idle</PChip>
                        )}
                      </td>
                      <td className="px-[18px] py-2.5 text-right">
                        <PButton
                          size="sm"
                          variant="primary"
                          disabled={savingCountry === row.country}
                          onClick={() => saveRow(row)}
                        >
                          {savingCountry === row.country ? "Saving..." : "Save"}
                        </PButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PCard>
        )}
      </div>
    </PortalShell>
  );
}
