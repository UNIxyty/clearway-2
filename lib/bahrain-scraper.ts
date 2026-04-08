const HISTORY_URL = "https://aim.mtt.gov.bh/eAIP/history-en-BH.html";
const WEB_AIP_URL = HISTORY_URL;
const FETCH_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type BahrainMeta = {
  effectiveDate: string | null;
  ad2Icaos: string[];
  webAipUrl: string;
};

let cached: { expiresAt: number; value: BahrainMeta } | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return promise.finally(() => clearTimeout(timeout));
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-bahrain-meta/1.0)" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseHistoryVersions(html: string) {
  const re = /href="((\d{4}-\d{2}-\d{2}(?:-AIRAC)?)\/html\/index-en-BH\.html)"/gi;
  const out: Array<{ label: string; indexUrl: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.push({
      label: m[2],
      indexUrl: new URL(m[1], HISTORY_URL).href,
    });
  }
  return out;
}

function pickNewestVersion(versions: Array<{ label: string; indexUrl: string }>) {
  const withDate = versions
    .map((v) => {
      const m = String(v.label || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return { v, ts: Number.NEGATIVE_INFINITY };
      const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return { v, ts };
    })
    .sort((a, b) => b.ts - a.ts);
  return withDate[0]?.v ?? versions[0] ?? null;
}

function parseTocFramesetUrl(indexHtml: string, indexUrl: string): string {
  const m = indexHtml.match(/<frame[^>]*name="eAISNavigationBase"[^>]*src="([^"]+)"/i);
  if (!m?.[1]) throw new Error("Could not find eAISNavigationBase frame in index.");
  return new URL(m[1], indexUrl).href;
}

function parseMenuUrl(tocHtml: string, tocUrl: string): string {
  const m = tocHtml.match(/<frame[^>]*name="eAISNavigation"[^>]*src="([^"]+)"/i);
  if (!m?.[1]) throw new Error("Could not find eAISNavigation frame in toc-frameset.");
  return new URL(m[1], tocUrl).href;
}

function parseAd2Icaos(menuHtml: string): string[] {
  const re = /href="([^"]*OB-AD-2\.([A-Z0-9]{4})-en-BH\.html#AD-2\.\2)"/gi;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(menuHtml))) {
    const icao = m[2].toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(icao)) set.add(icao);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

async function resolveBahrainMetaLive(): Promise<BahrainMeta> {
  const historyHtml = await fetchText(HISTORY_URL);
  const versions = parseHistoryVersions(historyHtml);
  const version = pickNewestVersion(versions);
  if (!version) {
    return { effectiveDate: null, ad2Icaos: ["OBBI", "OBBS", "OBKH"], webAipUrl: WEB_AIP_URL };
  }
  const indexHtml = await fetchText(version.indexUrl);
  const tocUrl = parseTocFramesetUrl(indexHtml, version.indexUrl);
  const tocHtml = await fetchText(tocUrl);
  const menuUrl = parseMenuUrl(tocHtml, tocUrl);
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = parseAd2Icaos(menuHtml);
  return {
    effectiveDate: version.label || null,
    ad2Icaos: ad2Icaos.length ? ad2Icaos : ["OBBI", "OBBS", "OBKH"],
    webAipUrl: WEB_AIP_URL,
  };
}

export async function getBahrainMeta(): Promise<BahrainMeta> {
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  try {
    const value = await withTimeout(resolveBahrainMetaLive(), FETCH_TIMEOUT_MS * 4);
    cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    const fallback = cached?.value ?? {
      effectiveDate: null,
      ad2Icaos: ["OBBI", "OBBS", "OBKH"],
      webAipUrl: WEB_AIP_URL,
    };
    return fallback;
  }
}

export async function isBahrainIcao(icao: string): Promise<boolean> {
  const up = String(icao || "").toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(up)) return false;
  const meta = await getBahrainMeta();
  return meta.ad2Icaos.includes(up);
}
