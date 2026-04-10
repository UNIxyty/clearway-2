const BELARUS_WEB_AIP_URL = "https://www.ban.by/ru/sbornik-aip/amdt";
const BHUTAN_WEB_AIP_URL = "https://www.doat.gov.bt/aip/";
const BOSNIA_WEB_AIP_URL = "https://eaip.bhansa.gov.ba";
const CABO_VERDE_WEB_AIP_URL = "https://eaip.asa.cv";
const CHILE_WEB_AIP_URL = "https://aipchile.dgac.gob.cl/aip/vol1";
const COSTA_RICA_WEB_AIP_URL = "https://www.cocesna.org/aipca/AIPMR/inicio.html";
const CUBA_WEB_AIP_URL = "https://aismet.avianet.cu/html/aip.html";
const ECUADOR_WEB_AIP_URL = "https://www.ais.aviacioncivil.gob.ec/ifis3/";
const EL_SALVADOR_WEB_AIP_URL = "https://www.cocesna.org/aipca/AIPMS/history.html";
const GUATEMALA_WEB_AIP_URL = "https://www.dgac.gob.gt/home/aip_e/";
const HONDURAS_WEB_AIP_URL = "https://www.ahac.gob.hn/eAIP1/inicio.html";
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
let caboVerdeCache: { expiresAt: number; value: ScraperMeta } | null = null;
let chileCache: { expiresAt: number; value: ScraperMeta } | null = null;
let costaRicaCache: { expiresAt: number; value: ScraperMeta } | null = null;
let cubaCache: { expiresAt: number; value: ScraperMeta } | null = null;
let ecuadorCache: { expiresAt: number; value: ScraperMeta } | null = null;
let elSalvadorCache: { expiresAt: number; value: ScraperMeta } | null = null;
let guatemalaCache: { expiresAt: number; value: ScraperMeta } | null = null;
let hondurasCache: { expiresAt: number; value: ScraperMeta } | null = null;

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

function normalizeRelativeHref(href: string): string {
  const clean = String(href || "").trim().replace(/\\/g, "/");
  const [pathAndQuery, hashPart] = clean.split("#", 2);
  const [rawPath, rawQuery] = pathAndQuery.split("?", 2);
  const encodedPath = rawPath
    .split("/")
    .map((part) => {
      try {
        return encodeURIComponent(decodeURIComponent(part));
      } catch {
        return encodeURIComponent(part);
      }
    })
    .join("/");
  return `${encodedPath}${rawQuery ? `?${rawQuery}` : ""}${hashPart ? `#${hashPart}` : ""}`;
}

function parseCaboVerdeIssues(historyHtml: string): Array<{ effectiveDate: string; issueCode: string; indexUrl: string; ts: number }> {
  const re = /<a[^>]*href="([^"]*AIRAC\/html\/index-[^"]+\.html)"[^>]*>([^<]+)<\/a>/gi;
  const out: Array<{ effectiveDate: string; issueCode: string; indexUrl: string; ts: number }> = [];
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(historyHtml))) {
    const href = m[1];
    const effectiveDate = String(m[2] || "").trim();
    const issueCode = href.match(/(\d{4}-\d{2}-\d{2}-AIRAC)/i)?.[1] ?? href;
    const iso = issueCode.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
    const ts = iso ? new Date(`${iso}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
    out.push({
      effectiveDate,
      issueCode,
      indexUrl: new URL(href, CABO_VERDE_WEB_AIP_URL).href,
      ts,
    });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

function parseCostaRicaIssues(historyHtml: string): Array<{ label: string; issueCode: string; indexUrl: string; ts: number }> {
  const out: Array<{ label: string; issueCode: string; indexUrl: string; ts: number }> = [];
  const re = /<a[^>]*href=["']([^"']*index-es-ES\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(historyHtml))) {
    const rawHref = m[1];
    const label = String(m[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const decodedHref = decodeURIComponent(rawHref);
    const issueCode =
      decodedHref.match(/(\d{4}-\d{2}-\d{2}-(?:NON|DOUBLE|AIRAC)[^/]+)/i)?.[1] ??
      decodedHref.replace(/\/html\/index-es-ES\.html$/i, "");
    const iso = issueCode.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
    const ts = iso ? new Date(`${iso}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
    out.push({
      label,
      issueCode,
      indexUrl: new URL(normalizeRelativeHref(rawHref), COSTA_RICA_WEB_AIP_URL).href,
      ts,
    });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

function parseChileAd2aIcaos(html: string): string[] {
  const out: string[] = [];
  const re = /<a[^>]*href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(html))) {
    const href = String(m[1] || "");
    const label = String(m[2] || "").replace(/<[^>]+>/g, " ");
    if (!/AD\s*2a\s*Aeropuertos/i.test(href) && !/AD\s*2a/i.test(label)) continue;
    const icao = href.match(/\b(SC[A-Z0-9]{2})\b/i)?.[1]?.toUpperCase() || label.match(/\b(SC[A-Z0-9]{2})\b/i)?.[1]?.toUpperCase();
    if (icao) out.push(icao);
  }
  return normalizeIcaos(out);
}

