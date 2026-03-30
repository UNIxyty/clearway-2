/**
 * M-NAV North Macedonia eAIP — resolve the live “current” package from Start.htm.
 * Human flow: open Start.htm and follow the row labeled “Current version: AIP NORTH MACEDONIA”
 * (browser: table > tbody > tr[3] > td[0] > a[0] > b). In HTML that is
 * `<a href="current/index.htm"><b>Current version: AIP NORTH MACEDONIA</b></a>`.
 * That page redirects into the English frameset under `current/en/`.
 */

export const MNAV_EAIP_ORIGIN = "https://ais.m-nav.info/eAIP";

/** Public landing page listing current vs future AIP. */
export const MNAV_START_URL = `${MNAV_EAIP_ORIGIN}/Start.htm`;

/** If Start.htm cannot be parsed; matches known layout (current/en frameset). */
export const MNAV_PACKAGE_ROOT_FALLBACK = `${MNAV_EAIP_ORIGIN}/current/en`;

export function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Find the non-commented current-version anchor and optional effective-date label from the prose line.
 */
export function parseMnavCurrentVersionFromStartHtml(html: string): {
  indexHref: string;
  effectiveDateLabel: string | null;
} {
  const cleaned = stripHtmlComments(html);
  const re =
    /<a\s+href=["']([^"']+)["'][^>]*>\s*<b(?:\s[^>]*)?>\s*Current version:\s*AIP NORTH MACEDONIA\s*<\/b>\s*<\/a>/i;
  const m = cleaned.match(re);
  if (!m) {
    throw new Error(
      "Could not find current version link (<a>…<b>Current version: AIP NORTH MACEDONIA</b></a>) on M-NAV Start.htm",
    );
  }
  const indexHref = m[1].trim();
  const startIdx = m.index ?? 0;
  const after = cleaned.slice(startIdx + m[0].length, startIdx + m[0].length + 500);
  const ed = after.match(/Effective date\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i);
  return { indexHref, effectiveDateLabel: ed ? ed[1].trim().replace(/\s+/g, " ") : null };
}

export function mnavAbsoluteFromEaipHref(href: string): string {
  const path = href.replace(/^\/+/, "");
  return `${MNAV_EAIP_ORIGIN}/${path}`;
}

/**
 * Directory that contains the English frameset (menu.htm, content.htm).
 * `current/index.htm` meta-refreshes to `en/index.htm`.
 */
export function mnavEaipFrameRootFromCurrentIndexHref(indexHref: string): string {
  const normalized = indexHref.replace(/^\/+/, "").replace(/\/+$/, "");
  if (normalized === "current/index.htm" || normalized === "current") {
    return `${MNAV_EAIP_ORIGIN}/current/en`;
  }
  if (normalized.toLowerCase().endsWith("/index.htm")) {
    const dir = normalized.slice(0, -"/index.htm".length);
    return `${MNAV_EAIP_ORIGIN}/${dir}`;
  }
  return `${MNAV_EAIP_ORIGIN}/${normalized}`;
}

export type MnavResolvedEaip = {
  /** Use for building paths to menu/content/html under the English tree */
  packageRoot: string;
  /** Resolved `href` from Start.htm, absolute */
  currentIndexUrl: string;
  effectiveDateLabel: string | null;
  startPageUrl: string;
};

export async function resolveMnavNorthMacedoniaEaip(
  init?: RequestInit & { next?: { revalidate?: number } },
): Promise<MnavResolvedEaip> {
  const res = await fetch(MNAV_START_URL, { redirect: "follow", ...init });
  if (!res.ok) {
    throw new Error(`M-NAV Start.htm: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const { indexHref, effectiveDateLabel } = parseMnavCurrentVersionFromStartHtml(html);
  const packageRoot = mnavEaipFrameRootFromCurrentIndexHref(indexHref);
  const currentIndexUrl = mnavAbsoluteFromEaipHref(indexHref);
  return {
    packageRoot,
    currentIndexUrl,
    effectiveDateLabel,
    startPageUrl: MNAV_START_URL,
  };
}
