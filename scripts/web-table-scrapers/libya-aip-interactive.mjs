#!/usr/bin/env node
/**
 * Interactive Libya AIP downloader.
 *
 * Sources:
 * - GEN: https://caa.gov.ly/ais/gen/
 * - AD:  https://caa.gov.ly/ais/ad/
 *
 * Usage:
 *   node scripts/web-table-scrapers/libya-aip-interactive.mjs
 *   node scripts/web-table-scrapers/libya-aip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/libya-aip-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output, stderr } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "libya-aip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "libya-aip", "AD2");

const GEN_URL = "https://caa.gov.ly/ais/gen/";
const AD_URL = "https://caa.gov.ly/ais/ad/";
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
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-ly-scraper/1.0)" },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseGenEntries(genHtml) {
  const re = /<a[^>]*href=["']([^"']+GEN[^"']*\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const bySection = new Map();
  let m;
  while ((m = re.exec(genHtml))) {
    const href = m[1];
    const label = stripHtml(m[2]);
    const sec = href.match(/GEN\s*([0-9]\.[0-9])/i)?.[1] || label.match(/GEN\s*([0-9]\.[0-9])/i)?.[1];
    if (!sec) continue;
    const section = `GEN ${sec}`;
    if (!bySection.has(section)) {
      bySection.set(section, {
        section,
        label: label || section,
        pdfUrl: new URL(href, GEN_URL).href.replace("http://", "https://"),
      });
    }
  }
  return [...bySection.values()].sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2Entries(adHtml) {
  const re = /<a[^>]*href=["']([^"']+\/(HL[A-Z0-9]{2})\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const byIcao = new Map();
  let m;
  while ((m = re.exec(adHtml))) {
    const href = m[1];
    const icao = m[2].toUpperCase();
    const label = stripHtml(m[3]) || icao;
    if (!byIcao.has(icao)) {
      byIcao.set(icao, {
        icao,
        label,
        pdfUrl: new URL(href, AD_URL).href.replace("http://", "https://"),
      });
    }
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-ly-scraper/1.0)" } });
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
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
    console.log("Usage: node scripts/web-table-scrapers/libya-aip-interactive.mjs [--insecure] [--collect]");
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[LY] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const adHtml = await fetchText(AD_URL);
      const ad2Entries = parseAd2Entries(adHtml);
      if (!ad2Entries.length) throw new Error("No AD2 entries found.");
      printCollectJson({ effectiveDate: null, ad2Icaos: ad2Entries.map((e) => e.icao) });
    } catch (err) {
      console.error("[LY] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("Libya AIP — interactive downloader\n");
    const genHtml = await fetchText(GEN_URL);
    const adHtml = await fetchText(AD_URL);
    const genEntries = parseGenEntries(genHtml);
    const ad2Entries = parseAd2Entries(adHtml);
    if (!genEntries.length) throw new Error("No GEN entries found.");
    if (!ad2Entries.length) throw new Error("No AD2 entries found.");

    rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
    const mode = (await rl.question("Download:\n  [1] GEN section PDF\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
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
      ad2Entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.icao}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nAirport number 1-${ad2Entries.length} or ICAO: `, ad2Entries, (e) => `${e.icao} ${e.label}`);
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
  console.error("[LY] failed:", err?.message || err);
  process.exit(1);
});
