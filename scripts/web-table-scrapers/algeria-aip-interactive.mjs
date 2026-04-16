#!/usr/bin/env node
/**
 * Interactive Algeria AIP downloader.
 *
 * Source:
 * - https://www.sia-enna.dz/aeronautical-information-publication.html
 *
 * Notes:
 * - AD 2 airports must use the "Text data" PDF (not chart PDFs).
 *
 * Usage:
 *   node scripts/web-table-scrapers/algeria-aip-interactive.mjs
 *   node scripts/web-table-scrapers/algeria-aip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/algeria-aip-interactive.mjs --collect
 *   node scripts/web-table-scrapers/algeria-aip-interactive.mjs --download-gen12
 *   node scripts/web-table-scrapers/algeria-aip-interactive.mjs --download-ad2 DAAG
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson, isoDateFromText } from "./_collect-json.mjs";
import { stdin as input, stdout as output, stderr } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "algeria-aip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "algeria-aip", "AD2");

const AIP_URL = "https://www.sia-enna.dz/aeronautical-information-publication.html";
const FETCH_TIMEOUT_MS = 30_000;
const UA = "Mozilla/5.0 (compatible; clearway-dz-scraper/1.0)";
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
      headers: { "User-Agent": UA },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseEffectiveDate(html) {
  // Example: "Last update : 19 FEB 26"
  const m = String(html || "").match(/Last\s*update\s*:\s*([0-9]{1,2}\s+[A-Za-z]{3,9}\s+[0-9]{2,4})/i);
  if (!m) return null;
  const raw = m[1].trim();
  const monthMap = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
    JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  };
  const parts = raw.split(/\s+/);
  if (parts.length !== 3) return isoDateFromText(raw);
  const dd = String(parts[0]).padStart(2, "0");
  const mm = monthMap[String(parts[1] || "").slice(0, 3).toUpperCase()];
  let yy = String(parts[2] || "").trim();
  if (!mm) return isoDateFromText(raw);
  if (/^\d{2}$/.test(yy)) yy = `20${yy}`;
  if (!/^\d{4}$/.test(yy)) return isoDateFromText(raw);
  return `${yy}-${mm}-${dd}`;
}

function parseGenEntries(html, baseUrl) {
  const out = [];
  const seen = new Set();
  const re = /<a[^>]*href=["']([^"']*\/GEN\/[^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const label = stripHtml(m[2]);
    const file = href.match(/\/(GEN[0-9.]+)\.pdf$/i)?.[1] || label.match(/GEN\s*([0-9]\.[0-9])/i)?.[1] || "";
    const section = String(file || "").toUpperCase().replace(/\s+/g, "");
    const key = section || href;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      section: section || "GEN",
      label: label || section || "GEN",
      pdfUrl: new URL(href, baseUrl).href,
    });
  }
  return out.sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2TextDataEntries(html, baseUrl) {
  // We only pick links whose visible label is "Text data" and whose target is AD2/<ICAO>/<ICAO>.pdf.
  const out = [];
  const byIcao = new Map();
  const re = /<a[^>]*href=["']([^"']*\/AD\/AD2\/([A-Z0-9]{4})\/[^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const icao = m[2].toUpperCase();
    const label = stripHtml(m[3]);
    if (!/^text\s*data$/i.test(label)) continue;
    if (!byIcao.has(icao)) {
      byIcao.set(icao, {
        icao,
        label: "Text data",
        pdfUrl: new URL(href, baseUrl).href,
      });
    }
  }
  for (const row of byIcao.values()) out.push(row);
  return out.sort((a, b) => a.icao.localeCompare(b.icao));
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
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
    console.log(`Usage: node scripts/web-table-scrapers/algeria-aip-interactive.mjs [--insecure] [--collect]
       node scripts/web-table-scrapers/algeria-aip-interactive.mjs --download-ad2 <ICAO>
       node scripts/web-table-scrapers/algeria-aip-interactive.mjs --download-gen12`);
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[DZ] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const html = await fetchText(AIP_URL);
      const ad2Entries = parseAd2TextDataEntries(html, AIP_URL);
      if (!ad2Entries.length) throw new Error("No AD2 Text data entries found.");
      printCollectJson({ effectiveDate: parseEffectiveDate(html), ad2Icaos: ad2Entries.map((e) => e.icao) });
    } catch (err) {
      console.error("[DZ] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("Algeria AIP — interactive downloader\n");
    const html = await fetchText(AIP_URL);
    const effectiveDate = parseEffectiveDate(html);
    const genEntries = parseGenEntries(html, AIP_URL);
    const ad2Entries = parseAd2TextDataEntries(html, AIP_URL);
    if (!genEntries.length) throw new Error("No GEN entries found.");
    if (!ad2Entries.length) throw new Error("No AD2 Text data entries found.");
    const fileDate = effectiveDate || "unknown-date";

    if (downloadGen12) {
      const chosen = genEntries.find((e) => /\bGEN\s*1\.2\b/i.test(e.label) || /\bGEN1\.2\b/i.test(e.section)) ?? genEntries[0];
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${fileDate}_${chosen.section}.pdf`));
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`Saved: ${outFile}`);
      return;
    }

    if (downloadAd2Icao) {
      const chosen = ad2Entries.find((e) => e.icao === downloadAd2Icao);
      if (!chosen) throw new Error(`AD2 ICAO not found in Algeria list: ${downloadAd2Icao}`);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${fileDate}_${chosen.icao}_AD2.pdf`));
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`Saved: ${outFile}`);
      return;
    }

    rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
    console.error(`Source: ${AIP_URL}`);
    if (effectiveDate) console.error(`Last update: ${effectiveDate}`);
    const mode = (await rl.question("Download:\n  [1] GEN section PDF\n  [2] AD 2 airport Text data PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;

    if (mode === "1") {
      genEntries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.section}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nSection number 1-${genEntries.length}: `, genEntries, (e) => `${e.section} ${e.label}`);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${fileDate}_${chosen.section}.pdf`));
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (mode === "2") {
      ad2Entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.icao}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nAirport number 1-${ad2Entries.length} or ICAO: `, ad2Entries, (e) => `${e.icao} ${e.label}`);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${fileDate}_${chosen.icao}_AD2.pdf`));
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error("[DZ] failed:", err?.message || err);
  process.exit(1);
});
