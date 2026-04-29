#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const SCRAPERS_DIR = path.join(ROOT, "scripts", "web-table-scrapers");
const OUT_DEFAULT = path.join(ROOT, "data", "dynamic-packages.json");

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function titleCaseFromSlug(slug) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

function toIcaoFromFilename(name) {
  const up = String(name || "")
    .toUpperCase()
    .replace(/\.PDF$/i, "");
  const tokens = up.split(/[^A-Z0-9]+/).filter(Boolean);
  const stop = new Set(["AIRAC", "GEN", "AD2", "DOUBLE", "NON", "VALID", "INDEX", "HTML", "AMDT", "AIP", "AD", "SUPP"]);
  for (const t of tokens) {
    if (/^[A-Z]{4}$/.test(t) && !stop.has(t)) return t;
  }
  return null;
}

function normalizeIcaoList(values) {
  const nonIcaoTokens = new Set([
    "EAIP",
    "AIPM",
    "AD2A",
    "GEN1",
    "GEN2",
    "AMDT",
    "SUPP",
    "AIRA",
    "HTML",
    "PDFS",
    "NONE",
    "NULL",
  ]);
  const seen = new Set();
  let droppedInvalid = 0;
  for (const raw of Array.isArray(values) ? values : []) {
    const token = String(raw || "").trim().toUpperCase();
    if (!token) continue;
    if (!/^[A-Z]{4}$/.test(token) || nonIcaoTokens.has(token)) {
      droppedInvalid += 1;
      continue;
    }
    seen.add(token);
  }
  return {
    icaos: Array.from(seen).sort((a, b) => a.localeCompare(b)),
    droppedInvalid,
  };
}

async function listPdfFiles(dir) {
  try {
    const rows = await fs.readdir(dir, { withFileTypes: true });
    return rows
      .filter((d) => d.isFile() && /\.pdf$/i.test(d.name))
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function parseOutDirFromSource(src, kind) {
  const rx =
    kind === "GEN"
      ? /const\s+OUT_GEN\s*=\s*join\([^)]*"downloads"\s*,\s*"([^"]+)"\s*,\s*"GEN"\s*\)/i
      : /const\s+OUT_AD2\s*=\s*join\([^)]*"downloads"\s*,\s*"([^"]+)"\s*,\s*"AD2"\s*\)/i;
  const m = src.match(rx);
  return m?.[1] ?? null;
}

function normalizeCountry(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .trim()
    .toLowerCase();
}

