#!/usr/bin/env node
/**
 * Interactive Sri Lanka AIP downloader.
 *
 * Source:
 * - https://airport.lk/aasl/AIM/AIP/Eurocontrol/SRI%20LANKA/2025-04-17-DOUBLE%20AIRAC/html/index-en-EN.html
 *
 * Notes:
 * - Effective-date packages are exposed via the dropdown in the top-left commands frame.
 *
 * Usage:
 *   node scripts/web-table-scrapers/sri-lanka-aip-interactive.mjs
 *   node scripts/web-table-scrapers/sri-lanka-aip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/sri-lanka-aip-interactive.mjs --collect
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
const OUT_GEN = join(PROJECT_ROOT, "downloads", "sri-lanka-aip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "sri-lanka-aip", "AD2");

const START_INDEX_URL =
  "https://airport.lk/aasl/AIM/AIP/Eurocontrol/SRI%20LANKA/2025-04-17-DOUBLE%20AIRAC/html/index-en-EN.html";
const FETCH_TIMEOUT_MS = 45_000;
const FETCH_RETRIES = 3;
const UA = "Mozilla/5.0 (compatible; clearway-lk-scraper/1.0)";

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
  let lastError = null;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": UA },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.text();
    } catch (err) {
      lastError = err;
      if (attempt < FETCH_RETRIES) {
        const waitMs = 500 * attempt;
        await new Promise((r) => setTimeout(r, waitMs));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("fetch failed");
}

async function parseIssuesFromDropdown(indexUrl) {
  const indexHtml = await fetchText(indexUrl);
  const navBase = indexHtml.match(/name=["']eAISNavigationBase["'][^>]*src=["']([^"']+)["']/i)?.[1];
  if (!navBase) throw new Error("Navigation frame not found.");
  const tocUrl = new URL(normalizeRelativeHref(navBase), indexUrl).href;
  const tocHtml = await fetchText(tocUrl);
  const commandsSrc = tocHtml.match(/name=["']eAISCommands["'][^>]*src=["']([^"']+)["']/i)?.[1];
  if (!commandsSrc) throw new Error("Commands frame source not found.");
  const commandsUrl = new URL(normalizeRelativeHref(commandsSrc), tocUrl).href;
  const commandsHtml = await fetchText(commandsUrl);

  const optionRe = /<option[^>]*value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = optionRe.exec(commandsHtml))) {
    const rawValue = String(m[1] || "").trim();
    const label = stripHtml(m[2]);
    if (!rawValue) continue;
    if (!/index(?:-en-EN)?\.html?$/i.test(rawValue)) continue;
    if (seen.has(rawValue)) continue;
    seen.add(rawValue);
    const rawIssueUrl = new URL(normalizeRelativeHref(rawValue), commandsUrl).href;
    out.push({
      label: label || rawValue,
      issueUrl: rawIssueUrl.replace(/\/index\.html$/i, "/index-en-EN.html"),
    });
  }
  return out;
}

function parseMetaRefreshTarget(html) {
  return html.match(/http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["']/i)?.[1]?.trim() || null;
}

async function resolveMenuUrl(issueUrl) {
  const candidates = [
    issueUrl,
    issueUrl.replace(/\/index-en-EN\.html$/i, "/index.html"),
    issueUrl.replace(/\/index-en-EN\.html$/i, "/index-en-GB.html"),
    START_INDEX_URL,
  ];

  for (const candidate of [...new Set(candidates)]) {
    let indexUrl = candidate;
    for (let i = 0; i < 3; i++) {
      let indexHtml;
      try {
        indexHtml = await fetchText(indexUrl);
      } catch {
        break;
      }

      const navBase = indexHtml.match(/name=["']eAISNavigationBase["'][^>]*src=["']([^"']+)["']/i)?.[1];
      if (navBase) {
        const tocUrl = new URL(normalizeRelativeHref(navBase), indexUrl).href;
        const tocHtml = await fetchText(tocUrl);
        const menuSrc = tocHtml.match(/name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i)?.[1];
        if (!menuSrc) throw new Error("Menu frame source not found.");
        return new URL(normalizeRelativeHref(menuSrc), tocUrl).href;
      }

      const refreshTarget = parseMetaRefreshTarget(indexHtml);
      if (!refreshTarget) break;
      indexUrl = new URL(normalizeRelativeHref(refreshTarget), indexUrl).href;
    }
  }

  throw new Error("Navigation frame not found.");
}

function parseGenEntries(menuHtml, menuUrl) {
  const bySection = new Map();
  const re = /<a[^>]*href=["']([^"']*GEN[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const label = stripHtml(m[2]);
    const sec =
      href.match(/GEN-([0-9]\.[0-9])/i)?.[1] ||
      href.match(/GEN[-_ ]([0-9]\.[0-9])/i)?.[1] ||
      label.match(/\bGEN\s*([0-9]\.[0-9])\b/i)?.[1];
    if (!sec) continue;
    const section = `GEN ${sec}`;
    if (bySection.has(section)) continue;
    bySection.set(section, {
      section,
      label: label || section,
      htmlUrl: new URL(normalizeRelativeHref(href), menuUrl).href,
    });
  }
  return [...bySection.values()].sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2Entries(menuHtml, menuUrl) {
  const byIcao = new Map();
  const re = /<a[^>]*href=["']([^"']*AD-2\.([A-Z0-9]{4})[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const icao = m[2]?.toUpperCase();
    const label = stripHtml(m[3]) || icao;
    if (!icao || byIcao.has(icao)) continue;
    byIcao.set(icao, {
      icao,
      label,
      htmlUrl: new URL(normalizeRelativeHref(href), menuUrl).href,
    });
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

function htmlToPdfUrl(url) {
  const u = new URL(url);
  u.hash = "";
  u.search = "";
  u.pathname = u.pathname.replace(/\/html\//i, "/pdf/");
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
    if (alt) candidates.push(new URL(normalizeRelativeHref(alt), htmlUrl).href);
  } catch {
    // Ignore and keep default candidate(s).
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
    console.log("Usage: node scripts/web-table-scrapers/sri-lanka-aip-interactive.mjs [--insecure] [--collect]");
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[LK] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const issues = await parseIssuesFromDropdown(START_INDEX_URL);
      if (!issues.length) throw new Error("No effective-date issues found in dropdown.");
      const issue = pickIssueFromInput("", issues);
      const menuUrl = await resolveMenuUrl(issue.issueUrl);
      const menuHtml = await fetchText(menuUrl);
      const ad2Entries = parseAd2Entries(menuHtml, menuUrl);
      printCollectJson({
        effectiveDate: isoDateFromText(issue.label) ?? issue.label,
        ad2Icaos: ad2Entries.map((e) => e.icao),
      });
    } catch (err) {
      console.error("[LK] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("Sri Lanka AIP — interactive downloader\n");
    const issues = await parseIssuesFromDropdown(START_INDEX_URL);
    if (!issues.length) throw new Error("No effective-date issues found in dropdown.");

    rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
    issues.forEach((x, i) => console.error(`${String(i + 1).padStart(3)}. ${x.label}`));
    const issueRaw = (await rl.question(`\nIssue number [enter=1, 1-${issues.length}]: `)).trim();
    const issue = pickIssueFromInput(issueRaw, issues);

    console.error(`\nUsing issue: ${issue.label}`);
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
      if (result.mode === "rendered") console.error("[LK] Direct PDF not available; saved rendered HTML as PDF.");
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (mode === "2") {
      ad2Entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.icao}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nAirport number 1-${ad2Entries.length} or ICAO: `, ad2Entries, (e) => `${e.icao} ${e.label}`);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${chosen.icao}_AD2.pdf`));
      const result = await savePdfWithFallback(chosen.htmlUrl, outFile);
      if (result.mode === "rendered") console.error("[LK] Direct PDF not available; saved rendered HTML as PDF.");
      console.error(`\nSaved: ${outFile}`);
      return;
    }
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error("[LK] failed:", err?.message || err);
  process.exit(1);
});
