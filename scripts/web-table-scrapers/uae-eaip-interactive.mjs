#!/usr/bin/env node
/**
 * Interactive UAE eAIP downloader.
 *
 * Source:
 * - https://www.gcaa.gov.ae/en/ais/AIPHtmlFiles/AIP/Current/AIP.aspx
 *
 * Usage:
 *   node scripts/web-table-scrapers/uae-eaip-interactive.mjs
 *   node scripts/web-table-scrapers/uae-eaip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/uae-eaip-interactive.mjs --collect
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
const OUT_GEN = join(PROJECT_ROOT, "downloads", "uae-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "uae-eaip", "AD2");

const AIP_URL = "https://www.gcaa.gov.ae/en/ais/AIPHtmlFiles/AIP/Current/AIP.aspx";
const AIP_CONTENT_URL = "https://www.gcaa.gov.ae/en/ais/AIPHtmlFiles/AIP/Current/UAE_AIP.html";
const FETCH_TIMEOUT_MS = 45_000;
const UA = "Mozilla/5.0 (compatible; clearway-uae-scraper/1.0)";

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

function parseIssues(aipHtml) {
  const re = /<a[^>]*href=["']([^"']*index-en-GB\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set();
  const out = [];
  let m;
  while ((m = re.exec(aipHtml))) {
    const href = m[1];
    const label = stripHtml(m[2]);
    if (!href || !label) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push({
      label,
      issueUrl: new URL(href, AIP_CONTENT_URL).href,
    });
  }
  return out;
}

async function resolveMenuUrl(issueUrl) {
  const indexHtml = await fetchText(issueUrl);
  const navBase = indexHtml.match(/name=["']eAISNavigationBase["'][^>]*src=["']([^"']+)["']/i)?.[1];
  if (!navBase) throw new Error("Navigation frame not found.");
  const tocUrl = new URL(navBase, issueUrl).href;
  const tocHtml = await fetchText(tocUrl);
  const menuSrc = tocHtml.match(/name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i)?.[1];
  if (!menuSrc) throw new Error("Menu frame source not found.");
  return new URL(menuSrc, tocUrl).href;
}

function parseGenEntries(menuHtml, menuUrl) {
  const bySection = new Map();
  const re = /<a[^>]*href=["']([^"']*GEN[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const label = stripHtml(m[2]);
    const sec = href.match(/GEN-([0-9]\.[0-9])/i)?.[1] || label.match(/\bGEN\s*([0-9]\.[0-9])\b/i)?.[1];
    if (!sec) continue;
    const section = `GEN ${sec}`;
    if (!bySection.has(section)) {
      bySection.set(section, {
        section,
        label: label || section,
        htmlUrl: new URL(href, menuUrl).href,
      });
    }
  }
  return [...bySection.values()].sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2Entries(menuHtml, menuUrl) {
  const byIcao = new Map();
  const re = /<a[^>]*href=["']([^"']*AD-2\.[A-Z0-9]{4}[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const label = stripHtml(m[2]);
    const icao = href.match(/AD-2\.([A-Z0-9]{4})/i)?.[1]?.toUpperCase();
    if (!icao || byIcao.has(icao)) continue;
    byIcao.set(icao, {
      icao,
      label: label || icao,
      htmlUrl: new URL(href, menuUrl).href,
    });
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

function htmlToPdfUrl(url) {
  const u = new URL(url);
  u.hash = "";
  u.search = "";
  u.pathname = u.pathname.replace(/\.html?$/i, ".pdf");
  return u.href;
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
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
    if (alt) candidates.push(new URL(alt, htmlUrl).href);
  } catch {
    // ignore and rely on render fallback
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
      // try next candidate
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
    console.log("Usage: node scripts/web-table-scrapers/uae-eaip-interactive.mjs [--insecure] [--collect]");
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[UAE] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const aipHtml = await fetchText(AIP_CONTENT_URL);
      const issues = parseIssues(aipHtml);
      if (!issues.length) throw new Error("No issue package links found.");
      const issue = issues[0];
      const menuUrl = await resolveMenuUrl(issue.issueUrl);
      const menuHtml = await fetchText(menuUrl);
      const ad2Entries = parseAd2Entries(menuHtml, menuUrl);
      printCollectJson({
        effectiveDate: isoDateFromText(issue.label) ?? issue.label,
        ad2Icaos: ad2Entries.map((e) => e.icao),
      });
    } catch (err) {
      console.error("[UAE] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("UAE eAIP — interactive downloader\n");
    const aipHtml = await fetchText(AIP_CONTENT_URL);
    const issues = parseIssues(aipHtml);
    if (!issues.length) throw new Error("No issue package links found.");

    rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
    issues.forEach((x, i) => console.error(`${String(i + 1).padStart(3)}. ${x.label}`));
    const issueRaw = (await rl.question(`\nIssue number [enter=1, 1-${issues.length}]: `)).trim();
    const issue = pickIssueFromInput(issueRaw, issues);

    console.error(`\nUsing issue: ${issue.label}`);
    console.error("[UAE] Loading issue package menu...");
    const menuUrl = await resolveMenuUrl(issue.issueUrl);
    const menuHtml = await fetchText(menuUrl);
    const genEntries = parseGenEntries(menuHtml, menuUrl);
    const ad2Entries = parseAd2Entries(menuHtml, menuUrl);
    if (!genEntries.length) throw new Error("No GEN entries found in issue menu.");
    if (!ad2Entries.length) throw new Error("No AD2 entries found in issue menu.");

    const mode = (await rl.question("\nDownload:\n  [1] GEN section PDF\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;

    if (mode === "1") {
      genEntries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.section}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nSection number 1-${genEntries.length}: `, genEntries, (e) => `${e.section} ${e.label}`);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${chosen.section}.pdf`));
      const result = await savePdfWithFallback(chosen.htmlUrl, outFile);
      if (result.mode === "rendered") console.error("[UAE] Direct PDF not available; saved rendered HTML as PDF.");
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (mode === "2") {
      ad2Entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.icao}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nAirport number 1-${ad2Entries.length} or ICAO: `, ad2Entries, (e) => `${e.icao} ${e.label}`);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${chosen.icao}_AD2.pdf`));
      const result = await savePdfWithFallback(chosen.htmlUrl, outFile);
      if (result.mode === "rendered") console.error("[UAE] Direct PDF not available; saved rendered HTML as PDF.");
      console.error(`\nSaved: ${outFile}`);
      return;
    }
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error("[UAE] failed:", err?.message || err);
  process.exit(1);
});

