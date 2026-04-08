const BELARUS_WEB_AIP_URL = "https://www.ban.by/ru/sbornik-aip/amdt";
const BHUTAN_WEB_AIP_URL = "https://www.doat.gov.bt/aip/";
const BOSNIA_WEB_AIP_URL = "https://eaip.bhansa.gov.ba";
const FETCH_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type ScraperMeta = {
  effectiveDate: string | null;
  ad2Icaos: string[];
  webAipUrl: string;
  country: string;
};

const NON_ICAO = new Set(["EAIP", "AIPM", "AD2A", "GEN1", "GEN2", "AMDT", "SUPP", "AIRA", "HTML", "PDFS", "NONE", "NULL"]);

let belarusCache: { expiresAt: number; value: ScraperMeta } | null = null;
let bhutanCache: { expiresAt: number; value: ScraperMeta } | null = null;
let bosniaCache: { expiresAt: number; value: ScraperMeta } | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return promise.finally(() => clearTimeout(timeout));
}

function normalizeIcaos(values: string[]): string[] {
  return Array.from(
    new Set(
      (values || [])
        .map((x) => String(x || "").trim().toUpperCase())
        .filter((x) => /^[A-Z]{4}$/.test(x) && !NON_ICAO.has(x)),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-scraper-meta/1.0)" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseBelarusMeta(html: string): { effectiveDate: string | null; ad2Icaos: string[] } {
  const dates = [...html.matchAll(/eAIP\s*EFFECTIVE\s*DATE\s*(\d{4}-\d{2}-\d{2})/gi)].map((m) => m[1]);
  const effectiveDate = dates.sort((a, b) => b.localeCompare(a))[0] ?? null;
  const ad2Icaos = normalizeIcaos(
    [...html.matchAll(/UM_AD_2_([A-Z0-9]{4})_en\.pdf/gi)].map((m) => String(m[1] || "").toUpperCase()),
  );
  return { effectiveDate, ad2Icaos };
}

function parseBhutanMeta(html: string): { effectiveDate: string | null; ad2Icaos: string[] } {
  const ad2Icaos = normalizeIcaos(
    [...html.matchAll(/\b(VQ[A-Z0-9]{2})\b/gi)].map((m) => String(m[1] || "").toUpperCase()),
  );
  return { effectiveDate: null, ad2Icaos };
}

function parseIssueDateCode(effectiveDate: string): string | null {
  const months: Record<string, number> = {
    JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  };
  const m = String(effectiveDate || "").trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const day = String(Number(m[1])).padStart(2, "0");
  const month = String(months[m[2].toUpperCase()] || "").padStart(2, "0");
  if (!month) return null;
  return `${m[3]}-${month}-${day}`;
}

function parseBosniaMenuAd2Icaos(menuHtml: string): string[] {
  const hrefMatches = [...menuHtml.matchAll(/href="([^"]*AD-2[^"]*)"/gi)].map((m) => String(m[1] || ""));
  const hrefIcaos = hrefMatches
    .map((h) => h.match(/\b(LQ[A-Z0-9]{2})\b/i)?.[1]?.toUpperCase() || "")
    .filter(Boolean);
  const textIcaos = [...menuHtml.matchAll(/\b(LQ[A-Z0-9]{2})\b/gi)].map((m) => String(m[1] || "").toUpperCase());
  return normalizeIcaos([...hrefIcaos, ...textIcaos]);
}

function parseBosniaUpdates(raw: unknown): { effectiveDate: string | null; issueCode: string | null } {
  const arr = Array.isArray(raw) ? raw : [];
  const rows = arr
    .map((u) => {
      const eff = String((u as any)?.effectiveDate || "").trim();
      const code = parseIssueDateCode(eff);
      return { eff, code };
    })
    .filter((r) => r.code)
    .sort((a, b) => String(b.code).localeCompare(String(a.code)));
  const top = rows[0];
  return {
    effectiveDate: top?.eff || null,
    issueCode: top?.code || null,
  };
}

async function resolveBelarusMetaLive(): Promise<ScraperMeta> {
  const html = await fetchText(BELARUS_WEB_AIP_URL);
  const parsed = parseBelarusMeta(html);
  return {
    country: "Belarus",
    effectiveDate: parsed.effectiveDate,
    ad2Icaos: parsed.ad2Icaos,
    webAipUrl: BELARUS_WEB_AIP_URL,
  };
}

async function resolveBhutanMetaLive(): Promise<ScraperMeta> {
  const html = await fetchText(BHUTAN_WEB_AIP_URL);
  const parsed = parseBhutanMeta(html);
  return {
    country: "Bhutan",
    effectiveDate: parsed.effectiveDate,
    ad2Icaos: parsed.ad2Icaos,
    webAipUrl: BHUTAN_WEB_AIP_URL,
  };
}

async function resolveBosniaMetaLive(): Promise<ScraperMeta> {
  const updatesRaw = await fetchText(new URL("updates.json", BOSNIA_WEB_AIP_URL).href);
  const updates = JSON.parse(updatesRaw);
  const { effectiveDate, issueCode } = parseBosniaUpdates(updates);
  if (!issueCode) {
    return {
      country: "Bosnia and Herzegovina",
      effectiveDate: null,
      ad2Icaos: [],
      webAipUrl: BOSNIA_WEB_AIP_URL,
    };
  }
  const indexUrl = new URL(`${issueCode}-AIRAC/html/index.html`, BOSNIA_WEB_AIP_URL).href;
  const indexHtml = await fetchText(indexUrl);
  const directMenuFrame = indexHtml.match(/<frame[^>]*name="eAISNavigation"[^>]*src="([^"]+)"/i)?.[1];
  const baseFrame = indexHtml.match(/<frame[^>]*name="eAISNavigationBase"[^>]*src="([^"]+)"/i)?.[1];
  let menuUrl: string | null = null;
  if (directMenuFrame) {
    menuUrl = new URL(directMenuFrame, indexUrl).href;
  } else if (baseFrame) {
    const baseUrl = new URL(baseFrame, indexUrl).href;
    const baseHtml = await fetchText(baseUrl);
    const menuFrame = baseHtml.match(/<frame[^>]*name="eAISNavigation"[^>]*src="([^"]+)"/i)?.[1];
    if (menuFrame) menuUrl = new URL(menuFrame, baseUrl).href;
  }
  if (!menuUrl) {
    return {
      country: "Bosnia and Herzegovina",
      effectiveDate,
      ad2Icaos: [],
      webAipUrl: BOSNIA_WEB_AIP_URL,
    };
  }
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = parseBosniaMenuAd2Icaos(menuHtml);
  const fallbackIcaos = ["LQBK", "LQMO", "LQSA", "LQTZ"];
  return {
    country: "Bosnia and Herzegovina",
    effectiveDate,
    ad2Icaos: ad2Icaos.length ? ad2Icaos : fallbackIcaos,
    webAipUrl: BOSNIA_WEB_AIP_URL,
  };
}

