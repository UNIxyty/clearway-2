#!/usr/bin/env node
/**
 * Interactive Cuba AIP downloader (non-frame, direct PDF links).
 *
 * Usage:
 *   node scripts/web-table-scrapers/cuba-aip-interactive.mjs
 *   node scripts/web-table-scrapers/cuba-aip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/cuba-aip-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output, stderr } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "cuba-aip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "cuba-aip", "AD2");

const CUBA_AIP_URL = "https://aismet.avianet.cu/html/aip.html";
const FETCH_TIMEOUT_MS = 30_000;
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
    .replace(/&#xA;|\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeFilename(name) {
  return String(name || "")
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "_");
}

function normalizeRelativeHref(href) {
  const clean = String(href || "").trim().replace(/\\/g, "/");
  const [pathAndQuery, hashPart] = clean.split("#", 2);
  const [rawPath, rawQuery] = pathAndQuery.split("?", 2);
  const encodedPath = rawPath
    .split("/")
    .map((part) => {
      try {
        return encodeURIComponent(decodeURIComponent(part));
      } catch {
        return encodeURIComponent(part);
      }
    })
    .join("/");
  return `${encodedPath}${rawQuery ? `?${rawQuery}` : ""}${hashPart ? `#${hashPart}` : ""}`;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-cu-scraper/1.0)" },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseGenEntries(html, baseUrl) {
  const bySection = new Map();
  const re = /<a[^>]*href=["']([^"']+GEN[_%]?\d+\.\d+\.pdf[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const label = stripHtml(m[2]);
    const section = href.match(/GEN[_%]?(\d+\.\d+)/i)?.[1];
    if (!section) continue;
    const key = `GEN-${section}`;
    if (!bySection.has(key)) {
      bySection.set(key, {
        section: key,
        label: label || key,
        pdfUrl: new URL(normalizeRelativeHref(href), baseUrl).href,
      });
    }
  }
  return [...bySection.values()].sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2Entries(html, baseUrl) {
  const byIcao = new Map();
  const re = /<a[^>]*href=["']([^"']+MU[A-Z0-9_%]*\.pdf[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const label = stripHtml(m[2]);
    const icao = href.match(/\/(MU[A-Z0-9]{2})/i)?.[1]?.toUpperCase();
    if (!icao) continue;
    if (!byIcao.has(icao)) {
      byIcao.set(icao, {
        icao,
        label: label || icao,
        pdfUrl: new URL(normalizeRelativeHref(href), baseUrl).href,
      });
    }
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-cu-scraper/1.0)" } });
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
    console.log(`Usage: node scripts/web-table-scrapers/cuba-aip-interactive.mjs [--insecure] [--collect]
       node scripts/web-table-scrapers/cuba-aip-interactive.mjs --download-ad2 <ICAO>
       node scripts/web-table-scrapers/cuba-aip-interactive.mjs --download-gen12`);
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[CU] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const html = await fetchText(CUBA_AIP_URL);
      const ad2Entries = parseAd2Entries(html, CUBA_AIP_URL);
      if (!ad2Entries.length) throw new Error("No AD2 airport entries found.");
      printCollectJson({ effectiveDate: null, ad2Icaos: ad2Entries.map((e) => e.icao) });
    } catch (err) {
      console.error("[CU] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("Cuba AIP — interactive downloader\n");
    const html = await fetchText(CUBA_AIP_URL);
    const genEntries = parseGenEntries(html, CUBA_AIP_URL);
    const ad2Entries = parseAd2Entries(html, CUBA_AIP_URL);
    if (!genEntries.length) throw new Error("No GEN entries found.");
    if (!ad2Entries.length) throw new Error("No AD2 airport entries found.");

    if (downloadGen12) {
      const chosen = genEntries.find((e) => /\bGEN[-_. ]?1[._-]?2\b/i.test(e.section) || /\bGEN[-_. ]?1[._-]?2\b/i.test(e.label)) ?? genEntries[0];
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${chosen.section}.pdf`));
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`Saved: ${outFile}`);
      return;
    }

    if (downloadAd2Icao) {
      const chosen = ad2Entries.find((e) => e.icao === downloadAd2Icao);
      if (!chosen) throw new Error(`AD2 ICAO not found in Cuba list: ${downloadAd2Icao}`);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${chosen.icao}_AD2.pdf`));
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`Saved: ${outFile}`);
      return;
    }

    rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
    const mode = (await rl.question("Download:\n  [1] GEN document PDF\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
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
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error("[CU] failed:", err?.message || err);
  process.exit(1);
});
