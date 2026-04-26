#!/usr/bin/env node
/**
 * Interactive Slovakia eAIP downloader.
 *
 * Source:
 * - https://aim.lps.sk/web/index.php?fn=200&lng=en
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "slovakia-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "slovakia-eaip", "AD2");
const ENTRY_URL = "https://aim.lps.sk/web/index.php?fn=200&lng=en";
const UA = "Mozilla/5.0 (compatible; clearway-slovakia-eaip/1.0)";
const log = (...args) => console.error("[SLOVAKIA]", ...args);

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

function parseFramesetUrls(entryHtml) {
  const links = [...String(entryHtml || "").matchAll(/href=['"](https:\/\/aim\.lps\.sk\/web\/eAIP_SR\/AIP_SR_EFF_[^"'\/]+\/html\/LZ-frameset-en-SK\.html)['"]/gi)].map(
    (m) => m[1],
  );
  if (!links.length) throw new Error("Could not resolve Slovakia frameset URL.");
  links.sort();
  return links;
}

function parseEffectiveDateFromFramesetUrl(framesetUrl) {
  const m = String(framesetUrl || "").match(/AIP_SR_EFF_(\d{2})([A-Z]{3})(\d{4})/i);
  if (!m) return null;
  const months = {
    JAN: "01",
    FEB: "02",
    MAR: "03",
    APR: "04",
    MAY: "05",
    JUN: "06",
    JUL: "07",
    AUG: "08",
    SEP: "09",
    OCT: "10",
    NOV: "11",
    DEC: "12",
  };
  const mm = months[m[2].toUpperCase()];
  if (!mm) return null;
  return `${m[3]}-${mm}-${m[1]}`;
}

function parseMenuUrl(framesetHtml, framesetUrl) {
  const src =
    String(framesetHtml || "").match(/<frame[^>]*name=['"]eAIPNavigation['"][^>]*src=['"]([^'"]+)['"]/i)?.[1] || "";
  if (!src) throw new Error("Could not resolve Slovakia menu URL.");
  return new URL(src, framesetUrl).href;
}

function parseGen12HtmlUrl(menuHtml, menuUrl) {
  const href = String(menuHtml || "").match(/href=['"]([^'"]*LZ-GEN-1\.2-en-SK\.html#[^'"]*)['"]/i)?.[1] || "";
  if (!href) throw new Error("Could not resolve Slovakia GEN 1.2 HTML URL.");
  return new URL(href, menuUrl).href;
}

function parseAd2Entries(menuHtml, menuUrl) {
  const byIcao = new Map();
  for (const m of String(menuHtml || "").matchAll(/href=['"]([^'"]*LZ-AD-2\.([A-Z0-9]{4})-en-SK\.html#[^'"]*)['"]/gi)) {
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

async function resolvePdfFromHtmlPage(htmlUrl) {
  const page = await fetchText(htmlUrl);
  const href = String(page || "").match(/href=['"]([^'"]*\.pdf[^'"]*)['"]/i)?.[1] || "";
  if (!href) throw new Error(`No PDF link found in page: ${htmlUrl}`);
  return new URL(href, htmlUrl).href;
}

async function resolveContext() {
  const entryHtml = await fetchText(ENTRY_URL);
  const framesets = parseFramesetUrls(entryHtml);
  const framesetUrl = framesets[framesets.length - 1];
  const framesetHtml = await fetchText(framesetUrl);
  const menuUrl = parseMenuUrl(framesetHtml, framesetUrl);
  const menuHtml = await fetchText(menuUrl);
  const genHtmlUrl = parseGen12HtmlUrl(menuHtml, menuUrl);
  const ad2Entries = parseAd2Entries(menuHtml, menuUrl);
  const effectiveDate = parseEffectiveDateFromFramesetUrl(framesetUrl);
  log("Resolved frameset URL:", framesetUrl);
  log("Resolved menu URL:", menuUrl);
  if (effectiveDate) log("Effective date:", effectiveDate);
  log("AD2 entries found:", ad2Entries.length);
  if (!ad2Entries.length) throw new Error("No AD2 entries found in Slovakia menu.");
  return { framesetUrl, menuUrl, effectiveDate, genHtmlUrl, ad2Entries };
}

async function main() {
  const ctx = await resolveContext();
  const dateTag = ctx.effectiveDate || "unknown-date";

  if (collectMode()) {
    printCollectJson({ effectiveDate: ctx.effectiveDate, ad2Icaos: ctx.ad2Entries.map((x) => x.icao) });
    return;
  }

  if (downloadGen12) {
    mkdirSync(OUT_GEN, { recursive: true });
    const pdfUrl = await resolvePdfFromHtmlPage(ctx.genHtmlUrl);
    await downloadPdf(pdfUrl, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`), ctx.genHtmlUrl);
    return;
  }

  if (downloadAd2Icao) {
    const row = ctx.ad2Entries.find((x) => x.icao === downloadAd2Icao);
    if (!row) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    const pdfUrl = await resolvePdfFromHtmlPage(row.htmlUrl);
    await downloadPdf(pdfUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`), row.htmlUrl);
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      mkdirSync(OUT_GEN, { recursive: true });
      const pdfUrl = await resolvePdfFromHtmlPage(ctx.genHtmlUrl);
      await downloadPdf(pdfUrl, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`), ctx.genHtmlUrl);
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
      const pdfUrl = await resolvePdfFromHtmlPage(row.htmlUrl);
      await downloadPdf(pdfUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`), row.htmlUrl);
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});