function parseCubaAd2Icaos(html: string): string[] {
  const out: string[] = [];
  const re = /<a[^>]*href=["']([^"']+MU[A-Z0-9_%]*\.pdf[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(html))) {
    const href = String(m[1] || "");
    const icao = href.match(/\/(MU[A-Z0-9]{2})/i)?.[1]?.toUpperCase();
    if (icao) out.push(icao);
  }
  return normalizeIcaos(out);
}

function parseEcuadorAd2Icaos(html: string): string[] {
  const out: string[] = [];
  const re = /<a[^>]*href=["']([^"']*\/ifis3\/aip\/AD%202%20([A-Z]{4})[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(html))) {
    const icao = String(m[2] || "").toUpperCase();
    if (icao) out.push(icao);
  }
  return normalizeIcaos(out);
}

function parseCocesnaIssues(historyHtml: string, baseUrl: string): Array<{ issueCode: string; indexUrl: string; ts: number }> {
  const out: Array<{ issueCode: string; indexUrl: string; ts: number }> = [];
  const re = /<a[^>]*href=["']([^"']*index-es-ES\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(historyHtml))) {
    const rawHref = m[1];
    const decodedHref = decodeURIComponent(rawHref);
    const issueCode =
      decodedHref.match(/(\d{4}-\d{2}-\d{2}-(?:NON|DOUBLE|AIRAC)[^/]+)/i)?.[1] ??
      decodedHref.replace(/\/html\/index-es-ES\.html$/i, "");
    const iso = issueCode.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
    const ts = iso ? new Date(`${iso}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
    out.push({
      issueCode,
      indexUrl: new URL(normalizeRelativeHref(rawHref), baseUrl).href,
      ts,
    });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

function parseMenuUrlFromIndex(indexHtml: string, indexUrl: string): string | null {
  const tocUrlMatch = indexHtml.match(/<frame[^>]*name=["']eAISNavigationBase["'][^>]*src=["']([^"']+)["']/i)?.[1];
  if (!tocUrlMatch) return null;
  return new URL(tocUrlMatch, indexUrl).href;
}

function parseMenuUrlFromToc(tocHtml: string, tocUrl: string): string | null {
  const menuFrame = tocHtml.match(/<frame[^>]*name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i)?.[1];
  return menuFrame ? new URL(menuFrame, tocUrl).href : null;
}

function parseCocesnaAd2Icaos(menuHtml: string): string[] {
  const out = [
    ...[...menuHtml.matchAll(/AD-2\.([A-Z0-9]{4})[^"']*\.html#[^"']*/gi)].map((m) => String(m[1] || "").toUpperCase()),
    ...[...menuHtml.matchAll(/AD[-\s]*2[.-]([A-Z0-9]{4})/gi)].map((m) => String(m[1] || "").toUpperCase()),
  ];
  return normalizeIcaos(out);
}

function parseGuatemalaIssues(historyHtml: string): Array<{ issueCode: string; effectiveDate: string | null; indexUrl: string; ts: number }> {
  const re = /<a[^>]*href="([^"]*index-es-ES\.html)"[^>]*>([^<]+)<\/a>/gi;
  const out: Array<{ issueCode: string; effectiveDate: string | null; indexUrl: string; ts: number }> = [];
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(historyHtml))) {
    const href = m[1];
    const effectiveDateRaw = String(m[2] || "").trim();
    const issueCode = href.match(/(\d{4}-\d{2}-\d{2}-(?:AIRAC|DOUBLE AIRAC))/i)?.[1] ?? href;
    const effectiveDate = parseIssueDateCode(effectiveDateRaw) ?? issueCode.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    const ts = effectiveDate ? new Date(`${effectiveDate}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
    out.push({
      issueCode,
      effectiveDate,
      indexUrl: new URL(href, GUATEMALA_WEB_AIP_URL).href,
      ts,
    });
  }
  return out.sort((a, b) => b.ts - a.ts);
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

async function resolveCaboVerdeMetaLive(): Promise<ScraperMeta> {
  const historyHtml = await fetchText(CABO_VERDE_WEB_AIP_URL);
  const issues = parseCaboVerdeIssues(historyHtml);
  const issue = issues[0];
  if (!issue) {
    return {
      country: "Republic of Cabo Verde",
      effectiveDate: null,
      ad2Icaos: [],
      webAipUrl: CABO_VERDE_WEB_AIP_URL,
    };
  }
  const indexHtml = await fetchText(issue.indexUrl);
  const tocUrlMatch = indexHtml.match(/<frame[^>]*name="eAISNavigationBase"[^>]*src="([^"]+)"/i)?.[1];
  const tocUrl = tocUrlMatch ? new URL(tocUrlMatch, issue.indexUrl).href : new URL("toc-frameset-en-GB.html", issue.indexUrl).href;
  const tocHtml = await fetchText(tocUrl);
  const menuFrame = tocHtml.match(/<frame[^>]*name="eAISNavigation"[^>]*src="([^"]+)"/i)?.[1];
  if (!menuFrame) {
    return {
      country: "Republic of Cabo Verde",
      effectiveDate: issue.issueCode.slice(0, 10),
      ad2Icaos: [],
      webAipUrl: CABO_VERDE_WEB_AIP_URL,
    };
  }
  const menuUrl = new URL(menuFrame, tocUrl).href;
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/GV-AD-2\.([A-Z0-9]{4})-en-GB\.html#AD-2\.\1/gi)].map((m) => String(m[1] || "").toUpperCase()),
  );
  return {
    country: "Republic of Cabo Verde",
    effectiveDate: issue.issueCode.slice(0, 10),
    ad2Icaos,
    webAipUrl: CABO_VERDE_WEB_AIP_URL,
  };
}

