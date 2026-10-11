"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "@/components/portal/Shell";
import { PCard, PButton, PSectionTitle } from "@/components/portal/ui";
import { Checkbox } from "@/components/kit";
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
      <PortalShell>
        <div className="flex min-h-[320px] items-center justify-center">
          <div className="text-sm text-cw-text-muted">Loading notification settings…</div>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <div className="max-w-[1100px] px-[30px] pb-10 pt-[26px]">
        <h1 className="m-0 mb-[5px] text-[26px] font-extrabold tracking-[-0.02em]">
          Browser Notifications
        </h1>
        <p className="m-0 mb-5 text-[15px] text-cw-text-muted">
          Choose which events should display native browser notifications.
        </p>

        <div className="flex max-w-[680px] flex-col gap-4">
          {error && (
            <div className="rounded-[10px] border border-cw-danger-border bg-cw-danger-tint px-3.5 py-2.5 text-sm text-cw-danger-text">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-[10px] border border-cw-success-border bg-cw-success-tint px-3.5 py-2.5 text-sm text-cw-success-text">
              Notification settings saved successfully
            </div>
          )}

          <PCard className="p-[22px]">
            <PSectionTitle>Notification Preferences</PSectionTitle>
            <p className="m-0 mt-1 text-[13px] text-cw-text-muted">
              Enable browser notifications and control which sync events create alerts.
            </p>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-[10px] bg-cw-bg-page px-3.5 py-3">
              <div>
                <p className="m-0 text-sm font-semibold text-cw-text">Permission</p>
                <p className="m-0 mt-0.5 text-xs text-cw-text-muted">
                  Status:{" "}
                  <span className="font-mono">
                    {isNotificationSupported() ? notificationPermission : "unsupported"}
                  </span>
                </p>
              </div>
              <PButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleNotificationPermission}
                disabled={!isNotificationSupported() || notificationPermission === "granted"}
              >
                {notificationPermission === "granted" ? "Granted" : "Enable Notifications"}
              </PButton>
            </div>

            <div className="mt-4 flex flex-col gap-2.5">
              <Checkbox checked={notificationPrefs.notify_enabled} onChange={(on) => setNotificationPrefs((prev) => ({ ...prev, notify_enabled: on }))} label="Enable notifications" />

              <Checkbox checked={notificationPrefs.notify_search_start} onChange={(on) => setNotificationPrefs((prev) => ({ ...prev, notify_search_start: on }))} disabled={!notificationPrefs.notify_enabled} label="Search started" />

              <Checkbox checked={notificationPrefs.notify_search_end} onChange={(on) => setNotificationPrefs((prev) => ({ ...prev, notify_search_end: on }))} disabled={!notificationPrefs.notify_enabled} label="Search completed" />

              <Checkbox checked={notificationPrefs.notify_notam} onChange={(on) => setNotificationPrefs((prev) => ({ ...prev, notify_notam: on }))} disabled={!notificationPrefs.notify_enabled} label="NOTAM retrieved" />

              <Checkbox checked={notificationPrefs.notify_aip} onChange={(on) => setNotificationPrefs((prev) => ({ ...prev, notify_aip: on }))} disabled={!notificationPrefs.notify_enabled} label="AIP retrieved" />

              <Checkbox checked={notificationPrefs.notify_gen} onChange={(on) => setNotificationPrefs((prev) => ({ ...prev, notify_gen: on }))} disabled={!notificationPrefs.notify_enabled} label="GEN retrieved" />
            </div>
          </PCard>

          <div className="flex gap-3">
            <PButton variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save Notification Settings"}
            </PButton>
            <PButton variant="secondary" onClick={() => router.push("/account/profile")}>
              Back to Profile
            </PButton>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}
