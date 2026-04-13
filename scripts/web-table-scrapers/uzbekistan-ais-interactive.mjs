#!/usr/bin/env node
/**
 * Interactive Uzbekistan AIS/eAIP downloader.
 *
 * Source:
 * - https://uzaeronavigation.com/ais/#
 *
 * Usage:
 *   node scripts/web-table-scrapers/uzbekistan-ais-interactive.mjs
 *   node scripts/web-table-scrapers/uzbekistan-ais-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/uzbekistan-ais-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "uzbekistan-ais", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "uzbekistan-ais", "AD2");

const PAGE_URL = "https://uzaeronavigation.com/ais/#";
const FETCH_TIMEOUT_MS = 45_000;
const UA = "Mozilla/5.0 (compatible; clearway-uz-scraper/1.0)";
const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

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

function parseGenEntries(html) {
  const bySection = new Map();
  const re = /<a[^>]*onclick=["'][^"']*FileView\('([^']+\.pdf)'\)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const fileHref = m[1];
    const label = stripHtml(m[2]);
    const sec = label.match(/\bGEN\s*([0-9]\.[0-9])\b/i)?.[1];
    if (!sec) continue;
    const section = `GEN ${sec}`;
    if (!bySection.has(section)) {
      bySection.set(section, {
        section,
        label: label || section,
        pdfUrl: new URL(fileHref, PAGE_URL).href,
      });
    }
  }
  return [...bySection.values()].sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2Entries(html) {
  const airportMap = new Map();
  const anchorRe = /<a([^>]*)>([\s\S]*?)<\/a>/gi;
  let currentIcao = null;
  let m;

  while ((m = anchorRe.exec(html))) {
    const attrs = m[1];
    const label = stripHtml(m[2]);
    if (!label) continue;

    const headingIcao = label.match(/\b(UZ[A-Z0-9]{2})\b/i)?.[1]?.toUpperCase();
    const fileHref = attrs.match(/FileView\('([^']+\.pdf)'\)/i)?.[1];

    if (headingIcao && !fileHref) {
      currentIcao = headingIcao;
      if (!airportMap.has(currentIcao)) {
        airportMap.set(currentIcao, { icao: currentIcao, heading: label, pages: [] });
      }
      continue;
    }

    if (!fileHref || !currentIcao) continue;
    const row = airportMap.get(currentIcao);
    if (!row) continue;

    const page = {
      label,
      pdfUrl: new URL(fileHref, PAGE_URL).href,
    };
    row.pages.push(page);
  }

  const out = [];
  for (const row of airportMap.values()) {
    if (!row.pages.length) continue;
    const uniquePages = [];
    const seen = new Set();
    for (const p of row.pages) {
      if (seen.has(p.pdfUrl)) continue;
      seen.add(p.pdfUrl);
      uniquePages.push(p);
    }
    out.push({
      icao: row.icao,
      label: row.heading || row.icao,
      pages: uniquePages,
    });
  }
  return out.sort((a, b) => a.icao.localeCompare(b.icao));
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
  writeFileSync(outFile, bytes);
}

function mergePdfFiles(inputFiles, outFile) {
  if (!inputFiles.length) throw new Error("No input PDF files to merge.");
  if (inputFiles.length === 1) {
    // Caller already has the single merged output semantics.
    return;
  }
  try {
    execFileSync("pdfunite", [...inputFiles, outFile], { stdio: "ignore" });
  } catch {
    throw new Error("Failed to merge PDF pages (pdfunite not available or merge failed).");
  }
}

async function downloadAndMergeAd2Pages(chosen, outFile) {
  if (!chosen.pages?.length) throw new Error("No AD2 pages found for selected airport.");

  const tempDir = mkdtempSync(join(tmpdir(), "clearway-uz-ad2-"));
  try {
    const pageFiles = [];
    for (let i = 0; i < chosen.pages.length; i += 1) {
      const page = chosen.pages[i];
      const tmpFile = join(tempDir, `${String(i + 1).padStart(4, "0")}.pdf`);
      await downloadPdf(page.pdfUrl, tmpFile);
      pageFiles.push(tmpFile);
    }

    if (pageFiles.length === 1) {
      await downloadPdf(chosen.pages[0].pdfUrl, outFile);
      return;
    }

    mergePdfFiles(pageFiles, outFile);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
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
    console.log(`Usage: node scripts/web-table-scrapers/uzbekistan-ais-interactive.mjs [--insecure] [--collect]
       node scripts/web-table-scrapers/uzbekistan-ais-interactive.mjs --download-ad2 <ICAO>
       node scripts/web-table-scrapers/uzbekistan-ais-interactive.mjs --download-gen12`);
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[UZ] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const html = await fetchText(PAGE_URL);
      const ad2Entries = parseAd2Entries(html);
      if (!ad2Entries.length) throw new Error("No AD2 airport entries found.");
      printCollectJson({ effectiveDate: null, ad2Icaos: ad2Entries.map((e) => e.icao) });
    } catch (err) {
      console.error("[UZ] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("Uzbekistan AIS — interactive downloader\n");
    const html = await fetchText(PAGE_URL);
    const genEntries = parseGenEntries(html);
    const ad2Entries = parseAd2Entries(html);
    if (!genEntries.length) throw new Error("No GEN entries found.");
    if (!ad2Entries.length) throw new Error("No AD2 airport entries found.");

    if (downloadGen12 || downloadAd2Icao) {
      if (downloadGen12) {
        const chosen =
          genEntries.find(
            (e) =>
              /\bGEN\s*1\.2\b/i.test(e.section) ||
              /\bGEN\s*1\.2\b/i.test(e.label) ||
              /GEN[-_. ]?1[._-]?2/i.test(e.pdfUrl),
          ) ?? genEntries[0];
        if (
          !/\bGEN\s*1\.2\b/i.test(chosen.section) &&
          !/\bGEN\s*1\.2\b/i.test(chosen.label) &&
          !/GEN[-_. ]?1[._-]?2/i.test(chosen.pdfUrl)
        ) {
          console.error("[UZ] GEN 1.2 not found; falling back to first available GEN entry.");
        }
        mkdirSync(OUT_GEN, { recursive: true });
        const outFile = join(OUT_GEN, "UZ-GEN-1.2.pdf");
        await downloadPdf(chosen.pdfUrl, outFile);
        console.error(`Saved: ${outFile}`);
        return;
      }

      const chosen = ad2Entries.find((e) => e.icao === downloadAd2Icao);
      if (!chosen) throw new Error(`AD2 ICAO not found in Uzbekistan package: ${downloadAd2Icao}`);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${chosen.icao}_AD2.pdf`));
      await downloadAndMergeAd2Pages(chosen, outFile);
      console.error(`Saved: ${outFile}`);
      return;
    }

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
      ad2Entries.forEach((e, i) =>
        console.error(`${String(i + 1).padStart(3)}. ${e.icao}  ${e.label}  (${e.pages.length} pages)`),
      );
      const chosen = await pickFromList(rl, `\nAirport number 1-${ad2Entries.length} or ICAO: `, ad2Entries, (e) => `${e.icao} ${e.label}`);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${chosen.icao}_AD2.pdf`));
      await downloadAndMergeAd2Pages(chosen, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    console.error("Nothing selected.");
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error("[UZ] failed:", err?.message || err);
  process.exit(1);
});