const WEB_AIP_BY_COUNTRY = {
  algeria: "https://www.sia-enna.dz/aeronautical-information-publication.html",
  albania: "https://www.albcontrol.al/aip/",
  armenia: "https://armats.am/activities/ais/eaip",
  austria: "https://eaip.austrocontrol.at/",
  bahrain: "https://aim.mtt.gov.bh/eAIP/history-en-BH.html",
  belgium: "https://ops.skeyes.be/htmlAIP/",
  belarus: "https://www.ban.by/ru/sbornik-aip/amdt",
  bhutan: "https://www.doat.gov.bt/aip/",
  bosnia: "https://eaip.bhansa.gov.ba",
  "cabo verde": "https://eaip.asa.cv",
  chile: "https://aipchile.dgac.gob.cl/aip/vol1",
  "costa rica": "https://www.cocesna.org/aipca/AIPMR/inicio.html",
  cuba: "https://aismet.avianet.cu/html/aip.html",
  "czech republic": "https://aim.rlp.cz/",
  denmark: "https://aim.naviair.dk/",
  ecuador: "https://www.ais.aviacioncivil.gob.ec/ifis3/",
  "el salvador": "https://www.cocesna.org/aipca/AIPMS/history.html",
  estonia: "https://aim.eans.ee/et/eaip",
  finland: "https://ais.fi/eaip/",
  france: "https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_16_APR_2026/FRANCE/home.html",
  germany: "https://aip.dfs.de/BasicIFR/2026APR20/chapter/279afdc243b210751d2f9f2401e5e4db.html",
  georgia: "https://airnav.ge/eaip/history-en-GB.html",
  greece: "https://aisgr.hasp.gov.gr/main.php?rand=0.7276487307378027#publications",
  guatemala: "https://www.dgac.gob.gt/home/aip_e/",
  hungary: "https://ais-en.hungarocontrol.hu/aip/aip-archive/",
  iceland: "https://eaip.isavia.is/",
  honduras: "https://www.ahac.gob.hn/eAIP1/inicio.html",
  "hong kong": "https://www.ais.gov.hk/eaip_20260319/VH-history-en-US.html",
  india: "https://aim-india.aai.aero/aip-supplements?page=1",
  israel: "https://e-aip.azurefd.net",
  ireland: "https://www.airnav.ie/air-traffic-management/aeronautical-information-management/aip-package",
  japan: "https://nagodede.github.io/aip/japan/",
  kosovo: "https://www.ashna-ks.org/eAIP/default.html",
  kazakhstan: "https://www.ans.kz/en/ais/eaip",
  latvia: "https://ais.lgs.lv/aiseaip",
  lithuania: "https://www.ans.lt/a1/aip/02_16Apr2026/EY-history-en-US.html",
  kuwait: "https://dgca.gov.kw/AIP",
  libya: "https://caa.gov.ly/ais/ad/",
  malaysia: "https://aip.caam.gov.my/aip/eAIP/history-en-MS.html",
  maldives: "https://www.macl.aero/corporate/services/operational/ans/aip",
  mongolia: "https://ais.mn/files/aip/eAIP/",
  myanmar: "https://www.ais.gov.mm/eAIP/2018-02-15/html/index-en-GB.html",
  nepal: "https://e-aip.caanepal.gov.np/welcome/listall/1",
  netherlands: "https://eaip.lvnl.nl/web/eaip/default.html",
  norway: "https://aim-prod.avinor.no/no/AIP/View/Index/152/history-no-NO.html",
  "north macedonia": "https://ais.m-nav.info/eAIP/Start.htm",
  pakistan: "https://paa.gov.pk/aeronautical-information/electronic-aeronautical-information-publication",
  panama: "https://www.aeronautica.gob.pa/ais-aip/",
  poland: "https://www.ais.pansa.pl/en/publications/aip-poland/",
  portugal: "https://aim.nav.pt/Html/IndexAeronauticalInformation",
  qatar: "https://www.caa.gov.qa/en/aeronautical-information-management",
  romania: "https://www.aisro.ro/",
  rwanda: "https://aim.asecna.aero/html/eAIP/FR-menu-fr-FR.html",
  "saudi arabia": "https://aimss.sans.com.sa/assets/FileManagerFiles/e65727c9-8414-49dc-9c6a-0b30c956ed33.html",
  slovakia: "https://aim.lps.sk/web/index.php?fn=200&lng=en",
  slovenia: "https://aim.sloveniacontrol.si/aim/products/aip/",
  somalia: "https://aip.scaa.gov.so/history-en-GB.html",
  spain: "https://aip.enaire.es/AIP/AIP-en.html",
  "sri lanka": "https://www.aimibsrilanka.lk/eaip/current/index.html",
  sweden: "https://aro.lfv.se/content/eaip/default_offline.html",
  taiwan: "https://ais.caa.gov.tw/eaip/",
  tajikistan: "http://www.caica.ru/aiptjk/?lang=en",
  thailand: "https://aip.caat.or.th/",
  turkmenistan: "http://www.caica.ru/aiptkm/?lang=en",
  "united arab emirates": "https://www.gcaa.gov.ae/en/ais/AIPHtmlFiles/AIP/Current/AIP.aspx",
  "united kingdom": "https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/AIP/",
  uzbekistan: "https://uzaeronavigation.com/ais/#",
  venezuela: "https://www.inac.gob.ve/eaip/history-en-GB.html",
};

function parseDateFromString(value) {
  const s = String(value || "");
  const iso = s.match(/\b(20\d{2})[-_](\d{2})[-_](\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const compact = s.match(/\b(20\d{2})(\d{2})(\d{2})\b/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const rev = s.match(/\b(\d{2})[-_](\d{2})[-_](20\d{2})\b/);
  if (rev) return `${rev[3]}-${rev[2]}-${rev[1]}`;
  return null;
}

function pickNewestDate(candidates) {
  const valid = candidates.filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)));
  return valid[0] || null;
}

function runScraperCollect(absScriptPath, timeoutMs, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [absScriptPath, "--collect", ...extraArgs], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {}
      reject(new Error("collect timeout"));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c) => {
      out += c;
    });
    child.stderr.on("data", (c) => {
      err += c;
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(err.trim() || `exit ${code}`));
        return;
      }
      try {
        const j = JSON.parse(String(out).trim());
        if (!j || typeof j !== "object") throw new Error("not an object");
        resolve(j);
      } catch {
        reject(new Error(`invalid JSON: ${String(out).slice(0, 160)}`));
      }
    });
  });
}

async function tryCollectNetwork(absScriptPath, timeoutMs) {
  try {
    const data = await runScraperCollect(absScriptPath, timeoutMs, []);
    return { ok: true, data, usedInsecure: false };
  } catch {
    try {
      const data = await runScraperCollect(absScriptPath, timeoutMs, ["--insecure"]);
      return { ok: true, data, usedInsecure: true };
    } catch (e2) {
      return { ok: false, error: String(e2?.message || e2) };
    }
  }
}

