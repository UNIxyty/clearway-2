#!/usr/bin/env node
/**
 * Interactive India eAIP downloader.
 *
 * Usage:
 *   node scripts/web-table-scrapers/india-eaip-interactive.mjs
 *   node scripts/web-table-scrapers/india-eaip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/india-eaip-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson, pickNewestIssueByIso, isoDateFromText } from "./_collect-json.mjs";
import { stdin as input, stderr } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "india-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "india-eaip", "AD2");

const SUPPLEMENTS_URL = "https://aim-india.aai.aero/aip-supplements?page=1";
const FETCH_TIMEOUT_MS = 60_000;
const FETCH_RETRIES = 4;
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

async function fetchText(url) {
  let lastError = null;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-india-scraper/1.0)" },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.text();
    } catch (err) {
      lastError = err;
      const msg = String(err?.message || err).toLowerCase();
      const transient =
        msg.includes("fetch failed") ||
        msg.includes("network") ||
        msg.includes("timeout") ||
        msg.includes("aborted") ||
        msg.includes("terminated") ||
        msg.includes("econnreset") ||
        msg.includes("socket");
      if (!transient || attempt === FETCH_RETRIES) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("Failed to fetch page.");
}

function parseIssuesFromSupplements(html) {
  const re = /<a[^>]*href=["']([^"']*\/eaip\/eaip-v2-[^"']*\/index-en-GB\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const label = stripHtml(m[2]);
    const issueCode = href.match(/eaip-v2-([0-9-]+-[0-9]{4})/i)?.[1] ?? href;
    out.push({
      label,
      issueCode,
      indexUrl: new URL(href, SUPPLEMENTS_URL).href,
    });
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
  const src = m?.[1] ?? "toc-frameset-en-GB.html";
  return new URL(src, indexUrl).href;
}

function parseMenuUrl(tocHtml, tocUrl) {
  const m = tocHtml.match(/<frame[^>]*name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i);
  if (!m?.[1]) throw new Error("Could not find eAISNavigation frame in India toc-frameset.");
  return new URL(m[1], tocUrl).href;
}

function parseGenEntries(menuHtml, menuUrl) {
  const re = /<a[^>]*href=["']([^"']*IN-GEN[^"']+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const bySection = new Map();
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const label = stripHtml(m[2]);
    const section = label.match(/\bGEN\s+(\d+\.\d+)/i)?.[1] ?? null;
    if (!section) continue;
    if (!bySection.has(section)) {
      bySection.set(section, {
        anchor: section,
        label,
        htmlUrl: new URL(href, menuUrl).href,
      });
    }
  }
  return [...bySection.values()].sort((a, b) => a.anchor.localeCompare(b.anchor, undefined, { numeric: true }));
}

function parseAd2Entries(menuHtml, menuUrl) {
  const re = /<a[^>]*href=["']([^"']*IN-AD\s*2\.1([A-Z0-9]{4})-en-GB\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const byIcao = new Map();
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const icao = m[2].toUpperCase();
    const label = stripHtml(m[3]) || icao;
    if (!byIcao.has(icao)) {
      byIcao.set(icao, {
        icao,
        label,
        htmlUrl: new URL(href, menuUrl).href,
      });
    }
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

function htmlToIndiaPdfUrl(htmlUrl) {
  const href = String(htmlUrl || "");
  const slashPos = href.lastIndexOf("/");
  const path = href.substring(0, slashPos);
  let cut = href.substring(slashPos);

  const updPos = cut.indexOf("#UPDT");
  if (updPos > 0) cut = cut.substring(0, updPos);

  const firstDash = cut.indexOf("-");
  cut = cut.substring(firstDash);
  const lastDash = cut.lastIndexOf("-");
  cut = cut.substring(1, lastDash);
  const secondLastDash = cut.lastIndexOf("-");
  const namePdf = cut.substring(0, secondLastDash);

  const pdfPath = path.replace("/eaip-v2-", "/eaip-v2-");
  const rootFixed = pdfPath.replace(/\/eaip-v2-[^/]+/, (x) => `${x}/pdf`);
  return `${rootFixed}/${namePdf}.pdf`;
}

async function downloadPdf(url, outFile) {
  let lastError = null;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-india-scraper/1.0)" },
      });
      if (!res.ok) throw new Error(`PDF fetch failed: ${res.status} ${res.statusText}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      writeFileSync(outFile, bytes);
      return;
    } catch (err) {
      lastError = err;
      const msg = String(err?.message || err).toLowerCase();
      const transient =
        msg.includes("fetch failed") ||
        msg.includes("network") ||
        msg.includes("timeout") ||
        msg.includes("aborted") ||
        msg.includes("terminated") ||
        msg.includes("econnreset") ||
        msg.includes("socket");
      if (!transient || attempt === FETCH_RETRIES) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("Failed to download PDF.");
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
    console.log(`Usage: node scripts/web-table-scrapers/india-eaip-interactive.mjs [--insecure] [--collect]
       node scripts/web-table-scrapers/india-eaip-interactive.mjs --download-ad2 <ICAO>
       node scripts/web-table-scrapers/india-eaip-interactive.mjs --download-gen12`);
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[IN] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const listHtml = await fetchText(SUPPLEMENTS_URL);
      const issues = parseIssuesFromSupplements(listHtml);
      if (!issues.length) throw new Error("No effective-date eAIP links found on India supplements page.");
      const issue = pickNewestIssueByIso(issues, (x) => `${x.label} ${x.issueCode}`);
      const indexHtml = await fetchText(issue.indexUrl);
      const tocUrl = parseTocUrl(indexHtml, issue.indexUrl);
      const tocHtml = await fetchText(tocUrl);
      const menuUrl = parseMenuUrl(tocHtml, tocUrl);
      const menuHtml = await fetchText(menuUrl);
      const entries = parseAd2Entries(menuHtml, menuUrl);
      printCollectJson({
        effectiveDate: isoDateFromText(issue.issueCode) ?? isoDateFromText(issue.label) ?? issue.issueCode,
        ad2Icaos: entries.map((e) => e.icao),
      });
    } catch (err) {
      console.error("[IN] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("India eAIP — interactive downloader\n");
    console.error(`Source page: ${SUPPLEMENTS_URL}\n`);
    const listHtml = await fetchText(SUPPLEMENTS_URL);
    const issues = parseIssuesFromSupplements(listHtml);
    if (!issues.length) throw new Error("No effective-date eAIP links found on India supplements page.");

    const autoMode = Boolean(downloadAd2Icao || downloadGen12);
    let issue;
    if (autoMode) {
      issue = pickNewestIssueByIso(issues, (x) => `${x.label} ${x.issueCode}`);
      console.error(`Auto-selected newest issue: ${issue.issueCode}`);
    } else {
      console.error("--- Effective-date issues ---\n");
      issues.forEach((x, i) => console.error(`${String(i + 1).padStart(3)}. ${x.label}`));

      rl = readline.createInterface({ input, output: stderr, terminal: Boolean(input.isTTY) });
      issue = await pickFromList(rl, `\nIssue number 1-${issues.length}: `, issues, (x) => `${x.label} ${x.issueCode}`);
    }

    const indexHtml = await fetchText(issue.indexUrl);
    const tocUrl = parseTocUrl(indexHtml, issue.indexUrl);
    const tocHtml = await fetchText(tocUrl);
    const menuUrl = parseMenuUrl(tocHtml, tocUrl);
    const menuHtml = await fetchText(menuUrl);

    if (downloadGen12) {
      const entries = parseGenEntries(menuHtml, menuUrl);
      if (!entries.length) throw new Error("No GEN entries found in India menu.");
      const chosen = entries.find((e) => /\b1\.2\b/.test(e.anchor) || /\bGEN\s*1\.2\b/i.test(e.label)) ?? entries[0];
      const pdfUrl = htmlToIndiaPdfUrl(chosen.htmlUrl);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${issue.issueCode}_GEN_${chosen.anchor}.pdf`));
      await downloadPdf(pdfUrl, outFile);
      console.error(`Saved: ${outFile}`);
      return;
    }

    if (downloadAd2Icao) {
      const entries = parseAd2Entries(menuHtml, menuUrl);
      const chosen = entries.find((e) => e.icao === downloadAd2Icao);
      if (!chosen) throw new Error(`AD2 ICAO not found in India menu: ${downloadAd2Icao}`);
      const pdfUrl = htmlToIndiaPdfUrl(chosen.htmlUrl);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${issue.issueCode}_${chosen.icao}_AD2.pdf`));
      await downloadPdf(pdfUrl, outFile);
      console.error(`Saved: ${outFile}`);
      return;
    }

    console.error(`\nSelected: ${issue.label}`);
    console.error(`Menu: ${menuUrl}\n`);

    const mode = (await rl.question("Download:\n  [1] GEN section PDF\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;

    if (mode === "1") {
      const entries = parseGenEntries(menuHtml, menuUrl);
      if (!entries.length) throw new Error("No GEN entries found in India menu.");
      entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. GEN ${e.anchor}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nSection number 1-${entries.length}: `, entries, (e) => `${e.anchor} ${e.label}`);
      const pdfUrl = htmlToIndiaPdfUrl(chosen.htmlUrl);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${issue.issueCode}_GEN_${chosen.anchor}.pdf`));
      await downloadPdf(pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (mode === "2") {
      const entries = parseAd2Entries(menuHtml, menuUrl);
      if (!entries.length) throw new Error("No AD2 entries found in India menu.");
      entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.icao}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nAirport number 1-${entries.length} or ICAO: `, entries, (e) => `${e.icao} ${e.label}`);
      const pdfUrl = htmlToIndiaPdfUrl(chosen.htmlUrl);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${issue.issueCode}_${chosen.icao}_AD2.pdf`));
      await downloadPdf(pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error("[IN] failed:", err?.message || err);
  process.exit(1);
});
