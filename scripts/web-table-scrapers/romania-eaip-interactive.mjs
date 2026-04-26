#!/usr/bin/env node
/**
 * Interactive Romania eAIP downloader.
 *
 * Source:
 * - https://www.aisro.ro/
 */
import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "romania-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "romania-eaip", "AD2");
const ENTRY_URL = "https://www.aisro.ro/aip/aip.php";
const UA = "Mozilla/5.0 (compatible; clearway-romania-eaip/1.0)";
const log = (...args) => console.error("[ROMANIA]", ...args);

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

function parseIssueIndexUrl(entryHtml) {
  const href = String(entryHtml || "").match(/href=['"]([^'"]*(\d{4}-\d{2}-\d{2})\/index\.html)['"]/i);
  if (!href?.[1]) throw new Error("Could not resolve Romania issue index URL.");
  return {
    indexUrl: new URL(href[1], ENTRY_URL).href,
    effectiveDate: href[2] || null,
  };
}

function parsePdfLinks(html, baseUrl) {
  return [...String(html || "").matchAll(/href=['"]([^'"]+\.pdf[^'"]*)['"]/gi)].map((m) => new URL(m[1], baseUrl).href);
}

function parseGen12PdfUrl(genTocHtml, genTocUrl) {
  const href = String(genTocHtml || "").match(/href=['"]([^'"]*LR_GEN_1_2_en\.pdf)['"]/i)?.[1] || "";
  if (!href) throw new Error("Could not resolve Romania GEN 1.2 PDF URL.");
  return new URL(href, genTocUrl).href;
}

function parseAd2Entries(adTocHtml, adTocUrl) {
  const byIcao = new Map();
  for (const u of parsePdfLinks(adTocHtml, adTocUrl)) {
    const m = String(u).match(/LR_AD_2_([A-Z0-9]{4})_en\.pdf$/i);
    if (!m) continue;
    const icao = m[1].toUpperCase();
    if (byIcao.has(icao)) continue;
    byIcao.set(icao, { icao, label: icao, pdfUrl: u });
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

async function resolveContext() {
  const entryHtml = await fetchText(ENTRY_URL);
  const { indexUrl, effectiveDate } = parseIssueIndexUrl(entryHtml);
  const issueRoot = new URL("./", indexUrl).href;
  const genTocUrl = new URL("html/en/aip_toc_gen.html", issueRoot).href;
  const adTocUrl = new URL("html/en/aip_toc_ad.html", issueRoot).href;
  const genTocHtml = await fetchText(genTocUrl);
  const adTocHtml = await fetchText(adTocUrl);
  const genPdfUrl = parseGen12PdfUrl(genTocHtml, genTocUrl);
  const ad2Entries = parseAd2Entries(adTocHtml, adTocUrl);
  if (!ad2Entries.length) throw new Error("No AD2 entries found in Romania AD TOC.");
  log("Resolved index URL:", indexUrl);
  if (effectiveDate) log("Effective date:", effectiveDate);
  log("AD2 entries found:", ad2Entries.length);
  return { effectiveDate, indexUrl, genPdfUrl, ad2Entries };
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
    await downloadPdf(ctx.genPdfUrl, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`), ctx.indexUrl);
    return;
  }

  if (downloadAd2Icao) {
    const row = ctx.ad2Entries.find((x) => x.icao === downloadAd2Icao);
    if (!row) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    await downloadPdf(row.pdfUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`), ctx.indexUrl);
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      mkdirSync(OUT_GEN, { recursive: true });
      await downloadPdf(ctx.genPdfUrl, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`), ctx.indexUrl);
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
      await downloadPdf(row.pdfUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`), ctx.indexUrl);
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("[ROMANIA] failed:", err?.message || err);
  process.exit(1);
});