async function collectOne(scriptFile, opts) {
  const { offline, collectTimeoutMs } = opts;
  const scriptPath = path.join(SCRAPERS_DIR, scriptFile);
  const src = await fs.readFile(scriptPath, "utf8");
  const slug = scriptFile.replace(/-interactive\.mjs$/i, "");
  const countryName = titleCaseFromSlug(slug.replace(/-(eaip|aip|ais|ifis3)$/i, ""));

  const outBaseGen = parseOutDirFromSource(src, "GEN");
  const outBaseAd2 = parseOutDirFromSource(src, "AD2");
  const genDir = outBaseGen ? path.join(ROOT, "downloads", outBaseGen, "GEN") : null;
  const ad2Dir = outBaseAd2 ? path.join(ROOT, "downloads", outBaseAd2, "AD2") : null;
  const genFiles = genDir ? await listPdfFiles(genDir) : [];
  const ad2Files = ad2Dir ? await listPdfFiles(ad2Dir) : [];
  const pdfEffectiveDate = pickNewestDate(
    [...genFiles, ...ad2Files].map((name) => parseDateFromString(name)).filter(Boolean),
  );

  const pdfNorm = normalizeIcaoList(ad2Files.map(toIcaoFromFilename));
  const pdfIcaos = pdfNorm.icaos;

  let networkEffectiveDate = null;
  let networkIcaos = [];
  let networkDroppedInvalid = 0;
  let collectOk = false;
  let collectError = null;
  let collectUsedInsecure = false;

  if (!offline) {
    const net = await tryCollectNetwork(scriptPath, collectTimeoutMs);
    if (net.ok) {
      collectOk = true;
      collectUsedInsecure = net.usedInsecure;
      networkEffectiveDate = net.data.effectiveDate ?? null;
      const networkNorm = normalizeIcaoList(net.data.ad2Icaos);
      networkIcaos = networkNorm.icaos;
      networkDroppedInvalid = networkNorm.droppedInvalid;
    } else {
      collectError = net.error;
    }
  }

  const mergedNorm = normalizeIcaoList([...pdfIcaos, ...networkIcaos]);
  const ad2Icaos = mergedNorm.icaos;
  const effectiveDate =
    networkEffectiveDate != null && String(networkEffectiveDate).trim() !== ""
      ? networkEffectiveDate
      : pdfEffectiveDate;

  return {
    countrySlug: slug,
    countryName,
    scriptPath: `scripts/web-table-scrapers/${scriptFile}`,
    runCommand: `node scripts/web-table-scrapers/${scriptFile}`,
    outputDirs: {
      gen: genDir ? path.relative(ROOT, genDir) : null,
      ad2: ad2Dir ? path.relative(ROOT, ad2Dir) : null,
    },
    genFiles,
    ad2Files,
    ad2Icaos,
    effectiveDate,
    effectiveDateFromDownloads: pdfEffectiveDate,
    collectOk,
    collectError,
    collectUsedInsecure,
    droppedInvalidIcaos: {
      fromPdf: pdfNorm.droppedInvalid,
      fromNetwork: networkDroppedInvalid,
      fromMerge: mergedNorm.droppedInvalid,
    },
    webAipUrl: WEB_AIP_BY_COUNTRY[normalizeCountry(countryName)] ?? null,
    generatedFromDownloads: true,
  };
}

async function main() {
  const outPath = argValue("--out", OUT_DEFAULT);
  const offline = hasFlag("--offline");
  const collectTimeoutMs = Number(argValue("--collect-timeout-ms", "90000")) || 90_000;
  const rows = await fs.readdir(SCRAPERS_DIR);
  const scraperFiles = rows.filter((f) => f.endsWith("-interactive.mjs")).sort((a, b) => a.localeCompare(b));
  console.log(
    `[collect-all-packages] mode=${offline ? "offline" : "network"} timeoutMs=${collectTimeoutMs} countries=${scraperFiles.length}`,
  );
  const countries = [];
  for (const f of scraperFiles) {
    const country = await collectOne(f, { offline, collectTimeoutMs });
    const collectModeLabel = offline ? "offline" : country.collectOk ? "network-ok" : "network-failed";
    console.log(
      `[collect-all-packages] ${country.countrySlug} ${collectModeLabel} ad2=${country.ad2Icaos.length} effective=${country.effectiveDate || "n/a"} droppedInvalid=${country.droppedInvalidIcaos.fromPdf + country.droppedInvalidIcaos.fromNetwork + country.droppedInvalidIcaos.fromMerge}`,
    );
    if (!offline && !country.collectOk && country.collectError) {
      console.log(`[collect-all-packages] ${country.countrySlug} collectError=${country.collectError}`);
    }
    countries.push(country);
  }
  const totalAd2 = countries.reduce((sum, c) => sum + (Array.isArray(c.ad2Icaos) ? c.ad2Icaos.length : 0), 0);
  const totalDropped = countries.reduce(
    (sum, c) =>
      sum +
      Number(c?.droppedInvalidIcaos?.fromPdf || 0) +
      Number(c?.droppedInvalidIcaos?.fromNetwork || 0) +
      Number(c?.droppedInvalidIcaos?.fromMerge || 0),
    0,
  );
  console.log(`[collect-all-packages] summary countries=${countries.length} totalAd2=${totalAd2} droppedInvalid=${totalDropped}`);
  const payload = {
    generatedAt: new Date().toISOString(),
    source: "scripts/web-table-scrapers",
    collectMode: offline ? "offline" : "network",
    countries,
  };
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`[collect-all-packages] wrote ${countries.length} countries -> ${outPath}`);
}

main().catch((err) => {
  console.error("[collect-all-packages] failed:", err?.message || err);
  process.exit(1);
});
