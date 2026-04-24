#!/usr/bin/env node
/**
 * Interactive Georgia eAIP downloader.
 *
 * Source:
 * - https://airnav.ge/eaip/history-en-GB.html
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "georgia-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "georgia-eaip", "AD2");
const ENTRY_URL = "https://airnav.ge/eaip/history-en-GB.html";
const UA = "Mozilla/5.0 (compatible; clearway-georgia-eaip/1.0)";
const FETCH_TIMEOUT_MS = 30_000;
const log = (...args) => console.error("[GEORGIA]", ...args);

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

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCurrentIndexUrl(historyHtml) {
  const href = String(historyHtml || "").match(/href=["']([^"']*\/html\/index-en-GB\.html)["']/i)?.[1] || "";
  if (!href) throw new Error("Could not resolve current Georgia issue index URL.");
  return new URL(href, ENTRY_URL).href;
}

function parseMenuUrl(indexHtml, indexUrl) {
  const direct = String(indexHtml || "").match(/<frame[^>]*name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i)?.[1];
  if (direct) return new URL(direct, indexUrl).href;
  const base = String(indexHtml || "").match(/<frame[^>]*name=["']eAISNavigationBase["'][^>]*src=["']([^"']+)["']/i)?.[1];
  if (!base) throw new Error("Could not resolve Georgia menu URL.");
  return new URL(base, indexUrl).href;
}

function parseEffectiveDate(indexUrl) {
  const m = String(indexUrl || "").match(/\/(20\d{2})-(\d{2})-(\d{2})-\d{6}\//);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseGenEntries(menuHtml, menuUrl) {
  const out = [];
  const seen = new Set();
  for (const m of String(menuHtml || "").matchAll(/href=["']([^"']*UG-GEN-([0-9.]+)-en-GB\.html(?:#[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const section = `GEN-${m[2]}`;
    if (seen.has(section)) continue;
    seen.add(section);
    out.push({
      section,
      label: stripHtml(m[3]) || section,
      htmlUrl: new URL(m[1], menuUrl).href,
    });
  }
  return out.sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2Entries(menuHtml, menuUrl) {
  const byIcao = new Map();
  for (const m of String(menuHtml || "").matchAll(/href=["']([^"']*UG-AD-2-([A-Z0-9]{4})-en-GB\.html(?:#[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
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

function pickPrimaryPdf(pageHtml) {
  const all = [...String(pageHtml || "").matchAll(/href=["']([^"']+\.pdf[^"']*)["']/gi)].map((m) => m[1]);
  if (!all.length) return "";
  const preferred = all.find((h) => /\/pdf\/UG-(GEN-1\.2|AD-2-[A-Z0-9]{4})\.pdf/i.test(h));
  return preferred || all[0];
}

async function resolveDirectPdfFromHtml(htmlUrl) {
  const pageHtml = await fetchText(htmlUrl);
  const href = pickPrimaryPdf(pageHtml);
  if (!href) throw new Error(`No PDF link found in page: ${htmlUrl}`);
  return new URL(href, htmlUrl).href;
}

async function resolveContext() {
  const historyHtml = await fetchText(ENTRY_URL);
  const indexUrl = parseCurrentIndexUrl(historyHtml);
  const indexHtml = await fetchText(indexUrl);
  const menuUrl = parseMenuUrl(indexHtml, indexUrl);
  const menuHtml = await fetchText(menuUrl);
  const effectiveDate = parseEffectiveDate(indexUrl);
  log("Resolved issue URL:", indexUrl);
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
    const pdfUrl = await resolveDirectPdfFromHtml(row.htmlUrl);
    mkdirSync(OUT_GEN, { recursive: true });
    await downloadPdf(pdfUrl, join(OUT_GEN, `${dateTag}_${row.section}.pdf`));
    return;
  }

  if (downloadAd2Icao) {
    const row = ad2Entries.find((x) => x.icao === downloadAd2Icao);
    if (!row) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    const pdfUrl = await resolveDirectPdfFromHtml(row.htmlUrl);
    mkdirSync(OUT_AD2, { recursive: true });
    await downloadPdf(pdfUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`));
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      const row = genEntries.find((x) => x.section === "GEN-1.2") ?? genEntries[0];
      if (!row) throw new Error("GEN entries not found.");
      const pdfUrl = await resolveDirectPdfFromHtml(row.htmlUrl);
      mkdirSync(OUT_GEN, { recursive: true });
      await downloadPdf(pdfUrl, join(OUT_GEN, `${dateTag}_${row.section}.pdf`));
      return;
    }
    if (mode === "2") {
      ad2Entries.forEach((x, i) => console.error(`${String(i + 1).padStart(3)}. ${x.icao}  ${x.label}`));
      const raw = (await rl.question(`\nAirport number 1-${ad2Entries.length} or ICAO: `)).trim().toUpperCase();
      const n = Number.parseInt(raw, 10);
      const row =
        String(n) === raw && n >= 1 && n <= ad2Entries.length
          ? ad2Entries[n - 1]
          : ad2Entries.find((x) => x.icao === raw);
      if (!row) throw new Error("Invalid selection.");
      const pdfUrl = await resolveDirectPdfFromHtml(row.htmlUrl);
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
