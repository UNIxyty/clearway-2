#!/usr/bin/env node
/**
 * Interactive Bahrain eAIP downloader.
 *
 * Flow:
 * 1) Read history page and auto-pick newest effective package
 * 2) Pick GEN section or AD 2 airport
 * 3) Download the corresponding PDF
 *
 * Usage:
 *   node scripts/web-table-scrapers/bahrain-eaip-interactive.mjs
 *   node scripts/web-table-scrapers/bahrain-eaip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/bahrain-eaip-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson, isoDateFromText } from "./_collect-json.mjs";
import { stdin as input, stderr } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "bahrain-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "bahrain-eaip", "AD2");

const HISTORY_URL = "https://aim.mtt.gov.bh/eAIP/history-en-BH.html";
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

function htmlToPdfUrl(htmlUrl) {
  const noAnchor = htmlUrl.replace(/#.*$/, "");
  const asPdf = noAnchor.replace(/\.html$/i, ".pdf");
  return asPdf.replace(/\/html\/\D{4}\//, "/pdf/");
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseHistoryVersions(html) {
  const re = /href="((\d{4}-\d{2}-\d{2}(?:-AIRAC)?)\/html\/index-en-BH\.html)"/gi;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    out.push({
      path: m[1],
      label: m[2],
      indexUrl: new URL(m[1], HISTORY_URL).href,
    });
  }
  return out;
}

function pickNewestVersion(versions) {
  const withDate = versions
    .map((v) => {
      const m = String(v.label || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return { v, ts: Number.NEGATIVE_INFINITY };
      const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return { v, ts };
    })
    .sort((a, b) => b.ts - a.ts);
  return withDate[0]?.v ?? versions[0];
}

function parseTocFramesetUrl(indexHtml, indexUrl) {
  const m = indexHtml.match(/<frame[^>]*name="eAISNavigationBase"[^>]*src="([^"]+)"/i);
  if (!m?.[1]) throw new Error("Could not find eAISNavigationBase frame in index.");
  return new URL(m[1], indexUrl).href;
}

function parseMenuUrl(tocHtml, tocUrl) {
  const m = tocHtml.match(/<frame[^>]*name="eAISNavigation"[^>]*src="([^"]+)"/i);
  if (!m?.[1]) throw new Error("Could not find eAISNavigation frame in toc-frameset.");
  return new URL(m[1], tocUrl).href;
}

function parseGenEntries(menuHtml) {
  const re = /<a[^>]*href="([^"]*OB-GEN-[^"]+\.html#(GEN-[^"]+))"[^>]*>([\s\S]*?)<\/a>/gi;
  const byAnchor = new Map();
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const anchor = m[2];
    const rawLabel = stripHtml(m[3]);
    if (!/^GEN-\d+\.\d+/i.test(anchor)) continue;
    const label = rawLabel || anchor.replace("-", " ");
    if (!byAnchor.has(anchor)) byAnchor.set(anchor, { anchor, href, label });
  }
  return [...byAnchor.values()].sort((a, b) => a.anchor.localeCompare(b.anchor, undefined, { numeric: true }));
}

function parseAd2Icaos(menuHtml) {
  const re = /href="([^"]*OB-AD-2\.([A-Z0-9]{4})-en-BH\.html#AD-2\.\2)"/gi;
  const byIcao = new Map();
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const icao = m[2].toUpperCase();
    if (!byIcao.has(icao)) byIcao.set(icao, href);
  }
  return [...byIcao.entries()]
    .map(([icao, href]) => ({ icao, href }))
    .sort((a, b) => a.icao.localeCompare(b.icao));
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

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Usage: node scripts/web-table-scrapers/bahrain-eaip-interactive.mjs [--insecure] [--collect]

Interactive flow:
  [1] Auto-select newest effective-date package from history page
  [2] Choose GEN section or AD 2 ICAO
  [3] Download corresponding PDF
`);
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[BH] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const historyHtml = await fetchText(HISTORY_URL);
      const versions = parseHistoryVersions(historyHtml);
      if (!versions.length) throw new Error("No effective versions found in history page.");
      const version = pickNewestVersion(versions);
      if (!version) throw new Error("No effective version resolved.");
      const indexHtml = await fetchText(version.indexUrl);
      const tocUrl = parseTocFramesetUrl(indexHtml, version.indexUrl);
      const tocHtml = await fetchText(tocUrl);
      const menuUrl = parseMenuUrl(tocHtml, tocUrl);
      const menuHtml = await fetchText(menuUrl);
      const airports = parseAd2Icaos(menuHtml);
      printCollectJson({
        effectiveDate: isoDateFromText(version.label) ?? version.label,
        ad2Icaos: airports.map((a) => a.icao),
      });
    } catch (err) {
      console.error("[BH] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  const rl = readline.createInterface({ input, output: stderr, terminal: Boolean(input.isTTY) });
  try {
    console.error("Bahrain eAIP — interactive downloader\n");
    console.error(`History: ${HISTORY_URL}\n`);

    const historyHtml = await fetchText(HISTORY_URL);
    const versions = parseHistoryVersions(historyHtml);
    if (!versions.length) throw new Error("No effective versions found in history page.");

    const version = pickNewestVersion(versions);
    if (!version) throw new Error("No effective version resolved.");

    const indexHtml = await fetchText(version.indexUrl);
    const tocUrl = parseTocFramesetUrl(indexHtml, version.indexUrl);
    const tocHtml = await fetchText(tocUrl);
    const menuUrl = parseMenuUrl(tocHtml, tocUrl);
    const menuHtml = await fetchText(menuUrl);

    console.error(`\nAuto-selected newest package: ${version.label}`);
    console.error(`Menu: ${menuUrl}\n`);

    const mode = (await rl.question("Download:\n  [1] GEN section PDF\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;

    if (mode === "1") {
      const entries = parseGenEntries(menuHtml);
      if (!entries.length) throw new Error("No GEN sections found in menu.");
      console.error("\n--- GEN sections ---\n");
      entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.anchor}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nSection number 1-${entries.length}: `, entries, (e) => `${e.anchor} ${e.label}`);
      const htmlUrl = new URL(chosen.href, menuUrl).href;
      const pdfUrl = htmlToPdfUrl(htmlUrl);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${version.label}_${chosen.anchor}.pdf`));
      console.error(`\n→ HTML: ${htmlUrl}`);
      console.error(`→ PDF : ${pdfUrl}`);
      const pdfRes = await fetch(pdfUrl);
      if (!pdfRes.ok) throw new Error(`GEN PDF fetch failed: ${pdfRes.status} ${pdfRes.statusText}`);
      const bytes = Buffer.from(await pdfRes.arrayBuffer());
      writeFileSync(outFile, bytes);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (mode === "2") {
      const airports = parseAd2Icaos(menuHtml);
      if (!airports.length) throw new Error("No AD 2 airports found in menu.");
      console.error("\n--- AD 2 airports ---\n");
      airports.forEach((a, i) => console.error(`${String(i + 1).padStart(3)}. ${a.icao}`));
      const chosen = await pickFromList(rl, `\nAirport number 1-${airports.length} or ICAO: `, airports, (a) => a.icao);
      const htmlUrl = new URL(chosen.href, menuUrl).href;
      const pdfUrl = htmlToPdfUrl(htmlUrl);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${version.label}_${chosen.icao}_AD2.pdf`));
      console.error(`\n→ HTML: ${htmlUrl}`);
      console.error(`→ PDF : ${pdfUrl}`);
      const pdfRes = await fetch(pdfUrl);
      if (!pdfRes.ok) throw new Error(`AD2 PDF fetch failed: ${pdfRes.status} ${pdfRes.statusText}`);
      const bytes = Buffer.from(await pdfRes.arrayBuffer());
      writeFileSync(outFile, bytes);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    console.error("Unknown choice.");
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("[BH] failed:", err?.message || err);
  process.exit(1);
});
