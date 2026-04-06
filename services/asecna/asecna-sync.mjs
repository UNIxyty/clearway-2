#!/usr/bin/env node
import { writeFileSync } from "fs";
import { join } from "path";
import {
  asecnaAd2AirportBasename,
  asecnaMenuUrl,
  createAsecnaFetch,
  parseMenuBasename,
  parseAsecnaCli,
  parseAd2Countries,
  parseAd2IcaosForCountry,
  parseGen1SectionsForCountry,
  resolveAsecnaHtmlUrl,
} from "../../scripts/asecna/asecna-eaip-http.mjs";

const ROOT = process.cwd();
const DEFAULT_OUTPUT = join(ROOT, "data", "asecna-airports.json");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function pickGen12Section(sections) {
  const exact = sections.find((s) => /GEN-1\.2/i.test(s.href) || /Entry,\s*Transit\s*and\s*Departure/i.test(s.label));
  if (exact) return exact;
  return sections.find((s) => /1\.2/.test(s.label)) ?? null;
}

export function inferCountryIso2(countryName) {
  const normalized = String(countryName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .trim();
  const map = {
    Benin: "BJ",
    "Benin": "BJ",
    "Bénin": "BJ",
    "Burkina Faso": "BF",
    Cameroon: "CM",
    Cameroun: "CM",
    "Central African Republic": "CF",
    Centrafrique: "CF",
    Chad: "TD",
    Tchad: "TD",
    Comoros: "KM",
    Comores: "KM",
    Congo: "CG",
    "Cote d'Ivoire": "CI",
    "Côte d’Ivoire": "CI",
    "Côte d'Ivoire": "CI",
    Gabon: "GA",
    Guinea: "GN",
    "Guinée": "GN",
    "Guinea-Bissau": "GW",
    "Guinée Bissau": "GW",
    Madagascar: "MG",
    Mali: "ML",
    Mauritania: "MR",
    Mauritanie: "MR",
    Niger: "NE",
    Senegal: "SN",
    "Sénégal": "SN",
    Togo: "TG",
    Rwanda: "RW",
    "Equatorial Guinea": "GQ",
    "Guinée Equatoriale": "GQ",
  };
  return map[countryName] ?? map[normalized] ?? null;
}

function parseAd2IcaosFromCountryHtml(countryHtml, countryCode) {
  const esc = String(countryCode).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:id|href)="_${esc}AD-2\\.([A-Z0-9]{4})"`, "gi");
  const set = new Set();
  let m;
  while ((m = re.exec(countryHtml))) {
    const icao = String(m[1] || "").toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(icao)) set.add(icao);
  }
  return [...set].sort();
}

function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveRwandaTocUrl(menuHtmlWithButton) {
  const m =
    menuHtmlWithButton.match(/id\s*=\s*["']AIP_RWANDA["'][\s\S]*?href\s*=\s*["']([^"']+)["']/i) ||
    menuHtmlWithButton.match(/href\s*=\s*["']([^"']+)["'][\s\S]*?id\s*=\s*["']AIP_RWANDA["']/i);
  const raw = (m?.[1] || "").replace(/\\/g, "/");
  if (!raw) return null;
  return new URL(raw, "https://aim.asecna.aero/html/eAIP/").href;
}

function resolveRwandaMenuUrl(tocFramesetHtml, tocUrl) {
  const m =
    tocFramesetHtml.match(/<frame[^>]*name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i) ||
    tocFramesetHtml.match(/<frame[^>]*src=["']([^"']*menu\.html[^"']*)["']/i);
  const src = m?.[1];
  if (!src) return null;
  return new URL(src, tocUrl).href;
}

function parseRwandaAd2Entries(menuHtml) {
  const re = /href=['"]([^'"]*AD\s*2\s*([A-Z0-9]{4})[^'"]*\.html#[^'"]*)['"]/gi;
  const byIcao = new Map();
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = String(m[1] || "");
    const icao = String(m[2] || "").toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(icao) && !byIcao.has(icao)) byIcao.set(icao, href);
  }
  return [...byIcao.entries()]
    .map(([icao, href]) => ({ icao, href }))
    .sort((a, b) => a.icao.localeCompare(b.icao));
}

function parseRwandaGen12(menuHtml) {
  const m =
    menuHtml.match(/href=['"]([^'"]*GEN[^'"]*1\.2[^'"]*)['"][^>]*title=['"]([^'"]*)/i) ||
    menuHtml.match(/href=['"]([^'"]*GEN[^'"]*1\.2[^'"]*)['"]/i);
  if (!m?.[1]) return null;
  return {
    href: m[1],
    label: m[2] || "GEN 1.2 Entry, transit and departure of aircraft",
  };
}

function parseCompactDmsToDecimal(value) {
  const v = String(value || "").trim().toUpperCase();
  const m = v.match(/^(\d{2,3})(\d{2})(\d{2}(?:\.\d+)?)([NSEW])$/);
  if (!m) return null;
  const deg = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  if (!Number.isFinite(deg) || !Number.isFinite(min) || !Number.isFinite(sec)) return null;
  const sign = m[4] === "S" || m[4] === "W" ? -1 : 1;
  return sign * (deg + min / 60 + sec / 3600);
}

function toTitleCaseWords(value) {
  return String(value || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function normalizeRwandaAirportName(icao, ad2Label) {
  const explicit = {
    HRYG: "Gisenyi Airport",
    HRYI: "Butare Airport",
    HRYN: "Nemba Airport",
    HRYR: "Kigali International Airport",
    HRYU: "Ruhengeri Airport",
    HRZA: "Kamembe International Airport",
  };
  if (explicit[icao]) return explicit[icao];
  const cleaned = String(ad2Label || "").replace(/\bINTL\b/gi, "International").trim();
  if (!cleaned) return `${icao} Airport`;
  const titled = toTitleCaseWords(cleaned);
  return /\bAirport\b/i.test(titled) ? titled : `${titled} Airport`;
}

function parseRwandaAirportMeta(ad2Html, icao) {
  const label =
    ad2Html.match(new RegExp(`${icao}\\s*-\\s*([^<\\n]+)`, "i"))?.[1]?.trim() ||
    ad2Html.match(/AD 2\.\d+\s+[A-Z0-9]{4}\s*-\s*([A-Z0-9 '\-]+)/i)?.[1]?.trim() ||
    null;
  const text = stripHtml(ad2Html);
  const coord = text.match(
    /ARP coordinates and site at AD\s+([0-9]{6,7}(?:\.\d+)?[NS])\s+([0-9]{7,8}(?:\.\d+)?[EW])/i,
  );
  const lat = coord ? parseCompactDmsToDecimal(coord[1]) : null;
  const lon = coord ? parseCompactDmsToDecimal(coord[2]) : null;
  return { name: normalizeRwandaAirportName(icao, label), lat, lon };
}

async function fetchRwandaCountry(http, strictTls) {
  const frMenuUrl = "https://aim.asecna.aero/html/eAIP/FR-menu-fr-FR.html";
  const frMenu = await http.fetchText(frMenuUrl, "FR menu with Rwanda button", { strictTls });
  const tocUrl = resolveRwandaTocUrl(frMenu);
  if (!tocUrl) return null;
  const tocFrameset = await http.fetchText(tocUrl, "Rwanda toc-frameset", { strictTls });
  const menuUrl = resolveRwandaMenuUrl(tocFrameset, tocUrl);
  if (!menuUrl) return null;
  const menuHtml = await http.fetchText(menuUrl, "Rwanda menu", { strictTls });
  const entries = parseRwandaAd2Entries(menuHtml);
  const gen12 = parseRwandaGen12(menuHtml);
  const gen12Resolved = gen12
    ? {
        anchor: "GEN-1.2",
        href: gen12.href,
        label: gen12.label,
        htmlUrl: new URL(gen12.href, menuUrl).href,
      }
    : null;
  const airports = [];
  for (const entry of entries) {
    const ad2HtmlUrl = new URL(entry.href, menuUrl).href;
    let meta = { name: null, lat: null, lon: null };
    try {
      const ad2Html = await http.fetchText(ad2HtmlUrl, `Rwanda AD2 ${entry.icao}`, { strictTls });
      meta = parseRwandaAirportMeta(ad2Html, entry.icao);
    } catch (_) {
      // Keep airport with null metadata if one page fails.
    }
    airports.push({
      icao: entry.icao,
      countryCode: "RW",
      countryName: "Rwanda",
      sourceType: "ASECNA_DYNAMIC",
      dynamicUpdated: true,
      webAipUrl: tocUrl,
      ad2HtmlUrl,
      name: meta.name,
      lat: meta.lat,
      lon: meta.lon,
    });
  }
  return {
    code: "RW",
    name: "Rwanda",
    iso2: "RW",
    sourceType: "ASECNA_DYNAMIC",
    dynamicUpdated: true,
    webAipUrl: tocUrl,
    menuDirUrl: menuUrl.replace(/[^/]+$/, ""),
    gen12: gen12Resolved,
    airports,
  };
}

async function run() {
  const cli = parseAsecnaCli(process.argv);
  const output = argValue("--out", DEFAULT_OUTPUT);
  const includeGen = !hasFlag("--skip-gen");
  const strictTls = cli.strictTls && !cli.insecureTls;
  if (cli.insecureTls) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  const http = createAsecnaFetch("SYNC");
  const menuUrl = asecnaMenuUrl(cli.menuBasename);
  const menuDirUrl = menuUrl.replace(/[^/]+$/, "");
  const menuHtml = await http.fetchText(menuUrl, "menu", { strictTls });
  const menuMeta = parseMenuBasename(cli.menuBasename);
  const prefix = menuMeta?.prefix ?? "FR";
  const locale = menuMeta?.locale ?? "fr-FR";

  const adCountries = parseAd2Countries(menuHtml, cli.menuBasename);
  const genCountries = includeGen ? new Map(parseAd2Countries(menuHtml, cli.menuBasename).map((c) => [c.code, c.name])) : new Map();
  const countries = [];
  const generatedAt = new Date().toISOString();

  for (const country of adCountries) {
    const fromMenu = parseAd2IcaosForCountry(menuHtml, country.code, cli.menuBasename);
    let fromCountryPage = [];
    try {
      const ad2CountryFile = `${prefix}-${country.code}-AD-2-${locale}.html`;
      const ad2CountryUrl = resolveAsecnaHtmlUrl(ad2CountryFile, menuDirUrl);
      const ad2CountryHtml = await http.fetchText(ad2CountryUrl, `AD2 country ${country.code}`, { strictTls });
      fromCountryPage = parseAd2IcaosFromCountryHtml(ad2CountryHtml, country.code);
    } catch (_) {
      // Keep menu-derived list when country page cannot be fetched.
    }
    const icaos = [...new Set([...fromMenu, ...fromCountryPage])].sort();
    let gen12 = null;
    if (includeGen) {
      const sections = parseGen1SectionsForCountry(menuHtml, country.code, cli.menuBasename);
      const chosen = pickGen12Section(sections);
      if (chosen) {
        gen12 = {
          anchor: chosen.anchor,
          href: chosen.href,
          label: chosen.label,
        };
      }
    }
    countries.push({
      code: country.code,
      name: country.name,
      iso2: inferCountryIso2(country.name),
      sourceType: "ASECNA_DYNAMIC",
      dynamicUpdated: true,
      webAipUrl: menuUrl,
      menuDirUrl,
      gen12,
      airports: icaos.map((icao) => {
        const ad2HtmlFile = asecnaAd2AirportBasename(country.code, icao, cli.menuBasename);
        const ad2HtmlUrl = resolveAsecnaHtmlUrl(ad2HtmlFile, menuDirUrl);
        return {
          icao,
          countryCode: country.code,
          countryName: country.name,
          sourceType: "ASECNA_DYNAMIC",
          dynamicUpdated: true,
          webAipUrl: menuUrl,
          ad2HtmlUrl,
        };
      }),
    });
  }

  try {
    const rwanda = await fetchRwandaCountry(http, strictTls);
    if (rwanda && rwanda.airports.length) countries.push(rwanda);
  } catch (err) {
    console.warn("[ASECNA sync] Rwanda fetch skipped:", err?.message || err);
  }

  const payload = {
    source: "ASECNA eAIP menu (dynamic)",
    generatedAt,
    menuBasename: cli.menuBasename,
    menuUrl,
    countries,
  };
  writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  const airportCount = countries.reduce((sum, c) => sum + c.airports.length, 0);
  const genCount = countries.filter((c) => c.gen12).length;
  console.log(`[ASECNA sync] wrote ${countries.length} countries, ${airportCount} airports -> ${output}`);
  if (includeGen) console.log(`[ASECNA sync] GEN 1.2 links resolved for ${genCount}/${countries.length} countries`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error("[ASECNA sync] failed:", err);
    process.exit(1);
  });
}
