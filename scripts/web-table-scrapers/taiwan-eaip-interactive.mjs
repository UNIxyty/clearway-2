#!/usr/bin/env node
/**
 * Interactive Taiwan eAIP downloader.
 *
 * Source:
 * - https://ais.caa.gov.tw/eaip/
 *
 * Usage:
 *   node scripts/web-table-scrapers/taiwan-eaip-interactive.mjs
 *   node scripts/web-table-scrapers/taiwan-eaip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/taiwan-eaip-interactive.mjs --collect
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
const OUT_GEN = join(PROJECT_ROOT, "downloads", "taiwan-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "taiwan-eaip", "AD2");

const HISTORY_URL = "https://ais.caa.gov.tw/eaip/";
const FETCH_TIMEOUT_MS = 30_000;
const UA = "Mozilla/5.0 (compatible; clearway-tw-scraper/1.0)";
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
  const h = String(href || "").replace(/\\/g, "/");
  const hashIndex = h.indexOf("#");
  const base = hashIndex >= 0 ? h.slice(0, hashIndex) : h;
  const hash = hashIndex >= 0 ? h.slice(hashIndex) : "";
  const encoded = base
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return encoded + hash;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseIssues(historyHtml) {
  const re = /<a[^>]*href=["']([^"']*index\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const items = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(historyHtml))) {
    const rawHref = normalizeRelativeHref(m[1]);
    if (seen.has(rawHref)) continue;
    seen.add(rawHref);
    items.push({ label: stripHtml(m[2]) || rawHref, issueUrl: new URL(rawHref, HISTORY_URL).href });
  }
  return items;
}

async function resolveMenuUrl(issueUrl) {
  const indexHtml = await fetchText(issueUrl);
  const navBase =
    indexHtml.match(/name=["']eAISNavigationBase["'][^>]*src=["']([^"']+)["']/i)?.[1] ||
    indexHtml.match(/name=["']eAISNavigationBase["'][^>]*src=([^ >]+)/i)?.[1];
  if (!navBase) throw new Error("Navigation frame not found.");
  const tocUrl = new URL(normalizeRelativeHref(navBase), issueUrl).href;
  const tocHtml = await fetchText(tocUrl);
  const menuSrc =
    tocHtml.match(/name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i)?.[1] ||
    tocHtml.match(/name=["']eAISNavigation["'][^>]*src=([^ >]+)/i)?.[1];
  if (!menuSrc) throw new Error("Menu frame source not found.");
  return new URL(normalizeRelativeHref(menuSrc), tocUrl).href;
}

function parseGenEntries(menuHtml, menuUrl) {
  const bySection = new Map();
  const re = /<a[^>]*href=["']([^"']*GEN[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = normalizeRelativeHref(m[1]);
    const label = stripHtml(m[2]);
    const langRank = /-en-GB/i.test(href) ? 2 : /-zh-TW/i.test(href) ? 1 : 0;
    const sec = href.match(/GEN[\s-]*([0-9]\.[0-9])/i)?.[1] || label.match(/\bGEN\s*([0-9]\.[0-9])\b/i)?.[1];
    if (!sec) continue;
    const section = `GEN ${sec}`;
    const next = { section, label: label || section, htmlUrl: new URL(href, menuUrl).href, langRank };
    const prev = bySection.get(section);
    if (!prev || next.langRank > prev.langRank) {
      bySection.set(section, next);
    }
  }
  return [...bySection.values()]
    .map(({ langRank, ...rest }) => rest)
    .sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2Entries(menuHtml, menuUrl) {
  const byIcao = new Map();
  const re = /<a[^>]*href=["']([^"']*AD[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = normalizeRelativeHref(m[1]);
    const label = stripHtml(m[2]);
    const langRank = /-en-GB/i.test(href) ? 2 : /-zh-TW/i.test(href) ? 1 : 0;
    const icao = (href.match(/\b([A-Z]{4})\b/)?.[1] || label.match(/\b([A-Z]{4})\b/)?.[1])?.toUpperCase();
    if (!icao || !icao.startsWith("RC")) continue;
    if (!/AD\s*2/i.test(href) && !/AD\s*2/i.test(label)) continue;
    const next = { icao, label: label || icao, htmlUrl: new URL(href, menuUrl).href, langRank };
    const prev = byIcao.get(icao);
    if (!prev || next.langRank > prev.langRank) {
      byIcao.set(icao, next);
    }
  }
  return [...byIcao.values()]
    .map(({ langRank, ...rest }) => rest)
    .sort((a, b) => a.icao.localeCompare(b.icao));
}

function htmlToPdfUrl(url) {
  const u = new URL(url);
  u.hash = "";
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
    // ignore
  }
  return [...new Set(candidates)];
}

async function renderHtmlToPdf(htmlUrl, outFile) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(htmlUrl, { waitUntil: "networkidle", timeout: 120_000 });
    await page.pdf({ path: outFile, printBackground: true, format: "A4" });
  } finally {
    await browser.close();
  }
}

async function savePdfWithFallback(htmlUrl, outFile) {
  const candidates = await derivePdfCandidates(htmlUrl);
  for (const c of candidates) {
    try {
      await downloadPdf(c, outFile);
      return;
    } catch {
      // next candidate
    }
  }
  await renderHtmlToPdf(htmlUrl, outFile);
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
    console.log(`Usage: node scripts/web-table-scrapers/taiwan-eaip-interactive.mjs [--insecure] [--collect]
       node scripts/web-table-scrapers/taiwan-eaip-interactive.mjs --download-ad2 <ICAO>
       node scripts/web-table-scrapers/taiwan-eaip-interactive.mjs --download-gen12`);
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[TW] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const historyHtml = await fetchText(HISTORY_URL);
      const issues = parseIssues(historyHtml);
      if (!issues.length) throw new Error("No effective-date issues found.");
      const issue = issues[0];
      const menuUrl = await resolveMenuUrl(issue.issueUrl);
      const menuHtml = await fetchText(menuUrl);
      const ad2Entries = parseAd2Entries(menuHtml, menuUrl);
      printCollectJson({
        effectiveDate: isoDateFromText(issue.label) ?? issue.label,
        ad2Icaos: ad2Entries.map((e) => e.icao),
      });
    } catch (err) {
      console.error("[TW] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("Taiwan eAIP — interactive downloader\n");
    const historyHtml = await fetchText(HISTORY_URL);
    const issues = parseIssues(historyHtml);
    if (!issues.length) throw new Error("No effective-date issues found.");

    if (downloadGen12 || downloadAd2Icao) {
      const issue = issues[0];
      const menuUrl = await resolveMenuUrl(issue.issueUrl);
      const menuHtml = await fetchText(menuUrl);
      const genEntries = parseGenEntries(menuHtml, menuUrl);
      const ad2Entries = parseAd2Entries(menuHtml, menuUrl);
      if (!genEntries.length) throw new Error("No GEN entries found.");
      if (!ad2Entries.length) throw new Error("No AD2 entries found.");

      if (downloadGen12) {
        const chosen = genEntries.find((e) => /\bGEN\s*1\.2\b/i.test(e.section) || /\bGEN\s*1\.2\b/i.test(e.label) || /GEN[-_. ]?1[._-]?2/i.test(e.htmlUrl)) ?? genEntries[0];
        if (!/\bGEN\s*1\.2\b/i.test(chosen.section) && !/\bGEN\s*1\.2\b/i.test(chosen.label) && !/GEN[-_. ]?1[._-]?2/i.test(chosen.htmlUrl)) {
          console.error("[TW] GEN 1.2 not found; falling back to first available GEN entry.");
        }
        mkdirSync(OUT_GEN, { recursive: true });
        const outFile = join(OUT_GEN, "RC-GEN-1.2.pdf");
        await savePdfWithFallback(chosen.htmlUrl, outFile);
        console.error(`Saved: ${outFile}`);
        return;
      }

      const chosen = ad2Entries.find((e) => e.icao === downloadAd2Icao);
      if (!chosen) throw new Error(`AD2 ICAO not found in Taiwan package: ${downloadAd2Icao}`);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${chosen.icao}_AD2.pdf`));
      await savePdfWithFallback(chosen.htmlUrl, outFile);
      console.error(`Saved: ${outFile}`);
      return;
    }

    rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
    issues.slice(0, 20).forEach((x, i) => console.error(`${String(i + 1).padStart(3)}. ${x.label}`));
    const issueRaw = (await rl.question(`\nIssue number [enter=1, 1-${issues.length}]: `)).trim();
    const issue =
      !issueRaw || issueRaw === "1"
        ? issues[0]
        : await pickFromList(rl, "", issues, (x) => x.label);

    console.error(`\nUsing issue: ${issue.label}`);
    const menuUrl = await resolveMenuUrl(issue.issueUrl);
    const menuHtml = await fetchText(menuUrl);
    const genEntries = parseGenEntries(menuHtml, menuUrl);
    const ad2Entries = parseAd2Entries(menuHtml, menuUrl);
    if (!genEntries.length) throw new Error("No GEN entries found.");
    if (!ad2Entries.length) throw new Error("No AD2 entries found.");

    const mode = (await rl.question("\nDownload:\n  [1] GEN section PDF\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;

    if (mode === "1") {
      genEntries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.section}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nSection number 1-${genEntries.length}: `, genEntries, (e) => `${e.section} ${e.label}`);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${chosen.section}.pdf`));
      await savePdfWithFallback(chosen.htmlUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (mode === "2") {
      ad2Entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.icao}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nAirport number 1-${ad2Entries.length} or ICAO: `, ad2Entries, (e) => `${e.icao} ${e.label}`);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${chosen.icao}_AD2.pdf`));
      await savePdfWithFallback(chosen.htmlUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error("[TW] failed:", err?.message || err);
  process.exit(1);
});

