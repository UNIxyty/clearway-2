/**
 * Oman CAA eAIP — effective package from history (Eurocontrol-style table).
 * Canonical history: https://aim.caa.gov.om/eAIP_Oman/history-en-GB.html
 * "New Publication" row links to index-en-GB.html in the same directory as the history page.
 */

export const OMAN_EAIP_HISTORY_URL = "https://aim.caa.gov.om/eAIP_Oman/history-en-GB.html";

/** @deprecated stale path segment from older AIRAC bundles — use eAIP_Oman */
export const OMAN_EAIP_HISTORY_URL_LEGACY_PATTERN = /AIRAC_eAIPOman-/;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export function omanHistoryDirectoryUrl(historyPageUrl: string): string {
  const u = new URL(historyPageUrl);
  const path = u.pathname.replace(/\/[^/]+$/, "");
  return `${u.origin}${path}`;
}

/**
 * First `index-en-GB.html` href under "New Publication" (before "Includes").
 */
export function parseOmanNewPublicationIndexHref(html: string): string {
  const start = html.indexOf("New Publication");
  if (start === -1) {
    throw new Error('Oman eAIP history: could not find "New Publication" section');
  }
  const end = html.indexOf("Includes", start);
  const slice = end === -1 ? html.slice(start) : html.slice(start, end);
  const m = slice.match(/href="(index-en-GB\.html)"/);
  if (!m) {
    throw new Error('Oman eAIP history: no href="index-en-GB.html" under New Publication');
  }
  return m[1];
}

export function omanIndexUrl(packageRoot: string): string {
  return `${packageRoot.replace(/\/$/, "")}/index-en-GB.html`;
}

export async function resolveOmanEaipPackageRoot(
  init?: RequestInit & { next?: { revalidate?: number } },
): Promise<{ packageRoot: string; indexUrl: string; historyPageUrl: string }> {
  const merged: RequestInit = {
    redirect: "follow",
    headers: { Accept: "text/html,*/*;q=0.8", "User-Agent": BROWSER_UA },
    ...init,
  };
  const res = await fetch(OMAN_EAIP_HISTORY_URL, merged);
  if (!res.ok) {
    throw new Error(`Oman history: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  parseOmanNewPublicationIndexHref(html);
  const packageRoot = omanHistoryDirectoryUrl(OMAN_EAIP_HISTORY_URL);
  return {
    packageRoot,
    indexUrl: omanIndexUrl(packageRoot),
    historyPageUrl: OMAN_EAIP_HISTORY_URL,
  };
}
