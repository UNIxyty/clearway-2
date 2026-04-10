#!/usr/bin/env node
/**
 * Interactive Bosnia and Herzegovina eAIP downloader (BHANSA).
 *
 * Flow:
 * 1) Read updates.json and choose effective date package
 * 2) Open selected issue index/menu
 * 3) Download GEN section PDF or AD 2 airport PDF
 *
 * Usage:
 *   node scripts/web-table-scrapers/bosnia-eaip-interactive.mjs
 *   node scripts/web-table-scrapers/bosnia-eaip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/bosnia-eaip-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stderr } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "bosnia-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "bosnia-eaip", "AD2");

const BASE_URL = "https://eaip.bhansa.gov.ba/";
const UPDATES_URL = new URL("updates.json", BASE_URL).href;
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
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; clearway-bhansa-scraper/1.0)",
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url) {
  const text = await fetchText(url);
  return JSON.parse(text);
}

function parseIssueDate(dateStr) {
  const months = {
    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11,
  };
  const m = String(dateStr || "")
    .trim()
    .match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = months[m[2].toUpperCase()];
  const year = Number(m[3]);
  if (!Number.isInteger(day) || month == null || !Number.isInteger(year)) return null;
  return new Date(Date.UTC(year, month, day));
}

function toIssueCode(dateStr) {
  const d = parseIssueDate(dateStr);
  if (!d) return null;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function resolveMenuUrl(indexHtml, indexUrl) {
  const directFrame = indexHtml.match(/<frame[^>]*name="eAISNavigation"[^>]*src="([^"]+)"/i)?.[1];
  if (directFrame) {
    return new URL(directFrame, indexUrl).href;
  }

  const baseFrame = indexHtml.match(/<frame[^>]*name="eAISNavigationBase"[^>]*src="([^"]+)"/i)?.[1];
  if (baseFrame) {
    const baseUrl = new URL(baseFrame, indexUrl).href;
    const baseHtml = await fetchText(baseUrl);
    const nestedFrame = baseHtml.match(/<frame[^>]*name="eAISNavigation"[^>]*src="([^"]+)"/i)?.[1];
    if (nestedFrame) {
      return new URL(nestedFrame, baseUrl).href;
    }
  }

  throw new Error("Could not find eAISNavigation frame in selected issue index.");
}

function parseGenEntries(menuHtml, menuUrl) {
  const re = /<a[^>]*href="([^"]*LQ-GEN-[^"]+\.html#(GEN-[^"]+))"[^>]*>([\s\S]*?)<\/a>/gi;
  const byHref = new Map();
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const anchor = m[2];
    const label = stripHtml(m[3]) || anchor;
    if (!/^GEN-\d+\.\d+/i.test(anchor)) continue;
    const key = href.toLowerCase();
    if (byHref.has(key)) continue;
    byHref.set(key, {
      anchor,
      label,
      htmlUrl: new URL(href, menuUrl).href,
    });
  }
  return [...byHref.values()].sort((a, b) => a.anchor.localeCompare(b.anchor, undefined, { numeric: true }));
}

function parseAd2Entries(menuHtml, menuUrl) {
  const re = /<a[^>]*href="([^"]*AD-2[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const byIcao = new Map();
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const absoluteHref = new URL(href, menuUrl).href;
    const label = stripHtml(m[2]);
    const icao =
      absoluteHref.match(/\b(LQ[A-Z0-9]{2})\b/i)?.[1]?.toUpperCase() ||
      label.match(/\b(LQ[A-Z0-9]{2})\b/i)?.[1]?.toUpperCase();
    if (!icao) continue;
    if (byIcao.has(icao)) continue;
    byIcao.set(icao, {
      icao,
      label,
      htmlUrl: absoluteHref,
    });
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

function htmlToBhansaPdfUrl(htmlUrl) {
  const href = String(htmlUrl || "");
  const splitNamePdf = href.split(/_([a-z]{2})\.pdf/);
  if (splitNamePdf.length > 1) return href;

  const htmlString = ".html";
  const amputate = "-CC";
  const startlocn = href.lastIndexOf("/") + 1;
  let step1 = href.substring(startlocn, href.lastIndexOf(htmlString) - amputate.length);
  step1 = step1.replace("eSUP", "Sup");
  if (step1.includes("eAIC")) {
    step1 = step1.replace("eAIC", "Circ");
  }
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
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; clearway-bhansa-scraper/1.0)",
    },
  });
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
    console.log(`Usage: node scripts/web-table-scrapers/bosnia-eaip-interactive.mjs [--insecure] [--collect]
       node scripts/web-table-scrapers/bosnia-eaip-interactive.mjs --download-ad2 <ICAO>
       node scripts/web-table-scrapers/bosnia-eaip-interactive.mjs --download-gen12

Interactive flow:
  [1] Pick effective-date issue from BHANSA updates list
  [2] Choose GEN section or AD 2 airport
  [3] Download PDF
`);
    return;
  }

  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[BA] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const updates = await fetchJson(UPDATES_URL);
      if (!Array.isArray(updates) || updates.length === 0) {
        throw new Error("No issues found in updates.json.");
      }
      const issues = updates
        .map((u) => {
          const effectiveDate = String(u?.effectiveDate || "").trim();
          const code = toIssueCode(effectiveDate);
          const ts = parseIssueDate(effectiveDate)?.getTime() ?? Number.NEGATIVE_INFINITY;
          if (!code) return null;
          return {
            effectiveDate,
            code,
            ts,
            indexUrl: new URL(`${code}-AIRAC/html/index.html`, BASE_URL).href,
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.ts - a.ts);
      if (!issues.length) throw new Error("Could not parse effective-date issues.");
      const issue = issues[0];
      const indexHtml = await fetchText(issue.indexUrl);
      const menuUrl = await resolveMenuUrl(indexHtml, issue.indexUrl);
      const menuHtml = await fetchText(menuUrl);
      const entries = parseAd2Entries(menuHtml, menuUrl);
      printCollectJson({ effectiveDate: issue.code, ad2Icaos: entries.map((e) => e.icao) });
    } catch (err) {
      console.error("[BA] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("Bosnia and Herzegovina eAIP — interactive downloader\n");
    console.error(`Issues source: ${UPDATES_URL}\n`);

    const updates = await fetchJson(UPDATES_URL);
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new Error("No issues found in updates.json.");
    }

    const issues = updates
      .map((u) => {
        const effectiveDate = String(u?.effectiveDate || "").trim();
        const code = toIssueCode(effectiveDate);
        const ts = parseIssueDate(effectiveDate)?.getTime() ?? Number.NEGATIVE_INFINITY;
        if (!code) return null;
        return {
          effectiveDate,
          publicationDate: String(u?.publicationDate || "").trim(),
          description: String(u?.description || "").trim(),
          code,
          ts,
          indexUrl: new URL(`${code}-AIRAC/html/index.html`, BASE_URL).href,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.ts - a.ts);

    if (!issues.length) throw new Error("Could not parse effective-date issues.");

    const autoMode = Boolean(downloadGen12 || downloadAd2Icao);
    let issue;
    if (autoMode) {
      issue = issues[0];
      console.error(`Auto-selected newest issue: ${issue.code}`);
    } else {
      console.error("--- Effective-date issues ---\n");
      issues.slice(0, 30).forEach((item, i) => {
        const descOneLine = item.description.replace(/\s+/g, " ").trim();
        console.error(`${String(i + 1).padStart(3)}. ${item.effectiveDate}  (${item.code})  ${descOneLine}`);
      });
      if (issues.length > 30) {
        console.error(`... and ${issues.length - 30} more (search by typing date/code).\n`);
      }

      rl = readline.createInterface({ input, output: stderr, terminal: Boolean(input.isTTY) });
      issue = await pickFromList(
        rl,
        `\nPick issue number 1-${issues.length} or type date/code: `,
        issues,
        (x) => `${x.effectiveDate} ${x.code} ${x.description}`
      );
    }

    const indexHtml = await fetchText(issue.indexUrl);
    const menuUrl = await resolveMenuUrl(indexHtml, issue.indexUrl);
    const menuHtml = await fetchText(menuUrl);

    if (downloadGen12) {
      const entries = parseGenEntries(menuHtml, menuUrl);
      if (!entries.length) throw new Error("No GEN entries found in selected issue menu.");
      const chosen = entries.find((e) => /\bGEN-1\.2\b/i.test(e.anchor) || /\bGEN\s*1\.2\b/i.test(e.label)) ?? entries[0];
      const pdfUrl = htmlToBhansaPdfUrl(chosen.htmlUrl);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${issue.code}_${chosen.anchor}.pdf`));
      await downloadPdf(pdfUrl, outFile);
      console.error(`Saved: ${outFile}`);
      return;
    }

    if (downloadAd2Icao) {
      const entries = parseAd2Entries(menuHtml, menuUrl);
      const chosen = entries.find((e) => e.icao === downloadAd2Icao);
      if (!chosen) throw new Error(`AD 2 ICAO not found in Bosnia menu: ${downloadAd2Icao}`);
      const pdfUrl = htmlToBhansaPdfUrl(chosen.htmlUrl);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${issue.code}_${chosen.icao}_AD2.pdf`));
      await downloadPdf(pdfUrl, outFile);
      console.error(`Saved: ${outFile}`);
      return;
    }

    console.error(`\nSelected issue: ${issue.effectiveDate} (${issue.code})`);
    console.error(`Index: ${issue.indexUrl}`);
    console.error(`Menu : ${menuUrl}\n`);

    const mode = (await rl.question("Download:\n  [1] GEN section PDF\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;

    if (mode === "1") {
      const entries = parseGenEntries(menuHtml, menuUrl);
      if (!entries.length) throw new Error("No GEN entries found in selected issue menu.");
      console.error("\n--- GEN sections ---\n");
      entries.forEach((e, i) => {
        console.error(`${String(i + 1).padStart(3)}. ${e.anchor}  ${e.label}`);
      });
      const chosen = await pickFromList(rl, `\nSection number 1-${entries.length}: `, entries, (e) => `${e.anchor} ${e.label}`);
      const pdfUrl = htmlToBhansaPdfUrl(chosen.htmlUrl);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${issue.code}_${chosen.anchor}.pdf`));
      console.error(`\n→ HTML: ${chosen.htmlUrl}`);
      console.error(`→ PDF : ${pdfUrl}`);
      await downloadPdf(pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (mode === "2") {
      const entries = parseAd2Entries(menuHtml, menuUrl);
      if (!entries.length) throw new Error("No AD 2 airport entries found in selected issue menu.");
      console.error("\n--- AD 2 airports ---\n");
      entries.forEach((e, i) => {
        console.error(`${String(i + 1).padStart(3)}. ${e.icao}  ${e.label}`);
      });
      const chosen = await pickFromList(rl, `\nAirport number 1-${entries.length} or ICAO: `, entries, (e) => `${e.icao} ${e.label}`);
      const pdfUrl = htmlToBhansaPdfUrl(chosen.htmlUrl);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${issue.code}_${chosen.icao}_AD2.pdf`));
      console.error(`\n→ HTML: ${chosen.htmlUrl}`);
      console.error(`→ PDF : ${pdfUrl}`);
      await downloadPdf(pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    console.error("Unknown choice.");
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error("[BA] failed:", err?.message || err);
  process.exit(1);
});
