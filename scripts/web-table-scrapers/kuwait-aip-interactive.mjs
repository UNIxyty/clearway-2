#!/usr/bin/env node
/**
 * Interactive Kuwait AIP downloader.
 *
 * Notes:
 * - No effective-date selection (single page source)
 * - AD2 is restricted to:
 *   AD 2.<ICAO>-1: AERODROME LOCATION INDICATOR AND NAME, ...
 *
 * Usage:
 *   node scripts/web-table-scrapers/kuwait-aip-interactive.mjs
 *   node scripts/web-table-scrapers/kuwait-aip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/kuwait-aip-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stderr } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "kuwait-aip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "kuwait-aip", "AD2");

const KUWAIT_AIP_URL = "https://dgca.gov.kw/AIP";
const FETCH_TIMEOUT_MS = 45_000;

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#xA;|\r?\n/g, " ")
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
      headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-kuwait-aip-scraper/1.0)" },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseKuwaitEntries(html) {
  const blocks = [...html.matchAll(/<h5[^>]*>([\s\S]*?)<\/h5>[\s\S]{0,1000}?<a[^>]*href=["']([^"']+)["'][^>]*>\s*Download PDF\s*<\/a>/gi)];
  const genEntries = [];
  const ad2Entries = [];

  for (const m of blocks) {
    const title = stripHtml(m[1]);
    const href = new URL(m[2], KUWAIT_AIP_URL).href;

    if (/^GEN\s+/i.test(title)) {
      const genKey = title.match(/^GEN\s+([0-9]+(?:\.[0-9]+)?)/i)?.[1] ?? title;
      genEntries.push({
        key: genKey,
        title,
        pdfUrl: href,
      });
      continue;
    }

    // Requested filter: only AD 2.<ICAO>-1 entries.
    const ad2 = title.match(/^AD\s*2\.?([A-Z0-9]{4})-1\s*:/i);
    if (ad2) {
      ad2Entries.push({
        icao: ad2[1].toUpperCase(),
        title,
        pdfUrl: href,
      });
    }
  }

  const dedupGen = new Map();
  for (const e of genEntries) {
    const key = `${e.key}|${e.pdfUrl}`;
    if (!dedupGen.has(key)) dedupGen.set(key, e);
  }
  const dedupAd2 = new Map();
  for (const e of ad2Entries) {
    const key = `${e.icao}|${e.pdfUrl}`;
    if (!dedupAd2.has(key)) dedupAd2.set(key, e);
  }

  return {
    genEntries: [...dedupGen.values()].sort((a, b) => String(a.key).localeCompare(String(b.key), undefined, { numeric: true })),
    ad2Entries: [...dedupAd2.values()].sort((a, b) => a.icao.localeCompare(b.icao)),
  };
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-kuwait-aip-scraper/1.0)" },
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
    console.error("Invalid selection. Type number/text, or 0 to quit.");
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Usage: node scripts/web-table-scrapers/kuwait-aip-interactive.mjs [--insecure]

Interactive flow:
  [1] Load Kuwait AIP page
  [2] Choose GEN document or AD2 ICAO-1 document
  [3] Download selected PDF
`);
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[KW] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const html = await fetchText(KUWAIT_AIP_URL);
      const { ad2Entries } = parseKuwaitEntries(html);
      if (!ad2Entries.length) throw new Error("No AD2 ICAO-1 entries found.");
      printCollectJson({ effectiveDate: null, ad2Icaos: ad2Entries.map((e) => e.icao) });
    } catch (err) {
      console.error("[KW] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("Kuwait AIP — interactive downloader\n");
    console.error(`Source page: ${KUWAIT_AIP_URL}\n`);

    const html = await fetchText(KUWAIT_AIP_URL);
    const { genEntries, ad2Entries } = parseKuwaitEntries(html);
    if (!genEntries.length && !ad2Entries.length) {
      throw new Error("No GEN or AD2 documents parsed from Kuwait AIP page.");
    }

    rl = readline.createInterface({ input, output: stderr, terminal: Boolean(input.isTTY) });
    const mode = (await rl.question("Download:\n  [1] GEN document PDF\n  [2] AD2 ICAO-1 PDF only\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;

    if (mode === "1") {
      if (!genEntries.length) throw new Error("No GEN documents found.");
      console.error("\n--- Kuwait GEN documents ---\n");
      genEntries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.title}`));
      const chosen = await pickFromList(rl, `\nGEN number 1-${genEntries.length} (or 0 to quit): `, genEntries, (e) => e.title);
      if (!chosen) return;
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${chosen.key}_${chosen.title}.pdf`));
      console.error(`\nDownloading: ${chosen.title}`);
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (mode === "2") {
      if (!ad2Entries.length) throw new Error("No AD2 ICAO-1 entries found.");
      console.error("\n--- Kuwait AD2 ICAO-1 documents ---\n");
      ad2Entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.icao}  ${e.title}`));
      const chosen = await pickFromList(rl, `\nAD2 number 1-${ad2Entries.length} or ICAO (or 0 to quit): `, ad2Entries, (e) => `${e.icao} ${e.title}`);
      if (!chosen) return;
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${chosen.icao}_AD2-1.pdf`));
      console.error(`\nDownloading: ${chosen.title}`);
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    console.error("Unknown choice.");
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error("[KW] failed:", err?.message || err);
  process.exit(1);
});