async function resolveChileMetaLive(): Promise<ScraperMeta> {
  const adHtml = await fetchText("https://aipchile.dgac.gob.cl/aip/vol1/seccion/ad");
  return {
    country: "Chile",
    effectiveDate: null,
    ad2Icaos: parseChileAd2aIcaos(adHtml),
    webAipUrl: CHILE_WEB_AIP_URL,
  };
}

async function resolveCostaRicaMetaLive(): Promise<ScraperMeta> {
  const historyHtml = await fetchText(COSTA_RICA_WEB_AIP_URL);
  const issues = parseCostaRicaIssues(historyHtml);
  const issue = issues[0];
  const effectiveDate = issue?.issueCode?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  if (!issue) {
    return {
      country: "Costa Rica",
      effectiveDate: null,
      ad2Icaos: [],
      webAipUrl: COSTA_RICA_WEB_AIP_URL,
    };
  }
  const indexHtml = await fetchText(issue.indexUrl);
  const tocUrlMatch = indexHtml.match(/<frame[^>]*name=["']eAISNavigationBase["'][^>]*src=["']([^"']+)["']/i)?.[1];
  if (!tocUrlMatch) {
    return {
      country: "Costa Rica",
      effectiveDate,
      ad2Icaos: [],
      webAipUrl: COSTA_RICA_WEB_AIP_URL,
    };
  }
  const tocUrl = new URL(tocUrlMatch, issue.indexUrl).href;
  const tocHtml = await fetchText(tocUrl);
  const menuFrame = tocHtml.match(/<frame[^>]*name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i)?.[1];
  if (!menuFrame) {
    return {
      country: "Costa Rica",
      effectiveDate,
      ad2Icaos: [],
      webAipUrl: COSTA_RICA_WEB_AIP_URL,
    };
  }
  const menuUrl = new URL(menuFrame, tocUrl).href;
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/AD-2\.([A-Z0-9]{4})[^"']*\.html#[^"']*/gi)].map((m) => String(m[1] || "").toUpperCase()),
  );
  return {
    country: "Costa Rica",
    effectiveDate,
    ad2Icaos,
    webAipUrl: COSTA_RICA_WEB_AIP_URL,
  };
}

async function resolveCubaMetaLive(): Promise<ScraperMeta> {
  const html = await fetchText(CUBA_WEB_AIP_URL);
  return {
    country: "Cuba",
    effectiveDate: null,
    ad2Icaos: parseCubaAd2Icaos(html),
    webAipUrl: CUBA_WEB_AIP_URL,
  };
}

async function resolveEcuadorMetaLive(): Promise<ScraperMeta> {
  const html = await fetchText(ECUADOR_WEB_AIP_URL);
  return {
    country: "Ecuador",
    effectiveDate: null,
    ad2Icaos: parseEcuadorAd2Icaos(html),
    webAipUrl: ECUADOR_WEB_AIP_URL,
  };
}

async function resolveElSalvadorMetaLive(): Promise<ScraperMeta> {
  const historyHtml = await fetchText(EL_SALVADOR_WEB_AIP_URL);
  const issues = parseCocesnaIssues(historyHtml, EL_SALVADOR_WEB_AIP_URL);
  const issue = issues[0];
  if (!issue) {
    return {
      country: "El Salvador",
      effectiveDate: null,
      ad2Icaos: [],
      webAipUrl: EL_SALVADOR_WEB_AIP_URL,
    };
  }
  const effectiveDate = issue.issueCode.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  const indexHtml = await fetchText(issue.indexUrl);
  const tocUrl = parseMenuUrlFromIndex(indexHtml, issue.indexUrl);
  if (!tocUrl) return { country: "El Salvador", effectiveDate, ad2Icaos: [], webAipUrl: EL_SALVADOR_WEB_AIP_URL };
  const tocHtml = await fetchText(tocUrl);
  const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
  if (!menuUrl) return { country: "El Salvador", effectiveDate, ad2Icaos: [], webAipUrl: EL_SALVADOR_WEB_AIP_URL };
  const menuHtml = await fetchText(menuUrl);
  return {
    country: "El Salvador",
    effectiveDate,
    ad2Icaos: parseCocesnaAd2Icaos(menuHtml),
    webAipUrl: EL_SALVADOR_WEB_AIP_URL,
  };
}

async function resolveGuatemalaMetaLive(): Promise<ScraperMeta> {
  const historyHtml = await fetchText(GUATEMALA_WEB_AIP_URL);
  const issues = parseGuatemalaIssues(historyHtml);
  const issue = issues[0];
  if (!issue) {
    return {
      country: "Guatemala",
      effectiveDate: null,
      ad2Icaos: [],
      webAipUrl: GUATEMALA_WEB_AIP_URL,
    };
  }
  const indexHtml = await fetchText(issue.indexUrl);
  const tocUrlMatch = indexHtml.match(/<frame[^>]*name="eAISNavigationBase"[^>]*src="([^"]+)"/i)?.[1];
  const tocUrl = tocUrlMatch ? new URL(tocUrlMatch, issue.indexUrl).href : new URL("toc-frameset-es-ES.html", issue.indexUrl).href;
  const tocHtml = await fetchText(tocUrl);
  const menuFrame = tocHtml.match(/<frame[^>]*name="eAISNavigation"[^>]*src="([^"]+)"/i)?.[1];
  if (!menuFrame) {
    return { country: "Guatemala", effectiveDate: issue.effectiveDate, ad2Icaos: [], webAipUrl: GUATEMALA_WEB_AIP_URL };
  }
  const menuUrl = new URL(menuFrame, tocUrl).href;
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/AD-2\.([A-Z0-9]{4})-[^"]*\.html#AD-2(?:\.eAIP)?(?:\.[A-Z0-9]{4})?/gi)].map((m) =>
      String(m[1] || "").toUpperCase(),
    ),
  );
  return {
    country: "Guatemala",
    effectiveDate: issue.effectiveDate,
    ad2Icaos,
    webAipUrl: GUATEMALA_WEB_AIP_URL,
  };
}

