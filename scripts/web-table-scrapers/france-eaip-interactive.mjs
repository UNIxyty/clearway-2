#!/usr/bin/env node
/**
 * Interactive France eAIP downloader.
 *
 * Source:
 * - https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_16_APR_2026/FRANCE/home.html
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "france-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "france-eaip", "AD2");
const ENTRY_URL = "https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_16_APR_2026/FRANCE/home.html";
const UA = "Mozilla/5.0 (compatible; clearway-france-eaip/1.0)";
const log = (...args) => console.error("[FRANCE]", ...args);

const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

async function fetchText(url) {
  log("Fetching HTML:", url);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
}

async function downloadPdf(url, outFile, referer = "") {
  log("Downloading PDF:", url);
  const res = await fetch(url, { headers: { "User-Agent": UA, ...(referer ? { Referer: referer } : {}) } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
  writeFileSync(outFile, bytes);
  log("Saved PDF:", outFile);
}

function parseIssueDate(homeHtml) {
  const m = String(homeHtml || "").match(/init\(['"][^'"]+['"],['"](20\d{2})['"],['"](\d{2})['"],['"](\d{2})['"]/i);
  if (!m) throw new Error("Could not resolve France current AIRAC date.");
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function buildIssueRoot(issueDate) {
  return new URL(`AIRAC-${issueDate}/`, ENTRY_URL).href;
}

function parseMenuUrl(indexHtml, indexUrl) {
  const toc = String(indexHtml || "").match(/<frame[^>]*name=['"]eAISNavigationBase['"][^>]*src=['"]([^'"]+)['"]/i)?.[1] || "";
  if (!toc) throw new Error("Could not resolve France TOC frameset URL.");
  const tocUrl = new URL(toc, indexUrl).href;
  return { tocUrl };
}

function parseMenuFromToc(tocHtml, tocUrl) {
  const menu = String(tocHtml || "").match(/<frame[^>]*name=['"]eAISNavigation['"][^>]*src=['"]([^'"]+)['"]/i)?.[1] || "";
  if (!menu) throw new Error("Could not resolve France menu URL.");
  return new URL(menu, tocUrl).href;
}

function parseAd2Entries(menuHtml, menuUrl, issueRoot) {
  const byIcao = new Map();
  for (const m of String(menuHtml || "").matchAll(/href=['"]([^'"]*FR-AD-2\.([A-Z0-9]{4})-fr-FR\.html#[^'"]*)['"]/gi)) {
    const icao = m[2].toUpperCase();
    if (byIcao.has(icao)) continue;
    byIcao.set(icao, {
      icao,
      label: icao,
      htmlUrl: new URL(m[1], menuUrl).href,
      pdfUrl: new URL(`pdf/FR-AD-2.${icao}-fr-FR.pdf`, issueRoot).href,
    });
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

async function resolveContext() {
  const homeHtml = await fetchText(ENTRY_URL);
  const issueDate = parseIssueDate(homeHtml);
  const issueRoot = buildIssueRoot(issueDate);
  const indexUrl = new URL("html/index-fr-FR.html", issueRoot).href;
  const indexHtml = await fetchText(indexUrl);
  const { tocUrl } = parseMenuUrl(indexHtml, indexUrl);
  const tocHtml = await fetchText(tocUrl);
  const menuUrl = parseMenuFromToc(tocHtml, tocUrl);
  const menuHtml = await fetchText(menuUrl);
  const ad2Entries = parseAd2Entries(menuHtml, menuUrl, issueRoot);
  const genPdfUrl = new URL("pdf/FR-GEN-1.2-fr-FR.pdf", issueRoot).href;
  const genHtmlUrl = new URL("html/eAIP/FR-GEN-1.2-fr-FR.html#GEN-1.2", issueRoot).href;
  log("Resolved issue URL:", indexUrl);
  log("Resolved menu URL:", menuUrl);
  log("Effective date:", issueDate);
  log("AD2 entries found:", ad2Entries.length);
  if (!ad2Entries.length) throw new Error("No AD2 entries found in France menu.");
  return {
    issueDate,
    issueRoot,
    indexUrl,
    menuUrl,
    genPdfUrl,
    genHtmlUrl,
    ad2Entries,
  };
}

async function main() {
  const ctx = await resolveContext();
  const dateTag = ctx.issueDate || "unknown-date";

  if (collectMode()) {
    printCollectJson({ effectiveDate: ctx.issueDate, ad2Icaos: ctx.ad2Entries.map((x) => x.icao) });
    return;
  }

  if (downloadGen12) {
    mkdirSync(OUT_GEN, { recursive: true });
    await downloadPdf(ctx.genPdfUrl, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`), ctx.genHtmlUrl);
    return;
  }

  if (downloadAd2Icao) {
    const row = ctx.ad2Entries.find((x) => x.icao === downloadAd2Icao);
    if (!row) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    await downloadPdf(row.pdfUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`), row.htmlUrl);
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      mkdirSync(OUT_GEN, { recursive: true });
      await downloadPdf(ctx.genPdfUrl, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`), ctx.genHtmlUrl);
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
      mkdirSync(OUT_AD2, { recursive: true });
      await downloadPdf(row.pdfUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`), row.htmlUrl);
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});
