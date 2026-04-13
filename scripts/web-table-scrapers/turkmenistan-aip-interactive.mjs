#!/usr/bin/env node
/**
 * Interactive Turkmenistan AIP downloader.
 *
 * Flow implemented as on the site:
 * 1) Open AIP Turkmenistan page
 * 2) Open "AIP Turkmenistan" (validaip)
 * 3) Click "English"
 * 4) Parse menueng.htm (legacy ItemLink(...) menu format)
 *
 * Source:
 * - http://www.caica.ru/aiptkm/?lang=en
 *
 * Usage:
 *   node scripts/web-table-scrapers/turkmenistan-aip-interactive.mjs
 *   node scripts/web-table-scrapers/turkmenistan-aip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/turkmenistan-aip-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "turkmenistan-aip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "turkmenistan-aip", "AD2");

const LANDING_URL = "http://www.caica.ru/aiptkm/?lang=en";
const FETCH_TIMEOUT_MS = 30_000;
const UA = "Mozilla/5.0 (compatible; clearway-tm-scraper/1.0)";
const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function safeFilename(name) {
  return String(name || "")
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "_");
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: "*/*" },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString("latin1");
  } finally {
    clearTimeout(timeout);
  }
}

function parseValidaipUrl(landingHtml) {
  const m = landingHtml.match(/onclick="window\.open\('([^']*validaip\/\?lang=en)'\)"/i);
  if (!m?.[1]) throw new Error('Could not find "AIP Turkmenistan" button target.');
  return new URL(m[1], LANDING_URL).href;
}

function parseEnglishUrl(validaipHtml, validaipUrl) {
  const m = validaipHtml.match(/<a[^>]*href=["']([^"']*html\/eng\.htm)["'][^>]*>/i);
  if (!m?.[1]) throw new Error('Could not find "English" button link.');
  return new URL(m[1], validaipUrl).href;
}

