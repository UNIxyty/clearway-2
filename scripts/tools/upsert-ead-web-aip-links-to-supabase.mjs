#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvFromProjectRoot } from "./_load-env.mjs";

const ROOT = process.cwd();
const BATCH_SIZE = 200;
const EAD_WEB_AIP_DEFAULT_URL =
  "https://www.ead.eurocontrol.int/cms-eadbasic/opencms/en/login/ead-basic/";

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

const EAD_PREFIXES = [
  "LA", "UD", "LO", "UB", "EB", "LQ", "LB", "LD", "LC", "LK", "EK", "EE", "XX", "EF",
  "LF", "UG", "ED", "LG", "BG", "LH", "BI", "EI", "LI", "OJ", "BK", "UA", "UC", "EV",
  "EY", "EL", "LM", "LU", "EH", "EN", "RP", "EP", "LP", "LW", "LR", "LY", "LZ", "LJ",
  "LE", "ES", "GC", "LS", "LT", "UK", "EG",
];

const BY_PREFIX = {
  LA: "https://www.albcontrol.al/aip/",
  UD: "http://www.armats.am/activities/ais/eaip",
  LO: "https://eaip.austrocontrol.at/",
  EB: "https://ops.skeyes.be/",
  LQ: "https://eaip.bhansa.gov.ba/",
  LB: "https://www.bulatsa.com/en/services/aeronautical-information-services/",
  LD: "https://www.crocontrol.hr/en/services/aeronautical-information-management/",
  LC: "http://www.mcw.gov.cy/mcw/DCA/AIS/ais.nsf/index%5Fen/index%5Fen",
  LK: "http://ais.ans.cz/",
  EK: "https://aim.naviair.dk/",
  XX: "https://aim.naviair.dk/",
  BG: "https://aim.naviair.dk/",
  EE: "https://aim.eans.ee/",
  EF: "https://www.ais.fi/",
  LF: "https://www.sia.aviation-civile.gouv.fr/",
  UG: "https://ais.airnav.ge/en/",
  ED: "https://aip.dfs.de/basicAIP/",
  LG: "https://aisgr.hasp.gov.gr/",
  LH: "https://ais-en.hungarocontrol.hu/aip/",
  BI: "https://www.avians.is/en/c-preflight-information",
  EI: "https://www.airnav.ie/air-traffic-management/aeronautical-information-management",
  LI: "https://www.enav.it/sites/public/en/Servizi/areonautical-information.html",
  OJ: "https://carc.gov.jo/en/directory-flight-information",
  BK: "https://www.ashna-ks.org/en/services/ais/",
  UA: "http://www.ans.kz/en/ais/eaip",
  UC: "https://ansp.kg/aeronautical-information-service",
  EV: "https://ais.lgs.lv/",
  EY: "https://www.ans.lt/en/aim",
  EL: "https://ops.skeyes.be/",
  LM: "https://www.maltats.com/aim/",
  LU: "https://aim.moldatsa.md/",
  EH: "https://www.lvnl.nl/diensten/aip",
  EN: "https://avinor.no/ais",
  RP: "https://ais.caap.gov.ph/home",
  EP: "https://www.ais.pansa.pl/en/publications/ais-products/",
  LP: "https://ais.nav.pt/",
  LW: "http://ais.m-nav.info/eAIP/current/en/index.htm",
  LR: "https://www.aisro.ro/",
  LY: "https://smatsa.rs/upload/aip/published/start%5Fpage.html",
  LZ: "https://aim.lps.sk/web/",
  LJ: "https://aim.sloveniacontrol.si/aim/products/",
  LE: "https://aip.enaire.es/aip/",
  GC: "https://aip.enaire.es/aip/",
  ES: "https://aro.lfv.se/Editorial/View/IAIP",
  LS: "https://www.skyguide.ch/en/services/aeronautical-information-management/",
  LT: "https://www.dhmi.gov.tr/Sayfalar/aipturkey.aspx",
  UK: "http://www.aisukraine.net/titul%5Fen.php",
  EG: "https://www.nats.aero/do-it-online/ais/",
};

