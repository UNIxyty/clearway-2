#!/usr/bin/env node
/**
 * Interactive Bhutan AIP downloader (table-based site).
 *
 * Flow:
 * 1) Fetch Bhutan AIP page
 * 2) Parse direct PDF links from table rows
 * 3) Choose General (GEN) or Aerodromes (AD 2)
 * 4) Download selected PDF
 *
 * Usage:
 *   node scripts/web-table-scrapers/bhutan-aip-interactive.mjs
 *   node scripts/web-table-scrapers/bhutan-aip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/bhutan-aip-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stderr } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "bhutan-aip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "bhutan-aip", "AD2");

const BHUTAN_AIP_URL = "https://www.doat.gov.bt/aip/";
const FETCH_TIMEOUT_MS = 30_000;

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
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; clearway-bhutan-aip-scraper/1.0)",
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseBhutanEntries(html) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[0]);
  const genEntries = [];
  const ad2Entries = [];
  const seenGen = new Set();
  const seenAd2 = new Set();

  for (const row of rows) {
    const rowText = stripHtml(row);
    const links = [...row.matchAll(/<a[^>]*href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)];
    if (!links.length) continue;

    for (const link of links) {
      const rawHref = link[1];
      const href = new URL(rawHref, BHUTAN_AIP_URL).href;
      const linkLabel = stripHtml(link[2]) || rowText;
      const combined = `${rowText} ${linkLabel} ${href}`;

      const isGen = /\bGEN\b/i.test(combined) || /GEN\d+[_-]\d+/i.test(combined);
      const isAd2 = /\bAD\s*2\b/i.test(combined) || /AD2[_-]/i.test(combined) || /\bVQ[A-Z0-9]{2}\b/.test(combined);

      if (isGen) {
        const section =
          combined.match(/GEN\s*([0-9]+\.[0-9]+)/i)?.[1] ??
          combined.match(/GEN([0-9]+[_-][0-9]+)/i)?.[1]?.replace("_", ".").replace("-", ".") ??
          "GEN";
        const key = `${section}|${href}`;
        if (seenGen.has(key)) continue;
        seenGen.add(key);
        genEntries.push({
          section,
          label: linkLabel,
          pdfUrl: href,
        });
        continue;
      }

      if (isAd2) {
        const icao = combined.match(/\b(VQ[A-Z0-9]{2})\b/i)?.[1]?.toUpperCase() ?? "UNKNOWN";
        const key = `${icao}|${href}`;
        if (seenAd2.has(key)) continue;
        seenAd2.add(key);
        ad2Entries.push({
          icao,
          label: linkLabel,
          pdfUrl: href,
        });
      }
    }
  }

  genEntries.sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
  ad2Entries.sort((a, b) => a.icao.localeCompare(b.icao));
  return { genEntries, ad2Entries };
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
      if (found.length > 1) {
        console.error(`Ambiguous (${found.length} matches). Type number or narrower text.`);
        continue;
      }
    }
    console.error("Invalid selection.");
  }
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; clearway-bhutan-aip-scraper/1.0)",
    },
  });
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  writeFileSync(outFile, bytes);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Usage: node scripts/web-table-scrapers/bhutan-aip-interactive.mjs [--insecure]

Interactive flow:
  [1] Parse "General" section PDFs from Bhutan AIP page
  [2] Parse "Aerodromes" (AD 2) airport PDFs
  [3] Pick one and download
`);
    return;
  }

  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[BT] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const html = await fetchText(BHUTAN_AIP_URL);
      const { ad2Entries } = parseBhutanEntries(html);
      if (!ad2Entries.length) throw new Error("No AD2 PDFs found.");
      printCollectJson({ effectiveDate: null, ad2Icaos: ad2Entries.map((e) => e.icao) });
    } catch (err) {
      console.error("[BT] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("Bhutan AIP — interactive downloader\n");
    console.error(`Source page: ${BHUTAN_AIP_URL}\n`);

    const html = await fetchText(BHUTAN_AIP_URL);
    const { genEntries, ad2Entries } = parseBhutanEntries(html);
    if (!genEntries.length && !ad2Entries.length) {
      throw new Error("No GEN or AD2 PDF links found on Bhutan AIP page.");
    }

    rl = readline.createInterface({ input, output: stderr, terminal: Boolean(input.isTTY) });
    const mode = (await rl.question("Download:\n  [1] General (GEN) PDF\n  [2] Aerodromes (AD 2) PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;

    if (mode === "1") {
      if (!genEntries.length) throw new Error("No GEN PDFs found.");
      console.error("\n--- Bhutan GEN PDFs ---\n");
      genEntries.forEach((e, i) => {
        console.error(`${String(i + 1).padStart(3)}. GEN ${e.section}  ${e.label}`);
      });
      const chosen = await pickFromList(rl, `\nSection number 1-${genEntries.length}: `, genEntries, (e) => `GEN ${e.section} ${e.label}`);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`BT_GEN_${chosen.section}.pdf`));
      console.error(`\n→ PDF: ${chosen.pdfUrl}`);
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (mode === "2") {
      if (!ad2Entries.length) throw new Error("No AD2 PDFs found.");
      console.error("\n--- Bhutan AD 2 PDFs ---\n");
      ad2Entries.forEach((e, i) => {
        console.error(`${String(i + 1).padStart(3)}. ${e.icao}  ${e.label}`);
      });
      const chosen = await pickFromList(rl, `\nAirport number 1-${ad2Entries.length} or ICAO: `, ad2Entries, (e) => `${e.icao} ${e.label}`);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`BT_AD2_${chosen.icao}.pdf`));
      console.error(`\n→ PDF: ${chosen.pdfUrl}`);
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
  console.error("[BT] failed:", err?.message || err);
  process.exit(1);
});
