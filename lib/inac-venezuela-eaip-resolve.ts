/**
 * Resolve the active INAC Venezuela eAIP package URL from the published-history page.
 * Entry: https://www.inac.gob.ve/eaip/history-en-GB.html (frameset → history-body-en-GB.html).
 * The first table under "Currently Effective Issue" links to `{YYYY-MM-DD}/html/index-en-GB.html`.
 */

export const INAC_EAIP_PUBLIC_BASE = "https://www.inac.gob.ve/eaip";

/** Framed history UI (user-facing). */
export const INAC_HISTORY_PAGE_URL = `${INAC_EAIP_PUBLIC_BASE}/history-en-GB.html`;

/** HTML that lists amendments; contains the effective-date hrefs. */
export const INAC_HISTORY_BODY_URL = `${INAC_EAIP_PUBLIC_BASE}/history-body-en-GB.html`;

/** Last-resort base if resolution fails (portal before fetch completes uses this briefly too). */
export const INAC_PACKAGE_ROOT_FALLBACK = `${INAC_EAIP_PUBLIC_BASE}/2020-07-16`;

/**
 * Parse history-body HTML for the currently effective release folder (YYYY-MM-DD).
 */
export function parseEffectivePackagePathSegment(html: string): string {
  const start = html.indexOf("Currently Effective Issue");
  if (start === -1) {
    throw new Error('Could not find "Currently Effective Issue" on INAC history-body page');
  }
  const end = html.indexOf("Next Issues", start);
  const slice = end === -1 ? html.slice(start) : html.slice(start, end);
  const m = slice.match(/href=['"](\d{4}-\d{2}-\d{2})\/html\/index-en-GB\.html/);
  if (!m) {
    throw new Error(
      "Could not find effective date link (pattern YYYY-MM-DD/html/index-en-GB.html) under Currently Effective Issue",
    );
  }
  return m[1];
}

export function packageRootFromSegment(segment: string): string {
  return `${INAC_EAIP_PUBLIC_BASE}/${segment}`;
}

export function indexUrlFromPackageRoot(packageRoot: string): string {
  return `${packageRoot.replace(/\/$/, "")}/html/index-en-GB.html`;
}

/**
 * Fetch history-body and return the full package root URL (…/eaip/YYYY-MM-DD).
 */
export async function resolveInacEaipPackageRoot(
  init?: RequestInit & { next?: { revalidate?: number } },
): Promise<string> {
  const res = await fetch(INAC_HISTORY_BODY_URL, {
    redirect: "follow",
    ...init,
  });
  if (!res.ok) {
    throw new Error(`INAC history-body: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const segment = parseEffectivePackagePathSegment(html);
  return packageRootFromSegment(segment);
}
