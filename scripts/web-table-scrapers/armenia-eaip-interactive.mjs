#!/usr/bin/env node
/**
 * Interactive Armenia eAIP downloader.
 *
 * Source:
 * - https://armats.am/activities/ais/eaip
 *
 * Usage:
 *   node scripts/web-table-scrapers/armenia-eaip-interactive.mjs
 *   node scripts/web-table-scrapers/armenia-eaip-interactive.mjs --collect
 *   node scripts/web-table-scrapers/armenia-eaip-interactive.mjs --download-gen12
 *   node scripts/web-table-scrapers/armenia-eaip-interactive.mjs --download-ad2 UDYZ
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "armenia-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "armenia-eaip", "AD2");
const ENTRY_URL = "https://armats.am/activities/ais/eaip";
const UA = "Mozilla/5.0 (compatible; clearway-armenia-eaip/1.0)";
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

function parseCompactDateToIso(compact) {
  const m = String(compact || "").match(/(\d{1,2})([A-Za-z]{3})(\d{4})/);
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

function parseCurrentIssueLink(entryHtml) {
  const rx = /Currently\s+Effective[\s\S]*?href=["']([^"']*\/storage\/attachments\/[^"']+\/index\.html)["']/i;
  const m = String(entryHtml || "").match(rx);
  if (m) return m[1];
  return String(entryHtml || "").match(/href=["']([^"']*\/storage\/attachments\/[^"']+\/index\.html)["']/i)?.[1] || "";
}

function parseMenuHref(indexHtml) {
  return (
    String(indexHtml || "").match(/<frame[^>]*src\s*=\s*['"]?([^'">\s]*menu\.html)['"]?/i)?.[1] ||
    "menu.html"
  );
}

function parseAipPdfListHref(menuHtml) {
  return String(menuHtml || "").match(/href=["']([^"']*AIP\s*PDF\.htm)["']/i)?.[1] || "";
}

function parseGenEntries(aipPdfHtml, aipPdfUrl) {
  const out = [];
  const seen = new Set();
  for (const m of String(aipPdfHtml || "").matchAll(/href=["']([^"']*UD-GEN-([0-9.]+)-en-GB\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const section = `GEN-${m[2]}`;
    if (seen.has(section)) continue;
    seen.add(section);
    out.push({
      section,
      label: stripHtml(m[3]) || section,
      pdfUrl: new URL(m[1], aipPdfUrl).href,
    });
  }
  return out.sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2Entries(aipPdfHtml, aipPdfUrl) {
  const byIcao = new Map();
  for (const m of String(aipPdfHtml || "").matchAll(/href=["']([^"']*UD-AD-2\.([A-Z0-9]{4})-en-GB\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const icao = m[2].toUpperCase();
    if (byIcao.has(icao)) continue;
    byIcao.set(icao, {
      icao,
      label: stripHtml(m[3]) || icao,
      pdfUrl: new URL(m[1], aipPdfUrl).href,
    });
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
  writeFileSync(outFile, bytes);
}

async function resolveContext() {
  const entryHtml = await fetchText(ENTRY_URL);
  const issuePath = parseCurrentIssueLink(entryHtml);
  if (!issuePath) throw new Error("Could not resolve currently effective Armenia issue link.");
  const issueUrl = new URL(issuePath, ENTRY_URL).href;
  const effectiveDate = parseCompactDateToIso(issueUrl.match(/\((\d{1,2}[A-Za-z]{3}\d{4})\)/)?.[1] || "");
  const indexHtml = await fetchText(issueUrl);
  const menuUrl = new URL(parseMenuHref(indexHtml), issueUrl).href;
  const menuHtml = await fetchText(menuUrl);
  const aipPdfHref = parseAipPdfListHref(menuHtml);
  if (!aipPdfHref) throw new Error("Armenia menu does not contain AIP PDF listing link.");
  const aipPdfUrl = new URL(aipPdfHref, menuUrl).href;
  const aipPdfHtml = await fetchText(aipPdfUrl);
  return { effectiveDate, aipPdfUrl, aipPdfHtml };
}

async function main() {
  const ctx = await resolveContext();
  const genEntries = parseGenEntries(ctx.aipPdfHtml, ctx.aipPdfUrl);
  const ad2Entries = parseAd2Entries(ctx.aipPdfHtml, ctx.aipPdfUrl);
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
  console.error("[ARMENIA] failed:", err?.message || err);
  process.exit(1);
});
