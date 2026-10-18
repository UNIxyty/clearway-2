// The person's recently opened airports (the portal's airport page writes them, the search pages and the dashboard
// read them). One key, one shape, in this file so a page can read the list without importing the airport view.
export type RecentEntry = { icao: string; name: string; country: string; ts: number };
export const RECENTS_STORAGE_KEY = "portal-recents";
export const RECENTS_MAX = 8;

export function readRecents(): RecentEntry[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENTS_STORAGE_KEY) || "[]") as RecentEntry[];
    return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r.icao === "string") : [];
  } catch { return []; }
}

export function pushRecent(entry: Omit<RecentEntry, "ts">): RecentEntry[] {
  const next = [{ ...entry, ts: Date.now() }, ...readRecents().filter((r) => r.icao !== entry.icao)].slice(0, RECENTS_MAX);
  try { window.localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}
