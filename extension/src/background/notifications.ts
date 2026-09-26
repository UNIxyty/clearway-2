// System notifications (§E10): confirmation waiting and finished job only, only when no Chrome window is
// focused, and only when the setting is on. Click → focus the window and open the panel at the item.
import { hmZ } from "~/shared/api";
import { getSettings } from "~/shared/storage";

async function chromeFocused(): Promise<boolean> {
  try { const w = await chrome.windows.getLastFocused(); return Boolean(w.focused); } catch { return true; }
}

export async function notify(kind: "confirmation" | "job", detail: { what?: string | null; expiresAt?: string | null; filename?: string; token?: string | null; jobId?: string }) {
  const settings = await getSettings();
  if (!settings.notifications) return;
  if (await chromeFocused()) return;
  const id = kind === "confirmation" ? `cw-confirm-${detail.token ?? Date.now()}` : `cw-job-${detail.jobId ?? Date.now()}`;
  const title = kind === "confirmation" ? "Confirmation waiting" : "Briefing ready";
  const message = kind === "confirmation"
    ? `${detail.what ?? "A change is waiting for you"}.${detail.expiresAt ? ` Expires ${hmZ(detail.expiresAt)}.` : ""} Click to open the panel.`
    : `${detail.filename ?? "Your file"} is ready in Clearway.`;
  try { await chrome.notifications.create(id, { type: "basic", iconUrl: chrome.runtime.getURL("icons/app-128.png"), title, message, priority: 1 }); } catch { /* notifications unavailable */ }
}

export function onNotificationClick(handler: (id: string) => void) {
  chrome.notifications.onClicked.addListener((id) => { handler(id); try { chrome.notifications.clear(id); } catch { /* gone */ } });
}
