#!/usr/bin/env node
/**
 * Interactive Sweden eAIP downloader.
 *
 * Source:
 * - https://aro.lfv.se/content/eaip/default_offline.html
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { Script, createContext } from "node:vm";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "sweden-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "sweden-eaip", "AD2");
const ENTRY_URL = "https://aro.lfv.se/content/eaip/default_offline.html";
const UA = "Mozilla/5.0 (compatible; clearway-sweden-eaip/1.0)";
const FETCH_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 3;
const log = (...args) => console.error("[SWEDEN]", ...args);

const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { headers: { "User-Agent": UA, ...extraHeaders }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url) {
  log("Fetching HTML:", url);
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        log(`Retrying fetch (${attempt}/${MAX_RETRIES - 1}):`, url);
        await sleep(400 * attempt);
      }
    }
  }
  throw lastErr || new Error(`Failed to fetch ${url}`);
}

async function downloadPdf(url, outFile, referer = "") {
  log("Downloading PDF:", url);
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(url, referer ? { Referer: referer } : {});
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
      writeFileSync(outFile, bytes);
      log("Saved PDF:", outFile);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        log(`Retrying download (${attempt}/${MAX_RETRIES - 1}):`, url);
        await sleep(500 * attempt);
      }
    }
  }
  throw lastErr || new Error(`Failed to download ${url}`);
}

function parseIssueIndexUrl(entryHtml) {
  const ranked = [...String(entryHtml || "").matchAll(/href=['"]([^'"]*AIRAC[^'"]*_(\d{4})_(\d{2})_(\d{2})[\\/]+index-v2\.html)['"]/gi)]
    .map((m) => {
      const href = String(m[1]).replace(/\\/g, "/").trim();
      const dateKey = `${m[2]}-${m[3]}-${m[4]}`;
      return { url: new URL(href, ENTRY_URL).href, dateKey };
    });
  if (!ranked.length) throw new Error("Could not resolve Sweden latest issue URL.");
  ranked.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return ranked[ranked.length - 1].url;
}

function parseEffectiveDate(issueIndexUrl) {
  const m = String(issueIndexUrl || "").match(/_(20\d{2})_(\d{2})_(\d{2})\/index-v2\.html$/i);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function parseDatasource(jsText) {
  const source = String(jsText || "");
  if (!/DATASOURCE/.test(source)) throw new Error("DATASOURCE object not found in Sweden datasource.");
  const script = new Script(`${source}\n;DATASOURCE;`);
  const data = script.runInContext(createContext({}));
  if (!data || typeof data !== "object") throw new Error("Failed to evaluate Sweden DATASOURCE object.");
  return data;
}

function walkMenu(nodes, out = []) {
  for (const n of nodes || []) {
    if (n && typeof n === "object" && typeof n.href === "string" && n.href) out.push(n);
    if (Array.isArray(n?.children)) walkMenu(n.children, out);
  }
  return out;
}

function toPdfUrl(issueRootUrl, href, langCode) {
  const html = String(href || "").replace(/#.*$/, "");
  const pdfRel = `documents/PDF/${html.replace(`-${langCode}.html`, ".pdf")}`;
  return new URL(pdfRel, issueRootUrl).href;
}

function parseFromDatasource(data, issueRootUrl) {
  const langCode = data?.commands?.languages?.find((x) => x?.code === "en-GB")?.code || "en-GB";
  const menu = data?.tabs?.[0]?.contents?.[langCode]?.menu || [];
  const all = walkMenu(menu, []);

  const genHref = all.find((x) => String(x.href).includes(`ES-GEN 1.2-${langCode}.html`))?.href;
  if (!genHref) throw new Error("Could not resolve Sweden GEN 1.2 href from datasource.");

  const adByIcao = new Map();
  for (const item of all) {
    const href = String(item?.href || "");
    const m = href.match(new RegExp(`ES-AD 2 ([A-Z0-9]{4}) [^#]* 1-${langCode}\\.html`, "i"));
    if (!m) continue;
    const icao = m[1].toUpperCase();
    if (adByIcao.has(icao)) continue;
    adByIcao.set(icao, {
      icao,
      label: icao,
      htmlUrl: new URL(`eAIP/${href}`, issueRootUrl).href,
      pdfUrl: toPdfUrl(issueRootUrl, href, langCode),
    });
  }

  const ad2Entries = [...adByIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
  if (!ad2Entries.length) throw new Error("No AD2 entries found in Sweden datasource.");

  return {
    genHtmlUrl: new URL(`eAIP/${genHref}`, issueRootUrl).href,
    genPdfUrl: toPdfUrl(issueRootUrl, genHref, langCode),
    ad2Entries,
  };
}

async function resolveContext() {
  const entryHtml = await fetchText(ENTRY_URL);
  const issueIndexUrl = parseIssueIndexUrl(entryHtml);
  const issueRootUrl = new URL("./", issueIndexUrl).href;
  const datasourceJs = await fetchText(new URL("v2/js/datasource.js", issueRootUrl).href);
  log("Parsing datasource...");
  const datasource = parseDatasource(datasourceJs);
  log("Building AD2 index from datasource...");
  const parsed = parseFromDatasource(datasource, issueRootUrl);
  const effectiveDate = parseEffectiveDate(issueIndexUrl);

  log("Resolved issue URL:", issueIndexUrl);
  if (effectiveDate) log("Effective date:", effectiveDate);
  log("AD2 entries found:", parsed.ad2Entries.length);

  return {
    issueRootUrl,
    issueIndexUrl,
    effectiveDate,
    ...parsed,
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
    mkdirSync(OUT_GEN, { recursive: true });
    await downloadPdf(ctx.genPdfUrl, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`), ctx.genHtmlUrl);
    return;
  }

  if (downloadAd2Icao) {
    const row = ctx.ad2Entries.find((x) => x.icao === downloadAd2Icao);
    if (!row) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    await downloadPdf(row.pdfUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`), row.htmlUrl);
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      mkdirSync(OUT_GEN, { recursive: true });
      await downloadPdf(ctx.genPdfUrl, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`), ctx.genHtmlUrl);
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
      await downloadPdf(row.pdfUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`), row.htmlUrl);
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});
