#!/usr/bin/env node
/**
 * Interactive Austria eAIP downloader.
 *
 * Source:
 * - https://eaip.austrocontrol.at/
 *
 * Usage:
 *   node scripts/web-table-scrapers/austria-eaip-interactive.mjs
 *   node scripts/web-table-scrapers/austria-eaip-interactive.mjs --collect
 *   node scripts/web-table-scrapers/austria-eaip-interactive.mjs --download-gen12
 *   node scripts/web-table-scrapers/austria-eaip-interactive.mjs --download-ad2 LOWW
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "austria-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "austria-eaip", "AD2");
const ENTRY_URL = "https://eaip.austrocontrol.at/";
const UA = "Mozilla/5.0 (compatible; clearway-austria-eaip/1.0)";
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

function stripHtml(v) {
  return String(v || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseCurrentIssue(rootHtml) {
  const m = String(rootHtml || "").match(/(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})[\s\S]*?href=["']([^"']*\/lo\/\d+\/index\.htm)["'][\s\S]*?current version/i);
  if (!m) {
    const issue = String(rootHtml || "").match(/href=["']([^"']*\/lo\/\d+\/index\.htm)["']/i)?.[1] || "";
    return { effectiveDate: null, issueUrl: issue };
  }
  return { effectiveDate: parseDateTextToIso(m[1]), issueUrl: m[2] };
}

function parseGenEntries(genHtml, genUrl) {
  const out = [];
  const bySection = new Map();
  for (const m of String(genHtml || "").matchAll(/href=["']([^"']*LO_GEN_([0-9_]+)_en\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const section = `GEN-${String(m[2]).replace("_", ".")}`;
    if (bySection.has(section)) continue;
    bySection.set(section, {
      section,
      label: stripHtml(m[3]) || section,
      pdfUrl: new URL(m[1], genUrl).href,
    });
  }
  for (const v of bySection.values()) out.push(v);
  return out.sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2Entries(ad2Html, ad2Url) {
  const out = [];
  const byIcao = new Map();
  for (const m of String(ad2Html || "").matchAll(/href=["']([^"']*LO_AD_2_([A-Z0-9]{4})_en\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const icao = m[2].toUpperCase();
    if (byIcao.has(icao)) continue;
    byIcao.set(icao, {
      icao,
      label: stripHtml(m[3]) || icao,
      pdfUrl: new URL(m[1], ad2Url).href,
    });
  }
  for (const v of byIcao.values()) out.push(v);
  return out.sort((a, b) => a.icao.localeCompare(b.icao));
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
  writeFileSync(outFile, bytes);
}

async function resolveContext() {
  const rootHtml = await fetchText(ENTRY_URL);
  const cur = parseCurrentIssue(rootHtml);
  if (!cur.issueUrl) throw new Error("Could not resolve current Austria issue URL.");
  const issueUrl = new URL(cur.issueUrl, ENTRY_URL).href;
  const genUrl = new URL("gen_1.htm", issueUrl).href;
  const ad2Url = new URL("ad_2.htm", issueUrl).href;
  const genHtml = await fetchText(genUrl);
  const ad2Html = await fetchText(ad2Url);
  return { effectiveDate: cur.effectiveDate, genUrl, ad2Url, genHtml, ad2Html };
}

async function main() {
  const ctx = await resolveContext();
  const genEntries = parseGenEntries(ctx.genHtml, ctx.genUrl);
  const ad2Entries = parseAd2Entries(ctx.ad2Html, ctx.ad2Url);
  const dateTag = ctx.effectiveDate || "unknown-date";

  if (collectMode()) {
    printCollectJson({ effectiveDate: ctx.effectiveDate, ad2Icaos: ad2Entries.map((x) => x.icao) });
    return;
  }

  if (downloadGen12) {
    const row = genEntries.find((x) => x.section === "GEN-1.2") ?? genEntries[0];
    if (!row) throw new Error("GEN entries not found.");
    mkdirSync(OUT_GEN, { recursive: true });
    await downloadPdf(row.pdfUrl, join(OUT_GEN, `${dateTag}_${row.section}.pdf`));
    return;
  }

  if (downloadAd2Icao) {
    const row = ad2Entries.find((x) => x.icao === downloadAd2Icao);
    if (!row) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    await downloadPdf(row.pdfUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`));
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      const row = genEntries.find((x) => x.section === "GEN-1.2") ?? genEntries[0];
      mkdirSync(OUT_GEN, { recursive: true });
      await downloadPdf(row.pdfUrl, join(OUT_GEN, `${dateTag}_${row.section}.pdf`));
      return;
    }
    if (mode === "2") {
      ad2Entries.forEach((x, i) => console.error(`${String(i + 1).padStart(3)}. ${x.icao}  ${x.label}`));
      const raw = (await rl.question(`\nAirport number 1-${ad2Entries.length} or ICAO: `)).trim().toUpperCase();
      const n = Number.parseInt(raw, 10);
      const row = (String(n) === raw && n >= 1 && n <= ad2Entries.length) ? ad2Entries[n - 1] : ad2Entries.find((x) => x.icao === raw);
      if (!row) throw new Error("Invalid selection.");
      mkdirSync(OUT_AD2, { recursive: true });
      await downloadPdf(row.pdfUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`));
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("[AUSTRIA] failed:", err?.message || err);
  process.exit(1);
});
