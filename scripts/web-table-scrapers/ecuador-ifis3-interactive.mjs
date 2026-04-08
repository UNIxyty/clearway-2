#!/usr/bin/env node
/**
 * Interactive Ecuador IFIS3 AIP downloader.
 *
 * IFIS3 AIP nodes are mostly HTML content pages under /ifis3/aip/*.
 * This script navigates the left-nav structure and renders selected
 * GEN/AD2 pages to PDF with Playwright.
 *
 * Usage:
 *   node scripts/web-table-scrapers/ecuador-ifis3-interactive.mjs
 *   node scripts/web-table-scrapers/ecuador-ifis3-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/ecuador-ifis3-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output, stderr } from "node:process";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "ecuador-ifis3", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "ecuador-ifis3", "AD2");

const IFIS_URL = "https://www.ais.aviacioncivil.gob.ec/ifis3/";
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

function normalizeRelativeHref(href) {
  const clean = String(href || "").trim().replace(/\\/g, "/");
  const [pathAndQuery, hashPart] = clean.split("#", 2);
  const [rawPath, rawQuery] = pathAndQuery.split("?", 2);
  const encodedPath = rawPath
    .split("/")
    .map((part) => {
      try {
        return encodeURIComponent(decodeURIComponent(part));
      } catch {
        return encodeURIComponent(part);
      }
    })
    .join("/");
  return `${encodedPath}${rawQuery ? `?${rawQuery}` : ""}${hashPart ? `#${hashPart}` : ""}`;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-ec-scraper/1.0)" },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseGenEntries(html) {
  const bySection = new Map();
  const re = /<a[^>]*href=["']([^"']*\/ifis3\/aip\/GEN%20\d(?:\.\d+)?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const label = stripHtml(m[2]);
    const sec = decodeURIComponent(href).match(/GEN\s+(\d(?:\.\d+)?)/i)?.[1];
    if (!sec) continue;
    const section = `GEN ${sec}`;
    if (!bySection.has(section)) {
      bySection.set(section, {
        section,
        label: label || section,
        pageUrl: new URL(normalizeRelativeHref(href), IFIS_URL).href,
      });
    }
  }
  return [...bySection.values()].sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2Entries(html) {
  const byIcao = new Map();
  const re = /<a[^>]*href=["']([^"']*\/ifis3\/aip\/AD%202%20([A-Z]{4})[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const icao = m[2].toUpperCase();
    const label = stripHtml(m[3]) || icao;
    if (!byIcao.has(icao)) {
      byIcao.set(icao, {
        icao,
        label,
        pageUrl: new URL(normalizeRelativeHref(href), IFIS_URL).href,
      });
    }
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

async function renderPageToPdf(page, pageUrl, outFile) {
  await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await page.pdf({
    path: outFile,
    format: "A4",
    printBackground: true,
    margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" },
  });
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
    console.log("Usage: node scripts/web-table-scrapers/ecuador-ifis3-interactive.mjs [--insecure] [--collect]");
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[EC] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const html = await fetchText(IFIS_URL);
      const ad2Entries = parseAd2Entries(html);
      if (!ad2Entries.length) throw new Error("No AD2 entries found.");
      printCollectJson({ effectiveDate: null, ad2Icaos: ad2Entries.map((e) => e.icao) });
    } catch (err) {
      console.error("[EC] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  let browser = null;
  try {
    console.error("Ecuador IFIS3 AIP — interactive downloader\n");
    const html = await fetchText(IFIS_URL);

    const genEntries = parseGenEntries(html);
    const ad2Entries = parseAd2Entries(html);
    if (!genEntries.length) throw new Error("No GEN entries found.");
    if (!ad2Entries.length) throw new Error("No AD2 entries found.");

    rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });

    const mode = (await rl.question("Download:\n  [1] GEN section (render to PDF)\n  [2] AD 2 airport page (render to PDF)\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;

    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    if (mode === "1") {
      genEntries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.section}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nSection number 1-${genEntries.length}: `, genEntries, (e) => `${e.section} ${e.label}`);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${chosen.section}.pdf`));
      await renderPageToPdf(page, chosen.pageUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (mode === "2") {
      ad2Entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.icao}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nAirport number 1-${ad2Entries.length} or ICAO: `, ad2Entries, (e) => `${e.icao} ${e.label}`);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${chosen.icao}_AD2.pdf`));
      await renderPageToPdf(page, chosen.pageUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }
  } finally {
    rl?.close();
    await browser?.close();
  }
}

main().catch((err) => {
  console.error("[EC] failed:", err?.message || err);
  process.exit(1);
});
