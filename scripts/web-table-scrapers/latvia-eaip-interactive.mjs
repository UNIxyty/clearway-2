#!/usr/bin/env node
/**
 * Interactive Latvia eAIP downloader.
 *
 * Source:
 * - https://ais.lgs.lv/aiseaip
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "latvia-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "latvia-eaip", "AD2");
const ENTRY_URL = "https://ais.lgs.lv/aiseaip";
const UA = "Mozilla/5.0 (compatible; clearway-latvia-eaip/1.0)";
const FETCH_TIMEOUT_MS = 45_000;
const log = (...args) => console.error("[LATVIA]", ...args);

const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url) {
  log("Fetching HTML:", url);
  let lastErr = null;
  for (let i = 1; i <= 3; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (i < 3) await sleep(i * 500);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error(`Failed to fetch ${url}`);
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

function parseIssueIndexUrl(entryHtml) {
  const links = [...String(entryHtml || "").matchAll(/href=['"]([^'"]*eAIPfiles\/[^'"]*\/data\/\d{4}-\d{2}-\d{2}\/html\/index\.html)\s*['"]/gi)]
    .map((m) => String(m[1]).replace(/\\/g, "/").trim())
    .map((href) => new URL(href, ENTRY_URL).href);
  if (!links.length) throw new Error("Could not resolve Latvia issue URL.");
  links.sort();
  return links[links.length - 1];
}

function parseEffectiveDate(issueIndexUrl) {
  const m = String(issueIndexUrl || "").match(/\/data\/(\d{4}-\d{2}-\d{2})\/html\/index\.html/i);
  return m ? m[1] : null;
}

function parseMenuUrl(indexHtml, indexUrl) {
  const src = String(indexHtml || "").match(/<frame[^>]*name=['"]eAISNavigation['"][^>]*src=['"]([^'"]+)['"]/i)?.[1] || "";
  if (!src) throw new Error("Could not resolve Latvia menu frame URL.");
  return new URL(src, indexUrl).href;
}

function parseAd2Entries(menuHtml, menuUrl) {
  const byIcao = new Map();
  for (const m of String(menuHtml || "").matchAll(/href=['"]([^'"]*EV-AD-2\.([A-Z0-9]{4})-en-GB\.html#[^'"]*)['"]/gi)) {
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

function gen12PdfUrl(issueIndexUrl) {
  return new URL("../pdf/EV_GEN_1_2_en.pdf", issueIndexUrl).href;
}

function ad2PdfUrl(issueIndexUrl, icao) {
  return new URL(`../pdf/EV_AD_2_${icao}_en.pdf`, issueIndexUrl).href;
}

async function resolveContext() {
  const entryHtml = await fetchText(ENTRY_URL);
  const issueIndexUrl = parseIssueIndexUrl(entryHtml);
  const indexHtml = await fetchText(issueIndexUrl);
  const menuUrl = parseMenuUrl(indexHtml, issueIndexUrl);
  const menuHtml = await fetchText(menuUrl);
  const ad2Entries = parseAd2Entries(menuHtml, menuUrl);
  const effectiveDate = parseEffectiveDate(issueIndexUrl);
  log("Resolved issue URL:", issueIndexUrl);
  log("Resolved menu URL:", menuUrl);
  if (effectiveDate) log("Effective date:", effectiveDate);
  log("AD2 entries found:", ad2Entries.length);
  if (!ad2Entries.length) throw new Error("No AD2 entries found in Latvia menu.");
  return {
    issueIndexUrl,
    menuUrl,
    effectiveDate,
    ad2Entries,
  };
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
    await downloadPdf(gen12PdfUrl(ctx.issueIndexUrl), join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`), ctx.menuUrl);
    return;
  }

  if (downloadAd2Icao) {
    const row = ctx.ad2Entries.find((x) => x.icao === downloadAd2Icao);
    if (!row) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    await downloadPdf(ad2PdfUrl(ctx.issueIndexUrl, row.icao), join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`), row.htmlUrl);
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      mkdirSync(OUT_GEN, { recursive: true });
      await downloadPdf(gen12PdfUrl(ctx.issueIndexUrl), join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`), ctx.menuUrl);
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
      await downloadPdf(ad2PdfUrl(ctx.issueIndexUrl, row.icao), join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`), row.htmlUrl);
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});