async function resolveHondurasMetaLive(): Promise<ScraperMeta> {
  const historyHtml = await fetchText(HONDURAS_WEB_AIP_URL);
  const issues = parseCocesnaIssues(historyHtml, HONDURAS_WEB_AIP_URL);
  const issue = issues[0];
  if (!issue) {
    return {
      country: "Honduras",
      effectiveDate: null,
      ad2Icaos: [],
      webAipUrl: HONDURAS_WEB_AIP_URL,
    };
  }
  const effectiveDate = issue.issueCode.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  const indexHtml = await fetchText(issue.indexUrl);
  const tocUrl = parseMenuUrlFromIndex(indexHtml, issue.indexUrl);
  if (!tocUrl) return { country: "Honduras", effectiveDate, ad2Icaos: [], webAipUrl: HONDURAS_WEB_AIP_URL };
  const tocHtml = await fetchText(tocUrl);
  const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
  if (!menuUrl) return { country: "Honduras", effectiveDate, ad2Icaos: [], webAipUrl: HONDURAS_WEB_AIP_URL };
  const menuHtml = await fetchText(menuUrl);
  return {
    country: "Honduras",
    effectiveDate,
    ad2Icaos: parseCocesnaAd2Icaos(menuHtml),
    webAipUrl: HONDURAS_WEB_AIP_URL,
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

export async function getCaboVerdeMeta(): Promise<ScraperMeta> {
  if (caboVerdeCache && Date.now() < caboVerdeCache.expiresAt) return caboVerdeCache.value;
  try {
    const value = await withTimeout(resolveCaboVerdeMetaLive(), FETCH_TIMEOUT_MS * 4);
    caboVerdeCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return caboVerdeCache?.value ?? {
      country: "Republic of Cabo Verde",
      effectiveDate: null,
      ad2Icaos: [],
      webAipUrl: CABO_VERDE_WEB_AIP_URL,
    };
  }
}

export async function getChileMeta(): Promise<ScraperMeta> {
  if (chileCache && Date.now() < chileCache.expiresAt) return chileCache.value;
  try {
    const value = await withTimeout(resolveChileMetaLive(), FETCH_TIMEOUT_MS * 4);
    chileCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return chileCache?.value ?? { country: "Chile", effectiveDate: null, ad2Icaos: [], webAipUrl: CHILE_WEB_AIP_URL };
  }
}

export async function getCostaRicaMeta(): Promise<ScraperMeta> {
  if (costaRicaCache && Date.now() < costaRicaCache.expiresAt) return costaRicaCache.value;
  try {
    const value = await withTimeout(resolveCostaRicaMetaLive(), FETCH_TIMEOUT_MS * 4);
    costaRicaCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return costaRicaCache?.value ?? { country: "Costa Rica", effectiveDate: null, ad2Icaos: [], webAipUrl: COSTA_RICA_WEB_AIP_URL };
  }
}

export async function getCubaMeta(): Promise<ScraperMeta> {
  if (cubaCache && Date.now() < cubaCache.expiresAt) return cubaCache.value;
  try {
    const value = await withTimeout(resolveCubaMetaLive(), FETCH_TIMEOUT_MS * 4);
    cubaCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return cubaCache?.value ?? { country: "Cuba", effectiveDate: null, ad2Icaos: [], webAipUrl: CUBA_WEB_AIP_URL };
  }
}

export async function getEcuadorMeta(): Promise<ScraperMeta> {
  if (ecuadorCache && Date.now() < ecuadorCache.expiresAt) return ecuadorCache.value;
  try {
    const value = await withTimeout(resolveEcuadorMetaLive(), FETCH_TIMEOUT_MS * 4);
    ecuadorCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return ecuadorCache?.value ?? { country: "Ecuador", effectiveDate: null, ad2Icaos: [], webAipUrl: ECUADOR_WEB_AIP_URL };
  }
}

export async function getElSalvadorMeta(): Promise<ScraperMeta> {
  if (elSalvadorCache && Date.now() < elSalvadorCache.expiresAt) return elSalvadorCache.value;
  try {
    const value = await withTimeout(resolveElSalvadorMetaLive(), FETCH_TIMEOUT_MS * 4);
    elSalvadorCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return elSalvadorCache?.value ?? {
      country: "El Salvador",
      effectiveDate: null,
      ad2Icaos: [],
      webAipUrl: EL_SALVADOR_WEB_AIP_URL,
    };
  }
}

export async function getGuatemalaMeta(): Promise<ScraperMeta> {
  if (guatemalaCache && Date.now() < guatemalaCache.expiresAt) return guatemalaCache.value;
  try {
    const value = await withTimeout(resolveGuatemalaMetaLive(), FETCH_TIMEOUT_MS * 4);
    guatemalaCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return guatemalaCache?.value ?? { country: "Guatemala", effectiveDate: null, ad2Icaos: [], webAipUrl: GUATEMALA_WEB_AIP_URL };
  }
}

export async function getHondurasMeta(): Promise<ScraperMeta> {
  if (hondurasCache && Date.now() < hondurasCache.expiresAt) return hondurasCache.value;
  try {
    const value = await withTimeout(resolveHondurasMetaLive(), FETCH_TIMEOUT_MS * 4);
    hondurasCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return hondurasCache?.value ?? { country: "Honduras", effectiveDate: null, ad2Icaos: [], webAipUrl: HONDURAS_WEB_AIP_URL };
  }
}
