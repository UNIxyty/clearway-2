/**
 * Republic of Korea — Office of Civil Aviation (KOCA) eAIP package root from history page.
 * https://aim.koca.go.kr/eaipPub/Package/history-en-GB.html
 * First link under "Currently Effective Issue" to {AIRAC}/html/index-en-GB.html (dated folder).
 */

export const KOCA_EAIP_HISTORY_URL = "https://aim.koca.go.kr/eaipPub/Package/history-en-GB.html";

export const KOCA_EAIP_PACKAGE_BASE = "https://aim.koca.go.kr/eaipPub/Package";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export function parseKocaCurrentlyEffectiveIndexRelative(html: string): string {
  const start = html.indexOf("Currently Effective Issue");
  if (start === -1) {
    throw new Error('KOCA eAIP history: could not find "Currently Effective Issue"');
  }
  const end = html.indexOf("Next Issues", start);
  const slice = end === -1 ? html.slice(start) : html.slice(start, end);
  const m = slice.match(/href="([^"]+\/html\/index-en-GB\.html)"/);
  if (!m) {
    throw new Error("KOCA eAIP history: no .../html/index-en-GB.html under Currently Effective Issue");
  }
  return m[1].trim();
}

export async function resolveKoreaKocaEaipPackageRoot(
  init?: RequestInit & { next?: { revalidate?: number } },
): Promise<{ packageRoot: string; indexUrl: string; historyPageUrl: string }> {
  const merged: RequestInit = {
    redirect: "follow",
    headers: { Accept: "text/html,*/*;q=0.8", "User-Agent": BROWSER_UA },
    ...init,
  };
  const res = await fetch(KOCA_EAIP_HISTORY_URL, merged);
  if (!res.ok) {
    throw new Error(`KOCA history: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const rel = parseKocaCurrentlyEffectiveIndexRelative(html);
  const packageBaseWithSlash = KOCA_EAIP_PACKAGE_BASE + "/";
  const indexUrl = new URL(rel, packageBaseWithSlash).href;
  const packageRoot = indexUrl.replace(/\/html\/index-en-GB\.html$/i, "");
  return {
    packageRoot,
    indexUrl,
    historyPageUrl: KOCA_EAIP_HISTORY_URL,
  };
}