const PREFIX_LABELS = {
  LA: "Albania",
  UD: "Armenia",
  LO: "Austria",
  UB: "Azerbaijan",
  EB: "Belgium",
  LQ: "Bosnia and Herzegovina",
  LB: "Bulgaria",
  LD: "Croatia",
  LC: "Cyprus",
  LK: "Czech Republic",
  EK: "Denmark",
  EE: "Estonia",
  XX: "Faroe Islands",
  EF: "Finland",
  LF: "France",
  UG: "Georgia",
  ED: "Germany",
  LG: "Greece",
  BG: "Greenland",
  LH: "Hungary",
  BI: "Iceland",
  EI: "Ireland",
  LI: "Italy",
  OJ: "Jordan",
  BK: "KFOR sector",
  UA: "Kazakhstan",
  UC: "Kyrgyzstan",
  EV: "Latvia",
  EY: "Lithuania",
  EL: "Luxembourg",
  LM: "Malta",
  LU: "Moldova",
  EH: "Netherlands",
  EN: "Norway",
  RP: "Philippines",
  EP: "Poland",
  LP: "Portugal",
  LW: "North Macedonia",
  LR: "Romania",
  LY: "Serbia and Montenegro",
  LZ: "Slovakia",
  LJ: "Slovenia",
  LE: "Spain (mainland / LE)",
  GC: "Spain (Canary Islands / GC)",
  ES: "Sweden",
  LS: "Switzerland",
  LT: "Türkiye",
  UK: "Ukraine",
  EG: "United Kingdom",
};

function countryLabel(prefix) {
  const name = PREFIX_LABELS[prefix] || prefix;
  return `${name} (${prefix})`;
}

function defaultRows() {
  const now = new Date().toISOString();
  return EAD_PREFIXES.slice()
    .sort((a, b) => a.localeCompare(b))
    .map((prefix) => ({
      prefix,
      country_label: countryLabel(prefix),
      web_aip_url: BY_PREFIX[prefix] || EAD_WEB_AIP_DEFAULT_URL,
      status: "correct",
      source_type: "official-country-site",
      fallback_url: EAD_WEB_AIP_DEFAULT_URL,
      fallback_note: "If official source is unavailable, use Eurocontrol EAD Basic.",
      updated_at: now,
    }));
}

async function rowsFromOverrideJson(jsonPath) {
  const raw = JSON.parse(await fs.readFile(jsonPath, "utf8"));
  const items = Array.isArray(raw?.items) ? raw.items : [];
  const now = new Date().toISOString();
  return items
    .map((it) => {
      const prefix = String(it?.prefix || "").trim().toUpperCase();
      if (!prefix || !/^[A-Z0-9]{2}$/.test(prefix)) return null;
      const statusRaw = String(it?.status || "unset").trim().toLowerCase();
      const status = ["unset", "correct", "changed"].includes(statusRaw) ? statusRaw : "unset";
      const url = String(it?.webAipUrl || "").trim() || EAD_WEB_AIP_DEFAULT_URL;
      return {
        prefix,
        country_label: String(it?.countryLabel || countryLabel(prefix)).trim() || countryLabel(prefix),
        web_aip_url: url,
        status,
        source_type: String(it?.sourceType || "official-country-site").trim() || "official-country-site",
        fallback_url: String(it?.fallbackUrl || EAD_WEB_AIP_DEFAULT_URL).trim() || EAD_WEB_AIP_DEFAULT_URL,
        fallback_note:
          String(it?.fallbackNote || "If official source is unavailable, use Eurocontrol EAD Basic.").trim() ||
          "If official source is unavailable, use Eurocontrol EAD Basic.",
        updated_at: now,
      };
    })
    .filter(Boolean);
}

async function main() {
  loadEnvFromProjectRoot(ROOT);
  const dryRun = hasFlag("--dry-run");
  const inPathArg = argValue("--in", "");
  const inPath = inPathArg ? path.resolve(ROOT, inPathArg) : "";

  let rows = defaultRows();
  if (inPath) {
    rows = await rowsFromOverrideJson(inPath);
  }

  console.log(
    `[upsert-ead-web-aip] rows=${rows.length} input=${inPath ? path.relative(ROOT, inPath) : "(defaults)"} dryRun=${dryRun ? "yes" : "no"}`,
  );
  if (!rows.length) {
    console.log("[upsert-ead-web-aip] no rows to upsert.");
    return;
  }
  if (dryRun) return;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  let createClient;
  try {
    ({ createClient } = await import("@supabase/supabase-js"));
  } catch {
    throw new Error(
      "Missing module '@supabase/supabase-js'. Run 'npm install' in the project directory and rerun this command.",
    );
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNo = Math.floor(i / BATCH_SIZE) + 1;
    const batchTotal = Math.ceil(rows.length / BATCH_SIZE);
    console.log(`[upsert-ead-web-aip] batch ${batchNo}/${batchTotal} size=${batch.length}`);
    const { error } = await supabase.from("ead_web_aip_links").upsert(batch, { onConflict: "prefix" });
    if (error) throw new Error(`Batch ${batchNo} failed: ${error.message}`);
  }

  console.log("[upsert-ead-web-aip] upsert complete.");
}

main().catch((err) => {
  console.error("[upsert-ead-web-aip] failed:", err?.message || err);
  process.exit(1);
});
