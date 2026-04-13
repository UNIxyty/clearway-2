#!/usr/bin/env node
/**
 * Interactive Qatar eAIP downloader.
 *
 * Rule requested by user:
 * - Use the FIRST row under Effective Date on Qatar AIM page.
 *
 * Usage:
 *   node scripts/web-table-scrapers/qatar-eaip-interactive.mjs
 *   node scripts/web-table-scrapers/qatar-eaip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/qatar-eaip-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson, isoDateFromText } from "./_collect-json.mjs";
import { stdin as input, stderr } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "qatar-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "qatar-eaip", "AD2");

const QATAR_AIM_URL = "https://www.caa.gov.qa/en/aeronautical-information-management";
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

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-qa-scraper/1.0)" },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseFirstEffectiveIssueUrl(qatarAimHtml) {
  // Try strict "first row with Effective Date + AIRAC index link" extraction.
  const rowMatches = [...qatarAimHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1] || "";
    const tds = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripHtml(m[1]));
    if (tds.length < 2) continue;
    const hasEffectiveDateCell = /\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/.test(tds[1] || "");
    if (!hasEffectiveDateCell) continue;
    const linkMatch = rowHtml.match(/href=["'](https?:\/\/www\.aim\.gov\.qa\/eaip\/[^"']*\/html\/index-en-GB\.html[^"']*)["']/i);
    if (!linkMatch?.[1]) continue;
    const indexUrl = linkMatch[1];
    const issueCode = indexUrl.match(/(\d{4}-\d{2}-\d{2}-AIRAC)/i)?.[1] ?? "QATAR-AIRAC";
    return {
      indexUrl,
      issueCode,
      effectiveDate: tds[1],
    };
  }

  // Fallback: first AIRAC index link in document order.
  const fallback = qatarAimHtml.match(/href=["'](https?:\/\/www\.aim\.gov\.qa\/eaip\/[^"']*\/html\/index-en-GB\.html[^"']*)["']/i)?.[1];
  if (!fallback) {
    throw new Error("Could not find Qatar AIRAC index link on AIM page.");
  }
  return {
    indexUrl: fallback,
    issueCode: fallback.match(/(\d{4}-\d{2}-\d{2}-AIRAC)/i)?.[1] ?? "QATAR-AIRAC",
    effectiveDate: "unknown",
  };
}

function parseTocUrl(indexHtml, indexUrl) {
  const m = indexHtml.match(/<frame[^>]*name=["']eAISNavigationBase["'][^>]*src=["']([^"']+)["']/i);
  return m?.[1] ? new URL(m[1], indexUrl).href : new URL("toc-frameset-en-GB.html", indexUrl).href;
}

function parseMenuUrlFromToc(tocHtml, tocUrl) {
  const m = tocHtml.match(/<frame[^>]*name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i);
  if (!m?.[1]) throw new Error("Could not find eAISNavigation frame in toc-frameset.");
  return new URL(m[1], tocUrl).href;
}

function parseGenEntries(menuHtml, menuUrl) {
  const re = /<a[^>]*href=["']([^"']*\/eAIP\/GEN-[^"']+\.html#(GEN-[^"']+))["'][^>]*>([\s\S]*?)<\/a>/gi;
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
  const re = /<a[^>]*href=["']([^"']*\/eAIP\/AD-2\.([A-Z0-9]{4})-en-GB\.html#AD-2\.\2)["'][^>]*>([\s\S]*?)<\/a>/gi;
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
  return String(htmlUrl)
    .replace(/\.html(?:\?.*)?(?:#.*)?$/i, ".pdf")
    .replace(/-[a-z]{2}-[A-Z]{2}\.pdf$/i, ".pdf")
    .replace(/\/html\/\D{4}\//, "/pdf/");
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-qa-scraper/1.0)" } });
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
    console.log(`Usage: node scripts/web-table-scrapers/qatar-eaip-interactive.mjs [--insecure] [--collect]
       node scripts/web-table-scrapers/qatar-eaip-interactive.mjs --download-ad2 <ICAO>
       node scripts/web-table-scrapers/qatar-eaip-interactive.mjs --download-gen12`);
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[QA] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const qatarAimHtml = await fetchText(QATAR_AIM_URL);
      const issue = parseFirstEffectiveIssueUrl(qatarAimHtml);
      const indexHtml = await fetchText(issue.indexUrl);
      const tocUrl = parseTocUrl(indexHtml, issue.indexUrl);
      const tocHtml = await fetchText(tocUrl);
      const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
      const menuHtml = await fetchText(menuUrl);
      const entries = parseAd2Entries(menuHtml, menuUrl);
      printCollectJson({
        effectiveDate: isoDateFromText(issue.issueCode) ?? isoDateFromText(issue.effectiveDate) ?? issue.effectiveDate,
        ad2Icaos: entries.map((e) => e.icao),
      });
    } catch (err) {
      console.error("[QA] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("Qatar eAIP — interactive downloader\n");

    const qatarAimHtml = await fetchText(QATAR_AIM_URL);
    const issue = parseFirstEffectiveIssueUrl(qatarAimHtml);

    const indexHtml = await fetchText(issue.indexUrl);
    const tocUrl = parseTocUrl(indexHtml, issue.indexUrl);
    const tocHtml = await fetchText(tocUrl);
    const menuUrl = parseMenuUrlFromToc(tocHtml, tocUrl);
    const menuHtml = await fetchText(menuUrl);

    console.error(`Selected (first Effective Date row): ${issue.effectiveDate}  ${issue.issueCode}`);
    console.error(`Issue: ${issue.indexUrl}`);
    console.error(`Menu:  ${menuUrl}\n`);

    if (downloadGen12) {
      const entries = parseGenEntries(menuHtml, menuUrl);
      if (!entries.length) throw new Error("No GEN entries found.");
      const chosen = entries.find((e) => /^GEN-1\.2/i.test(e.anchor) || /\bGEN\s*1\.2\b/i.test(e.label)) ?? entries[0];
      const pdfUrl = htmlToPdfUrl(chosen.htmlUrl);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${issue.issueCode}_${chosen.anchor}.pdf`));
      await downloadPdf(pdfUrl, outFile);
      console.error(`Saved: ${outFile}`);
      return;
    }

    if (downloadAd2Icao) {
      const entries = parseAd2Entries(menuHtml, menuUrl);
      const chosen = entries.find((e) => e.icao === downloadAd2Icao);
      if (!chosen) throw new Error(`AD2 ICAO not found in Qatar package: ${downloadAd2Icao}`);
      const pdfUrl = htmlToPdfUrl(chosen.htmlUrl);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${issue.issueCode}_${chosen.icao}_AD2.pdf`));
      await downloadPdf(pdfUrl, outFile);
      console.error(`Saved: ${outFile}`);
      return;
    }

    rl = readline.createInterface({ input, output: stderr, terminal: Boolean(input.isTTY) });
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
  console.error("[QA] failed:", err?.message || err);
  process.exit(1);
});
