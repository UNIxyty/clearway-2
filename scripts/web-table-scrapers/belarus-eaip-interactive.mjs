#!/usr/bin/env node
/**
 * Interactive Belarus eAIP downloader.
 *
 * Flow:
 * 1) Read BAN AIP amendments page and auto-pick newest effective date
 * 2) Resolve package index/menu for that date
 * 3) Download GEN section PDF or AD 2 airport PDF
 *
 * Usage:
 *   node scripts/web-table-scrapers/belarus-eaip-interactive.mjs
 *   node scripts/web-table-scrapers/belarus-eaip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/belarus-eaip-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stderr } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "belarus-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "belarus-eaip", "AD2");

const AMDT_URLS = [
  "https://www.ban.by/ru/sbornik-aip/amdt",
  "https://www.ban.by/sbornik-aip/amdt",
];
const FETCH_TIMEOUT_MS = 30_000;

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#xA;|\r?\n/g, " ")
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
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchBelarusAmdtPage() {
  const errors = [];
  for (const url of AMDT_URLS) {
    try {
      const html = await fetchText(url);
      if (/eAIP\s*EFFECTIVE\s*DATE/i.test(html)) return { url, html };
      errors.push(`${url} -> no effective-date markers found`);
    } catch (err) {
      errors.push(`${url} -> ${err?.message || err}`);
    }
  }
  throw new Error(`Could not load amendments page. Tried: ${errors.join(" | ")}`);
}

function parseEffectiveDates(amdtHtml) {
  const dates = [...amdtHtml.matchAll(/eAIP\s*EFFECTIVE\s*DATE\s*(\d{4}-\d{2}-\d{2})/gi)].map((m) => m[1]);
  return [...new Set(dates)];
}

function pickNewestDate(dates) {
  const parsed = dates
    .map((d) => {
      const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return { date: d, ts: Number.NEGATIVE_INFINITY };
      const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return { date: d, ts };
    })
    .sort((a, b) => b.ts - a.ts);
  return parsed[0]?.date ?? null;
}

function belarusDateToPackageCode(date) {
  // 2026-04-16 -> 260416
  const m = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const yy = m[1].slice(-2);
  return `${yy}${m[2]}${m[3]}`;
}

function packageIndexUrlFromDate(date) {
  const code = belarusDateToPackageCode(date);
  if (!code) return null;
  return `https://www.ban.by/AIP/Belarus${code}/html/index.html`;
}

function parseMenuUrl(indexHtml, indexUrl) {
  const m = indexHtml.match(/<frame[^>]*name="eAISNavigation"[^>]*src="([^"]+)"/i);
  if (!m?.[1]) throw new Error("Could not find eAISNavigation frame in index.");
  return new URL(m[1], indexUrl).href;
}

function parseGenEntries(menuHtml, menuUrl) {
  const re = /<a[^>]*href="([^"]*\/pdf\/(UM_GEN_[^"]+?\.pdf))"[^>]*>([\s\S]*?)<\/a>/gi;
  const byPdf = new Map();
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const pdfFile = m[2];
    const label = stripHtml(m[3]) || pdfFile;
    if (!byPdf.has(pdfFile)) {
      byPdf.set(pdfFile, {
        label,
        pdfUrl: new URL(href, menuUrl).href,
        pdfFile,
      });
    }
  }
  return [...byPdf.values()].sort((a, b) => a.pdfFile.localeCompare(b.pdfFile));
}

function parseAd2Entries(menuHtml, menuUrl) {
  const re = /href="([^"]*\/pdf\/(UM_AD_2_([A-Z0-9]{4})_en\.pdf))"/gi;
  const byIcao = new Map();
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const pdfFile = m[2];
    const icao = m[3].toUpperCase();
    if (!byIcao.has(icao)) {
      byIcao.set(icao, {
        icao,
        pdfFile,
        pdfUrl: new URL(href, menuUrl).href,
      });
    }
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
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
      if (found.length > 1) {
        console.error(`Ambiguous (${found.length} matches). Type number or narrower text.`);
        continue;
      }
    }
    console.error("Invalid selection.");
  }
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  writeFileSync(outFile, bytes);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Usage: node scripts/web-table-scrapers/belarus-eaip-interactive.mjs [--insecure] [--collect]

Interactive flow:
  [1] Auto-select newest Belarus eAIP release from BAN amendments page
  [2] Choose GEN section PDF or AD 2 airport PDF
`);
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[BY] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const { html: amdtHtml } = await fetchBelarusAmdtPage();
      const dates = parseEffectiveDates(amdtHtml);
      if (!dates.length) throw new Error("No 'eAIP EFFECTIVE DATE' entries found.");
      const newestDate = pickNewestDate(dates);
      if (!newestDate) throw new Error("Could not resolve newest effective date.");
      const indexUrl = packageIndexUrlFromDate(newestDate);
      if (!indexUrl) throw new Error("Could not build package URL from newest date.");
      const indexHtml = await fetchText(indexUrl);
      const menuUrl = parseMenuUrl(indexHtml, indexUrl);
      const menuHtml = await fetchText(menuUrl);
      const entries = parseAd2Entries(menuHtml, menuUrl);
      printCollectJson({ effectiveDate: newestDate, ad2Icaos: entries.map((e) => e.icao) });
    } catch (err) {
      console.error("[BY] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  const rl = readline.createInterface({ input, output: stderr, terminal: Boolean(input.isTTY) });
  try {
    console.error("Belarus eAIP — interactive downloader\n");
    console.error(`Amendments page(s): ${AMDT_URLS.join(" , ")}\n`);

    const { url: amdtUrlUsed, html: amdtHtml } = await fetchBelarusAmdtPage();
    const dates = parseEffectiveDates(amdtHtml);
    if (!dates.length) throw new Error("No 'eAIP EFFECTIVE DATE' entries found.");
    const newestDate = pickNewestDate(dates);
    if (!newestDate) throw new Error("Could not resolve newest effective date.");
    const indexUrl = packageIndexUrlFromDate(newestDate);
    if (!indexUrl) throw new Error("Could not build package URL from newest date.");

    const indexHtml = await fetchText(indexUrl);
    const menuUrl = parseMenuUrl(indexHtml, indexUrl);
    const menuHtml = await fetchText(menuUrl);

    console.error(`Resolved amendments page: ${amdtUrlUsed}`);
    console.error(`Auto-selected newest effective date: ${newestDate}`);
    console.error(`Package index: ${indexUrl}`);
    console.error(`Menu: ${menuUrl}\n`);

    const mode = (await rl.question("Download:\n  [1] GEN section PDF\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;

    if (mode === "1") {
      const entries = parseGenEntries(menuHtml, menuUrl);
      if (!entries.length) throw new Error("No GEN PDFs found in Belarus menu.");
      console.error("\n--- GEN PDFs ---\n");
      entries.forEach((e, i) => {
        console.error(`${String(i + 1).padStart(3)}. ${e.label}`);
      });
      const chosen = await pickFromList(rl, `\nSection number 1-${entries.length}: `, entries, (e) => e.label);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${newestDate}_${chosen.pdfFile}`));
      console.error(`\n→ PDF: ${chosen.pdfUrl}`);
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (mode === "2") {
      const entries = parseAd2Entries(menuHtml, menuUrl);
      if (!entries.length) throw new Error("No AD 2 PDFs found in Belarus menu.");
      console.error("\n--- AD 2 airports ---\n");
      entries.forEach((e, i) => {
        console.error(`${String(i + 1).padStart(3)}. ${e.icao}`);
      });
      const chosen = await pickFromList(rl, `\nAirport number 1-${entries.length} or ICAO: `, entries, (e) => e.icao);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${newestDate}_${chosen.pdfFile}`));
      console.error(`\n→ PDF: ${chosen.pdfUrl}`);
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    console.error("Unknown choice.");
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("[BY] failed:", err?.message || err);
  process.exit(1);
});
