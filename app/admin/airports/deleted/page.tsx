"use client";

import { useEffect, useState } from "react";
import { Trash2Icon } from "lucide-react";
import PortalShell from "@/components/portal/Shell";
import { PCard, PButton, PEmpty, PMono, PSectionTitle } from "@/components/portal/ui";

type DeletedAirportRow = {
  id: number;
  icao: string;
  airport_snapshot: {
    country?: string;
    state?: string;
    name?: string;
  } | null;
  deleted_reason?: string | null;
  deleted_at: string;
  restored_at?: string | null;
};

export default function DeletedAirportsPage() {
  const [rows, setRows] = useState<DeletedAirportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [restoringBulk, setRestoringBulk] = useState(false);

  async function loadRows() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/airports/list?include_deleted=true", { cache: "no-store" });
      const data = await res.json().catch(() => ({} as { error?: string; results?: DeletedAirportRow[] }));
      if (!res.ok) throw new Error(data.error || "Failed to load deleted airports.");
      const activeRows: DeletedAirportRow[] = (data.results ?? []).filter(
        (r: DeletedAirportRow) => !r.restored_at,
      );
      setRows(activeRows);
      setSelectedIds((prev) =>
        prev.filter((id) => activeRows.some((r: DeletedAirportRow) => r.id === id)),
      );
    } catch (e) {
      setError((e as { message?: string })?.message || "Failed to load deleted airports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
  }, []);

  async function restore(row: DeletedAirportRow) {
    setRestoringId(row.id);
    setError(null);
    try {
      const res = await fetch("/api/airports/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deletedId: row.id, icao: row.icao }),
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error(data.error || "Failed to restore airport.");
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (e) {
      setError((e as { message?: string })?.message || "Failed to restore airport.");
    } finally {
      setRestoringId(null);
    }
  }

  async function restoreSelected() {
    if (selectedIds.length === 0) return;
    setRestoringBulk(true);
    setError(null);
    const selectedRows = rows.filter((row) => selectedIds.includes(row.id));
    try {
      for (const row of selectedRows) {
        const res = await fetch("/api/airports/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deletedId: row.id, icao: row.icao }),
        });
        const data = await res.json().catch(() => ({} as { error?: string }));
        if (!res.ok) throw new Error(data.error || `Failed to restore ${row.icao}.`);
      }
      setRows((prev) => prev.filter((r) => !selectedIds.includes(r.id)));
      setSelectedIds([]);
    } catch (e) {
      setError((e as { message?: string })?.message || "Failed to restore selected airports.");
    } finally {
      setRestoringBulk(false);
    }
  }

  return (
    <PortalShell>
      <div className="max-w-[1100px] px-[30px] pb-10 pt-[26px]">
        <h1 className="m-0 mb-[5px] text-[26px] font-extrabold tracking-[-0.02em]">
          Deleted airports
        </h1>
        <p className="m-0 mb-5 text-[15px] text-[#6c7079]">
          Restore airports hidden from the portal menu.
        </p>

        {rows.length > 0 && (
          <div className="mb-4 flex items-center justify-between gap-2">
            <p className="m-0 text-[12.5px] text-[#6c7079]">
              <PMono className="font-semibold text-[#17181c]">{selectedIds.length}</PMono> selected
            </p>
            <PButton
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                void restoreSelected();
              }}
              disabled={selectedIds.length === 0 || restoringBulk}
            >
              {restoringBulk ? "Restoring selected…" : `Restore selected${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
            </PButton>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-[10px] border border-[#f0d4d4] bg-[#fdf2f2] px-3.5 py-2.5 text-sm text-[#a12a2e]">
            {error}
          </div>
        )}

        <PCard className="overflow-hidden">
          <div className="border-b border-[#eef0f2] px-[18px] py-4">
            <PSectionTitle>Recently deleted</PSectionTitle>
            <p className="m-0 mt-1 text-[13px] text-[#6c7079]">
              Airports hidden by your account. Restore returns airport to your browse menu.
            </p>
          </div>
          {loading ? (
            <p className="m-0 px-[18px] py-5 text-sm text-[#6c7079]">Loading…</p>
          ) : rows.length === 0 ? (
            <PEmpty icon={<Trash2Icon className="h-5 w-5" />} title="No deleted airports." />
          ) : (
            <div>
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center gap-3.5 border-b border-[#f2f3f5] px-[18px] py-3.5 last:border-b-0"
                >
                  <input
                    id={`deleted-airport-${row.id}`}
                    type="checkbox"
                    className="h-4 w-4 flex-none accent-[#2563eb]"
                    checked={selectedIds.includes(row.id)}
                    onChange={(e) => {
                      setSelectedIds((prev) =>
                        e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id),
                      );
                    }}
                    aria-label={`Select ${row.icao} for restore`}
                  />
                  <PMono className="w-16 flex-none text-[14.5px] font-semibold text-[#17181c]">
                    {row.icao}
                  </PMono>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-[14.5px] text-[#17181c]">
                      {row.airport_snapshot?.name || "Unnamed airport"}
                    </p>
                    <p className="m-0 mt-0.5 truncate text-xs text-[#6c7079]">
                      {(row.airport_snapshot?.country || "Unknown country") +
                        (row.airport_snapshot?.state ? ` · ${row.airport_snapshot.state}` : "")}
                    </p>
                  </div>
                  <PMono className="hidden flex-none text-[12.5px] text-[#9aa0a8] sm:block">
                    {new Date(row.deleted_at).toLocaleString()}
                  </PMono>
                  <button
                    type="button"
                    className="flex-none cursor-pointer rounded-[9px] border-none bg-[#eef4ff] px-3.5 py-2 text-[13px] font-semibold text-[#1d4ed8] hover:bg-[#e0eaff] disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      void restore(row);
                    }}
                    disabled={restoringId === row.id}
                  >
                    {restoringId === row.id ? "Restoring…" : "Restore"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </PCard>
      </div>
    </PortalShell>
  );
}
