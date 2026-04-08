#!/usr/bin/env node
/**
 * Interactive Japan AIP downloader (ICAO "full" PDFs only).
 *
 * Source:
 *   https://nagodede.github.io/aip/japan/
 *
 * Usage:
 *   node scripts/web-table-scrapers/japan-aip-interactive.mjs
 *   node scripts/web-table-scrapers/japan-aip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/japan-aip-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stderr } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_FULL = join(PROJECT_ROOT, "downloads", "japan-aip", "FULL");

const JAPAN_AIP_URL = "https://nagodede.github.io/aip/japan/";
const FETCH_TIMEOUT_MS = 30_000;

function safeFilename(name) {
  return String(name || "")
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "_");
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-japan-scraper/1.0)" },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseJapanFullEntries(html) {
  const out = [];
  const matches = [...html.matchAll(/href\s*=\s*["']?([^"'\s>]*\/documents\/([A-Z]{4})_full\.pdf)["']?/gi)];
  for (const m of matches) {
    out.push({
      icao: m[2].toUpperCase(),
      pdfUrl: new URL(m[1], JAPAN_AIP_URL).href,
    });
  }
  const dedup = new Map();
  for (const e of out) {
    if (!dedup.has(e.icao)) dedup.set(e.icao, e);
  }
  return [...dedup.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-japan-scraper/1.0)" },
  });
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  writeFileSync(outFile, bytes);
}

async function pickFromList(rl, prompt, items, display) {
  for (;;) {
    const raw = (await rl.question(prompt)).trim().toUpperCase();
    if (raw === "0" || raw === "Q" || raw === "QUIT") return null;
    const n = Number.parseInt(raw, 10);
    if (String(n) === raw && n >= 1 && n <= items.length) return items[n - 1];
    if (raw) {
      const found = items.filter((x) => display(x).toUpperCase().includes(raw));
      if (found.length === 1) return found[0];
    }
    console.error("Invalid selection. Type number, ICAO, or 0 to quit.");
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Usage: node scripts/web-table-scrapers/japan-aip-interactive.mjs [--insecure] [--collect]

Interactive flow:
  [1] Load ICAO list from Japan AIP page
  [2] Pick ICAO (full PDF only)
  [3] Download PDF
`);
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[JP] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const html = await fetchText(JAPAN_AIP_URL);
      const entries = parseJapanFullEntries(html);
      if (!entries.length) throw new Error("No ICAO full-PDF entries found.");
      printCollectJson({ effectiveDate: null, ad2Icaos: entries.map((e) => e.icao) });
    } catch (err) {
      console.error("[JP] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("Japan AIP — interactive full-PDF downloader\n");
    console.error(`Source page: ${JAPAN_AIP_URL}\n`);

    const html = await fetchText(JAPAN_AIP_URL);
    const entries = parseJapanFullEntries(html);
    if (!entries.length) throw new Error("No ICAO full-PDF entries found.");

    console.error(`Found ${entries.length} ICAO entries.\n`);
    entries.forEach((e, i) => {
      if (i < 120) console.error(`${String(i + 1).padStart(3)}. ${e.icao}`);
    });
    if (entries.length > 120) console.error(`... and ${entries.length - 120} more`);

    rl = readline.createInterface({ input, output: stderr, terminal: Boolean(input.isTTY) });
    const chosen = await pickFromList(rl, `\nPick ICAO number 1-${entries.length} or ICAO (0 to quit): `, entries, (e) => e.icao);
    if (!chosen) return;

    mkdirSync(OUT_FULL, { recursive: true });
    const outFile = join(OUT_FULL, safeFilename(`${chosen.icao}_full.pdf`));
    console.error(`\nDownloading ${chosen.icao} full PDF...`);
    console.error(`URL: ${chosen.pdfUrl}`);
    await downloadPdf(chosen.pdfUrl, outFile);
    console.error(`\nSaved: ${outFile}`);
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error("[JP] failed:", err?.message || err);
  process.exit(1);
});
