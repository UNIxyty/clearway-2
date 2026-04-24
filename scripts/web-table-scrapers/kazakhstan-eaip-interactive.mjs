#!/usr/bin/env node
/**
 * Interactive Kazakhstan eAIP downloader.
 *
 * Source:
 * - https://www.ans.kz/en/ais/eaip
 * Uses publication HTML issue link + dedicated text PDFs (no full ZIP download).
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "kazakhstan-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "kazakhstan-eaip", "AD2");
const ENTRY_URL = "https://www.ans.kz/en/ais/eaip";
const UA = "Mozilla/5.0 (compatible; clearway-kazakhstan-eaip/1.0)";
const FETCH_TIMEOUT_MS = 45_000;
const DOWNLOAD_TIMEOUT_MS = 240_000;
const MAX_RETRIES = 3;
const log = (...args) => console.error("[KAZAKHSTAN]", ...args);

const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { "User-Agent": UA } });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url) {
  log("Fetching HTML:", url);
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt >= MAX_RETRIES) break;
      log(`Fetch failed (attempt ${attempt}/${MAX_RETRIES}):`, err?.message || err);
      await sleep(800 * attempt);
    }
  }
  throw lastErr || new Error(`Failed to fetch ${url}`);
}

async function downloadPdf(url, dest) {
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log(`Downloading PDF (attempt ${attempt}/${MAX_RETRIES}):`, url);
      const res = await fetchWithTimeout(url, DOWNLOAD_TIMEOUT_MS);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
      writeFileSync(dest, bytes);
      log("Saved PDF:", dest);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt >= MAX_RETRIES) break;
      log(`PDF download failed (attempt ${attempt}/${MAX_RETRIES}):`, err?.message || err);
      await sleep(1_000 * attempt);
    }
  }
  throw lastErr || new Error(`Failed to download ${url}`);
}

function parseCurrentIndexUrl(html) {
  const links = [...String(html || "").matchAll(/href=["']([^"']*\/20\d{2}-\d{2}-\d{2}-AIRAC\/html\/index-en-GB\.html)["']/gi)]
    .map((m) => new URL(m[1], ENTRY_URL).href)
    .sort();
  if (!links.length) throw new Error("Could not resolve Kazakhstan current issue HTML link.");
  return links[links.length - 1];
}

function parseMenuUrl(indexHtml, indexUrl) {
  const src = String(indexHtml || "").match(/<frame[^>]*name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i)?.[1];
  if (!src) throw new Error("Could not resolve Kazakhstan menu frame URL.");
  return new URL(src, indexUrl).href;
}

function parseEffectiveDate(indexUrl) {
  const m = String(indexUrl || "").match(/\/(20\d{2})-(\d{2})-(\d{2})-AIRAC\/html\//);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function stripHtml(v) {
  return String(v || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAd2Entries(menuHtml, menuUrl) {
  const byIcao = new Map();
  for (const m of String(menuHtml || "").matchAll(/href=["']([^"']*UA-AD-2\.([A-Z0-9]{4})-en-GB\.html(?:#[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const icao = m[2].toUpperCase();
    if (byIcao.has(icao)) continue;
    byIcao.set(icao, {
      icao,
      label: stripHtml(m[3]) || icao,
      htmlUrl: new URL(m[1], menuUrl).href,
    });
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

function parseGenEntries(menuHtml, menuUrl) {
  const bySection = new Map();
  for (const m of String(menuHtml || "").matchAll(/href=["']([^"']*UA-GEN-([0-9.]+)-en-GB\.html(?:#[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const section = `GEN-${m[2]}`;
    if (bySection.has(section)) continue;
    bySection.set(section, {
      section,
      label: stripHtml(m[3]) || section,
      htmlUrl: new URL(m[1], menuUrl).href,
    });
  }
  return [...bySection.values()].sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

async function resolveContext() {
  const html = await fetchText(ENTRY_URL);
  const indexUrl = parseCurrentIndexUrl(html);
  const indexHtml = await fetchText(indexUrl);
  const menuUrl = parseMenuUrl(indexHtml, indexUrl);
  const menuHtml = await fetchText(menuUrl);
  const effectiveDate = parseEffectiveDate(indexUrl);
  const ad2Entries = parseAd2Entries(menuHtml, menuUrl);
  const genEntries = parseGenEntries(menuHtml, menuUrl);
  const issueRoot = new URL("../", indexUrl).href;
  log("Resolved issue URL:", indexUrl);
  log("Resolved menu URL:", menuUrl);
  if (effectiveDate) log("Effective date:", effectiveDate);
  log("GEN entries found:", genEntries.length);
  log("AD2 entries found:", ad2Entries.length);
  return { issueRoot, effectiveDate, ad2Entries, genEntries };
}

async function main() {
  const ctx = await resolveContext();
  const dateTag = ctx.effectiveDate || "unknown-date";

  if (collectMode()) {
    printCollectJson({ effectiveDate: ctx.effectiveDate, ad2Icaos: ctx.ad2Entries.map((x) => x.icao) });
    return;
  }

  if (downloadGen12) {
    const row = ctx.genEntries.find((x) => x.section === "GEN-1.2") || ctx.genEntries[0];
    if (!row) throw new Error("GEN entries not found.");
    const pdfUrl = new URL("pdf/UA_GEN_1_2_en.pdf", ctx.issueRoot).href;
    mkdirSync(OUT_GEN, { recursive: true });
    await downloadPdf(pdfUrl, join(OUT_GEN, `${dateTag}_${row.section}.pdf`));
    return;
  }

  if (downloadAd2Icao) {
    const row = ctx.ad2Entries.find((x) => x.icao === downloadAd2Icao);
    if (!row) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    const pdfUrl = new URL(`pdf/UA_AD_2_${row.icao}_en.pdf`, ctx.issueRoot).href;
    mkdirSync(OUT_AD2, { recursive: true });
    await downloadPdf(pdfUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`));
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      const row = ctx.genEntries.find((x) => x.section === "GEN-1.2") || ctx.genEntries[0];
      if (!row) throw new Error("GEN entries not found.");
      const pdfUrl = new URL("pdf/UA_GEN_1_2_en.pdf", ctx.issueRoot).href;
      mkdirSync(OUT_GEN, { recursive: true });
      await downloadPdf(pdfUrl, join(OUT_GEN, `${dateTag}_${row.section}.pdf`));
      return;
    }
    if (mode === "2") {
      ctx.ad2Entries.forEach((row, i) => console.error(`${String(i + 1).padStart(3)}. ${row.icao}  ${row.label}`));
      const raw = (await rl.question(`\nAirport number 1-${ctx.ad2Entries.length} or ICAO: `)).trim().toUpperCase();
      const n = Number.parseInt(raw, 10);
      const row =
        String(n) === raw && n >= 1 && n <= ctx.ad2Entries.length
          ? ctx.ad2Entries[n - 1]
          : ctx.ad2Entries.find((x) => x.icao === raw);
      if (!row) throw new Error("Invalid selection.");
      const pdfUrl = new URL(`pdf/UA_AD_2_${row.icao}_en.pdf`, ctx.issueRoot).href;
      mkdirSync(OUT_AD2, { recursive: true });
      await downloadPdf(pdfUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`));
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});
