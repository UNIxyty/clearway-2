"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2Icon } from "lucide-react";
import PortalShell from "@/components/portal/Shell";

type MaintenanceData = {
  enabled: boolean;
  message: string | null;
  eta_text: string | null;
  updated_at?: string | null;
};

export default function AdminMaintenancePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [clearCacheLoading, setClearCacheLoading] = useState(false);
  const [clearCacheResult, setClearCacheResult] = useState<{ deleted: string[]; errors: string[]; total: number } | null>(null);
  const [data, setData] = useState<MaintenanceData>({
    enabled: false,
    message: "",
    eta_text: "",
  });

  useEffect(() => {
    fetch("/api/admin/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setIsDeveloper(Boolean(d?.isDeveloper)))
      .catch(() => {});
    fetch("/api/admin/maintenance", { cache: "no-store" })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error || "Failed to load maintenance settings");
        setData({
          enabled: Boolean(payload.enabled),
          message: payload.message ?? "",
          eta_text: payload.eta_text ?? "",
          updated_at: payload.updated_at ?? null,
        });
      })
      .catch((e) => setError((e as Error).message || "Failed to load maintenance settings"))
      .finally(() => setLoading(false));
  }, []);

  async function save(nextEnabled: boolean) {
    setSaving(true);
    setError(null);
    try {
      let etaText = data.eta_text ?? "";
      if (nextEnabled && !etaText.trim()) {
        etaText = window.prompt("Approximate maintenance time (e.g. 30 minutes, 2 days, 1 week)") || "";
      }

      const res = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: nextEnabled,
          message: data.message || null,
          eta_text: etaText || null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Failed to save");
      setData((prev) => ({
        ...prev,
        enabled: nextEnabled,
        eta_text: etaText,
        updated_at: payload?.maintenance?.updated_at ?? new Date().toISOString(),
      }));
    } catch (e) {
      setError((e as Error).message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalShell title="Maintenance Control" crumb="/admin/maintenance" subtitle="Enable or disable portal-wide maintenance mode.">
      <div className="max-w-3xl space-y-6 px-8 py-6">

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Maintenance Control</CardTitle>
            <CardDescription>
              Enable or disable portal-wide maintenance mode.
              {!isDeveloper && " Requires Developer role."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                {error && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}

                {isDeveloper ? (
                  <>
                    <label className="block text-sm">
                      <span className="font-medium">Message</span>
                      <Input
                        value={data.message ?? ""}
                        onChange={(e) => setData((prev) => ({ ...prev, message: e.target.value }))}
                        placeholder="Optional maintenance message"
                        className="mt-2"
                      />
                    </label>

                    <label className="block text-sm">
                      <span className="font-medium">ETA text</span>
                      <Input
                        value={data.eta_text ?? ""}
                        onChange={(e) => setData((prev) => ({ ...prev, eta_text: e.target.value }))}
                        placeholder="e.g. 30 minutes / 2 days / 1 week"
                        className="mt-2"
                      />
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <Button type="button" disabled={saving || data.enabled} onClick={() => save(true)}>
                        {saving ? "Saving…" : "Enable maintenance"}
                      </Button>
                      <Button type="button" variant="outline" disabled={saving || !data.enabled} onClick={() => save(false)}>
                        Disable maintenance
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    Maintenance mode is currently <strong>{data.enabled ? "enabled" : "disabled"}</strong>.
                    Only Developers can toggle it.
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => router.push("/admin/users")}>
                    Manage users
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <Link href="/admin/country-service-status">Country service statuses</Link>
                  </Button>
                </div>

                {data.updated_at && (
                  <p className="text-xs text-muted-foreground">
                    Last updated: {new Date(data.updated_at).toLocaleString()}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">PDF Cache</CardTitle>
            <CardDescription>
              Delete all cached AIP PDFs from storage. Airports will re-download PDFs on next sync.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              type="button"
              variant="destructive"
              disabled={clearCacheLoading}
              onClick={async () => {
                if (!confirm("Delete ALL cached AIP PDFs for all airports? They will re-download on next sync.")) return;
                setClearCacheResult(null);
                setClearCacheLoading(true);
                try {
                  const res = await fetch("/api/admin/aip/clear-cache", {
                    method: "DELETE",
                    credentials: "include",
                  });
                  const data = await res.json() as { deleted: string[]; errors: string[]; total: number };
                  setClearCacheResult(data);
                } catch (e) {
                  setClearCacheResult({ deleted: [], errors: [(e as Error)?.message ?? "Request failed"], total: 0 });
                } finally {
                  setClearCacheLoading(false);
                }
              }}
            >
              <Trash2Icon className={`size-4 mr-2 ${clearCacheLoading ? "animate-pulse" : ""}`} />
              {clearCacheLoading ? "Clearing cache…" : "Clear all PDF cache"}
            </Button>

            {clearCacheResult && (
              <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-3 text-xs space-y-1">
                <p className="font-medium text-foreground text-sm">
                  {clearCacheResult.total > 0
                    ? `Deleted ${clearCacheResult.total} file${clearCacheResult.total !== 1 ? "s" : ""}`
                    : "No cached PDF files found."}
                </p>
                {clearCacheResult.deleted.length > 0 && (
                  <div className="mt-2 max-h-64 overflow-y-auto space-y-0.5">
                    {clearCacheResult.deleted.map((f) => (
                      <p key={f} className="font-mono text-muted-foreground">{f}</p>
                    ))}
                  </div>
                )}
                {clearCacheResult.errors.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    <p className="font-medium text-destructive">Errors ({clearCacheResult.errors.length}):</p>
                    {clearCacheResult.errors.map((e) => (
                      <p key={e} className="font-mono text-destructive">{e}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