function parseMenuUrl(engHtml, engUrl) {
  const m = engHtml.match(/<frame[^>]*name=["']menu["'][^>]*src=["']([^"']+)["']/i);
  if (!m?.[1]) throw new Error("Could not find menu frame source in eng.htm.");
  return new URL(m[1], engUrl).href;
}

function parseItemLinks(menuHtml, menuUrl) {
  const re = /ItemLink\("([^"]+)","([^"]+)"\);/g;
  const out = [];
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const label = stripHtml(m[2]);
    if (!href || !label || !/\.pdf$/i.test(href)) continue;
    out.push({
      label,
      href,
      pdfUrl: new URL(href, menuUrl).href,
    });
  }
  return out;
}

function parseGenEntries(itemLinks) {
  const bySection = new Map();
  for (const row of itemLinks) {
    const sec = row.label.match(/\bGEN\s*([0-9]\.[0-9])\b/i)?.[1];
    if (!sec) continue;
    const section = `GEN ${sec}`;
    if (!bySection.has(section)) {
      bySection.set(section, { section, label: row.label, pdfUrl: row.pdfUrl });
    }
  }
  return [...bySection.values()].sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2Entries(itemLinks) {
  const byIcao = new Map();
  for (const row of itemLinks) {
    const icao = row.href.match(/\/ad2\/([a-z0-9]{4})\//i)?.[1]?.toUpperCase();
    if (!icao) continue;
    const list = byIcao.get(icao) || [];
    list.push(row);
    byIcao.set(icao, list);
  }

  const out = [];
  for (const [icao, docs] of byIcao.entries()) {
    const preferred =
      docs.find((d) => /ad2-[a-z0-9]{4}-txt\.pdf$/i.test(d.href)) ||
      docs.find((d) => /data|text|tables/i.test(d.label)) ||
      docs[0];
    out.push({ icao, pdfUrl: preferred.pdfUrl, label: preferred.label });
  }
  return out.sort((a, b) => a.icao.localeCompare(b.icao));
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("Downloaded payload is not a PDF");
  }
  writeFileSync(outFile, bytes);
}

async function pickFromList(rl, prompt, items, display) {
  for (;;) {
    const raw = (await rl.question(prompt)).trim();
    const n = Number.parseInt(raw, 10);
    if (String(n) === raw && n >= 1 && n <= items.length) return items[n - 1];
    if (raw) {
      const q = raw.toLowerCase();
      const found = items.filter((x) => display(x).toLowerCase().includes(q));
      if (found.length === 1) return found[0];
    }
    console.error("Invalid selection.");
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Usage: node scripts/web-table-scrapers/turkmenistan-aip-interactive.mjs [--insecure] [--collect]
       node scripts/web-table-scrapers/turkmenistan-aip-interactive.mjs --download-ad2 <ICAO>
       node scripts/web-table-scrapers/turkmenistan-aip-interactive.mjs --download-gen12`);
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[TM] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const landingHtml = await fetchText(LANDING_URL);
      const validaipUrl = parseValidaipUrl(landingHtml);
      const validaipHtml = await fetchText(validaipUrl);
      const englishUrl = parseEnglishUrl(validaipHtml, validaipUrl);
      const engHtml = await fetchText(englishUrl);
      const menuUrl = parseMenuUrl(engHtml, englishUrl);
      const menuHtml = await fetchText(menuUrl);
      const itemLinks = parseItemLinks(menuHtml, menuUrl);
      if (!itemLinks.length) throw new Error("No PDF menu entries found in Turkmenistan English menu.");
      const ad2Entries = parseAd2Entries(itemLinks);
      if (!ad2Entries.length) throw new Error("No AD2 airport entries found.");
      printCollectJson({ effectiveDate: null, ad2Icaos: ad2Entries.map((e) => e.icao) });
    } catch (err) {
      console.error("[TM] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("Turkmenistan AIP — interactive downloader\n");

    const landingHtml = await fetchText(LANDING_URL);
    const validaipUrl = parseValidaipUrl(landingHtml);
    const validaipHtml = await fetchText(validaipUrl);
    const englishUrl = parseEnglishUrl(validaipHtml, validaipUrl);
    const engHtml = await fetchText(englishUrl);
    const menuUrl = parseMenuUrl(engHtml, englishUrl);
    const menuHtml = await fetchText(menuUrl);

    const itemLinks = parseItemLinks(menuHtml, menuUrl);
    if (!itemLinks.length) throw new Error("No PDF menu entries found in Turkmenistan English menu.");

    const genEntries = parseGenEntries(itemLinks);
    const ad2Entries = parseAd2Entries(itemLinks);
    if (!genEntries.length) throw new Error("No GEN entries found.");
    if (!ad2Entries.length) throw new Error("No AD2 airport entries found.");

    if (downloadGen12 || downloadAd2Icao) {
      if (downloadGen12) {
        const chosen =
          genEntries.find(
            (e) =>
              /\bGEN\s*1\.2\b/i.test(e.section) ||
              /\bGEN\s*1\.2\b/i.test(e.label) ||
              /GEN[-_. ]?1[._-]?2/i.test(e.pdfUrl),
          ) ?? genEntries[0];
        if (
          !/\bGEN\s*1\.2\b/i.test(chosen.section) &&
          !/\bGEN\s*1\.2\b/i.test(chosen.label) &&
          !/GEN[-_. ]?1[._-]?2/i.test(chosen.pdfUrl)
        ) {
          console.error("[TM] GEN 1.2 not found; falling back to first available GEN entry.");
        }
        mkdirSync(OUT_GEN, { recursive: true });
        const outFile = join(OUT_GEN, "UTM-GEN-1.2.pdf");
        await downloadPdf(chosen.pdfUrl, outFile);
        console.error(`Saved: ${outFile}`);
        return;
      }

      const chosen = ad2Entries.find((e) => e.icao === downloadAd2Icao);
      if (!chosen) throw new Error(`AD2 ICAO not found in Turkmenistan package: ${downloadAd2Icao}`);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${chosen.icao}_AD2.pdf`));
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`Saved: ${outFile}`);
      return;
    }

    rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
    const mode = (await rl.question("\nDownload:\n  [1] GEN section PDF\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;

    if (mode === "1") {
      genEntries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.section}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nSection number 1-${genEntries.length}: `, genEntries, (e) => `${e.section} ${e.label}`);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${chosen.section}.pdf`));
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (mode === "2") {
      ad2Entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.icao}`));
      const chosen = await pickFromList(rl, `\nAirport number 1-${ad2Entries.length} or ICAO: `, ad2Entries, (e) => e.icao);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${chosen.icao}_AD2.pdf`));
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error("[TM] failed:", err?.message || err);
  process.exit(1);
});
