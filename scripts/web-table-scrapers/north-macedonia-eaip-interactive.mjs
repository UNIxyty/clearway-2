#!/usr/bin/env node
/**
 * Interactive North Macedonia eAIP downloader.
 *
 * Source:
 * - https://ais.m-nav.info/eAIP/Start.htm
 *
 * Usage:
 *   node scripts/web-table-scrapers/north-macedonia-eaip-interactive.mjs
 *   node scripts/web-table-scrapers/north-macedonia-eaip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/north-macedonia-eaip-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson, isoDateFromText } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "north-macedonia-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "north-macedonia-eaip", "AD2");

const START_URL = "https://ais.m-nav.info/eAIP/Start.htm";
const FETCH_TIMEOUT_MS = 45_000;
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

function normalizeRelativeHref(href) {
  const raw = String(href || "").trim();
  if (!raw) return raw;
  const hashIndex = raw.indexOf("#");
  const base = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  return base.replace(/\\/g, "/").replace(/ /g, "%20") + hash;
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

function parseIssues(startHtml) {
  const cleaned = startHtml.replace(/<!--[\s\S]*?-->/g, "");
  const re =
    /<a\s+href=["']((?:current|future)\/index\.htm)["'][^>]*>\s*<b[^>]*>\s*(Current|Future)\s+version:\s*AIP\s+NORTH\s+MACEDONIA\s*<\/b>\s*<\/a>([\s\S]*?)(?:<br|$)/gi;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(cleaned))) {
    const href = m[1];
    const kind = m[2].toUpperCase();
    const tail = stripHtml(m[3] || "");
    if (seen.has(`${kind}:${href}`)) continue;
    seen.add(`${kind}:${href}`);
    const issueUrl = new URL(normalizeRelativeHref(href), START_URL).href;
    out.push({
      label: tail ? `${kind}: ${tail}` : kind,
      issueUrl,
      rank: kind === "CURRENT" ? 0 : 1,
    });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

function parseMetaRefreshTarget(html) {
  return html.match(/http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["']/i)?.[1]?.trim() || null;
}

async function resolveMenuUrl(issueUrl) {
  let indexUrl = issueUrl;

  for (let i = 0; i < 3; i++) {
    const indexHtml = await fetchText(indexUrl);
    const navBase = indexHtml.match(/name=["']eAISNavigationBase["'][^>]*src=["']([^"']+)["']/i)?.[1];
    if (navBase) {
      const tocUrl = new URL(normalizeRelativeHref(navBase), indexUrl).href;
      const tocHtml = await fetchText(tocUrl);
      const menuSrc = tocHtml.match(/name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i)?.[1];
      if (!menuSrc) throw new Error("Menu frame source not found.");
      return new URL(normalizeRelativeHref(menuSrc), tocUrl).href;
    }

    const directMenuSrc =
      indexHtml.match(/<frame[^>]*name=["']menu["'][^>]*src=["']([^"']+)["']/i)?.[1] ||
      indexHtml.match(/<frame[^>]*src=["']([^"']+)["'][^>]*name=["']menu["']/i)?.[1];
    if (directMenuSrc) {
      return new URL(normalizeRelativeHref(directMenuSrc), indexUrl).href;
    }

    const refreshTarget = parseMetaRefreshTarget(indexHtml);
    if (!refreshTarget) break;
    indexUrl = new URL(normalizeRelativeHref(refreshTarget), indexUrl).href;
  }

  throw new Error("Navigation frame not found.");
}

function parseGenEntries(treeJs, treeUrl) {
  const bySection = new Map();
  const re = /\['([^']*)',\s*'([^']*LW_GEN_[0-9]_[0-9]_en\.pdf)'\]/gi;
  let m;
  while ((m = re.exec(treeJs))) {
    const label = stripHtml(m[1]) || m[2];
    const href = m[2];
    const sec = href.match(/LW_GEN_([0-9])_([0-9])/i)?.slice(1, 3).join(".");
    if (!sec) continue;
    const section = `GEN ${sec}`;
    if (bySection.has(section)) continue;
    bySection.set(section, {
      section,
      label,
      htmlUrl: new URL(normalizeRelativeHref(href), treeUrl).href,
    });
  }
  return [...bySection.values()].sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2Entries(treeJs, treeUrl) {
  const byIcao = new Map();
  const re = /'([^']*LW_AD_2_([A-Z]{4})_en\.pdf)'/gi;
  let m;
  while ((m = re.exec(treeJs))) {
    const href = m[1];
    const icao = m[2]?.toUpperCase();
    const label = icao || href;
    if (!icao || byIcao.has(icao)) continue;
    byIcao.set(icao, {
      icao,
      label,
      htmlUrl: new URL(normalizeRelativeHref(href), treeUrl).href,
    });
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

function htmlToPdfUrl(url) {
  const u = new URL(url);
  u.hash = "";
  return u.href;
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
  writeFileSync(outFile, bytes);
}

async function derivePdfCandidates(htmlUrl) {
  const candidates = [htmlToPdfUrl(htmlUrl)];
  try {
    const html = await fetchText(htmlUrl);
    const alt = html.match(/<link[^>]*rel=["']alternate["'][^>]*type=["']application\/pdf["'][^>]*href=["']([^"']+)["']/i)?.[1];
    if (alt) candidates.push(new URL(normalizeRelativeHref(alt), htmlUrl).href);
  } catch {
    // Ignore and rely on default candidate/fallback render.
  }
  return [...new Set(candidates)];
}

async function renderHtmlToPdf(htmlUrl, outFile) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(htmlUrl, { waitUntil: "networkidle", timeout: 120_000 });
    await page.pdf({
      path: outFile,
      printBackground: true,
      format: "A4",
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    });
  } finally {
    await browser.close();
  }
}

async function savePdfWithFallback(htmlUrl, outFile) {
  const candidates = await derivePdfCandidates(htmlUrl);
  for (const c of candidates) {
    try {
      await downloadPdf(c, outFile);
      return { mode: "direct", url: c };
    } catch {
      // Try next.
    }
  }
  await renderHtmlToPdf(htmlUrl, outFile);
  return { mode: "rendered", url: htmlUrl };
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

function pickIssueFromInput(raw, issues) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return issues[0];
  const n = Number.parseInt(trimmed, 10);
  if (String(n) === trimmed && n >= 1 && n <= issues.length) return issues[n - 1];
  throw new Error(`Invalid issue selection: ${trimmed}`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Usage: node scripts/web-table-scrapers/north-macedonia-eaip-interactive.mjs [--insecure] [--collect]
       node scripts/web-table-scrapers/north-macedonia-eaip-interactive.mjs --download-ad2 <ICAO>
       node scripts/web-table-scrapers/north-macedonia-eaip-interactive.mjs --download-gen12`);
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[MK] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const startHtml = await fetchText(START_URL);
      const issues = parseIssues(startHtml);
      if (!issues.length) throw new Error("No issue package links found.");
      const issue = pickIssueFromInput("", issues);
      const menuUrl = await resolveMenuUrl(issue.issueUrl);
      const menuHtml = await fetchText(menuUrl);
      const treeItemsSrc = menuHtml.match(/<script[^>]*src=["']([^"']*tree_items\.js[^"']*)["']/i)?.[1];
      if (!treeItemsSrc) throw new Error("tree_items.js source not found in menu.");
      const treeUrl = new URL(normalizeRelativeHref(treeItemsSrc), menuUrl).href;
      const treeJs = await fetchText(treeUrl);
      const ad2Entries = parseAd2Entries(treeJs, treeUrl);
      printCollectJson({
        effectiveDate: isoDateFromText(issue.label) ?? issue.label,
        ad2Icaos: ad2Entries.map((e) => e.icao),
      });
    } catch (err) {
      console.error("[MK] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("North Macedonia eAIP — interactive downloader\n");
    const startHtml = await fetchText(START_URL);
    const issues = parseIssues(startHtml);
    if (!issues.length) throw new Error("No issue package links found.");

    rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
    issues.forEach((x, i) => console.error(`${String(i + 1).padStart(3)}. ${x.label}`));
    const issueRaw = (await rl.question(`\nIssue number [enter=1, 1-${issues.length}]: `)).trim();
    const issue = pickIssueFromInput(issueRaw, issues);

    console.error(`\nUsing issue: ${issue.label}`);
    const menuUrl = await resolveMenuUrl(issue.issueUrl);
    const menuHtml = await fetchText(menuUrl);
    const treeItemsSrc = menuHtml.match(/<script[^>]*src=["']([^"']*tree_items\.js[^"']*)["']/i)?.[1];
    if (!treeItemsSrc) throw new Error("tree_items.js source not found in menu.");
    const treeUrl = new URL(normalizeRelativeHref(treeItemsSrc), menuUrl).href;
    const treeJs = await fetchText(treeUrl);
    const genEntries = parseGenEntries(treeJs, treeUrl);
    const ad2Entries = parseAd2Entries(treeJs, treeUrl);
    if (!genEntries.length) throw new Error("No GEN entries found in issue menu.");
    if (!ad2Entries.length) throw new Error("No AD2 entries found in issue menu.");

    if (downloadGen12) {
      const chosen = genEntries.find((e) => /\b1\.2\b/.test(e.section) || /\bGEN\s*1\.2\b/i.test(e.label)) ?? genEntries[0];
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${chosen.section}.pdf`));
      const result = await savePdfWithFallback(chosen.htmlUrl, outFile);
      if (result.mode === "rendered") console.error("[MK] Direct PDF not available; saved rendered HTML as PDF.");
      console.error(`Saved: ${outFile}`);
      return;
    }

    if (downloadAd2Icao) {
      const chosen = ad2Entries.find((e) => e.icao === downloadAd2Icao);
      if (!chosen) throw new Error(`AD2 ICAO not found in North Macedonia menu: ${downloadAd2Icao}`);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${chosen.icao}_AD2.pdf`));
      const result = await savePdfWithFallback(chosen.htmlUrl, outFile);
      if (result.mode === "rendered") console.error("[MK] Direct PDF not available; saved rendered HTML as PDF.");
      console.error(`Saved: ${outFile}`);
      return;
    }

    const mode = (await rl.question("\nDownload:\n  [1] GEN section PDF\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;

    if (mode === "1") {
      genEntries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.section}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nSection number 1-${genEntries.length}: `, genEntries, (e) => `${e.section} ${e.label}`);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${chosen.section}.pdf`));
      const result = await savePdfWithFallback(chosen.htmlUrl, outFile);
      if (result.mode === "rendered") console.error("[MK] Direct PDF not available; saved rendered HTML as PDF.");
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (mode === "2") {
      ad2Entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.icao}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nAirport number 1-${ad2Entries.length} or ICAO: `, ad2Entries, (e) => `${e.icao} ${e.label}`);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${chosen.icao}_AD2.pdf`));
      const result = await savePdfWithFallback(chosen.htmlUrl, outFile);
      if (result.mode === "rendered") console.error("[MK] Direct PDF not available; saved rendered HTML as PDF.");
      console.error(`\nSaved: ${outFile}`);
      return;
    }
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error("[MK] failed:", err?.message || err);
  process.exit(1);
});
