#!/usr/bin/env node
/**
 * Interactive Iceland eAIP downloader.
 *
 * Source:
 * - https://eaip.isavia.is/
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "iceland-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "iceland-eaip", "AD2");
const ENTRY_URL = "https://eaip.isavia.is/";
const UA = "Mozilla/5.0 (compatible; clearway-iceland-eaip/1.0)";
const log = (...args) => console.error("[ICELAND]", ...args);

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

function parseIssueRoot(entryHtml) {
  const links = [...String(entryHtml || "").matchAll(/href=['"](https:\/\/eaip\.isavia\.is\/A_[^"'\/]+\/?)['"]/gi)].map((m) => m[1]);
  if (!links.length) throw new Error("Could not resolve Iceland latest issue URL.");
  links.sort();
  return links[links.length - 1];
}

function parseEffectiveDate(issueRootUrl) {
  const m = String(issueRootUrl || "").match(/_(20\d{2})_(\d{2})_(\d{2})\/?$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function parseTocUrl(indexHtml, issueRootUrl) {
  const directMenu = String(indexHtml || "").match(/<frame[^>]*name=['"]eAISNavigation['"][^>]*src=['"]([^'"]+)['"]/i)?.[1] || "";
  if (directMenu) return new URL(directMenu, issueRootUrl).href;
  const toc = String(indexHtml || "").match(/<frame[^>]*name=['"]eAISNavigationBase['"][^>]*src=['"]([^'"]+)['"]/i)?.[1] || "";
  if (!toc) throw new Error("Could not resolve Iceland TOC/menu frame URL.");
  return new URL(toc, issueRootUrl).href;
}

function parseMenuUrl(tocHtml, tocUrl) {
  const src = String(tocHtml || "").match(/<frame[^>]*name=['"]eAISNavigation['"][^>]*src=['"]([^'"]+)['"]/i)?.[1] || "";
  if (!src) throw new Error("Could not resolve Iceland menu frame URL.");
  return new URL(src, tocUrl).href;
}

function parseGenHtmlUrl(menuHtml, menuUrl) {
  const href =
    String(menuHtml || "").match(/href=['"]([^'"]*BI-GEN\s*1\.2-(?:en-GB|is-IS)\.html#[^'"]*)['"]/i)?.[1] || "";
  if (!href) throw new Error("Could not resolve Iceland GEN 1.2 HTML entry.");
  return new URL(href, menuUrl).href;
}

function parseAd2Entries(menuHtml, menuUrl) {
  const byIcao = new Map();
  for (const m of String(menuHtml || "").matchAll(
    /href=['"]([^'"]*BI-AD\s+([A-Z0-9]{4})\s+[^'"]*?\s1-(en-GB|is-IS)\.html#[^'"]*)['"]/gi,
  )) {
    const icao = m[2].toUpperCase();
    const lang = m[3];
    const existing = byIcao.get(icao);
    if (existing && existing.lang === "en-GB") continue;
    byIcao.set(icao, {
      icao,
      label: icao,
      lang,
      htmlUrl: new URL(m[1], menuUrl).href,
    });
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

function htmlToPdfUrl(htmlUrl) {
  return String(htmlUrl || "")
    .replace(/#.*$/, "")
    .replace("/eAIP/", "/documents/PDF/")
    .replace("-is-IS", "")
    .replace("-en-GB", "")
    .replace(/\.html$/i, ".pdf");
}

async function resolveContext() {
  const entryHtml = await fetchText(ENTRY_URL);
  const issueRootUrl = parseIssueRoot(entryHtml);
  const issueIndexHtml = await fetchText(issueRootUrl);
  const tocOrMenuUrl = parseTocUrl(issueIndexHtml, issueRootUrl);
  const menuUrl = /\/menu\.html$/i.test(tocOrMenuUrl) ? tocOrMenuUrl : parseMenuUrl(await fetchText(tocOrMenuUrl), tocOrMenuUrl);
  const menuHtml = await fetchText(menuUrl);
  const genHtmlUrl = parseGenHtmlUrl(menuHtml, menuUrl);
  const ad2Entries = parseAd2Entries(menuHtml, menuUrl);
  const effectiveDate = parseEffectiveDate(issueRootUrl);
  log("Resolved issue URL:", issueRootUrl);
  log("Resolved menu URL:", menuUrl);
  if (effectiveDate) log("Effective date:", effectiveDate);
  log("AD2 entries found:", ad2Entries.length);
  if (!ad2Entries.length) throw new Error("No AD2 entries found in Iceland menu.");
  return { issueRootUrl, menuUrl, effectiveDate, genHtmlUrl, ad2Entries };
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
    await downloadPdf(htmlToPdfUrl(ctx.genHtmlUrl), join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`), ctx.genHtmlUrl);
    return;
  }

  if (downloadAd2Icao) {
    const row = ctx.ad2Entries.find((x) => x.icao === downloadAd2Icao);
    if (!row) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    await downloadPdf(htmlToPdfUrl(row.htmlUrl), join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`), row.htmlUrl);
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      mkdirSync(OUT_GEN, { recursive: true });
      await downloadPdf(htmlToPdfUrl(ctx.genHtmlUrl), join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`), ctx.genHtmlUrl);
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
      await downloadPdf(htmlToPdfUrl(row.htmlUrl), join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`), row.htmlUrl);
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});
