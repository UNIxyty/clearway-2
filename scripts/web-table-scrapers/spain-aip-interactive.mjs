#!/usr/bin/env node
/**
 * Interactive Spain AIP downloader.
 *
 * Source:
 * - https://aip.enaire.es/AIP/AIP-en.html
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "spain-aip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "spain-aip", "AD2");
const ENTRY_URL = "https://aip.enaire.es/AIP/AIP-en.html";
const UA = "Mozilla/5.0 (compatible; clearway-spain-aip/1.0)";
const log = (...args) => console.error("[SPAIN]", ...args);

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

async function downloadPdf(url, outFile) {
  log("Downloading PDF:", url);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
  writeFileSync(outFile, bytes);
  log("Saved PDF:", outFile);
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

function parsePdfLinks(entryHtml) {
  return [...String(entryHtml || "").matchAll(/href=["']([^"']+\.pdf[^"']*)["']/gi)].map((m) => new URL(m[1], ENTRY_URL).href);
}

function resolveContextFromHtml(entryHtml) {
  const links = [...new Set(parsePdfLinks(entryHtml))];
  const genUrl = links.find((u) => /LE[_-]?GEN[_-]?1[_-]?2[_-]?en\.pdf/i.test(u)) || "";
  const byIcao = new Map();
  for (const u of links) {
    const m = u.match(/LE[_-]?AD[_-]?2[_-]?([A-Z0-9]{4})[_-]?en\.pdf/i);
    if (!m) continue;
    const icao = m[1].toUpperCase();
    if (!byIcao.has(icao)) byIcao.set(icao, u);
  }
  if (!genUrl) throw new Error("GEN 1.2 PDF link not found for Spain.");
  if (!byIcao.size) throw new Error("No AD2 PDFs found for Spain.");
  return {
    genUrl,
    ad2Entries: [...byIcao.entries()].map(([icao, pdfUrl]) => ({ icao, label: icao, pdfUrl })).sort((a, b) => a.icao.localeCompare(b.icao)),
  };
}

async function resolveContext() {
  const entryHtml = await fetchText(ENTRY_URL);
  const parsed = resolveContextFromHtml(entryHtml);
  const effectiveDate = (await detectDateFromPdf(parsed.genUrl)) || null;
  if (effectiveDate) log("Effective date:", effectiveDate);
  log("AD2 entries found:", parsed.ad2Entries.length);
  return { effectiveDate, ...parsed };
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
    await downloadPdf(ctx.genUrl, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`));
    return;
  }

  if (downloadAd2Icao) {
    const row = ctx.ad2Entries.find((x) => x.icao === downloadAd2Icao);
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
      mkdirSync(OUT_GEN, { recursive: true });
      await downloadPdf(ctx.genUrl, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`));
      return;
    }
    if (mode === "2") {
      ctx.ad2Entries.forEach((row, i) => console.error(`${String(i + 1).padStart(3)}. ${row.icao}  ${row.pdfUrl}`));
      const raw = (await rl.question(`\nAirport number 1-${ctx.ad2Entries.length} or ICAO: `)).trim().toUpperCase();
      const n = Number.parseInt(raw, 10);
      const row =
        String(n) === raw && n >= 1 && n <= ctx.ad2Entries.length
          ? ctx.ad2Entries[n - 1]
          : ctx.ad2Entries.find((x) => x.icao === raw);
      if (!row) throw new Error("Invalid selection.");
      mkdirSync(OUT_AD2, { recursive: true });
      await downloadPdf(row.pdfUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`));
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});
