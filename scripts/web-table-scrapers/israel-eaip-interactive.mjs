#!/usr/bin/env node
/**
 * Interactive Israel eAIP downloader.
 *
 * Usage:
 *   node scripts/web-table-scrapers/israel-eaip-interactive.mjs
 *   node scripts/web-table-scrapers/israel-eaip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/israel-eaip-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson, pickNewestIssueByIso, isoDateFromText } from "./_collect-json.mjs";
import { stdin as input, stderr } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "israel-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "israel-eaip", "AD2");

const HISTORY_URL = "https://e-aip.azurefd.net";
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

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-il-scraper/1.0)" },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseIssues(historyHtml) {
  const re = /<a[^>]*href=["']([^"']*AIRAC\/html\/index\.html)["'][^>]*>/gi;
  const out = [];
  let m;
  while ((m = re.exec(historyHtml))) {
    const href = m[1];
    const issueCode = href.match(/(\d{4}-\d{2}-\d{2}-AIRAC)/i)?.[1] ?? href;
    const datePart = issueCode.match(/^(\d{4})-(\d{2})-(\d{2})/)?.slice(1).join("-") ?? issueCode;
    out.push({
      effectiveDate: datePart,
      issueCode,
      indexUrl: new URL(href, HISTORY_URL).href,
    });
  }
  const seen = new Set();
  return out.filter((x) => {
    if (seen.has(x.indexUrl)) return false;
    seen.add(x.indexUrl);
    return true;
  });
}

function parseMenuUrl(indexHtml, indexUrl) {
  const m = indexHtml.match(/<frame[^>]*name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i);
  if (!m?.[1]) throw new Error("Could not find eAISNavigation frame URL.");
  return new URL(m[1], indexUrl).href;
}

function parseGenEntries(menuHtml, menuUrl) {
  const re = /<a[^>]*href=["']([^"']*LL-GEN-[^"']+\.html#(GEN-[^"']+))["'][^>]*>([\s\S]*?)<\/a>/gi;
  const byAnchor = new Map();
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const anchor = m[2];
    const label = stripHtml(m[3]) || anchor;
    if (!/^GEN-\d+\.\d+/i.test(anchor)) continue;
    if (!byAnchor.has(anchor)) {
      byAnchor.set(anchor, { anchor, label, htmlUrl: new URL(href, menuUrl).href });
    }
  }
  return [...byAnchor.values()].sort((a, b) => a.anchor.localeCompare(b.anchor, undefined, { numeric: true }));
}

function parseAd2Entries(menuHtml, menuUrl) {
  const re = /<a[^>]*href=["']([^"']*LL-AD-2\.([A-Z0-9]{4})-en-GB\.html#AD-2\.\2)["'][^>]*>([\s\S]*?)<\/a>/gi;
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

function htmlToPdfUrl(htmlUrl) {
  const href = String(htmlUrl || "");
  const htmlString = ".html";
  const amputate = "-CC";
  const startlocn = href.lastIndexOf("/") + 1;
  let step1 = href.substring(startlocn, href.lastIndexOf(htmlString) - amputate.length);
  if (step1.includes("eSUP")) step1 = step1.replace("eSUP", "Sup");
  if (step1.includes("eAIC")) step1 = step1.replace("eAIC", "Circ");
  const mypath = href.substring(0, startlocn);
  let anchor = href.substr(href.lastIndexOf(htmlString) + htmlString.length + 1);
  let step2 = `${mypath}${step1.replace(/[-.]/g, "_")}.pdf`;
  if (anchor.length > 0) {
    if (anchor.includes("amdt=show#")) anchor = anchor.replace("amdt=show#", "");
    step2 += `#E.${anchor}`;
  }
  return step2.replace(/\/html\/\D{4}\//, "/pdf/");
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-il-scraper/1.0)" } });
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
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
    console.log(`Usage: node scripts/web-table-scrapers/israel-eaip-interactive.mjs [--insecure] [--collect]`);
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[IL] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const historyHtml = await fetchText(HISTORY_URL);
      const issues = parseIssues(historyHtml);
      if (!issues.length) throw new Error("No issue links found on Israel page.");
      const issue = pickNewestIssueByIso(issues, (x) => x.effectiveDate);
      const indexHtml = await fetchText(issue.indexUrl);
      const menuUrl = parseMenuUrl(indexHtml, issue.indexUrl);
      const menuHtml = await fetchText(menuUrl);
      const entries = parseAd2Entries(menuHtml, menuUrl);
      printCollectJson({
        effectiveDate: isoDateFromText(issue.effectiveDate) ?? issue.effectiveDate,
        ad2Icaos: entries.map((e) => e.icao),
      });
    } catch (err) {
      console.error("[IL] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("Israel eAIP — interactive downloader\n");
    const historyHtml = await fetchText(HISTORY_URL);
    const issues = parseIssues(historyHtml);
    if (!issues.length) throw new Error("No issue links found on Israel page.");

    console.error("--- Available issues ---\n");
    issues.forEach((x, i) => console.error(`${String(i + 1).padStart(3)}. ${x.effectiveDate}  ${x.issueCode}`));

    rl = readline.createInterface({ input, output: stderr, terminal: Boolean(input.isTTY) });
    const issue = await pickFromList(rl, `\nIssue number 1-${issues.length}: `, issues, (x) => `${x.effectiveDate} ${x.issueCode}`);

    const indexHtml = await fetchText(issue.indexUrl);
    const menuUrl = parseMenuUrl(indexHtml, issue.indexUrl);
    const menuHtml = await fetchText(menuUrl);

    console.error(`\nSelected: ${issue.effectiveDate} (${issue.issueCode})`);
    console.error(`Menu: ${menuUrl}\n`);

    const mode = (await rl.question("Download:\n  [1] GEN section PDF\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;

    if (mode === "1") {
      const entries = parseGenEntries(menuHtml, menuUrl);
      if (!entries.length) throw new Error("No GEN entries found.");
      entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.anchor}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nSection number 1-${entries.length}: `, entries, (e) => `${e.anchor} ${e.label}`);
      const pdfUrl = htmlToPdfUrl(chosen.htmlUrl);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${issue.issueCode}_${chosen.anchor}.pdf`));
      await downloadPdf(pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (mode === "2") {
      const entries = parseAd2Entries(menuHtml, menuUrl);
      if (!entries.length) throw new Error("No AD2 entries found.");
      entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.icao}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nAirport number 1-${entries.length} or ICAO: `, entries, (e) => `${e.icao} ${e.label}`);
      const pdfUrl = htmlToPdfUrl(chosen.htmlUrl);
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
  console.error("[IL] failed:", err?.message || err);
  process.exit(1);
});
