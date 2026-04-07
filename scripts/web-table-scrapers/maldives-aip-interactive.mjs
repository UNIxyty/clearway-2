#!/usr/bin/env node
/**
 * Interactive Maldives AIP downloader.
 *
 * Source:
 * - https://www.macl.aero/corporate/services/operational/ans/aip
 *
 * Usage:
 *   node scripts/web-table-scrapers/maldives-aip-interactive.mjs
 *   node scripts/web-table-scrapers/maldives-aip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/maldives-aip-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "maldives-aip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "maldives-aip", "AD2");

const PAGE_URL = "https://www.macl.aero/corporate/services/operational/ans/aip";
const FETCH_TIMEOUT_MS = 30_000;
const UA = "Mozilla/5.0 (compatible; clearway-mv-scraper/1.0)";

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

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
      headers: { "User-Agent": UA },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseEntries(html) {
  const re = /<h6[^>]*class=["'][^"']*\bdataloadlist\b[^"']*["'][^>]*data-id=["'](\d+)["'][^>]*>([\s\S]*?)<\/h6>/gi;
  const genEntries = [];
  const ad2Entries = [];
  let m;
  while ((m = re.exec(html))) {
    const id = m[1];
    const label = stripHtml(m[2]);
    if (!label) continue;
    const pdfUrl = `https://www.macl.aero/corporate/services/operational/ans/aip/document/${id}.pdf`;
    const icao = label.match(/\b([A-Z]{4})\b/)?.[1]?.toUpperCase();
    if (/^GEN\s+\d\.\d/i.test(label)) {
      const sec = label.match(/^(GEN\s+\d\.\d)/i)?.[1]?.toUpperCase() || "GEN";
      genEntries.push({ id, section: sec, label, pdfUrl });
      continue;
    }
    if (icao && /\bAD\s*2\b/i.test(label)) {
      ad2Entries.push({ id, icao, label, pdfUrl });
    }
  }

  const seenGen = new Set();
  const dedupGen = genEntries.filter((x) => {
    if (seenGen.has(x.section)) return false;
    seenGen.add(x.section);
    return true;
  });

  const byIcao = new Map();
  for (const row of ad2Entries) {
    if (!byIcao.has(row.icao)) byIcao.set(row.icao, row);
  }

  return {
    genEntries: dedupGen.sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true })),
    ad2Entries: [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao)),
  };
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
  writeFileSync(outFile, bytes);
}

async function pickFromList(rl, prompt, items, display) {
  for (;;) {
    const raw = (await rl.question(prompt)).trim();
    const n = Number.parseInt(raw, 10);
    if (String(n) === raw && n >= 1 && n <= items.length) return items[n - 1];
    if (raw) {
      const q = raw.toLowerCase();
      const found = items.filter((x) => display(x).toLowerCase().includes(q));
      if (found.length === 1) return found[0];
    }
    console.error("Invalid selection.");
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log("Usage: node scripts/web-table-scrapers/maldives-aip-interactive.mjs [--insecure] [--collect]");
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[MV] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const html = await fetchText(PAGE_URL);
      const { ad2Entries } = parseEntries(html);
      if (!ad2Entries.length) throw new Error("No AD2 entries found.");
      printCollectJson({ effectiveDate: null, ad2Icaos: ad2Entries.map((e) => e.icao) });
    } catch (err) {
      console.error("[MV] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("Maldives AIP — interactive downloader\n");
    const html = await fetchText(PAGE_URL);
    const { genEntries, ad2Entries } = parseEntries(html);
    if (!genEntries.length) throw new Error("No GEN entries found.");
    if (!ad2Entries.length) throw new Error("No AD2 entries found.");

    rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
    const mode = (await rl.question("Download:\n  [1] GEN section PDF\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;

    if (mode === "1") {
      genEntries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.section}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nSection number 1-${genEntries.length}: `, genEntries, (e) => `${e.section} ${e.label}`);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${chosen.section}.pdf`));
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (mode === "2") {
      ad2Entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.icao}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nAirport number 1-${ad2Entries.length} or ICAO: `, ad2Entries, (e) => `${e.icao} ${e.label}`);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${chosen.icao}_AD2.pdf`));
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    console.error("Nothing selected.");
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error("[MV] failed:", err?.message || err);
  process.exit(1);
});

