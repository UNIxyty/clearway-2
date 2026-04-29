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
const HONG_KONG_WEB_AIP_URL = "https://www.ais.gov.hk/eaip_20260319/VH-history-en-US.html";
const INDIA_WEB_AIP_URL = "https://aim-india.aai.aero/aip-supplements?page=1";
const ISRAEL_WEB_AIP_URL = "https://e-aip.azurefd.net";
const SOUTH_KOREA_WEB_AIP_URL = "https://aim.koca.go.kr/eaipPub/Package/history-en-GB.html";
const KOSOVO_WEB_AIP_URL = "https://www.ashna-ks.org/eAIP/default.html";
const KUWAIT_WEB_AIP_URL = "https://dgca.gov.kw/AIP";
const LIBYA_WEB_AIP_URL = "https://caa.gov.ly/ais/ad/";
const MALAYSIA_WEB_AIP_URL = "https://aip.caam.gov.my/aip/eAIP/history-en-MS.html";
const MALDIVES_WEB_AIP_URL = "https://www.macl.aero/corporate/services/operational/ans/aip";
const MONGOLIA_WEB_AIP_URL = "https://ais.mn/files/aip/eAIP/";
const MYANMAR_WEB_AIP_URL = "https://www.ais.gov.mm/eAIP/2018-02-15/html/index-en-GB.html";
const NEPAL_WEB_AIP_URL = "https://e-aip.caanepal.gov.np/welcome/listall/1";
const NORTH_MACEDONIA_WEB_AIP_URL = "https://ais.m-nav.info/eAIP/Start.htm";
const PAKISTAN_WEB_AIP_URL = "https://paa.gov.pk/aeronautical-information/electronic-aeronautical-information-publication";
const PAKISTAN_MENUS_API =
  "https://paawebadmin.paa.gov.pk/api/v1/Content/GetMenus?ApiKey=123456789_API&_IPAddress=0.0.0.0&_Header=clearway";
const PAKISTAN_CONTENT_BY_ID_API = "https://paawebadmin.paa.gov.pk/api/v1/Content/GetContentById";
const PAKISTAN_EAIP_ROUTE = "/aeronautical-information/electronic-aeronautical-information-publication";
const PANAMA_WEB_AIP_URL = "https://www.aeronautica.gob.pa/ais-aip/";
const QATAR_WEB_AIP_URL = "https://www.caa.gov.qa/en/aeronautical-information-management";
const RWANDA_WEB_AIP_URL = "https://aim.asecna.aero/html/eAIP/FR-menu-fr-FR.html";
const SAUDI_ARABIA_WEB_AIP_URL = "https://aimss.sans.com.sa/assets/FileManagerFiles/e65727c9-8414-49dc-9c6a-0b30c956ed33.html";
const SOMALIA_WEB_AIP_URL = "https://aip.scaa.gov.so/history-en-GB.html";
const SRI_LANKA_WEB_AIP_URL = "https://www.aimibsrilanka.lk/eaip/current/index.html";
const TAIWAN_WEB_AIP_URL = "https://ais.caa.gov.tw/eaip/";
const TAJIKISTAN_WEB_AIP_URL = "http://www.caica.ru/aiptjk/?lang=en";
const THAILAND_WEB_AIP_URL = "https://aip.caat.or.th/";
const TURKMENISTAN_WEB_AIP_URL = "http://www.caica.ru/aiptkm/?lang=en";
const UAE_WEB_AIP_URL = "https://www.gcaa.gov.ae/en/ais/AIPHtmlFiles/AIP/Current/AIP.aspx";
const UAE_CONTENT_WEB_AIP_URL = "https://www.gcaa.gov.ae/en/ais/AIPHtmlFiles/AIP/Current/UAE_AIP.html";
const UZBEKISTAN_WEB_AIP_URL = "https://uzaeronavigation.com/ais/#";
const VENEZUELA_WEB_AIP_URL = "https://www.inac.gob.ve/eaip/history-en-GB.html";
const VENEZUELA_HISTORY_BODY_URL = "https://www.inac.gob.ve/eaip/history-body-en-GB.html";
const JAPAN_WEB_AIP_URL = "https://nagodede.github.io/aip/japan/";
const FETCH_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type ScraperMeta = {
  effectiveDate: string | null;
  ad2Icaos: string[];
  webAipUrl: string;
  country: string;
};

export type ScraperMetaResolver = () => Promise<ScraperMeta>;

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
let hongKongCache: { expiresAt: number; value: ScraperMeta } | null = null;
let indiaCache: { expiresAt: number; value: ScraperMeta } | null = null;
let israelCache: { expiresAt: number; value: ScraperMeta } | null = null;
let southKoreaCache: { expiresAt: number; value: ScraperMeta } | null = null;
let kosovoCache: { expiresAt: number; value: ScraperMeta } | null = null;
let kuwaitCache: { expiresAt: number; value: ScraperMeta } | null = null;
let libyaCache: { expiresAt: number; value: ScraperMeta } | null = null;
let malaysiaCache: { expiresAt: number; value: ScraperMeta } | null = null;
let maldivesCache: { expiresAt: number; value: ScraperMeta } | null = null;
let mongoliaCache: { expiresAt: number; value: ScraperMeta } | null = null;
let myanmarCache: { expiresAt: number; value: ScraperMeta } | null = null;
let nepalCache: { expiresAt: number; value: ScraperMeta } | null = null;
let northMacedoniaCache: { expiresAt: number; value: ScraperMeta } | null = null;
let pakistanCache: { expiresAt: number; value: ScraperMeta } | null = null;
let panamaCache: { expiresAt: number; value: ScraperMeta } | null = null;
let qatarCache: { expiresAt: number; value: ScraperMeta } | null = null;
let rwandaCache: { expiresAt: number; value: ScraperMeta } | null = null;
let saudiArabiaCache: { expiresAt: number; value: ScraperMeta } | null = null;
let somaliaCache: { expiresAt: number; value: ScraperMeta } | null = null;
let sriLankaCache: { expiresAt: number; value: ScraperMeta } | null = null;
let taiwanCache: { expiresAt: number; value: ScraperMeta } | null = null;
let tajikistanCache: { expiresAt: number; value: ScraperMeta } | null = null;
let thailandCache: { expiresAt: number; value: ScraperMeta } | null = null;
let turkmenistanCache: { expiresAt: number; value: ScraperMeta } | null = null;
let uaeCache: { expiresAt: number; value: ScraperMeta } | null = null;
let uzbekistanCache: { expiresAt: number; value: ScraperMeta } | null = null;
let venezuelaCache: { expiresAt: number; value: ScraperMeta } | null = null;
let japanCache: { expiresAt: number; value: ScraperMeta } | null = null;

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

function parseDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.valueOf())) return null;
  return d;
}

