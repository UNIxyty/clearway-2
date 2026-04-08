#!/usr/bin/env node
/**
 * Interactive Mongolia eAIP downloader.
 *
 * Usage:
 *   node scripts/web-table-scrapers/mongolia-eaip-interactive.mjs
 *   node scripts/web-table-scrapers/mongolia-eaip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/mongolia-eaip-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson, pickNewestIssueByIso, isoDateFromText } from "./_collect-json.mjs";
import { stdin as input, stdout as output, stderr } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "mongolia-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "mongolia-eaip", "AD2");

const HISTORY_URL = "https://ais.mn/files/aip/eAIP/";
const FETCH_TIMEOUT_MS = 30_000;

let _browser = null;
let _page = null;

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

async function getBrowserPage() {
  if (_page) return _page;
  const { chromium } = await import("playwright");
  _browser = await chromium.launch({ headless: true });
  _page = await _browser.newPage();
  return _page;
}

async function closeBrowser() {
  try {
    await _page?.close();
    await _browser?.close();
  } catch {}
  _page = null;
  _browser = null;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-mn-scraper/1.0)" },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } catch {
    const page = await getBrowserPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
    return await page.content();
  } finally {
    clearTimeout(timeout);
  }
}

function parseIssues(historyHtml) {
  const out = [];
  const re = /<a[^>]*href=["']([^"']*index-en-MN\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(historyHtml))) {
    const rawHref = m[1].trim();
    const label = stripHtml(m[2]) || rawHref;
    const indexUrl = new URL(rawHref, HISTORY_URL).href;
    const issueCode = rawHref.match(/([0-9]{4}-[0-9]{2}-[0-9]{2}(?:-AIRAC)?)/i)?.[1] ?? rawHref.replace(/\/html\/index-en-MN\.html$/i, "");
    out.push({ label, issueCode, indexUrl });
  }
  const seen = new Set();
  return out.filter((x) => {
    if (seen.has(x.indexUrl)) return false;
    seen.add(x.indexUrl);
    return true;
  });
}

function parseTocUrl(indexHtml, indexUrl) {
  const m = indexHtml.match(/<frame[^>]*name=["']eAISNavigationBase["'][^>]*src=["']([^"']+)["']/i);
  if (!m?.[1]) throw new Error("Could not find eAISNavigationBase frame URL.");
  return new URL(m[1], indexUrl).href;
}

function parseMenuUrlFromToc(tocHtml, tocUrl) {
  const m = tocHtml.match(/<frame[^>]*name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i);
  if (!m?.[1]) throw new Error("Could not find eAISNavigation frame URL.");
  return new URL(m[1], tocUrl).href;
}

function parseGenEntries(menuHtml, menuUrl) {
  const re = /<a[^>]*href=["']([^"']*GEN[^"']*\.html#(GEN-[^"']+))["'][^>]*>([\s\S]*?)<\/a>/gi;
  const byAnchor = new Map();
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const anchor = m[2].toUpperCase();
    const label = stripHtml(m[3]) || anchor;
    if (!/^GEN-\d+\.\d+/i.test(anchor)) continue;
    if (!byAnchor.has(anchor)) {
      byAnchor.set(anchor, { anchor, label, htmlUrl: new URL(href, menuUrl).href });
    }
  }
  return [...byAnchor.values()].sort((a, b) => a.anchor.localeCompare(b.anchor, undefined, { numeric: true }));
}

function parseAd2Entries(menuHtml, menuUrl) {
  const re = /<a[^>]*href=["']([^"']*AD-2\.([A-Z0-9]{4})[^"']*\.html#AD-2[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const byIcao = new Map();
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const icao = m[2].toUpperCase();
    const label = stripHtml(m[3]) || icao;
    if (!byIcao.has(icao)) byIcao.set(icao, { icao, label, htmlUrl: new URL(href, menuUrl).href });
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

function buildPdfCandidates(htmlUrl) {
  const base = String(htmlUrl || "").replace(/#.*$/, "").replace(/\.html(?:\?.*)?$/i, ".pdf");
  const candidates = [
    base.replace(/\/html\/\D{4}\//, "/pdf/"),
    base.replace(/-[a-z]{2}-[A-Z]{2}\.pdf$/i, ".pdf").replace(/\/html\/\D{4}\//, "/pdf/"),
    base.replace("/html/eAIP/", "/pdf/"),
    base.replace("/html/eAIP/", "/eAIP/pdf/"),
    base.replace(/-[a-z]{2}-[A-Z]{2}\.pdf$/i, ".pdf").replace("/html/eAIP/", "/pdf/"),
    base.replace(/-[a-z]{2}-[A-Z]{2}\.pdf$/i, ".pdf").replace("/html/eAIP/", "/eAIP/pdf/"),
  ];
  return [...new Set(candidates)];
}

async function downloadPdfFromCandidates(candidates, outFile) {
  let lastErr = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-mn-scraper/1.0)" } });
      if (!res.ok) throw new Error(`PDF fetch failed: ${res.status} ${res.statusText}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
      writeFileSync(outFile, bytes);
      return url;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("PDF download failed.");
}

async function renderHtmlToPdf(htmlUrl, outFile) {
  const page = await getBrowserPage();
  await page.goto(htmlUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await page.pdf({
    path: outFile,
    format: "A4",
    printBackground: true,
    margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" },
  });
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
    console.log("Usage: node scripts/web-table-scrapers/mongolia-eaip-interactive.mjs [--insecure] [--collect]");
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[MN] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const historyHtml = await fetchText(HISTORY_URL);
      const issues = parseIssues(historyHtml);
      if (!issues.length) throw new Error("No issue links found.");
      const issue = pickNewestIssueByIso(issues, (x) => `${x.issueCode} ${x.label}`);
      const indexHtml = await fetchText(issue.indexUrl);
      const tocUrl = parseTocUrl(indexHtml, issue.indexUrl);
      const tocHtml = await fetchText(tocUrl);
      const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
      const menuHtml = await fetchText(menuUrl);
      const entries = parseAd2Entries(menuHtml, menuUrl);
      printCollectJson({
        effectiveDate: isoDateFromText(issue.issueCode) ?? issue.issueCode,
        ad2Icaos: entries.map((e) => e.icao),
      });
    } catch (err) {
      console.error("[MN] collect failed:", err?.message || err);
      process.exit(1);
    } finally {
      await closeBrowser();
    }
    return;
  }

  let rl = null;
  try {
    console.error("Mongolia eAIP — interactive downloader\n");
    const historyHtml = await fetchText(HISTORY_URL);
    const issues = parseIssues(historyHtml);
    if (!issues.length) throw new Error("No issue links found.");

    console.error("--- Available issues ---\n");
    issues.forEach((x, i) => console.error(`${String(i + 1).padStart(3)}. ${x.label}  ${x.issueCode}`));

    rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
    const issue = await pickFromList(rl, `\nIssue number 1-${issues.length}: `, issues, (x) => `${x.label} ${x.issueCode}`);

    const indexHtml = await fetchText(issue.indexUrl);
    const tocUrl = parseTocUrl(indexHtml, issue.indexUrl);
    const tocHtml = await fetchText(tocUrl);
    const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
    const menuHtml = await fetchText(menuUrl);

    console.error(`\nSelected: ${issue.label} (${issue.issueCode})`);
    console.error(`Menu: ${menuUrl}\n`);

    const mode = (await rl.question("Download:\n  [1] GEN section PDF\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;

    if (mode === "1") {
      const entries = parseGenEntries(menuHtml, menuUrl);
      if (!entries.length) throw new Error("No GEN entries found.");
      entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.anchor}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nSection number 1-${entries.length}: `, entries, (e) => `${e.anchor} ${e.label}`);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${issue.issueCode}_${chosen.anchor}.pdf`));
      const candidates = buildPdfCandidates(chosen.htmlUrl);
      try {
        const resolved = await downloadPdfFromCandidates(candidates, outFile);
        console.error(`\nSaved: ${outFile}`);
        console.error(`PDF URL: ${resolved}`);
      } catch {
        await renderHtmlToPdf(chosen.htmlUrl, outFile);
        console.error(`\nSaved: ${outFile}`);
        console.error(`Rendered from HTML: ${chosen.htmlUrl}`);
      }
      return;
    }

    if (mode === "2") {
      const entries = parseAd2Entries(menuHtml, menuUrl);
      if (!entries.length) throw new Error("No AD2 entries found.");
      entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.icao}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nAirport number 1-${entries.length} or ICAO: `, entries, (e) => `${e.icao} ${e.label}`);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${issue.issueCode}_${chosen.icao}_AD2.pdf`));
      const candidates = buildPdfCandidates(chosen.htmlUrl);
      try {
        const resolved = await downloadPdfFromCandidates(candidates, outFile);
        console.error(`\nSaved: ${outFile}`);
        console.error(`PDF URL: ${resolved}`);
      } catch {
        await renderHtmlToPdf(chosen.htmlUrl, outFile);
        console.error(`\nSaved: ${outFile}`);
        console.error(`Rendered from HTML: ${chosen.htmlUrl}`);
      }
      return;
    }
  } finally {
    rl?.close();
    await closeBrowser();
  }
}

main().catch((err) => {
  console.error("[MN] failed:", err?.message || err);
  process.exit(1);
});
