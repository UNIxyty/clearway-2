#!/usr/bin/env node
import { writeFileSync } from "fs";
import { join } from "path";
import {
  asecnaMenuUrl,
  createAsecnaFetch,
  parseMenuBasename,
  parseAsecnaCli,
  parseAd2Countries,
  parseAd2IcaosForCountry,
  parseGen1SectionsForCountry,
  resolveAsecnaHtmlUrl,
} from "../../scripts/asecna-eaip-http.mjs";

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
      airports: icaos.map((icao) => ({
        icao,
        countryCode: country.code,
        countryName: country.name,
        sourceType: "ASECNA_DYNAMIC",
        dynamicUpdated: true,
        webAipUrl: menuUrl,
      })),
    });
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
