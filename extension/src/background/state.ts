// Everything the worker "knows" lives in chrome.storage (see PROTOCOL.md); this file only adds the
// per-tab site status computation and the panel port registry, both of which are recomputed on demand.
import type { SessionState, SiteStatus, TabInfo } from "~/shared/protocol";
import { getSession } from "~/shared/storage";
import { hostOf, isChromePage, originPattern, statusFor } from "~/shared/sites";

export async function granted(url: string): Promise<boolean> {
  const p = originPattern(url); if (!p) return false;
  try { return await chrome.permissions.contains({ origins: [p] }); } catch { return false; }
}

export async function tabInfo(tab: chrome.tabs.Tab | undefined | null, session?: SessionState): Promise<TabInfo> {
  const url = tab?.url ?? ""; const s = session ?? (await getSession());
  const approved = s.sites?.approved ?? [], requests = s.sites?.requests ?? [];
  const status: SiteStatus = s.status === "signed-in" ? statusFor(url, approved, requests, await granted(url)) : isChromePage(url) ? "chrome" : "unknown";
  let path = ""; try { const u = new URL(url); path = u.pathname === "/" ? "" : u.pathname + u.search; } catch { /* not a URL */ }
  return { id: tab?.id ?? null, url, host: hostOf(url), path, title: tab?.title ?? "", favIconUrl: tab?.favIconUrl ?? null, status, scriptable: !isChromePage(url) && /^https?:/.test(url) };
}

/** The tab the user is looking at. Never one of our own pages: if the panel is open as a tab (tests, or a
 *  pinned extension page), the most recently used other tab in that window stands in. */
export async function activeTab(windowId?: number): Promise<chrome.tabs.Tab | null> {
  const q: chrome.tabs.QueryInfo = windowId != null ? { active: true, windowId } : { active: true, lastFocusedWindow: true };
  const [t] = await chrome.tabs.query(q).catch(() => [] as chrome.tabs.Tab[]);
  const own = `chrome-extension://${chrome.runtime.id}/`;
  if (!t || !(t.url ?? "").startsWith(own)) return t ?? null;
  const others = (await chrome.tabs.query({ windowId: t.windowId }).catch(() => [] as chrome.tabs.Tab[])).filter((x) => !(x.url ?? "").startsWith(own));
  others.sort((a, b) => ((b as { lastAccessed?: number }).lastAccessed ?? 0) - ((a as { lastAccessed?: number }).lastAccessed ?? 0));
  return others[0] ?? null;
}

/** Whether the side panel is open anywhere (Chrome 116+). The worker never trusts its own memory for this. */
export async function panelOpen(): Promise<boolean> {
  // A connected port also counts: the panel page opened in a tab is the same UI.
  try { const ctx = await chrome.runtime.getContexts({ contextTypes: ["SIDE_PANEL" as chrome.runtime.ContextType] }); return ctx.length > 0 || ports.size > 0; } catch { return ports.size > 0; }
}

export const ports = new Set<chrome.runtime.Port>();
export function tellPanel(msg: Record<string, unknown>) { for (const p of ports) { try { p.postMessage(msg); } catch { ports.delete(p); } } }

/** activeTab is granted by a gesture on a tab and lost when that tab navigates to another origin. Chrome exposes no
 *  query for it, so the worker records the gesture itself (commands, menu clicks, the panel opening). */
export async function noteGesture(tab: chrome.tabs.Tab | null | undefined) {
  if (!tab?.id || !tab.url) return;
  let origin = ""; try { origin = new URL(tab.url).origin; } catch { return; }
  await chrome.storage.local.set({ gestureTab: { tabId: tab.id, origin, at: Date.now() } });
}
export async function captureWorks(tab: chrome.tabs.Tab | null | undefined): Promise<boolean> {
  if (!tab?.id || !tab.url) return false;
  const g = ((await chrome.storage.local.get("gestureTab")).gestureTab as { tabId: number; origin: string } | undefined);
  let origin = ""; try { origin = new URL(tab.url).origin; } catch { return false; }
  return Boolean(g && g.tabId === tab.id && g.origin === origin);
}
