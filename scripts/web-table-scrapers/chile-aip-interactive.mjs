#!/usr/bin/env node
/**
 * Interactive Chile AIP downloader.
 *
 * This source is not frame-based like classic eAIP packages.
 * It exposes direct PDF links under section pages.
 *
 * Requirement:
 * - AD downloads must come from AD 2a section only (not base AD 2).
 *
 * Usage:
 *   node scripts/web-table-scrapers/chile-aip-interactive.mjs
 *   node scripts/web-table-scrapers/chile-aip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/chile-aip-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output, stderr } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "chile-aip", "GEN");
const OUT_AD2A = join(PROJECT_ROOT, "downloads", "chile-aip", "AD2A");

const VOL1_URL = "https://aipchile.dgac.gob.cl/aip/vol1";
const GEN_URL = "https://aipchile.dgac.gob.cl/aip/vol1/seccion/gen";
const AD_URL = "https://aipchile.dgac.gob.cl/aip/vol1/seccion/ad";
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

function toAbsoluteUrl(href, baseUrl) {
  return new URL(normalizeRelativeHref(href), baseUrl).href;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-cl-scraper/1.0)" },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseGenEntries(html, baseUrl) {
  const entries = [];
  const seen = new Set();
  const re = /<a[^>]*href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const label = stripHtml(m[2]);
    if (!/GEN/i.test(href) && !/GEN/i.test(label)) continue;
    const pdfUrl = toAbsoluteUrl(href, baseUrl);
    const section = href.match(/GEN\s*\d+(?:\.\d+)?/i)?.[0]?.replace(/\s+/g, " ").toUpperCase() || label;
    const key = pdfUrl;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ section, label: label || section, pdfUrl });
  }
  return entries.sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2aEntries(html, baseUrl) {
  const entries = [];
  const seen = new Set();
  const re = /<a[^>]*href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const label = stripHtml(m[2]);
    // Keep only AD 2a bucket as requested.
    if (!/AD\s*2a\s*Aeropuertos/i.test(href) && !/AD\s*2a/i.test(label)) continue;
    const icao = href.match(/\b(SC[A-Z0-9]{2})\b/i)?.[1]?.toUpperCase() || label.match(/\b(SC[A-Z0-9]{2})\b/i)?.[1]?.toUpperCase();
    if (!icao) continue;
    const pdfUrl = toAbsoluteUrl(href, baseUrl);
    const key = `${icao}|${pdfUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ icao, label: label || icao, pdfUrl });
  }
  return entries.sort((a, b) => a.icao.localeCompare(b.icao));
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-cl-scraper/1.0)" } });
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
    console.log(`Usage: node scripts/web-table-scrapers/chile-aip-interactive.mjs [--insecure] [--collect]
       node scripts/web-table-scrapers/chile-aip-interactive.mjs --download-ad2 <ICAO>
       node scripts/web-table-scrapers/chile-aip-interactive.mjs --download-gen12`);
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[CL] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      await fetchText(VOL1_URL);
      const adHtml = await fetchText(AD_URL);
      const ad2aEntries = parseAd2aEntries(adHtml, AD_URL);
      if (!ad2aEntries.length) throw new Error("No AD2a PDF entries found.");
      printCollectJson({ effectiveDate: null, ad2Icaos: ad2aEntries.map((e) => e.icao) });
    } catch (err) {
      console.error("[CL] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("Chile AIP Vol. I — interactive downloader\n");
    await fetchText(VOL1_URL); // quick availability check
    const genHtml = await fetchText(GEN_URL);
    const adHtml = await fetchText(AD_URL);

    const genEntries = parseGenEntries(genHtml, GEN_URL);
    const ad2aEntries = parseAd2aEntries(adHtml, AD_URL);
    if (!genEntries.length) throw new Error("No GEN PDF entries found.");
    if (!ad2aEntries.length) throw new Error("No AD2a PDF entries found.");

    if (downloadGen12) {
      const chosen = genEntries.find((e) => /\bGEN[-_. ]?1[._-]?2\b/i.test(e.section) || /\bGEN[-_. ]?1[._-]?2\b/i.test(e.label)) ?? genEntries[0];
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename("GEN-1.2.pdf"));
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`Saved: ${outFile}`);
      return;
    }

    if (downloadAd2Icao) {
      const chosen = ad2aEntries.find((e) => e.icao === downloadAd2Icao);
      if (!chosen) throw new Error(`AD2 ICAO not found in Chile AD2a list: ${downloadAd2Icao}`);
      mkdirSync(OUT_AD2A, { recursive: true });
      const outFile = join(OUT_AD2A, safeFilename(`${chosen.icao}_AD2A.pdf`));
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`Saved: ${outFile}`);
      return;
    }

    rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });

    const mode = (await rl.question("Download:\n  [1] GEN document PDF\n  [2] AD2a airport PDF only\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
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
      ad2aEntries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.icao}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nAirport number 1-${ad2aEntries.length} or ICAO: `, ad2aEntries, (e) => `${e.icao} ${e.label}`);
      mkdirSync(OUT_AD2A, { recursive: true });
      const outFile = join(OUT_AD2A, safeFilename(`${chosen.icao}_AD2A.pdf`));
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error("[CL] failed:", err?.message || err);
  process.exit(1);
});
