// Host matching for the organisation's site list. Only the URL is used — never the page.
import type { SiteEntry, SiteRequest, SiteStatus } from "./protocol";

export function hostOf(url: string): string { try { return new URL(url).host.toLowerCase(); } catch { return ""; } }
export function isChromePage(url: string): boolean {
  return /^(chrome|chrome-extension|edge|about|file|devtools|view-source):/i.test(url) || /^https:\/\/chromewebstore\.google\.com\//i.test(url) || /^https:\/\/chrome\.google\.com\/webstore/i.test(url) || url === "";
}
export function matchesSite(host: string, site: SiteEntry): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, ""); const s = site.host.toLowerCase().replace(/:\d+$/, "");
  return h === s || (site.includeSubdomains && h.endsWith(`.${s}`));
}
export function approvedEntryFor(host: string, approved: SiteEntry[]): SiteEntry | null { return approved.find((s) => matchesSite(host, s)) ?? null; }
export function pendingRequestFor(host: string, requests: SiteRequest[]): SiteRequest | null { return requests.find((r) => r.status === "pending" && matchesSite(host, { host: r.host, includeSubdomains: r.includeSubdomains })) ?? null; }
/** The origin pattern Chrome is asked for (§E2: one site, the user's own consent). */
export function originPattern(url: string): string | null { try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) return null; return `${u.protocol}//${u.host}/*`; } catch { return null; } }
export function statusFor(url: string, approved: SiteEntry[], requests: SiteRequest[], granted: boolean): SiteStatus {
  if (isChromePage(url)) return "chrome";
  const host = hostOf(url); if (!host) return "unknown";
  if (approvedEntryFor(host, approved)) return granted ? "approved" : "approved-pending-enable";
  if (pendingRequestFor(host, requests)) return "requested";
  return "not-on-list";
}