export function normalizeScraperCountryName(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .replace(/[./_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

async function fetchJson(url: string): Promise<any> {
  const text = await fetchText(url);
  return JSON.parse(text);
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

function parseHongKongIssues(historyHtml: string): Array<{ effectiveDate: string; issueCode: string; indexUrl: string; ts: number }> {
  const re = /<a[^>]*href="([^"]*\/html\/index-en-US\.html)"[^>]*>([^<]+)<\/a>/gi;
  const out: Array<{ effectiveDate: string; issueCode: string; indexUrl: string; ts: number }> = [];
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(historyHtml))) {
    const href = m[1];
    const effectiveDate = String(m[2] || "").trim();
    const issueCode = href.match(/(\d{4}-\d{2}-\d{2}-\d{6})/i)?.[1] ?? href;
    const iso = issueCode.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
    const ts = iso ? new Date(`${iso}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
    out.push({
      effectiveDate,
      issueCode,
      indexUrl: new URL(href, HONG_KONG_WEB_AIP_URL).href,
      ts,
    });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

function parseIndiaIssues(html: string): Array<{ label: string; issueCode: string; indexUrl: string; ts: number }> {
  const re = /<a[^>]*href=["']([^"']*\/eaip\/eaip-v2-[^"']*\/index-en-GB\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const out: Array<{ label: string; issueCode: string; indexUrl: string; ts: number }> = [];
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(html))) {
    const href = m[1];
    const label = String(m[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const issueCode = href.match(/eaip-v2-([0-9-]+-[0-9]{4})/i)?.[1] ?? href;
    const iso = issueCode.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
    const ts = iso ? new Date(`${iso}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
    out.push({
      label,
      issueCode,
      indexUrl: new URL(href, INDIA_WEB_AIP_URL).href,
      ts,
    });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

function parseKoreaIssues(historyHtml: string): Array<{ label: string; issueUrl: string; ts: number }> {
  const re = /<a[^>]*href=["']([^"']*index-en-GB\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const out: Array<{ label: string; issueUrl: string; ts: number }> = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(historyHtml))) {
    const href = String(m[1] || "").trim();
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const label = String(m[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const iso = label.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? parseIssueDateCode(label) ?? "";
    const ts = iso ? new Date(`${iso}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
    out.push({ label, issueUrl: new URL(href, SOUTH_KOREA_WEB_AIP_URL).href, ts });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

function parseKosovoIssues(historyHtml: string): Array<{ label: string; issueCode: string; indexUrl: string; ts: number }> {
  const re = /<a[^>]*href=["']([^"']*index\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const out: Array<{ label: string; issueCode: string; indexUrl: string; ts: number }> = [];
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(historyHtml))) {
    const rawHref = String(m[1] || "");
    const label = String(m[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const issueCode = decodeURIComponent(rawHref).replace(/\/index\.html$/i, "");
    const iso = issueCode.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? parseIssueDateCode(label) ?? "";
    const ts = iso ? new Date(`${iso}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
    out.push({
      label,
      issueCode,
      indexUrl: new URL(normalizeRelativeHref(rawHref), KOSOVO_WEB_AIP_URL).href,
      ts,
    });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

function parseMalaysiaIssues(historyHtml: string): Array<{ label: string; issueUrl: string; ts: number }> {
  const re = /<a[^>]*href=["']([^"']*index-en-MS\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const out: Array<{ label: string; issueUrl: string; ts: number }> = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(historyHtml))) {
    const href = String(m[1] || "").trim();
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const label = String(m[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const iso = label.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? parseIssueDateCode(label) ?? "";
    const ts = iso ? new Date(`${iso}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
    out.push({ label, issueUrl: new URL(href, MALAYSIA_WEB_AIP_URL).href, ts });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

function parseMongoliaIssues(historyHtml: string): Array<{ issueCode: string; indexUrl: string; ts: number }> {
  const re = /<a[^>]*href=["']([^"']*index-en-MN\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const out: Array<{ issueCode: string; indexUrl: string; ts: number }> = [];
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(historyHtml))) {
    const rawHref = String(m[1] || "").trim();
    if (!rawHref) continue;
    const issueCode = rawHref.match(/([0-9]{4}-[0-9]{2}-[0-9]{2}(?:-AIRAC)?)/i)?.[1] ?? rawHref;
    const iso = issueCode.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
    const ts = iso ? new Date(`${iso}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
    out.push({ issueCode, indexUrl: new URL(rawHref, MONGOLIA_WEB_AIP_URL).href, ts });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

function parseNorthMacedoniaIssues(startHtml: string): Array<{ label: string; issueUrl: string; rank: number }> {
  const cleaned = startHtml.replace(/<!--[\s\S]*?-->/g, "");
  const re =
    /<a\s+href=["']((?:current|future)\/index\.htm)["'][^>]*>\s*<b[^>]*>\s*(Current|Future)\s+version:\s*AIP\s+NORTH\s+MACEDONIA\s*<\/b>\s*<\/a>([\s\S]*?)(?:<br|$)/gi;
  const out: Array<{ label: string; issueUrl: string; rank: number }> = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(cleaned))) {
    const href = String(m[1] || "").trim();
    const kind = String(m[2] || "").trim().toUpperCase();
    const tail = String(m[3] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!href) continue;
    const key = `${kind}:${href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      label: tail ? `${kind}: ${tail}` : kind,
      issueUrl: new URL(normalizeRelativeHref(href), NORTH_MACEDONIA_WEB_AIP_URL).href,
      rank: kind === "CURRENT" ? 0 : 1,
    });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

function parseMetaRefreshTarget(html: string): string | null {
  return html.match(/http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["']/i)?.[1]?.trim() || null;
}

async function resolveNorthMacedoniaMenuUrl(issueUrl: string): Promise<string> {
  let indexUrl = issueUrl;
  for (let i = 0; i < 3; i++) {
    const indexHtml = await fetchText(indexUrl);
    const navBase = indexHtml.match(/name=["']eAISNavigationBase["'][^>]*src=["']([^"']+)["']/i)?.[1];
    if (navBase) {
      const tocUrl = new URL(normalizeRelativeHref(navBase), indexUrl).href;
      const tocHtml = await fetchText(tocUrl);
      const menuSrc = tocHtml.match(/name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i)?.[1];
      if (!menuSrc) throw new Error("North Macedonia menu frame source not found.");
      return new URL(normalizeRelativeHref(menuSrc), tocUrl).href;
    }
    const directMenuSrc =
      indexHtml.match(/<frame[^>]*name=["']menu["'][^>]*src=["']([^"']+)["']/i)?.[1] ||
      indexHtml.match(/<frame[^>]*src=["']([^"']+)["'][^>]*name=["']menu["']/i)?.[1];
    if (directMenuSrc) return new URL(normalizeRelativeHref(directMenuSrc), indexUrl).href;
    const refreshTarget = parseMetaRefreshTarget(indexHtml);
    if (!refreshTarget) break;
    indexUrl = new URL(normalizeRelativeHref(refreshTarget), indexUrl).href;
  }
  throw new Error("North Macedonia navigation frame not found.");
}

function flattenMenus(root: any, out: any[] = []): any[] {
  if (!root || typeof root !== "object") return out;
  out.push(root);
  for (const c of root.children || []) flattenMenus(c, out);
  return out;
}

function parseJapanFullIcaos(html: string): string[] {
  const matches = [...html.matchAll(/href\s*=\s*["']?([^"'\s>]*\/documents\/([A-Z]{4})_full\.pdf)["']?/gi)];
  return normalizeIcaos(matches.map((m) => String(m[2] || "").toUpperCase()));
}

function parseQatarFirstIssue(aimHtml: string): { indexUrl: string; effectiveDate: string | null } | null {
  const rowMatches = [...aimHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const row of rowMatches) {
    const rowHtml = row[1] || "";
    const tds = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      String(m[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    );
    if (tds.length < 2) continue;
    if (!/\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/.test(tds[1] || "")) continue;
    const linkMatch = rowHtml.match(/href=["'](https?:\/\/www\.aim\.gov\.qa\/eaip\/[^"']*\/html\/index-en-GB\.html[^"']*)["']/i);
    if (!linkMatch?.[1]) continue;
    return { indexUrl: linkMatch[1], effectiveDate: parseIssueDateCode(tds[1]) ?? null };
  }
  const fallback = aimHtml.match(/href=["'](https?:\/\/www\.aim\.gov\.qa\/eaip\/[^"']*\/html\/index-en-GB\.html[^"']*)["']/i)?.[1];
  return fallback ? { indexUrl: fallback, effectiveDate: fallback.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null } : null;
}

function parseRwandaTocUrl(menuWithButtonHtml: string): string | null {
  const idFirst =
    menuWithButtonHtml.match(/id\s*=\s*["']AIP_RWANDA["'][\s\S]*?href\s*=\s*["']([^"']+)["']/i) ||
    menuWithButtonHtml.match(/href\s*=\s*["']([^"']+)["'][\s\S]*?id\s*=\s*["']AIP_RWANDA["']/i);
  const raw = idFirst?.[1] ?? "";
  if (!raw) return null;
  return new URL(raw.replace(/\\/g, "/"), "https://aim.asecna.aero/html/eAIP/").href;
}

function parseSaudiIssues(historyHtml: string): Array<{ issueCode: string; indexUrl: string; ts: number }> {
  const out: Array<{ issueCode: string; indexUrl: string; ts: number }> = [];
  const re = /<a[^>]*href=["']([^"']*index\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(historyHtml))) {
    const rawHref = m[1];
    const decodedHref = decodeURIComponent(rawHref);
    const issueCode =
      decodedHref.match(/([A-Z]+\s+AIP\s+AMDT[^\s/]*\s+\d{2}_\d{2}_\d{4}_\d{2}_\d{2})/i)?.[1] ??
      decodedHref.replace(/\/index\.html$/i, "");
    const iso = issueCode.match(/\d{4}_\d{2}_\d{2}/)?.[0]?.replace(/_/g, "-") ?? "";
    const ts = iso ? new Date(`${iso}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
    out.push({ issueCode, indexUrl: new URL(normalizeRelativeHref(rawHref), SAUDI_ARABIA_WEB_AIP_URL).href, ts });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

function parseSomaliaIssues(historyHtml: string): Array<{ issueUrl: string; effectiveDate: string | null; ts: number }> {
  const out: Array<{ issueUrl: string; effectiveDate: string | null; ts: number }> = [];
  const re = /<a[^>]*href=["']([^"']*index-en-GB\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(historyHtml))) {
    const href = m[1];
    const label = String(m[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const effectiveDate = parseIssueDateCode(label) ?? label.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    const ts = effectiveDate ? new Date(`${effectiveDate}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
    out.push({ issueUrl: new URL(href, SOMALIA_WEB_AIP_URL).href, effectiveDate, ts });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

function parseSriLankaIssueUrls(indexHtml: string, indexUrl: string): Array<{ issueUrl: string; effectiveDate: string | null; ts: number }> {
  const out: Array<{ issueUrl: string; effectiveDate: string | null; ts: number }> = [];
  const optionRe = /<option[^>]*value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi;
  let m: RegExpExecArray | null = null;
  while ((m = optionRe.exec(indexHtml))) {
    const rawValue = String(m[1] || "").trim();
    if (!/index(?:-en-EN)?\.html?$/i.test(rawValue)) continue;
    const issueUrl = new URL(normalizeRelativeHref(rawValue), indexUrl).href.replace(/\/index\.html$/i, "/index-en-EN.html");
    const label = String(m[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const effectiveDate = parseIssueDateCode(label) ?? issueUrl.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    const ts = effectiveDate ? new Date(`${effectiveDate}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
    out.push({ issueUrl, effectiveDate, ts });
  }
  const dedup = new Map<string, { issueUrl: string; effectiveDate: string | null; ts: number }>();
  for (const row of out) {
    if (!dedup.has(row.issueUrl)) dedup.set(row.issueUrl, row);
  }
  const rows = [...dedup.values()].sort((a, b) => b.ts - a.ts);
  if (rows.length > 0) return rows;
  const refreshTarget = indexHtml.match(/http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["']/i)?.[1]?.trim();
  if (!refreshTarget) return rows;
  const issueUrl = new URL(normalizeRelativeHref(refreshTarget), indexUrl).href.replace(/\/index\.html$/i, "/index-en-EN.html");
  const effectiveDate = issueUrl.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  const ts = effectiveDate ? new Date(`${effectiveDate}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
  return [{ issueUrl, effectiveDate, ts }];
}

function parseTaiwanIssues(historyHtml: string): Array<{ issueUrl: string; effectiveDate: string | null; ts: number }> {
  const out: Array<{ issueUrl: string; effectiveDate: string | null; ts: number }> = [];
  const re = /<a[^>]*href=["']([^"']*index\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(historyHtml))) {
    const rawHref = normalizeRelativeHref(m[1]);
    const issueUrl = new URL(rawHref, TAIWAN_WEB_AIP_URL).href;
    const label = String(m[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const effectiveDate = parseIssueDateCode(label) ?? issueUrl.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    const ts = effectiveDate ? new Date(`${effectiveDate}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
    out.push({ issueUrl, effectiveDate, ts });
  }
  const dedup = new Map<string, { issueUrl: string; effectiveDate: string | null; ts: number }>();
  for (const row of out) {
    if (!dedup.has(row.issueUrl)) dedup.set(row.issueUrl, row);
  }
  return [...dedup.values()].sort((a, b) => b.ts - a.ts);
}

function parseThailandIssues(historyHtml: string): Array<{ issueUrl: string; effectiveDate: string | null; ts: number }> {
  const out: Array<{ issueUrl: string; effectiveDate: string | null; ts: number }> = [];
  const re = /<a[^>]*href=["']([^"']*index-en-GB\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(historyHtml))) {
    const href = m[1];
    const issueUrl = new URL(href, THAILAND_WEB_AIP_URL).href;
    const label = String(m[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const effectiveDate = parseIssueDateCode(label) ?? issueUrl.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    const ts = effectiveDate ? new Date(`${effectiveDate}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
    out.push({ issueUrl, effectiveDate, ts });
  }
  const dedup = new Map<string, { issueUrl: string; effectiveDate: string | null; ts: number }>();
  for (const row of out) {
    if (!dedup.has(row.issueUrl)) dedup.set(row.issueUrl, row);
  }
  return [...dedup.values()].sort((a, b) => b.ts - a.ts);
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

async function resolveHongKongMetaLive(): Promise<ScraperMeta> {
  const historyHtml = await fetchText(HONG_KONG_WEB_AIP_URL);
  const issues = parseHongKongIssues(historyHtml);
  const issue = issues[0];
  if (!issue) {
    return {
      country: "Hong Kong",
      effectiveDate: null,
      ad2Icaos: [],
      webAipUrl: HONG_KONG_WEB_AIP_URL,
    };
  }
  const indexHtml = await fetchText(issue.indexUrl);
  const directMenu = indexHtml.match(/<frame[^>]*name="eAISNavigation"[^>]*src="([^"]+)"/i)?.[1];
  const baseFrame = indexHtml.match(/<frame[^>]*name="eAISNavigationBase"[^>]*src="([^"]+)"/i)?.[1];
  let menuUrl: string | null = null;
  if (directMenu) menuUrl = new URL(directMenu, issue.indexUrl).href;
  else if (baseFrame) menuUrl = new URL(baseFrame, issue.indexUrl).href;
  if (!menuUrl) return { country: "Hong Kong", effectiveDate: issue.effectiveDate, ad2Icaos: [], webAipUrl: HONG_KONG_WEB_AIP_URL };
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/(?:VH|VM)-AD-2[-.]([A-Z0-9]{4})-en-US\.html#(?:AD-2[-.][A-Z0-9]{4}|i[^"]*)/gi)].map((m) =>
      String(m[1] || "").toUpperCase(),
    ),
  );
  return {
    country: "Hong Kong",
    effectiveDate: issue.effectiveDate,
    ad2Icaos,
    webAipUrl: HONG_KONG_WEB_AIP_URL,
  };
}

async function resolveIndiaMetaLive(): Promise<ScraperMeta> {
  const listHtml = await fetchText(INDIA_WEB_AIP_URL);
  const issues = parseIndiaIssues(listHtml);
  const issue = issues[0];
  if (!issue) {
    return {
      country: "India",
      effectiveDate: null,
      ad2Icaos: [],
      webAipUrl: INDIA_WEB_AIP_URL,
    };
  }
  const effectiveDate = issue.issueCode.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  const indexHtml = await fetchText(issue.indexUrl);
  const tocUrlMatch = indexHtml.match(/<frame[^>]*name=["']eAISNavigationBase["'][^>]*src=["']([^"']+)["']/i)?.[1];
  if (!tocUrlMatch) return { country: "India", effectiveDate, ad2Icaos: [], webAipUrl: INDIA_WEB_AIP_URL };
  const tocUrl = new URL(tocUrlMatch, issue.indexUrl).href;
  const tocHtml = await fetchText(tocUrl);
  const menuFrame = tocHtml.match(/<frame[^>]*name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i)?.[1];
  if (!menuFrame) return { country: "India", effectiveDate, ad2Icaos: [], webAipUrl: INDIA_WEB_AIP_URL };
  const menuUrl = new URL(menuFrame, tocUrl).href;
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/IN-AD\s*2\.1([A-Z0-9]{4})-en-GB\.html/gi)].map((m) => String(m[1] || "").toUpperCase()),
  );
  return {
    country: "India",
    effectiveDate,
    ad2Icaos,
    webAipUrl: INDIA_WEB_AIP_URL,
  };
}

async function resolveIsraelMetaLive(): Promise<ScraperMeta> {
  const historyHtml = await fetchText(ISRAEL_WEB_AIP_URL);
  const issueMatches = [...historyHtml.matchAll(/<a[^>]*href=["']([^"']*AIRAC\/html\/index\.html)["'][^>]*>/gi)];
  const issues = issueMatches
    .map((m) => {
      const href = String(m[1] || "");
      const issueCode = href.match(/(\d{4}-\d{2}-\d{2}-AIRAC)/i)?.[1] ?? "";
      const effectiveDate = issueCode.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
      const ts = effectiveDate ? new Date(`${effectiveDate}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
      return { href, issueCode, effectiveDate, ts };
    })
    .filter((x) => x.href)
    .sort((a, b) => b.ts - a.ts);
  const issue = issues[0];
  if (!issue) return { country: "Israel", effectiveDate: null, ad2Icaos: [], webAipUrl: ISRAEL_WEB_AIP_URL };
  const indexUrl = new URL(issue.href, ISRAEL_WEB_AIP_URL).href;
  const indexHtml = await fetchText(indexUrl);
  const menuFrame = indexHtml.match(/<frame[^>]*name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i)?.[1];
  if (!menuFrame) return { country: "Israel", effectiveDate: issue.effectiveDate, ad2Icaos: [], webAipUrl: ISRAEL_WEB_AIP_URL };
  const menuUrl = new URL(menuFrame, indexUrl).href;
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/LL-AD-2\.([A-Z0-9]{4})-en-GB\.html#AD-2\.[A-Z0-9]{4}/gi)].map((m) =>
      String(m[1] || "").toUpperCase(),
    ),
  );
  return {
    country: "Israel",
    effectiveDate: issue.effectiveDate,
    ad2Icaos,
    webAipUrl: ISRAEL_WEB_AIP_URL,
  };
}

async function resolveSouthKoreaMetaLive(): Promise<ScraperMeta> {
  const historyHtml = await fetchText(SOUTH_KOREA_WEB_AIP_URL);
  const issues = parseKoreaIssues(historyHtml);
  const issue = issues[0];
  if (!issue) {
    return { country: "South Korea", effectiveDate: null, ad2Icaos: [], webAipUrl: SOUTH_KOREA_WEB_AIP_URL };
  }
  const indexHtml = await fetchText(issue.issueUrl);
  const tocUrl = parseMenuUrlFromIndex(indexHtml, issue.issueUrl);
  if (!tocUrl) return { country: "South Korea", effectiveDate: parseIssueDateCode(issue.label), ad2Icaos: [], webAipUrl: SOUTH_KOREA_WEB_AIP_URL };
  const tocHtml = await fetchText(tocUrl);
  const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
  if (!menuUrl) return { country: "South Korea", effectiveDate: parseIssueDateCode(issue.label), ad2Icaos: [], webAipUrl: SOUTH_KOREA_WEB_AIP_URL };
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/AD-2\.([A-Z0-9]{4})[^"']*\.html/gi)].map((m) => String(m[1] || "").toUpperCase()),
  );
  return {
    country: "South Korea",
    effectiveDate: parseIssueDateCode(issue.label),
    ad2Icaos,
    webAipUrl: SOUTH_KOREA_WEB_AIP_URL,
  };
}

async function resolveKosovoMetaLive(): Promise<ScraperMeta> {
  const historyHtml = await fetchText(KOSOVO_WEB_AIP_URL);
  const issues = parseKosovoIssues(historyHtml);
  const issue = issues[0];
  if (!issue) return { country: "Kosovo", effectiveDate: null, ad2Icaos: [], webAipUrl: KOSOVO_WEB_AIP_URL };
  const indexHtml = await fetchText(issue.indexUrl);
  const tocUrl = parseMenuUrlFromIndex(indexHtml, issue.indexUrl);
  if (!tocUrl) return { country: "Kosovo", effectiveDate: parseIssueDateCode(issue.label), ad2Icaos: [], webAipUrl: KOSOVO_WEB_AIP_URL };
  const tocHtml = await fetchText(tocUrl);
  const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
  if (!menuUrl) return { country: "Kosovo", effectiveDate: parseIssueDateCode(issue.label), ad2Icaos: [], webAipUrl: KOSOVO_WEB_AIP_URL };
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/AD\s*2[^"']*\.html#AD-2-([A-Z0-9]{4})/gi)].map((m) => String(m[1] || "").toUpperCase()),
  );
  return {
    country: "Kosovo",
    effectiveDate: parseIssueDateCode(issue.label),
    ad2Icaos,
    webAipUrl: KOSOVO_WEB_AIP_URL,
  };
}

async function resolveKuwaitMetaLive(): Promise<ScraperMeta> {
  const html = await fetchText(KUWAIT_WEB_AIP_URL);
  const ad2Icaos = normalizeIcaos(
    [...html.matchAll(/AD\s*2\.?([A-Z0-9]{4})-1\s*:/gi)].map((m) => String(m[1] || "").toUpperCase()),
  );
  return {
    country: "Kuwait",
    effectiveDate: null,
    ad2Icaos,
    webAipUrl: KUWAIT_WEB_AIP_URL,
  };
}

async function resolveLibyaMetaLive(): Promise<ScraperMeta> {
  const html = await fetchText(LIBYA_WEB_AIP_URL);
  const ad2Icaos = normalizeIcaos(
    [...html.matchAll(/\/(HL[A-Z0-9]{2})\.pdf/gi)].map((m) => String(m[1] || "").toUpperCase()),
  );
  return {
    country: "Libya",
    effectiveDate: null,
    ad2Icaos,
    webAipUrl: LIBYA_WEB_AIP_URL,
  };
}

async function resolveMalaysiaMetaLive(): Promise<ScraperMeta> {
  const historyHtml = await fetchText(MALAYSIA_WEB_AIP_URL);
  const issues = parseMalaysiaIssues(historyHtml);
  const issue = issues[0];
  if (!issue) return { country: "Malaysia", effectiveDate: null, ad2Icaos: [], webAipUrl: MALAYSIA_WEB_AIP_URL };
  const indexHtml = await fetchText(issue.issueUrl);
  const tocUrl = parseMenuUrlFromIndex(indexHtml, issue.issueUrl);
  if (!tocUrl) return { country: "Malaysia", effectiveDate: parseIssueDateCode(issue.label), ad2Icaos: [], webAipUrl: MALAYSIA_WEB_AIP_URL };
  const tocHtml = await fetchText(tocUrl);
  const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
  if (!menuUrl) return { country: "Malaysia", effectiveDate: parseIssueDateCode(issue.label), ad2Icaos: [], webAipUrl: MALAYSIA_WEB_AIP_URL };
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/AD-2\.([A-Z0-9]{4})[^"']*\.html/gi)].map((m) => String(m[1] || "").toUpperCase()),
  );
  return {
    country: "Malaysia",
    effectiveDate: parseIssueDateCode(issue.label),
    ad2Icaos,
    webAipUrl: MALAYSIA_WEB_AIP_URL,
  };
}

async function resolveMaldivesMetaLive(): Promise<ScraperMeta> {
  const html = await fetchText(MALDIVES_WEB_AIP_URL);
  const ad2Icaos = normalizeIcaos(
    [...html.matchAll(/<h6[^>]*class=["'][^"']*\bdataloadlist\b[^"']*["'][^>]*>([\s\S]*?)<\/h6>/gi)]
      .map((m) => String(m[1] || "").replace(/<[^>]+>/g, " "))
      .map((label) => label.match(/\b([A-Z]{4})\b/)?.[1]?.toUpperCase() || "")
      .filter(Boolean),
  );
  return {
    country: "Maldives",
    effectiveDate: null,
    ad2Icaos,
    webAipUrl: MALDIVES_WEB_AIP_URL,
  };
}

async function resolveMongoliaMetaLive(): Promise<ScraperMeta> {
  const historyHtml = await fetchText(MONGOLIA_WEB_AIP_URL);
  const issues = parseMongoliaIssues(historyHtml);
  const issue = issues[0];
  if (!issue) return { country: "Mongolia", effectiveDate: null, ad2Icaos: [], webAipUrl: MONGOLIA_WEB_AIP_URL };
  const indexHtml = await fetchText(issue.indexUrl);
  const tocUrl = parseMenuUrlFromIndex(indexHtml, issue.indexUrl);
  if (!tocUrl) return { country: "Mongolia", effectiveDate: issue.issueCode.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null, ad2Icaos: [], webAipUrl: MONGOLIA_WEB_AIP_URL };
  const tocHtml = await fetchText(tocUrl);
  const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
  if (!menuUrl) return { country: "Mongolia", effectiveDate: issue.issueCode.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null, ad2Icaos: [], webAipUrl: MONGOLIA_WEB_AIP_URL };
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/AD-2\.([A-Z0-9]{4})[^"']*\.html/gi)].map((m) => String(m[1] || "").toUpperCase()),
  );
  return {
    country: "Mongolia",
    effectiveDate: issue.issueCode.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null,
    ad2Icaos,
    webAipUrl: MONGOLIA_WEB_AIP_URL,
  };
}

async function resolveMyanmarMetaLive(): Promise<ScraperMeta> {
  const indexHtml = await fetchText(MYANMAR_WEB_AIP_URL);
  const tocUrl = parseMenuUrlFromIndex(indexHtml, MYANMAR_WEB_AIP_URL);
  if (!tocUrl) return { country: "Myanmar", effectiveDate: "2018-02-15", ad2Icaos: [], webAipUrl: MYANMAR_WEB_AIP_URL };
  const tocHtml = await fetchText(tocUrl);
  const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
  if (!menuUrl) return { country: "Myanmar", effectiveDate: "2018-02-15", ad2Icaos: [], webAipUrl: MYANMAR_WEB_AIP_URL };
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/AD-2\.([A-Z0-9]{4})[^"']*\.html#AD-2[^"']*/gi)].map((m) => String(m[1] || "").toUpperCase()),
  );
  return {
    country: "Myanmar",
    effectiveDate: "2018-02-15",
    ad2Icaos,
    webAipUrl: MYANMAR_WEB_AIP_URL,
  };
}

async function resolveNepalMetaLive(): Promise<ScraperMeta> {
  const html = await fetchText(NEPAL_WEB_AIP_URL);
  const ad2Icaos = normalizeIcaos(
    [...html.matchAll(/\b(VN[A-Z0-9]{2})\b/gi)].map((m) => String(m[1] || "").toUpperCase()),
  );
  return {
    country: "Nepal",
    effectiveDate: null,
    ad2Icaos,
    webAipUrl: NEPAL_WEB_AIP_URL,
  };
}

async function resolveNorthMacedoniaMetaLive(): Promise<ScraperMeta> {
  const startHtml = await fetchText(NORTH_MACEDONIA_WEB_AIP_URL);
  const issues = parseNorthMacedoniaIssues(startHtml);
  const issue = issues[0];
  if (!issue) return { country: "North Macedonia", effectiveDate: null, ad2Icaos: [], webAipUrl: NORTH_MACEDONIA_WEB_AIP_URL };
  const menuUrl = await resolveNorthMacedoniaMenuUrl(issue.issueUrl);
  const menuHtml = await fetchText(menuUrl);
  const treeItemsSrc = menuHtml.match(/<script[^>]*src=["']([^"']*tree_items\.js[^"']*)["']/i)?.[1];
  if (!treeItemsSrc) return { country: "North Macedonia", effectiveDate: parseIssueDateCode(issue.label), ad2Icaos: [], webAipUrl: NORTH_MACEDONIA_WEB_AIP_URL };
  const treeUrl = new URL(normalizeRelativeHref(treeItemsSrc), menuUrl).href;
  const treeJs = await fetchText(treeUrl);
  const ad2Icaos = normalizeIcaos(
    [...treeJs.matchAll(/'[^']*LW_AD_2_([A-Z]{4})_en\.pdf'/gi)].map((m) => String(m[1] || "").toUpperCase()),
  );
  return {
    country: "North Macedonia",
    effectiveDate: parseIssueDateCode(issue.label),
    ad2Icaos,
    webAipUrl: NORTH_MACEDONIA_WEB_AIP_URL,
  };
}

async function resolvePakistanMetaLive(): Promise<ScraperMeta> {
  const menus = await fetchJson(PAKISTAN_MENUS_API);
  const all: any[] = [];
  for (const row of menus?.data || []) {
    if (row?.paaEnglishMenus) flattenMenus(row.paaEnglishMenus, all);
  }
  const match = all.find((x) => String(x?.redirctFrontURL || "").toLowerCase() === PAKISTAN_EAIP_ROUTE.toLowerCase());
  if (!match?.uniqueId) {
    return { country: "Pakistan", effectiveDate: null, ad2Icaos: [], webAipUrl: PAKISTAN_WEB_AIP_URL };
  }
  const url = `${PAKISTAN_CONTENT_BY_ID_API}?Id=${encodeURIComponent(match.uniqueId)}&ApiKey=123456789_API`;
  const payload = await fetchJson(url);
  const items = payload?.data?.en?.properties?.addEAIP?.items || [];
  const issues = items
    .map((item: any) => {
      const p = item?.content?.properties || {};
      const rawUrl = p?.uRL?.[0]?.url;
      return {
        issueUrl: String(rawUrl || "").trim(),
        effectiveDate: p?.effectiveDate || null,
        latest: Boolean(p?.latest),
      };
    })
    .filter((x: any) => x.issueUrl)
    .sort((a: any, b: any) => {
      const da = parseDate(a.effectiveDate)?.valueOf() || 0;
      const db = parseDate(b.effectiveDate)?.valueOf() || 0;
      return db - da;
    });
  const issue = issues.find((x: any) => x.latest) ?? issues[0];
  if (!issue) return { country: "Pakistan", effectiveDate: null, ad2Icaos: [], webAipUrl: PAKISTAN_WEB_AIP_URL };
  const leftUrl = new URL("left.htm", issue.issueUrl).href;
  const leftHtml = await fetchText(leftUrl);
  const ad2Icaos = normalizeIcaos(
    [...leftHtml.matchAll(/\(([A-Z0-9]{4})\)/gi)]
      .map((m) => String(m[1] || "").toUpperCase())
      .filter((icao) => /^OP[A-Z0-9]{2}$/.test(icao)),
  );
  const d = parseDate(issue.effectiveDate);
  return {
    country: "Pakistan",
    effectiveDate: d && !Number.isNaN(d.valueOf()) ? d.toISOString().slice(0, 10) : null,
    ad2Icaos,
    webAipUrl: PAKISTAN_WEB_AIP_URL,
  };
}

async function resolvePanamaMetaLive(): Promise<ScraperMeta> {
  const html = await fetchText(PANAMA_WEB_AIP_URL);
  const ad2Icaos = normalizeIcaos([...html.matchAll(/\b(MP[A-Z0-9]{2})\b/gi)].map((m) => String(m[1] || "").toUpperCase()));
  return { country: "Panama", effectiveDate: null, ad2Icaos, webAipUrl: PANAMA_WEB_AIP_URL };
}

async function resolveQatarMetaLive(): Promise<ScraperMeta> {
  const aimHtml = await fetchText(QATAR_WEB_AIP_URL);
  const issue = parseQatarFirstIssue(aimHtml);
  if (!issue) return { country: "Qatar", effectiveDate: null, ad2Icaos: [], webAipUrl: QATAR_WEB_AIP_URL };
  const indexHtml = await fetchText(issue.indexUrl);
  const tocUrl = parseMenuUrlFromIndex(indexHtml, issue.indexUrl);
  if (!tocUrl) return { country: "Qatar", effectiveDate: issue.effectiveDate, ad2Icaos: [], webAipUrl: QATAR_WEB_AIP_URL };
  const tocHtml = await fetchText(tocUrl);
  const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
  if (!menuUrl) return { country: "Qatar", effectiveDate: issue.effectiveDate, ad2Icaos: [], webAipUrl: QATAR_WEB_AIP_URL };
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/\/AD-2\.([A-Z0-9]{4})-en-GB\.html#AD-2\.[A-Z0-9]{4}/gi)]
      .map((m) => String(m[1] || "").toUpperCase())
      .filter((icao) => /^OT[A-Z0-9]{2}$/.test(icao)),
  );
  return { country: "Qatar", effectiveDate: issue.effectiveDate, ad2Icaos, webAipUrl: QATAR_WEB_AIP_URL };
}

async function resolveRwandaMetaLive(): Promise<ScraperMeta> {
  const menuWithButton = await fetchText(RWANDA_WEB_AIP_URL);
  const tocUrl = parseRwandaTocUrl(menuWithButton);
  if (!tocUrl) return { country: "Rwanda", effectiveDate: null, ad2Icaos: [], webAipUrl: RWANDA_WEB_AIP_URL };
  const tocHtml = await fetchText(tocUrl);
  const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
  if (!menuUrl) return { country: "Rwanda", effectiveDate: null, ad2Icaos: [], webAipUrl: RWANDA_WEB_AIP_URL };
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos([...menuHtml.matchAll(/AD 2\s+([A-Z0-9]{4})/g)].map((m) => String(m[1] || "").toUpperCase()));
  return { country: "Rwanda", effectiveDate: null, ad2Icaos, webAipUrl: RWANDA_WEB_AIP_URL };
}

async function resolveSaudiArabiaMetaLive(): Promise<ScraperMeta> {
  const historyHtml = await fetchText(SAUDI_ARABIA_WEB_AIP_URL);
  const issues = parseSaudiIssues(historyHtml);
  const issue = issues[0];
  if (!issue) return { country: "Saudi Arabia", effectiveDate: null, ad2Icaos: [], webAipUrl: SAUDI_ARABIA_WEB_AIP_URL };
  const indexHtml = await fetchText(issue.indexUrl);
  const tocUrl = parseMenuUrlFromIndex(indexHtml, issue.indexUrl);
  if (!tocUrl) return { country: "Saudi Arabia", effectiveDate: null, ad2Icaos: [], webAipUrl: SAUDI_ARABIA_WEB_AIP_URL };
  const tocHtml = await fetchText(tocUrl);
  const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
  if (!menuUrl) return { country: "Saudi Arabia", effectiveDate: null, ad2Icaos: [], webAipUrl: SAUDI_ARABIA_WEB_AIP_URL };
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/AD\s*2[^"']*#AD-2-([A-Z0-9]{4})/gi)]
      .map((m) => String(m[1] || "").toUpperCase())
      .filter((icao) => /^OE[A-Z0-9]{2}$/.test(icao)),
  );
  return {
    country: "Saudi Arabia",
    effectiveDate: issue.issueCode.match(/\d{4}_\d{2}_\d{2}/)?.[0]?.replace(/_/g, "-") ?? null,
    ad2Icaos,
    webAipUrl: SAUDI_ARABIA_WEB_AIP_URL,
  };
}

async function resolveSomaliaMetaLive(): Promise<ScraperMeta> {
  const historyHtml = await fetchText(SOMALIA_WEB_AIP_URL);
  const issues = parseSomaliaIssues(historyHtml);
  const issue = issues[0];
  if (!issue) return { country: "Somalia", effectiveDate: null, ad2Icaos: [], webAipUrl: SOMALIA_WEB_AIP_URL };
  const indexHtml = await fetchText(issue.issueUrl);
  const tocUrl = parseMenuUrlFromIndex(indexHtml, issue.issueUrl);
  if (!tocUrl) return { country: "Somalia", effectiveDate: issue.effectiveDate, ad2Icaos: [], webAipUrl: SOMALIA_WEB_AIP_URL };
  const tocHtml = await fetchText(tocUrl);
  const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
  if (!menuUrl) return { country: "Somalia", effectiveDate: issue.effectiveDate, ad2Icaos: [], webAipUrl: SOMALIA_WEB_AIP_URL };
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/AD-2\.([A-Z0-9]{4})/gi)]
      .map((m) => String(m[1] || "").toUpperCase())
      .filter((icao) => /^HC[A-Z0-9]{2}$/.test(icao)),
  );
  return { country: "Somalia", effectiveDate: issue.effectiveDate, ad2Icaos, webAipUrl: SOMALIA_WEB_AIP_URL };
}

async function resolveSriLankaMetaLive(): Promise<ScraperMeta> {
  const indexHtml = await fetchText(SRI_LANKA_WEB_AIP_URL);
  const issues = parseSriLankaIssueUrls(indexHtml, SRI_LANKA_WEB_AIP_URL);
  const issue = issues[0];
  const issueUrl = issue?.issueUrl ?? SRI_LANKA_WEB_AIP_URL;
  const candidates = [
    issueUrl,
    issueUrl.replace(/\/index-en-EN\.html$/i, "/index.html"),
    issueUrl.replace(/\/index-en-EN\.html$/i, "/index-en-GB.html"),
    SRI_LANKA_WEB_AIP_URL,
  ];
  let menuHtml = "";
  for (const candidate of [...new Set(candidates)]) {
    let indexUrl = candidate;
    for (let i = 0; i < 3; i += 1) {
      const candidateHtml = await fetchText(indexUrl);
      const tocUrl = parseMenuUrlFromIndex(candidateHtml, indexUrl);
      if (tocUrl) {
        const tocHtml = await fetchText(tocUrl);
        const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
        if (menuUrl) {
          menuHtml = await fetchText(menuUrl);
          break;
        }
      }
      const refreshTarget = candidateHtml.match(/http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["']/i)?.[1]?.trim();
      if (!refreshTarget) break;
      indexUrl = new URL(normalizeRelativeHref(refreshTarget), indexUrl).href;
    }
    if (menuHtml) break;
  }
  if (!menuHtml) return { country: "Sri Lanka", effectiveDate: issue?.effectiveDate ?? null, ad2Icaos: [], webAipUrl: SRI_LANKA_WEB_AIP_URL };
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/AD-2\.([A-Z0-9]{4})/gi)]
      .map((m) => String(m[1] || "").toUpperCase())
      .filter((icao) => /^VC[A-Z0-9]{2}$/.test(icao)),
  );
  return { country: "Sri Lanka", effectiveDate: issue?.effectiveDate ?? null, ad2Icaos, webAipUrl: SRI_LANKA_WEB_AIP_URL };
}

async function resolveTaiwanMetaLive(): Promise<ScraperMeta> {
  const historyHtml = await fetchText(TAIWAN_WEB_AIP_URL);
  const issues = parseTaiwanIssues(historyHtml);
  const issue = issues[0];
  if (!issue) return { country: "Taiwan", effectiveDate: null, ad2Icaos: [], webAipUrl: TAIWAN_WEB_AIP_URL };
  const indexHtml = await fetchText(issue.issueUrl);
  const tocUrl = parseMenuUrlFromIndex(indexHtml, issue.issueUrl);
  if (!tocUrl) return { country: "Taiwan", effectiveDate: issue.effectiveDate, ad2Icaos: [], webAipUrl: TAIWAN_WEB_AIP_URL };
  const tocHtml = await fetchText(tocUrl);
  const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
  if (!menuUrl) return { country: "Taiwan", effectiveDate: issue.effectiveDate, ad2Icaos: [], webAipUrl: TAIWAN_WEB_AIP_URL };
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/\b(RC[A-Z0-9]{2})\b/gi)].map((m) => String(m[1] || "").toUpperCase()),
  );
  return { country: "Taiwan", effectiveDate: issue.effectiveDate, ad2Icaos, webAipUrl: TAIWAN_WEB_AIP_URL };
}

async function resolveTajikistanMetaLive(): Promise<ScraperMeta> {
  const landingHtml = await fetchText(TAJIKISTAN_WEB_AIP_URL);
  const validaipPath = landingHtml.match(/onclick="window\.open\('([^']*validaip\/\?lang=en)'\)"/i)?.[1];
  if (!validaipPath) return { country: "Tajikistan", effectiveDate: null, ad2Icaos: [], webAipUrl: TAJIKISTAN_WEB_AIP_URL };
  const validaipUrl = new URL(validaipPath, TAJIKISTAN_WEB_AIP_URL).href;
  const validaipHtml = await fetchText(validaipUrl);
  const englishPath = validaipHtml.match(/<a[^>]*href=["']([^"']*html\/eng\.htm)["'][^>]*>/i)?.[1];
  if (!englishPath) return { country: "Tajikistan", effectiveDate: null, ad2Icaos: [], webAipUrl: TAJIKISTAN_WEB_AIP_URL };
  const englishUrl = new URL(englishPath, validaipUrl).href;
  const engHtml = await fetchText(englishUrl);
  const menuPath = engHtml.match(/<frame[^>]*name=["']menu["'][^>]*src=["']([^"']+)["']/i)?.[1];
  if (!menuPath) return { country: "Tajikistan", effectiveDate: null, ad2Icaos: [], webAipUrl: TAJIKISTAN_WEB_AIP_URL };
  const menuUrl = new URL(menuPath, englishUrl).href;
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/\/ad2\/([a-z0-9]{4})\//gi)]
      .map((m) => String(m[1] || "").toUpperCase())
      .filter((icao) => /^UT[A-Z0-9]{2}$/.test(icao)),
  );
  return { country: "Tajikistan", effectiveDate: null, ad2Icaos, webAipUrl: TAJIKISTAN_WEB_AIP_URL };
}

async function resolveThailandMetaLive(): Promise<ScraperMeta> {
  const historyHtml = await fetchText(THAILAND_WEB_AIP_URL);
  const issues = parseThailandIssues(historyHtml);
  const issue = issues[0];
  if (!issue) return { country: "Thailand", effectiveDate: null, ad2Icaos: [], webAipUrl: THAILAND_WEB_AIP_URL };
  const indexHtml = await fetchText(issue.issueUrl);
  const tocUrl = parseMenuUrlFromIndex(indexHtml, issue.issueUrl);
  if (!tocUrl) return { country: "Thailand", effectiveDate: issue.effectiveDate, ad2Icaos: [], webAipUrl: THAILAND_WEB_AIP_URL };
  const tocHtml = await fetchText(tocUrl);
  const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
  if (!menuUrl) return { country: "Thailand", effectiveDate: issue.effectiveDate, ad2Icaos: [], webAipUrl: THAILAND_WEB_AIP_URL };
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/AD-2\.([A-Z0-9]{4})/gi)]
      .map((m) => String(m[1] || "").toUpperCase())
      .filter((icao) => /^VT[A-Z0-9]{2}$/.test(icao)),
  );
  return { country: "Thailand", effectiveDate: issue.effectiveDate, ad2Icaos, webAipUrl: THAILAND_WEB_AIP_URL };
}

async function resolveTurkmenistanMetaLive(): Promise<ScraperMeta> {
  const landingHtml = await fetchText(TURKMENISTAN_WEB_AIP_URL);
  const validaipPath = landingHtml.match(/onclick="window\.open\('([^']*validaip\/\?lang=en)'\)"/i)?.[1];
  if (!validaipPath) return { country: "Turkmenistan", effectiveDate: null, ad2Icaos: [], webAipUrl: TURKMENISTAN_WEB_AIP_URL };
  const validaipUrl = new URL(validaipPath, TURKMENISTAN_WEB_AIP_URL).href;
  const validaipHtml = await fetchText(validaipUrl);
  const englishPath = validaipHtml.match(/<a[^>]*href=["']([^"']*html\/eng\.htm)["'][^>]*>/i)?.[1];
  if (!englishPath) return { country: "Turkmenistan", effectiveDate: null, ad2Icaos: [], webAipUrl: TURKMENISTAN_WEB_AIP_URL };
  const englishUrl = new URL(englishPath, validaipUrl).href;
  const engHtml = await fetchText(englishUrl);
  const menuPath = engHtml.match(/<frame[^>]*name=["']menu["'][^>]*src=["']([^"']+)["']/i)?.[1];
  if (!menuPath) return { country: "Turkmenistan", effectiveDate: null, ad2Icaos: [], webAipUrl: TURKMENISTAN_WEB_AIP_URL };
  const menuUrl = new URL(menuPath, englishUrl).href;
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/\/ad2\/([a-z0-9]{4})\//gi)]
      .map((m) => String(m[1] || "").toUpperCase())
      .filter((icao) => /^UT[A-Z0-9]{2}$/.test(icao)),
  );
  return { country: "Turkmenistan", effectiveDate: null, ad2Icaos, webAipUrl: TURKMENISTAN_WEB_AIP_URL };
}

async function resolveUaeMetaLive(): Promise<ScraperMeta> {
  const html = await fetchText(UAE_CONTENT_WEB_AIP_URL);
  const issueMatch = html.match(/<a[^>]*href=["']([^"']*index-en-GB\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
  if (!issueMatch?.[1]) return { country: "United Arab Emirates", effectiveDate: null, ad2Icaos: [], webAipUrl: UAE_WEB_AIP_URL };
  const issueUrl = new URL(issueMatch[1], UAE_CONTENT_WEB_AIP_URL).href;
  const issueLabel = String(issueMatch[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const indexHtml = await fetchText(issueUrl);
  const tocUrl = parseMenuUrlFromIndex(indexHtml, issueUrl);
  if (!tocUrl) return { country: "United Arab Emirates", effectiveDate: parseIssueDateCode(issueLabel), ad2Icaos: [], webAipUrl: UAE_WEB_AIP_URL };
  const tocHtml = await fetchText(tocUrl);
  const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
  if (!menuUrl) return { country: "United Arab Emirates", effectiveDate: parseIssueDateCode(issueLabel), ad2Icaos: [], webAipUrl: UAE_WEB_AIP_URL };
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/AD-2\.([A-Z0-9]{4})/gi)]
      .map((m) => String(m[1] || "").toUpperCase())
      .filter((icao) => /^OM[A-Z0-9]{2}$/.test(icao)),
  );
  return { country: "United Arab Emirates", effectiveDate: parseIssueDateCode(issueLabel), ad2Icaos, webAipUrl: UAE_WEB_AIP_URL };
}

async function resolveUzbekistanMetaLive(): Promise<ScraperMeta> {
  const html = await fetchText(UZBEKISTAN_WEB_AIP_URL);
  const ad2Icaos = normalizeIcaos(
    [...html.matchAll(/\b(UZ[A-Z0-9]{2})\b/gi)]
      .map((m) => String(m[1] || "").toUpperCase()),
  );
  return { country: "Uzbekistan", effectiveDate: null, ad2Icaos, webAipUrl: UZBEKISTAN_WEB_AIP_URL };
}

async function resolveVenezuelaMetaLive(): Promise<ScraperMeta> {
  const historyBodyHtml = await fetchText(VENEZUELA_HISTORY_BODY_URL);
  const issueMatch = historyBodyHtml.match(/<a[^>]*href=['"](\d{4}-\d{2}-\d{2})\/html\/index-en-GB\.html['"][^>]*>([\s\S]*?)<\/a>/i);
  if (!issueMatch?.[1]) return { country: "Venezuela", effectiveDate: null, ad2Icaos: [], webAipUrl: VENEZUELA_WEB_AIP_URL };
  const issueUrl = new URL(`${issueMatch[1]}/html/index-en-GB.html`, VENEZUELA_WEB_AIP_URL).href;
  const issueLabel = String(issueMatch[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const indexHtml = await fetchText(issueUrl);
  const tocUrl = parseMenuUrlFromIndex(indexHtml, issueUrl);
  if (!tocUrl) {
    const effectiveDate = parseIssueDateCode(issueLabel) ?? issueMatch[1];
    return { country: "Venezuela", effectiveDate, ad2Icaos: [], webAipUrl: VENEZUELA_WEB_AIP_URL };
  }
  const tocHtml = await fetchText(tocUrl);
  const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
  if (!menuUrl) {
    const effectiveDate = parseIssueDateCode(issueLabel) ?? issueMatch[1];
    return { country: "Venezuela", effectiveDate, ad2Icaos: [], webAipUrl: VENEZUELA_WEB_AIP_URL };
  }
  const menuHtml = await fetchText(menuUrl);
  const ad2Icaos = normalizeIcaos(
    [...menuHtml.matchAll(/SV-AD2\.1([A-Z]{4})-en-GB\.html/gi)]
      .map((m) => String(m[1] || "").toUpperCase())
      .filter((icao) => /^SV[A-Z0-9]{2}$/.test(icao)),
  );
  const effectiveDate = parseIssueDateCode(issueLabel) ?? issueMatch[1];
  return { country: "Venezuela", effectiveDate, ad2Icaos, webAipUrl: VENEZUELA_WEB_AIP_URL };
}

async function resolveJapanMetaLive(): Promise<ScraperMeta> {
  const html = await fetchText(JAPAN_WEB_AIP_URL);
  return {
    country: "Japan",
    effectiveDate: null,
    ad2Icaos: parseJapanFullIcaos(html),
    webAipUrl: JAPAN_WEB_AIP_URL,
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

export async function getHongKongMeta(): Promise<ScraperMeta> {
  if (hongKongCache && Date.now() < hongKongCache.expiresAt) return hongKongCache.value;
  try {
    const value = await withTimeout(resolveHongKongMetaLive(), FETCH_TIMEOUT_MS * 4);
    hongKongCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return hongKongCache?.value ?? { country: "Hong Kong", effectiveDate: null, ad2Icaos: [], webAipUrl: HONG_KONG_WEB_AIP_URL };
  }
}

export async function getIndiaMeta(): Promise<ScraperMeta> {
  if (indiaCache && Date.now() < indiaCache.expiresAt) return indiaCache.value;
  try {
    const value = await withTimeout(resolveIndiaMetaLive(), FETCH_TIMEOUT_MS * 4);
    indiaCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return indiaCache?.value ?? { country: "India", effectiveDate: null, ad2Icaos: [], webAipUrl: INDIA_WEB_AIP_URL };
  }
}

export async function getIsraelMeta(): Promise<ScraperMeta> {
  if (israelCache && Date.now() < israelCache.expiresAt) return israelCache.value;
  try {
    const value = await withTimeout(resolveIsraelMetaLive(), FETCH_TIMEOUT_MS * 4);
    israelCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return israelCache?.value ?? { country: "Israel", effectiveDate: null, ad2Icaos: [], webAipUrl: ISRAEL_WEB_AIP_URL };
  }
}

export async function getSouthKoreaMeta(): Promise<ScraperMeta> {
  if (southKoreaCache && Date.now() < southKoreaCache.expiresAt) return southKoreaCache.value;
  try {
    const value = await withTimeout(resolveSouthKoreaMetaLive(), FETCH_TIMEOUT_MS * 4);
    southKoreaCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return southKoreaCache?.value ?? { country: "South Korea", effectiveDate: null, ad2Icaos: [], webAipUrl: SOUTH_KOREA_WEB_AIP_URL };
  }
}

export async function getKosovoMeta(): Promise<ScraperMeta> {
  if (kosovoCache && Date.now() < kosovoCache.expiresAt) return kosovoCache.value;
  try {
    const value = await withTimeout(resolveKosovoMetaLive(), FETCH_TIMEOUT_MS * 4);
    kosovoCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return kosovoCache?.value ?? { country: "Kosovo", effectiveDate: null, ad2Icaos: [], webAipUrl: KOSOVO_WEB_AIP_URL };
  }
}

export async function getKuwaitMeta(): Promise<ScraperMeta> {
  if (kuwaitCache && Date.now() < kuwaitCache.expiresAt) return kuwaitCache.value;
  try {
    const value = await withTimeout(resolveKuwaitMetaLive(), FETCH_TIMEOUT_MS * 4);
    kuwaitCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return kuwaitCache?.value ?? { country: "Kuwait", effectiveDate: null, ad2Icaos: [], webAipUrl: KUWAIT_WEB_AIP_URL };
  }
}

export async function getLibyaMeta(): Promise<ScraperMeta> {
  if (libyaCache && Date.now() < libyaCache.expiresAt) return libyaCache.value;
  try {
    const value = await withTimeout(resolveLibyaMetaLive(), FETCH_TIMEOUT_MS * 4);
    libyaCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return libyaCache?.value ?? { country: "Libya", effectiveDate: null, ad2Icaos: [], webAipUrl: LIBYA_WEB_AIP_URL };
  }
}

export async function getMalaysiaMeta(): Promise<ScraperMeta> {
  if (malaysiaCache && Date.now() < malaysiaCache.expiresAt) return malaysiaCache.value;
  try {
    const value = await withTimeout(resolveMalaysiaMetaLive(), FETCH_TIMEOUT_MS * 4);
    malaysiaCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return malaysiaCache?.value ?? { country: "Malaysia", effectiveDate: null, ad2Icaos: [], webAipUrl: MALAYSIA_WEB_AIP_URL };
  }
}

export async function getMaldivesMeta(): Promise<ScraperMeta> {
  if (maldivesCache && Date.now() < maldivesCache.expiresAt) return maldivesCache.value;
  try {
    const value = await withTimeout(resolveMaldivesMetaLive(), FETCH_TIMEOUT_MS * 4);
    maldivesCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return maldivesCache?.value ?? { country: "Maldives", effectiveDate: null, ad2Icaos: [], webAipUrl: MALDIVES_WEB_AIP_URL };
  }
}

export async function getMongoliaMeta(): Promise<ScraperMeta> {
  if (mongoliaCache && Date.now() < mongoliaCache.expiresAt) return mongoliaCache.value;
  try {
    const value = await withTimeout(resolveMongoliaMetaLive(), FETCH_TIMEOUT_MS * 4);
    mongoliaCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return mongoliaCache?.value ?? { country: "Mongolia", effectiveDate: null, ad2Icaos: [], webAipUrl: MONGOLIA_WEB_AIP_URL };
  }
}

export async function getMyanmarMeta(): Promise<ScraperMeta> {
  if (myanmarCache && Date.now() < myanmarCache.expiresAt) return myanmarCache.value;
  try {
    const value = await withTimeout(resolveMyanmarMetaLive(), FETCH_TIMEOUT_MS * 4);
    myanmarCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return myanmarCache?.value ?? { country: "Myanmar", effectiveDate: null, ad2Icaos: [], webAipUrl: MYANMAR_WEB_AIP_URL };
  }
}

export async function getNepalMeta(): Promise<ScraperMeta> {
  if (nepalCache && Date.now() < nepalCache.expiresAt) return nepalCache.value;
  try {
    const value = await withTimeout(resolveNepalMetaLive(), FETCH_TIMEOUT_MS * 4);
    nepalCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return nepalCache?.value ?? { country: "Nepal", effectiveDate: null, ad2Icaos: [], webAipUrl: NEPAL_WEB_AIP_URL };
  }
}

export async function getNorthMacedoniaMeta(): Promise<ScraperMeta> {
  if (northMacedoniaCache && Date.now() < northMacedoniaCache.expiresAt) return northMacedoniaCache.value;
  try {
    const value = await withTimeout(resolveNorthMacedoniaMetaLive(), FETCH_TIMEOUT_MS * 4);
    northMacedoniaCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return northMacedoniaCache?.value ?? {
      country: "North Macedonia",
      effectiveDate: null,
      ad2Icaos: [],
      webAipUrl: NORTH_MACEDONIA_WEB_AIP_URL,
    };
  }
}

export async function getPakistanMeta(): Promise<ScraperMeta> {
  if (pakistanCache && Date.now() < pakistanCache.expiresAt) return pakistanCache.value;
  try {
    const value = await withTimeout(resolvePakistanMetaLive(), FETCH_TIMEOUT_MS * 4);
    pakistanCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return pakistanCache?.value ?? { country: "Pakistan", effectiveDate: null, ad2Icaos: [], webAipUrl: PAKISTAN_WEB_AIP_URL };
  }
}

export async function getPanamaMeta(): Promise<ScraperMeta> {
  if (panamaCache && Date.now() < panamaCache.expiresAt) return panamaCache.value;
  try {
    const value = await withTimeout(resolvePanamaMetaLive(), FETCH_TIMEOUT_MS * 4);
    panamaCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return panamaCache?.value ?? { country: "Panama", effectiveDate: null, ad2Icaos: [], webAipUrl: PANAMA_WEB_AIP_URL };
  }
}

export async function getQatarMeta(): Promise<ScraperMeta> {
  if (qatarCache && Date.now() < qatarCache.expiresAt) return qatarCache.value;
  try {
    const value = await withTimeout(resolveQatarMetaLive(), FETCH_TIMEOUT_MS * 4);
    qatarCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return qatarCache?.value ?? { country: "Qatar", effectiveDate: null, ad2Icaos: [], webAipUrl: QATAR_WEB_AIP_URL };
  }
}

export async function getRwandaMeta(): Promise<ScraperMeta> {
  if (rwandaCache && Date.now() < rwandaCache.expiresAt) return rwandaCache.value;
  try {
    const value = await withTimeout(resolveRwandaMetaLive(), FETCH_TIMEOUT_MS * 4);
    rwandaCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return rwandaCache?.value ?? { country: "Rwanda", effectiveDate: null, ad2Icaos: [], webAipUrl: RWANDA_WEB_AIP_URL };
  }
}

export async function getSaudiArabiaMeta(): Promise<ScraperMeta> {
  if (saudiArabiaCache && Date.now() < saudiArabiaCache.expiresAt) return saudiArabiaCache.value;
  try {
    const value = await withTimeout(resolveSaudiArabiaMetaLive(), FETCH_TIMEOUT_MS * 4);
    saudiArabiaCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return saudiArabiaCache?.value ?? {
      country: "Saudi Arabia",
      effectiveDate: null,
      ad2Icaos: [],
      webAipUrl: SAUDI_ARABIA_WEB_AIP_URL,
    };
  }
}

export async function getSomaliaMeta(): Promise<ScraperMeta> {
  if (somaliaCache && Date.now() < somaliaCache.expiresAt) return somaliaCache.value;
  try {
    const value = await withTimeout(resolveSomaliaMetaLive(), FETCH_TIMEOUT_MS * 4);
    somaliaCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return somaliaCache?.value ?? { country: "Somalia", effectiveDate: null, ad2Icaos: [], webAipUrl: SOMALIA_WEB_AIP_URL };
  }
}

export async function getSriLankaMeta(): Promise<ScraperMeta> {
  if (sriLankaCache && Date.now() < sriLankaCache.expiresAt) return sriLankaCache.value;
  try {
    const value = await withTimeout(resolveSriLankaMetaLive(), FETCH_TIMEOUT_MS * 4);
    sriLankaCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return sriLankaCache?.value ?? { country: "Sri Lanka", effectiveDate: null, ad2Icaos: [], webAipUrl: SRI_LANKA_WEB_AIP_URL };
  }
}

export async function getTaiwanMeta(): Promise<ScraperMeta> {
  if (taiwanCache && Date.now() < taiwanCache.expiresAt) return taiwanCache.value;
  try {
    const value = await withTimeout(resolveTaiwanMetaLive(), FETCH_TIMEOUT_MS * 4);
    taiwanCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return taiwanCache?.value ?? { country: "Taiwan", effectiveDate: null, ad2Icaos: [], webAipUrl: TAIWAN_WEB_AIP_URL };
  }
}

export async function getTajikistanMeta(): Promise<ScraperMeta> {
  if (tajikistanCache && Date.now() < tajikistanCache.expiresAt) return tajikistanCache.value;
  try {
    const value = await withTimeout(resolveTajikistanMetaLive(), FETCH_TIMEOUT_MS * 4);
    tajikistanCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return tajikistanCache?.value ?? { country: "Tajikistan", effectiveDate: null, ad2Icaos: [], webAipUrl: TAJIKISTAN_WEB_AIP_URL };
  }
}

export async function getThailandMeta(): Promise<ScraperMeta> {
  if (thailandCache && Date.now() < thailandCache.expiresAt) return thailandCache.value;
  try {
    const value = await withTimeout(resolveThailandMetaLive(), FETCH_TIMEOUT_MS * 4);
    thailandCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return thailandCache?.value ?? { country: "Thailand", effectiveDate: null, ad2Icaos: [], webAipUrl: THAILAND_WEB_AIP_URL };
  }
}

export async function getTurkmenistanMeta(): Promise<ScraperMeta> {
  if (turkmenistanCache && Date.now() < turkmenistanCache.expiresAt) return turkmenistanCache.value;
  try {
    const value = await withTimeout(resolveTurkmenistanMetaLive(), FETCH_TIMEOUT_MS * 4);
    turkmenistanCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return turkmenistanCache?.value ?? { country: "Turkmenistan", effectiveDate: null, ad2Icaos: [], webAipUrl: TURKMENISTAN_WEB_AIP_URL };
  }
}

export async function getUaeMeta(): Promise<ScraperMeta> {
  if (uaeCache && Date.now() < uaeCache.expiresAt) return uaeCache.value;
  try {
    const value = await withTimeout(resolveUaeMetaLive(), FETCH_TIMEOUT_MS * 4);
    uaeCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return uaeCache?.value ?? { country: "United Arab Emirates", effectiveDate: null, ad2Icaos: [], webAipUrl: UAE_WEB_AIP_URL };
  }
}

export async function getUzbekistanMeta(): Promise<ScraperMeta> {
  if (uzbekistanCache && Date.now() < uzbekistanCache.expiresAt) return uzbekistanCache.value;
  try {
    const value = await withTimeout(resolveUzbekistanMetaLive(), FETCH_TIMEOUT_MS * 4);
    uzbekistanCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return uzbekistanCache?.value ?? { country: "Uzbekistan", effectiveDate: null, ad2Icaos: [], webAipUrl: UZBEKISTAN_WEB_AIP_URL };
  }
}

export async function getVenezuelaMeta(): Promise<ScraperMeta> {
  if (venezuelaCache && Date.now() < venezuelaCache.expiresAt) return venezuelaCache.value;
  try {
    const value = await withTimeout(resolveVenezuelaMetaLive(), FETCH_TIMEOUT_MS * 4);
    venezuelaCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return venezuelaCache?.value ?? { country: "Venezuela", effectiveDate: null, ad2Icaos: [], webAipUrl: VENEZUELA_WEB_AIP_URL };
  }
}

export async function getJapanMeta(): Promise<ScraperMeta> {
  if (japanCache && Date.now() < japanCache.expiresAt) return japanCache.value;
  try {
    const value = await withTimeout(resolveJapanMetaLive(), FETCH_TIMEOUT_MS * 4);
    japanCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return japanCache?.value ?? { country: "Japan", effectiveDate: null, ad2Icaos: [], webAipUrl: JAPAN_WEB_AIP_URL };
  }
}

function registerMetaResolver(
  out: Record<string, ScraperMetaResolver>,
  aliases: string[],
  resolver: ScraperMetaResolver,
): void {
  for (const alias of aliases) {
    out[normalizeScraperCountryName(alias)] = resolver;
  }
}

const SCRAPER_META_BY_COUNTRY_INTERNAL: Record<string, ScraperMetaResolver> = {};

registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Belarus"], getBelarusMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Bhutan"], getBhutanMeta);
registerMetaResolver(
  SCRAPER_META_BY_COUNTRY_INTERNAL,
  ["Bosnia and Herzegovina", "Bosnia", "Bosnia/Herzeg", "Bosnia/Herzeg."],
  getBosniaMeta,
);
registerMetaResolver(
  SCRAPER_META_BY_COUNTRY_INTERNAL,
  ["Republic of Cabo Verde", "Cabo Verde", "Cape Verde"],
  getCaboVerdeMeta,
);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Chile"], getChileMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Costa Rica"], getCostaRicaMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Cuba"], getCubaMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Ecuador"], getEcuadorMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["El Salvador"], getElSalvadorMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Guatemala"], getGuatemalaMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Honduras"], getHondurasMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Hong Kong", "Hongkong"], getHongKongMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["India"], getIndiaMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Israel"], getIsraelMeta);
registerMetaResolver(
  SCRAPER_META_BY_COUNTRY_INTERNAL,
  ["South Korea", "Korea", "Republic of Korea"],
  getSouthKoreaMeta,
);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Kosovo"], getKosovoMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Kuwait"], getKuwaitMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Libya"], getLibyaMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Malaysia"], getMalaysiaMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Maldives"], getMaldivesMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Mongolia"], getMongoliaMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Myanmar"], getMyanmarMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Nepal"], getNepalMeta);
registerMetaResolver(
  SCRAPER_META_BY_COUNTRY_INTERNAL,
  ["North Macedonia", "Republic of North Macedonia", "Macedonia"],
  getNorthMacedoniaMeta,
);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Pakistan"], getPakistanMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Panama"], getPanamaMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Qatar"], getQatarMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Rwanda"], getRwandaMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Saudi Arabia"], getSaudiArabiaMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Somalia"], getSomaliaMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Sri Lanka"], getSriLankaMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Taiwan"], getTaiwanMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Tajikistan"], getTajikistanMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Thailand"], getThailandMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Turkmenistan"], getTurkmenistanMeta);
registerMetaResolver(
  SCRAPER_META_BY_COUNTRY_INTERNAL,
  ["United Arab Emirates", "UAE"],
  getUaeMeta,
);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Uzbekistan"], getUzbekistanMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Venezuela"], getVenezuelaMeta);
registerMetaResolver(SCRAPER_META_BY_COUNTRY_INTERNAL, ["Japan"], getJapanMeta);

export const SCRAPER_META_BY_COUNTRY = SCRAPER_META_BY_COUNTRY_INTERNAL;

export function getScraperMetaResolverByCountry(country: string): ScraperMetaResolver | null {
  return SCRAPER_META_BY_COUNTRY[normalizeScraperCountryName(country)] ?? null;
}

export function listScraperMetaResolvers(): ScraperMetaResolver[] {
  return Array.from(new Set(Object.values(SCRAPER_META_BY_COUNTRY)));
}
