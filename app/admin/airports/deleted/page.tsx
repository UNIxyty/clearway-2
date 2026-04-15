"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
  const router = useRouter();
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
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Deleted airports</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Restore airports hidden from the portal menu.
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push("/")}>
            Back to portal
          </Button>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {selectedIds.length} selected
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                void restoreSelected();
              }}
              disabled={selectedIds.length === 0 || restoringBulk}
            >
              {restoringBulk ? "Restoring selected…" : `Restore selected${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
            </Button>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Recently deleted</CardTitle>
            <CardDescription>
              Airports hidden by your account. Restore returns airport to your browse menu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deleted airports.</p>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/70 px-3 py-2"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <input
                        id={`deleted-airport-${row.id}`}
                        type="checkbox"
                        className="mt-1 size-4"
                        checked={selectedIds.includes(row.id)}
                        onChange={(e) => {
                          setSelectedIds((prev) =>
                            e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id),
                          );
                        }}
                        aria-label={`Select ${row.icao} for restore`}
                      />
                      <div className="min-w-0">
                      <p className="text-sm font-medium">
                        <span className="font-mono mr-2">{row.icao}</span>
                        <span>{row.airport_snapshot?.name || "Unnamed airport"}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(row.airport_snapshot?.country || "Unknown country") +
                          (row.airport_snapshot?.state ? ` · ${row.airport_snapshot.state}` : "")}
                        {" · "}
                        {new Date(row.deleted_at).toLocaleString()}
                      </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        void restore(row);
                      }}
                      disabled={restoringId === row.id}
                    >
                      {restoringId === row.id ? "Restoring…" : "Restore"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
