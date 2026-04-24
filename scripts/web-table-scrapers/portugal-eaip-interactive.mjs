#!/usr/bin/env node
/**
 * Interactive Portugal eAIP downloader.
 *
 * Source:
 * - https://aim.nav.pt/Html/IndexAeronauticalInformation
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "portugal-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "portugal-eaip", "AD2");
const ENTRY_URL = "https://ais.nav.pt/wp-content/uploads/AIS_Files/eAIP_Current/eAIP_Online/eAIP/html/index.html";
const UA = "Mozilla/5.0 (compatible; clearway-portugal-eaip/1.0)";
const log = (...args) => console.error("[PORTUGAL]", ...args);

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

function stripHtml(v) {
  return String(v || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEffectiveDateFromHeader(value) {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function detectDateFromPdf(url) {
  try {
    const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA } });
    const lm = res.headers.get("last-modified");
    return parseEffectiveDateFromHeader(lm);
  } catch {
    return null;
  }
}

function parseAd2Entries(menuHtml, menuUrl) {
  const byIcao = new Map();
  for (const m of String(menuHtml || "").matchAll(/href=['"]([^"']*LP-AD-2\.([A-Z0-9]{4})-en-GB\.html(?:#[^"']*)?)['"][^>]*>([\s\S]*?)<\/a>/gi)) {
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

function gen12PdfUrl(eaipRoot) {
  return new URL("pdf/LP_GEN_1_2_en.pdf", eaipRoot).href;
}

function ad2PdfUrl(eaipRoot, icao) {
  return new URL(`pdf/LP_AD_2_${icao}_en.pdf`, eaipRoot).href;
}

async function resolveContext() {
  await fetchText(ENTRY_URL);
  const eaipRoot = new URL("../", ENTRY_URL).href;
  const menuUrl = new URL("html/eAIP/LP-menu-en-GB.html", eaipRoot).href;
  const menuHtml = await fetchText(menuUrl);
  const ad2Entries = parseAd2Entries(menuHtml, menuUrl);
  const genUrl = gen12PdfUrl(eaipRoot);
  const effectiveDate = (await detectDateFromPdf(genUrl)) || null;
  log("Resolved eAIP root:", eaipRoot);
  log("Resolved menu URL:", menuUrl);
  if (effectiveDate) log("Effective date:", effectiveDate);
  log("AD2 entries found:", ad2Entries.length);
  if (!ad2Entries.length) throw new Error("No AD2 entries found in Portugal menu.");
  return { eaipRoot, effectiveDate, genUrl, menuUrl, ad2Entries };
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
    await downloadPdf(ctx.genUrl, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`), ctx.menuUrl);
    return;
  }

  if (downloadAd2Icao) {
    const row = ctx.ad2Entries.find((x) => x.icao === downloadAd2Icao);
    if (!row) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    await downloadPdf(ad2PdfUrl(ctx.eaipRoot, row.icao), join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`), row.htmlUrl);
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      mkdirSync(OUT_GEN, { recursive: true });
      await downloadPdf(ctx.genUrl, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`), ctx.menuUrl);
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
      await downloadPdf(ad2PdfUrl(ctx.eaipRoot, row.icao), join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`), row.htmlUrl);
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});
