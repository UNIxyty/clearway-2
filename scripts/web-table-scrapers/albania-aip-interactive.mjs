#!/usr/bin/env node
/**
 * Interactive Albania AIP downloader.
 *
 * Source:
 * - https://www.albcontrol.al/aip/
 *
 * Usage:
 *   node scripts/web-table-scrapers/albania-aip-interactive.mjs
 *   node scripts/web-table-scrapers/albania-aip-interactive.mjs --collect
 *   node scripts/web-table-scrapers/albania-aip-interactive.mjs --download-gen12
 *   node scripts/web-table-scrapers/albania-aip-interactive.mjs --download-ad2 LATI
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "albania-aip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "albania-aip", "AD2");
const ENTRY_URL = "https://www.albcontrol.al/aip/";
const UA = "Mozilla/5.0 (compatible; clearway-albania-aip/1.0)";
const FETCH_TIMEOUT_MS = 30_000;

const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

function monthToNumber(m) {
  const map = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
  return map[String(m || "").slice(0, 3).toUpperCase()] || null;
}

function parseDateTextToIso(raw) {
  const m = String(raw || "").match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (!m) return null;
  const dd = String(m[1]).padStart(2, "0");
  const mm = monthToNumber(m[2]);
  if (!mm) return null;
  return `${m[3]}-${mm}-${dd}`;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseCurrentIssue(rootHtml) {
  const rx = /(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})[\s\S]*?href=["']([^"']*AIRAC\/html\/?)["'][\s\S]*?Current\s+Version/i;
  const m = String(rootHtml || "").match(rx);
  if (m) return { effectiveDate: parseDateTextToIso(m[1]), issueUrl: m[2] };
  const fallbackHref = String(rootHtml || "").match(/href=["']([^"']*AIRAC\/html\/?)["']/i)?.[1] || "";
  return { effectiveDate: null, issueUrl: fallbackHref };
}

function parseMenuUrl(indexHtml, issueUrl) {
  const src = String(indexHtml || "").match(/<frame[^>]*name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i)?.[1] ||
    String(indexHtml || "").match(/src=["']([^"']*LA-menu[^"']+\.html)["']/i)?.[1];
  if (!src) throw new Error("Could not resolve Albania eAIP menu URL.");
  return new URL(src, issueUrl).href;
}

function parseGenEntries(menuHtml, menuUrl) {
  const out = [];
  const seen = new Set();
  for (const m of String(menuHtml || "").matchAll(/href=["']([^"']*LA-GEN-[^"']+\.html(?:#[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1];
    const label = String(m[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const section = href.match(/LA-GEN-([0-9.]+)/i)?.[1];
    if (!section) continue;
    const key = `GEN-${section}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ section: key, label: label || key, htmlUrl: new URL(href, menuUrl).href });
  }
  return out.sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2Entries(menuHtml, menuUrl) {
  const out = [];
  const byIcao = new Map();
  for (const m of String(menuHtml || "").matchAll(/href=["']([^"']*AD-2\.([A-Z0-9]{4})[^"']*\.html(?:#[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const icao = m[2].toUpperCase();
    if (byIcao.has(icao)) continue;
    const href = m[1];
    const label = String(m[3] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    byIcao.set(icao, { icao, label: label || icao, htmlUrl: new URL(href, menuUrl).href });
  }
  for (const v of byIcao.values()) out.push(v);
  return out.sort((a, b) => a.icao.localeCompare(b.icao));
}

function pdfCandidatesFromHtmlUrl(htmlUrl) {
  const clean = String(htmlUrl || "").replace(/#.*$/, "");
  const candidates = [
    clean.replace("/html/eAIP/", "/pdf/").replace(".html", ".pdf"),
    clean.replace("/html/", "/pdf/").replace(".html", ".pdf"),
    clean.replace("-en-GB", "").replace("/html/eAIP/", "/pdf/").replace(".html", ".pdf"),
    clean.replace("-en-GB", "").replace("/html/", "/pdf/").replace(".html", ".pdf"),
  ];
  return [...new Set(candidates)];
}

async function downloadPdfWithFallback(htmlUrl, outFile) {
  let lastErr = null;
  for (const u of pdfCandidatesFromHtmlUrl(htmlUrl)) {
    try {
      const res = await fetch(u, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("not a PDF");
      writeFileSync(outFile, bytes);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(htmlUrl, { waitUntil: "networkidle", timeout: 120_000 });
    await page.pdf({ path: outFile, format: "A4", printBackground: true });
  } catch (e) {
    throw lastErr || e;
  } finally {
    await browser.close();
  }
}

async function resolveContext() {
  const rootHtml = await fetchText(ENTRY_URL);
  const current = parseCurrentIssue(rootHtml);
  if (!current.issueUrl) throw new Error("Could not resolve current Albania issue URL.");
  const issueUrl = new URL(current.issueUrl, ENTRY_URL).href;
  const indexHtml = await fetchText(issueUrl);
  const menuUrl = parseMenuUrl(indexHtml, issueUrl);
  const menuHtml = await fetchText(menuUrl);
  return { effectiveDate: current.effectiveDate, menuUrl, menuHtml };
}

async function main() {
  if (collectMode()) {
    const ctx = await resolveContext();
    const ad2 = parseAd2Entries(ctx.menuHtml, ctx.menuUrl).map((x) => x.icao);
    printCollectJson({ effectiveDate: ctx.effectiveDate, ad2Icaos: ad2 });
    return;
  }

  const ctx = await resolveContext();
  const genEntries = parseGenEntries(ctx.menuHtml, ctx.menuUrl);
  const ad2Entries = parseAd2Entries(ctx.menuHtml, ctx.menuUrl);
  const dateTag = ctx.effectiveDate || "unknown-date";

  if (downloadGen12) {
    const row = genEntries.find((x) => /\bGEN-1\.2\b/i.test(x.section)) ?? genEntries[0];
    if (!row) throw new Error("GEN entries not found.");
    mkdirSync(OUT_GEN, { recursive: true });
    await downloadPdfWithFallback(row.htmlUrl, join(OUT_GEN, `${dateTag}_${row.section}.pdf`));
    return;
  }

  if (downloadAd2Icao) {
    const row = ad2Entries.find((x) => x.icao === downloadAd2Icao);
    if (!row) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    await downloadPdfWithFallback(row.htmlUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`));
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      const row = genEntries.find((x) => /\bGEN-1\.2\b/i.test(x.section)) ?? genEntries[0];
      mkdirSync(OUT_GEN, { recursive: true });
      await downloadPdfWithFallback(row.htmlUrl, join(OUT_GEN, `${dateTag}_${row.section}.pdf`));
      return;
    }
    if (mode === "2") {
      ad2Entries.forEach((x, i) => console.error(`${String(i + 1).padStart(3)}. ${x.icao}  ${x.label}`));
      const raw = (await rl.question(`\nAirport number 1-${ad2Entries.length} or ICAO: `)).trim().toUpperCase();
      const n = Number.parseInt(raw, 10);
      const row = (String(n) === raw && n >= 1 && n <= ad2Entries.length) ? ad2Entries[n - 1] : ad2Entries.find((x) => x.icao === raw);
      if (!row) throw new Error("Invalid selection.");
      mkdirSync(OUT_AD2, { recursive: true });
      await downloadPdfWithFallback(row.htmlUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`));
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("[ALBANIA] failed:", err?.message || err);
  process.exit(1);
});
