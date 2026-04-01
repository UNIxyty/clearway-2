"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeftIcon } from "lucide-react";

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
  const [data, setData] = useState<MaintenanceData>({
    enabled: false,
    message: "",
    eta_text: "",
  });

  useEffect(() => {
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
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/profile")}>
            <ArrowLeftIcon className="size-4 mr-1" />
            Back
          </Button>
        </div>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Maintenance Control</CardTitle>
            <CardDescription>
              Enable or disable portal-wide maintenance mode.
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
                  <Button type="button" variant="outline" onClick={() => router.push("/admin/users")}>
                    Manage admin users
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
      </div>
    </div>
  );
}