export async function getBelarusMeta(): Promise<ScraperMeta> {
  if (belarusCache && Date.now() < belarusCache.expiresAt) return belarusCache.value;
  try {
    const value = await withTimeout(resolveBelarusMetaLive(), FETCH_TIMEOUT_MS * 4);
    belarusCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return belarusCache?.value ?? { country: "Belarus", effectiveDate: null, ad2Icaos: [], webAipUrl: BELARUS_WEB_AIP_URL };
  }
}

export async function getBhutanMeta(): Promise<ScraperMeta> {
  if (bhutanCache && Date.now() < bhutanCache.expiresAt) return bhutanCache.value;
  try {
    const value = await withTimeout(resolveBhutanMetaLive(), FETCH_TIMEOUT_MS * 4);
    bhutanCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return bhutanCache?.value ?? { country: "Bhutan", effectiveDate: null, ad2Icaos: [], webAipUrl: BHUTAN_WEB_AIP_URL };
  }
}

export async function getBosniaMeta(): Promise<ScraperMeta> {
  if (bosniaCache && Date.now() < bosniaCache.expiresAt) return bosniaCache.value;
  try {
    const value = await withTimeout(resolveBosniaMetaLive(), FETCH_TIMEOUT_MS * 4);
    bosniaCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return bosniaCache?.value ?? { country: "Bosnia and Herzegovina", effectiveDate: null, ad2Icaos: [], webAipUrl: BOSNIA_WEB_AIP_URL };
  }
}
