#!/usr/bin/env node
/**
 * Interactive Finland eAIP downloader.
 *
 * Source:
 * - https://ais.fi/eaip/default.html
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "finland-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "finland-eaip", "AD2");
const ENTRY_URL = "https://ais.fi/eaip/default.html";
const UA = "Mozilla/5.0 (compatible; clearway-finland-eaip/1.0)";
const FETCH_TIMEOUT_MS = 45_000;
const log = (...args) => console.error("[FINLAND]", ...args);

const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, headers: { "User-Agent": UA } });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url) {
  log("Fetching HTML:", url);
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt >= 3) break;
      await sleep(500 * attempt);
    }
  }
  throw lastErr || new Error(`Failed to fetch ${url}`);
}

async function downloadPdf(url, outFile, referer = "") {
  log("Downloading PDF:", url);
  const res = await fetch(url, { headers: { "User-Agent": UA, ...(referer ? { Referer: referer } : {}) } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
  writeFileSync(outFile, bytes);
  log("Saved PDF:", outFile);
}

function stripHtml(v) {
  return String(v || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseIssueUrl(entryHtml) {
  const links = [...String(entryHtml || "").matchAll(/href=["']([^"']+index\.html)["']/gi)]
    .map((m) => String(m[1]).replace(/\\/g, "/"))
    .map((href) => new URL(href, ENTRY_URL).href)
    .sort();
  if (!links.length) throw new Error("Could not resolve Finland issue URL.");
  return links[links.length - 1];
}

function parseEffectiveDate(issueUrl) {
  const m = String(issueUrl || "").match(/_(20\d{2})_(\d{2})_(\d{2})\//);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseGenEntries(menuHtml, menuUrl) {
  const bySection = new Map();
  for (const m of String(menuHtml || "").matchAll(/href=['"]([^'"]*EF-GEN\s*([0-9.]+)-en-GB\.html(?:#[^'"]*)?)['"][^>]*>([\s\S]*?)<\/a>/gi)) {
    const section = `GEN-${m[2]}`;
    if (bySection.has(section)) continue;
    bySection.set(section, {
      section,
      label: stripHtml(m[3]) || section,
      htmlUrl: new URL(m[1], menuUrl).href,
    });
  }
  return [...bySection.values()].sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2Entries(menuHtml, menuUrl) {
  const byIcao = new Map();
  for (const m of String(menuHtml || "").matchAll(/href=['"]([^'"]*EF-AD\s*2\s*([A-Z0-9]{4})[^'"]*1-en-GB\.html(?:#[^'"]*)?)['"][^>]*>([\s\S]*?)<\/a>/gi)) {
    const icao = m[2].toUpperCase();
    if (byIcao.has(icao)) continue;
    byIcao.set(icao, {
      icao,
      label: stripHtml(m[3]) || icao,
      htmlUrl: new URL(m[1], menuUrl).href,
    });
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

async function resolveAdPrimaryPdf(adHtmlUrl, icao) {
  const page = await fetchText(adHtmlUrl);
  const links = [...String(page || "").matchAll(/href=["']([^"']+\.pdf[^"']*)["']/gi)].map((m) => m[1]);
  if (!links.length) return deriveTextPdfFromHtmlUrl(adHtmlUrl);
  const preferred = links.find((href) => new RegExp(`EF_AD_2_${icao}_`, "i").test(href)) || links[0];
  return new URL(preferred, adHtmlUrl).href;
}

function deriveTextPdfFromHtmlUrl(adHtmlUrl) {
  const htmlNoAnchor = String(adHtmlUrl || "").replace(/#.*$/, "");
  const slash = htmlNoAnchor.lastIndexOf("/");
  if (slash < 0) throw new Error(`Cannot derive text PDF URL from: ${adHtmlUrl}`);
  let path = htmlNoAnchor.slice(0, slash);
  let name = htmlNoAnchor.slice(slash);
  name = name.replace("-en-GB", "").replace("-fi-FI", "");
  const marker = path.lastIndexOf("/eAIP");
  if (marker >= 0) {
    path = path.slice(0, marker) + path.slice(marker).replace("/eAIP", "/documents/PDF");
  } else {
    path = `${path}/documents/PDF`;
  }
  return `${path}${name.replace(/\.html$/i, ".pdf")}`;
}

function gen12PdfUrl(issueRoot) {
  return new URL("documents/PDF/EF-GEN 1.2.pdf", issueRoot).href;
}

async function resolveContext() {
  const entryHtml = await fetchText(ENTRY_URL);
  const issueUrl = parseIssueUrl(entryHtml);
  const menuUrl = new URL("eAIP/menu.html", issueUrl).href;
  const menuHtml = await fetchText(menuUrl);
  const genEntries = parseGenEntries(menuHtml, menuUrl);
  const ad2Entries = parseAd2Entries(menuHtml, menuUrl);
  const effectiveDate = parseEffectiveDate(issueUrl);
  log("Resolved issue URL:", issueUrl);
  log("Resolved menu URL:", menuUrl);
  if (effectiveDate) log("Effective date:", effectiveDate);
  log("GEN entries found:", genEntries.length);
  log("AD2 entries found:", ad2Entries.length);
  return {
    issueRoot: issueUrl,
    effectiveDate,
    genEntries,
    ad2Entries,
  };
}

async function main() {
  const ctx = await resolveContext();
  const dateTag = ctx.effectiveDate || "unknown-date";

  if (collectMode()) {
    printCollectJson({ effectiveDate: ctx.effectiveDate, ad2Icaos: ctx.ad2Entries.map((x) => x.icao) });
    return;
  }

  if (downloadGen12) {
    const row = ctx.genEntries.find((x) => x.section === "GEN-1.2") || ctx.genEntries[0];
    if (!row) throw new Error("GEN entries not found.");
    mkdirSync(OUT_GEN, { recursive: true });
    await downloadPdf(gen12PdfUrl(ctx.issueRoot), join(OUT_GEN, `${dateTag}_${row.section}.pdf`), row.htmlUrl);
    return;
  }

  if (downloadAd2Icao) {
    const row = ctx.ad2Entries.find((x) => x.icao === downloadAd2Icao);
    if (!row) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    const outFile = join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`);
    const pdfUrl = await resolveAdPrimaryPdf(row.htmlUrl, row.icao);
    await downloadPdf(pdfUrl, outFile, row.htmlUrl);
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      const row = ctx.genEntries.find((x) => x.section === "GEN-1.2") || ctx.genEntries[0];
      if (!row) throw new Error("GEN entries not found.");
      mkdirSync(OUT_GEN, { recursive: true });
      await downloadPdf(gen12PdfUrl(ctx.issueRoot), join(OUT_GEN, `${dateTag}_${row.section}.pdf`), row.htmlUrl);
      return;
    }
    if (mode === "2") {
      ctx.ad2Entries.forEach((row, i) => console.error(`${String(i + 1).padStart(3)}. ${row.icao}  ${row.label}`));
      const raw = (await rl.question(`\nAirport number 1-${ctx.ad2Entries.length} or ICAO: `)).trim().toUpperCase();
      const n = Number.parseInt(raw, 10);
      const row =
        String(n) === raw && n >= 1 && n <= ctx.ad2Entries.length
          ? ctx.ad2Entries[n - 1]
          : ctx.ad2Entries.find((x) => x.icao === raw);
      if (!row) throw new Error("Invalid selection.");
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`);
      const pdfUrl = await resolveAdPrimaryPdf(row.htmlUrl, row.icao);
      await downloadPdf(pdfUrl, outFile, row.htmlUrl);
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});
