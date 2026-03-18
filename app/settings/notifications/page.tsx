"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "lucide-react";
import {
  DEFAULT_NOTIFICATION_PREFS,
  getNotificationPermission,
  isNotificationSupported,
  requestNotificationPermission,
  type NotificationPrefs,
} from "@/lib/notifications";

export default function NotificationSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);

  useEffect(() => {
    fetch("/api/user/preferences")
      .then((res) => res.json())
      .then((data) => {
        if (data.preferences) {
          setNotificationPrefs((prev) => ({
            ...prev,
            notify_enabled: data.preferences.notify_enabled ?? prev.notify_enabled,
            notify_search_start: data.preferences.notify_search_start ?? prev.notify_search_start,
            notify_search_end: data.preferences.notify_search_end ?? prev.notify_search_end,
            notify_notam: data.preferences.notify_notam ?? prev.notify_notam,
            notify_aip: data.preferences.notify_aip ?? prev.notify_aip,
            notify_gen: data.preferences.notify_gen ?? prev.notify_gen,
          }));
        }
      })
      .catch((err) => {
        setError(err.message || "Failed to load preferences");
      })
      .finally(() => {
        if (isNotificationSupported()) {
          setNotificationPermission(getNotificationPermission());
        }
        setLoading(false);
      });
  }, []);

  async function handleSave() {
    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      const res = await fetch("/api/user/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notify_enabled: notificationPrefs.notify_enabled,
          notify_search_start: notificationPrefs.notify_search_start,
          notify_search_end: notificationPrefs.notify_search_end,
          notify_notam: notificationPrefs.notify_notam,
          notify_aip: notificationPrefs.notify_aip,
          notify_gen: notificationPrefs.notify_gen,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError((e as Error).message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleNotificationPermission() {
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading notification settings…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/settings")}>
            <ArrowLeftIcon className="size-4 mr-1" />
            Back to Settings
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Browser Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose which events should display native browser notifications.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
            Notification settings saved successfully
          </div>
        )}

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Notification Preferences</CardTitle>
            <CardDescription>
              Enable browser notifications and control which sync events create alerts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Permission</p>
                <p className="text-xs text-muted-foreground">
                  Status: {isNotificationSupported() ? notificationPermission : "unsupported"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleNotificationPermission}
                disabled={!isNotificationSupported() || notificationPermission === "granted"}
              >
                {notificationPermission === "granted" ? "Granted" : "Enable Notifications"}
              </Button>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={notificationPrefs.notify_enabled}
                  onChange={(e) =>
                    setNotificationPrefs((prev) => ({ ...prev, notify_enabled: e.target.checked }))
                  }
                />
                Enable notifications
              </label>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={notificationPrefs.notify_search_start}
                  onChange={(e) =>
                    setNotificationPrefs((prev) => ({ ...prev, notify_search_start: e.target.checked }))
                  }
                  disabled={!notificationPrefs.notify_enabled}
                />
                Search started
              </label>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={notificationPrefs.notify_search_end}
                  onChange={(e) =>
                    setNotificationPrefs((prev) => ({ ...prev, notify_search_end: e.target.checked }))
                  }
                  disabled={!notificationPrefs.notify_enabled}
                />
                Search completed
              </label>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={notificationPrefs.notify_notam}
                  onChange={(e) =>
                    setNotificationPrefs((prev) => ({ ...prev, notify_notam: e.target.checked }))
                  }
                  disabled={!notificationPrefs.notify_enabled}
                />
                NOTAM retrieved
              </label>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={notificationPrefs.notify_aip}
                  onChange={(e) =>
                    setNotificationPrefs((prev) => ({ ...prev, notify_aip: e.target.checked }))
                  }
                  disabled={!notificationPrefs.notify_enabled}
                />
                AIP retrieved
              </label>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={notificationPrefs.notify_gen}
                  onChange={(e) =>
                    setNotificationPrefs((prev) => ({ ...prev, notify_gen: e.target.checked }))
                  }
                  disabled={!notificationPrefs.notify_enabled}
                />
                GEN retrieved
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Notification Settings"}
          </Button>
          <Button variant="outline" onClick={() => router.push("/profile")}>
            Back to Profile
          </Button>
        </div>
      </div>
    </div>
  );
}
