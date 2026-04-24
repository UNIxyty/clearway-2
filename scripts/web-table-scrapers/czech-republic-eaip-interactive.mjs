#!/usr/bin/env node
/**
 * Interactive Czech Republic eAIP downloader.
 *
 * Source:
 * - https://aim.rlp.cz/ais_data/www_main_control/frm_en_aip.htm
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "czech-republic-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "czech-republic-eaip", "AD2");
const ENTRY_URL = "https://aim.rlp.cz/ais_data/aip/control/aip_obsah_en.htm";
const UA = "Mozilla/5.0 (compatible; clearway-czech-eaip/1.0)";
const FETCH_TIMEOUT_MS = 30_000;
const log = (...args) => console.error("[CZECH]", ...args);

const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    log("Fetching HTML:", url);
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function downloadPdf(url, outFile) {
  log("Downloading PDF:", url);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
  writeFileSync(outFile, bytes);
  log("Saved PDF:", outFile);
}

function stripHtml(v) {
  return String(v || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseGenEntries(indexHtml, indexUrl) {
  const bySection = new Map();
  for (const m of String(indexHtml || "").matchAll(/href=["']([^"']*\/aip\/data\/valid\/[^"']+\.pdf)["'][^>]*>\s*(GEN\s*[0-9.]+)\s*<\/a>/gi)) {
    const section = String(m[2] || "").replace(/\s+/g, "").toUpperCase().replace(/^GEN/, "GEN-");
    if (bySection.has(section)) continue;
    bySection.set(section, {
      section,
      label: section,
      pdfUrl: new URL(m[1], indexUrl).href,
    });
  }
  return [...bySection.values()].sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2Entries(indexHtml, indexUrl) {
  const byIcao = new Map();
  for (const m of String(indexHtml || "").matchAll(/<span>\s*([A-Z0-9]{4})\s*<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<a[^>]*href=["']([^"']*\/aip\/data\/valid\/[^"']*text[^"']*\.pdf)["']/gi)) {
    const icao = m[1].toUpperCase();
    if (byIcao.has(icao)) continue;
    byIcao.set(icao, {
      icao,
      label: stripHtml(m[2]) || icao,
      pdfUrl: new URL(m[3], indexUrl).href,
    });
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

function parseEffectiveDate(indexHtml) {
  const m = String(indexHtml || "").match(/AIRAC\s+effective(?:\s+date)?\s*[:\-]?\s*(\d{1,2})\.(\d{1,2})\.(20\d{2})/i);
  if (!m) return null;
  return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
}

async function resolveContext() {
  const menuHtml = await fetchText(ENTRY_URL);
  const effectiveDate = parseEffectiveDate(menuHtml);
  const menuUrl = ENTRY_URL;
  log("Resolved menu URL:", menuUrl);
  if (effectiveDate) log("Effective date:", effectiveDate);
  return { effectiveDate, menuUrl, menuHtml };
}

async function main() {
  const ctx = await resolveContext();
  const genEntries = parseGenEntries(ctx.menuHtml, ctx.menuUrl);
  const ad2Entries = parseAd2Entries(ctx.menuHtml, ctx.menuUrl);
  const dateTag = ctx.effectiveDate || "unknown-date";
  log("GEN entries found:", genEntries.length);
  log("AD2 entries found:", ad2Entries.length);

  if (collectMode()) {
    printCollectJson({ effectiveDate: ctx.effectiveDate, ad2Icaos: ad2Entries.map((x) => x.icao) });
    return;
  }

  if (downloadGen12) {
    const row = genEntries.find((x) => x.section === "GEN-1.2") ?? genEntries[0];
    if (!row) throw new Error("GEN entries not found.");
    mkdirSync(OUT_GEN, { recursive: true });
    await downloadPdf(row.pdfUrl, join(OUT_GEN, `${dateTag}_${row.section}.pdf`));
    return;
  }

  if (downloadAd2Icao) {
    const row = ad2Entries.find((x) => x.icao === downloadAd2Icao);
    if (!row) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    await downloadPdf(row.pdfUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`));
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      const row = genEntries.find((x) => x.section === "GEN-1.2") ?? genEntries[0];
      if (!row) throw new Error("GEN entries not found.");
      mkdirSync(OUT_GEN, { recursive: true });
      await downloadPdf(row.pdfUrl, join(OUT_GEN, `${dateTag}_${row.section}.pdf`));
      return;
    }
    if (mode === "2") {
      ad2Entries.forEach((x, i) => console.error(`${String(i + 1).padStart(3)}. ${x.icao}  ${x.label}`));
      const raw = (await rl.question(`\nAirport number 1-${ad2Entries.length} or ICAO: `)).trim().toUpperCase();
      const n = Number.parseInt(raw, 10);
      const row = String(n) === raw && n >= 1 && n <= ad2Entries.length ? ad2Entries[n - 1] : ad2Entries.find((x) => x.icao === raw);
      if (!row) throw new Error("Invalid selection.");
      mkdirSync(OUT_AD2, { recursive: true });
      await downloadPdf(row.pdfUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`));
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});
