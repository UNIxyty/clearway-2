#!/usr/bin/env node
/**
 * Interactive United Kingdom eAIP downloader.
 *
 * Sources:
 * - https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/AIP/
 * - https://www.aurora.nats.co.uk/htmlAIP/
 */
import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "united-kingdom-aip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "united-kingdom-aip", "AD2");
const ENTRY_URL = "https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/AIP/";
const UA = "Mozilla/5.0 (compatible; clearway-united-kingdom-aip/1.0)";
const log = (...args) => console.error("[UNITED KINGDOM]", ...args);

const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Request timeout")), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url) {
  log("Fetching HTML:", url);
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, 30000);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
}

async function tryDownloadPdf(url, outFile, referer = "") {
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA, ...(referer ? { Referer: referer } : {}) } }, 180000);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
  writeFileSync(outFile, bytes);
}

function parseEntryInfo(entryHtml) {
  const issueRows = [...String(entryHtml || "").matchAll(/href=['"]([^'"]*\/Publications\/(\d{4}-\d{2}-\d{2})-AIRAC\/html\/index-en-GB\.html)['"]/gi)];
  if (!issueRows.length) throw new Error("Could not resolve UK publication issue index URL.");
  issueRows.sort((a, b) => String(b[2]).localeCompare(String(a[2])));
  const issueDate = issueRows[0][2];
  const indexUrl = new URL(issueRows[0][1], ENTRY_URL).href;
  const fullAipRows = [...String(entryHtml || "").matchAll(/href=['"]([^'"]*\/PDF_AIP\/EG-aip-en-(\d{2})-(\d{2})-(\d{4})\.pdf)['"]/gi)].map((m) => ({
    url: new URL(m[1], ENTRY_URL).href,
    isoDate: `${m[4]}-${m[3]}-${m[2]}`,
  }));
  fullAipRows.sort((a, b) => String(b.isoDate).localeCompare(String(a.isoDate)));
  return { issueDate, indexUrl, fullAipPdfUrl: fullAipRows[0]?.url || "" };
}

function parseTocUrl(indexHtml, indexUrl) {
  const src = String(indexHtml || "").match(/<frame[^>]*name=['"]eAISNavigationBase['"][^>]*src=['"]([^'"]+)['"]/i)?.[1] || "";
  if (!src) throw new Error("Could not resolve UK TOC URL.");
  return new URL(src, indexUrl).href;
}

function parseMenuUrl(tocHtml, tocUrl) {
  const src = String(tocHtml || "").match(/<frame[^>]*name=['"]eAISNavigation['"][^>]*src=['"]([^'"]+)['"]/i)?.[1] || "";
  if (!src) throw new Error("Could not resolve UK menu URL.");
  return new URL(src, tocUrl).href;
}

function parseAd2Entries(menuHtml, menuUrl) {
  const byIcao = new Map();
  for (const m of String(menuHtml || "").matchAll(/href=['"]([^'"]*EG-AD-2\.([A-Z0-9]{4})-en-GB\.html#[^'"]*)['"]/gi)) {
    const icao = m[2].toUpperCase();
    if (byIcao.has(icao)) continue;
    byIcao.set(icao, {
      icao,
      label: icao,
      htmlUrl: new URL(m[1], menuUrl).href,
    });
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

function parsePdfLinks(pageHtml, pageUrl) {
  return [...String(pageHtml || "").matchAll(/href=['"]([^'"]+\.pdf[^'"]*)['"]/gi)].map((m) => new URL(m[1], pageUrl).href);
}

async function downloadFirstWorkingPdf(candidates, outFile, referer) {
  for (const url of candidates) {
    try {
      log("Trying PDF:", url);
      if (/\/PDF_AIP\//i.test(url)) {
        log("Using full AIP fallback PDF (this can take 30-90 seconds)...");
      }
      await tryDownloadPdf(url, outFile, referer);
      log("Saved PDF:", outFile);
      return;
    } catch (err) {
      log("Skipping candidate:", url, "-", err?.message || err);
    }
  }
  throw new Error("No downloadable PDF candidate succeeded.");
}

async function resolveContext() {
  const entryHtml = await fetchText(ENTRY_URL);
  const { issueDate, indexUrl, fullAipPdfUrl } = parseEntryInfo(entryHtml);
  const indexHtml = await fetchText(indexUrl);
  const tocUrl = parseTocUrl(indexHtml, indexUrl);
  const tocHtml = await fetchText(tocUrl);
  const menuUrl = parseMenuUrl(tocHtml, tocUrl);
  const menuHtml = await fetchText(menuUrl);
  const ad2Entries = parseAd2Entries(menuHtml, menuUrl);
  if (!ad2Entries.length) throw new Error("No AD2 entries found in UK menu.");
  const issueRoot = new URL("../", indexUrl).href;
  const genHtmlUrl = new URL("eAIP/EG-GEN-1.2-en-GB.html", new URL("html/", issueRoot)).href;
  const genTextPdfUrl = new URL("../../pdf/EG-GEN-1.2.pdf", genHtmlUrl).href;
  log("Resolved index URL:", indexUrl);
  log("Resolved menu URL:", menuUrl);
  log("Effective date:", issueDate);
  log("AD2 entries found:", ad2Entries.length);
  return { issueDate, genHtmlUrl, genTextPdfUrl, fullAipPdfUrl, ad2Entries };
}

async function downloadGen12Pdf(ctx, outFile) {
  const candidates = [];
  if (ctx.genTextPdfUrl) candidates.push(ctx.genTextPdfUrl);
  if (ctx.fullAipPdfUrl) candidates.push(ctx.fullAipPdfUrl);
  if (!candidates.length) throw new Error("No UK GEN candidate PDF URLs found.");
  await downloadFirstWorkingPdf(candidates, outFile, ctx.genHtmlUrl || ENTRY_URL);
}

async function downloadAd2Pdf(row, outFile) {
  const adHtml = await fetchText(row.htmlUrl);
  const linked = parsePdfLinks(adHtml, row.htmlUrl);
  const preferred = linked.filter((u) => new RegExp(`/pdf/EG-AD-2\\.${row.icao}\\.pdf$`, "i").test(u));
  const candidates = [...preferred, ...linked.filter((u) => !preferred.includes(u))];
  if (!candidates.length) throw new Error(`No PDF links found for AD2 page: ${row.htmlUrl}`);
  await downloadFirstWorkingPdf(candidates, outFile, row.htmlUrl);
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
    await downloadGen12Pdf(ctx, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`));
    return;
  }

  if (downloadAd2Icao) {
    const row = ctx.ad2Entries.find((x) => x.icao === downloadAd2Icao);
    if (!row) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    await downloadAd2Pdf(row, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`));
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      mkdirSync(OUT_GEN, { recursive: true });
      await downloadGen12Pdf(ctx, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`));
      return;
    }
    if (mode === "2") {
      ctx.ad2Entries.forEach((row, i) => console.error(`${String(i + 1).padStart(3)}. ${row.icao}  ${row.label}`));
      const raw = (await rl.question(`\nAirport number 1-${ctx.ad2Entries.length} or ICAO: `)).trim().toUpperCase();
      const n = Number.parseInt(raw, 10);
      const row =
        String(n) === raw && n >= 1 && n <= ctx.ad2Entries.length ? ctx.ad2Entries[n - 1] : ctx.ad2Entries.find((x) => x.icao === raw);
      if (!row) throw new Error("Invalid selection.");
      mkdirSync(OUT_AD2, { recursive: true });
      await downloadAd2Pdf(row, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`));
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});

