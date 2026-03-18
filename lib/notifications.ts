export type NotificationPrefs = {
  notify_enabled: boolean;
  notify_search_start: boolean;
  notify_search_end: boolean;
  notify_notam: boolean;
  notify_aip: boolean;
  notify_gen: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  notify_enabled: false,
  notify_search_start: true,
  notify_search_end: true,
  notify_notam: true,
  notify_aip: true,
  notify_gen: true,
};

export type NotificationEvent =
  | "search_start"
  | "search_end"
  | "notam"
  | "aip"
  | "gen";

const EVENT_TO_PREF: Record<NotificationEvent, keyof NotificationPrefs> = {
  search_start: "notify_search_start",
  search_end: "notify_search_end",
  notam: "notify_notam",
  aip: "notify_aip",
  gen: "notify_gen",
};

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return "denied";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return "denied";
  return Notification.permission;
}

export function sendNotification(
  event: NotificationEvent,
  title: string,
  body: string,
  prefs: NotificationPrefs
): void {
  if (!isNotificationSupported()) return;
  if (Notification.permission !== "granted") return;
  if (!prefs.notify_enabled) return;

  const prefKey = EVENT_TO_PREF[event];
  if (!prefs[prefKey]) return;

  try {
    new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: `clearway-${event}`,
    });
  } catch {
    // Silently fail if notification creation fails (e.g. in some mobile browsers)
  }
}
