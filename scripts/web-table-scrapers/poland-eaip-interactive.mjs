#!/usr/bin/env node
/**
 * Interactive Poland eAIP downloader.
 *
 * Source:
 * - https://www.ais.pansa.pl/en/publications/aip-poland/
 * Uses v2 datasource JSON and deterministic documents/PDF endpoints.
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Script, createContext } from "vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "poland-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "poland-eaip", "AD2");
const ENTRY_URL = "https://www.ais.pansa.pl/en/publications/aip-poland/";
const UA = "Mozilla/5.0 (compatible; clearway-poland-eaip/1.0)";
const log = (...args) => console.error("[POLAND]", ...args);

const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

async function fetchText(url) {
  log("Fetching HTML:", url);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
}

async function downloadPdf(url, outFile) {
  log("Downloading PDF:", url);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
  writeFileSync(outFile, bytes);
  log("Saved PDF:", outFile);
}

function parseDefaultOfflineUrl(entryHtml) {
  const href = String(entryHtml || "").match(/href=["'](https:\/\/docs\.pansa\.pl\/ais\/eaipifr\/default_offline_[^"']+\.html)["']/i)?.[1] || "";
  if (!href) throw new Error("Could not resolve Poland default_offline URL.");
  return href;
}

function parseLatestIndexUrl(defaultOfflineHtml, defaultOfflineUrl) {
  const links = [...String(defaultOfflineHtml || "").matchAll(/href=["']([^"']*index-v2\.html)["']/gi)].map((m) =>
    String(m[1]).replace(/\\/g, "/"),
  );
  const abs = [...new Set(links.map((h) => new URL(h, defaultOfflineUrl).href))];
  if (!abs.length) throw new Error("Could not resolve Poland index-v2 URL.");
  abs.sort((a, b) => {
    const da = a.match(/_(20\d{2})_(\d{2})_(\d{2})\//);
    const db = b.match(/_(20\d{2})_(\d{2})_(\d{2})\//);
    const ka = da ? `${da[1]}-${da[2]}-${da[3]}` : a;
    const kb = db ? `${db[1]}-${db[2]}-${db[3]}` : b;
    return ka.localeCompare(kb);
  });
  return abs[abs.length - 1];
}

function parseDatasourceJson(jsText) {
  const source = String(jsText || "");
  if (!/DATASOURCE/.test(source)) throw new Error("DATASOURCE object was not found in Poland datasource.js");
  const script = new Script(`${source}\n;DATASOURCE;`);
  const ctx = createContext({});
  const data = script.runInContext(ctx);
  if (!data || typeof data !== "object") throw new Error("Failed to evaluate DATASOURCE object");
  return data;
}

function flattenMenu(nodes, out = []) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    out.push(node);
    if (Array.isArray(node.children) && node.children.length) flattenMenu(node.children, out);
  }
  return out;
}

function parseEffectiveDateFromTitle(title) {
  const m = String(title || "").match(/\bWEF\s+(\d{1,2})\s+([A-Z]{3})\s+(20\d{2})\b/i);
  if (!m) return null;
  const monthMap = {
    JAN: "01",
    FEB: "02",
    MAR: "03",
    APR: "04",
    MAY: "05",
    JUN: "06",
    JUL: "07",
    AUG: "08",
    SEP: "09",
    OCT: "10",
    NOV: "11",
    DEC: "12",
  };
  const mm = monthMap[m[2].toUpperCase()];
  if (!mm) return null;
  return `${m[3]}-${mm}-${String(Number.parseInt(m[1], 10)).padStart(2, "0")}`;
}

function parseContextFromDatasource(data) {
  const tab = Array.isArray(data?.tabs) ? data.tabs.find((t) => t?.contents?.["en-GB"]) : null;
  const en = tab?.contents?.["en-GB"];
  const menuFlat = flattenMenu(en?.menu || []);
  const ad2Set = new Set();
  for (const node of menuFlat) {
    const href = String(node?.href || "");
    const m = href.match(/AD 2 ([A-Z0-9]{4}) 1-en-GB\.html/i);
    if (m) ad2Set.add(m[1].toUpperCase());
  }
  return {
    effectiveDate: parseEffectiveDateFromTitle(en?.title || ""),
    ad2Icaos: [...ad2Set].sort(),
  };
}

function makeGenPdfUrl(issueBase) {
  return new URL("documents/PDF/GEN 1.2.pdf", issueBase).href;
}

function makeAd2PdfUrl(issueBase, icao) {
  return new URL(`documents/PDF/AD 2 ${icao} 1.pdf`, issueBase).href;
}

async function resolveContext() {
  const entryHtml = await fetchText(ENTRY_URL);
  const defaultOfflineUrl = parseDefaultOfflineUrl(entryHtml);
  const defaultOfflineHtml = await fetchText(defaultOfflineUrl);
  const indexUrl = parseLatestIndexUrl(defaultOfflineHtml, defaultOfflineUrl);
  const issueBase = new URL("./", indexUrl).href;
  const datasourceUrl = new URL("v2/js/datasource.js", issueBase).href;
  const datasourceJs = await fetchText(datasourceUrl);
  const data = parseDatasourceJson(datasourceJs);
  const parsed = parseContextFromDatasource(data);
  log("Resolved default_offline URL:", defaultOfflineUrl);
  log("Resolved issue URL:", indexUrl);
  if (parsed.effectiveDate) log("Effective date:", parsed.effectiveDate);
  log("AD2 entries found:", parsed.ad2Icaos.length);
  return {
    issueBase,
    effectiveDate: parsed.effectiveDate,
    ad2Icaos: parsed.ad2Icaos,
  };
}

async function main() {
  const ctx = await resolveContext();
  const dateTag = ctx.effectiveDate || "unknown-date";

  if (collectMode()) {
    printCollectJson({ effectiveDate: ctx.effectiveDate, ad2Icaos: ctx.ad2Icaos });
    return;
  }

  if (downloadGen12) {
    mkdirSync(OUT_GEN, { recursive: true });
    await downloadPdf(makeGenPdfUrl(ctx.issueBase), join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`));
    return;
  }

  if (downloadAd2Icao) {
    if (!ctx.ad2Icaos.includes(downloadAd2Icao)) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    await downloadPdf(makeAd2PdfUrl(ctx.issueBase, downloadAd2Icao), join(OUT_AD2, `${dateTag}_${downloadAd2Icao}_AD2.pdf`));
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      mkdirSync(OUT_GEN, { recursive: true });
      await downloadPdf(makeGenPdfUrl(ctx.issueBase), join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`));
      return;
    }
    if (mode === "2") {
      ctx.ad2Icaos.forEach((icao, i) => console.error(`${String(i + 1).padStart(3)}. ${icao}`));
      const raw = (await rl.question(`\nAirport number 1-${ctx.ad2Icaos.length} or ICAO: `)).trim().toUpperCase();
      const n = Number.parseInt(raw, 10);
      const icao =
        String(n) === raw && n >= 1 && n <= ctx.ad2Icaos.length ? ctx.ad2Icaos[n - 1] : raw;
      if (!ctx.ad2Icaos.includes(icao)) throw new Error("Invalid selection.");
      mkdirSync(OUT_AD2, { recursive: true });
      await downloadPdf(makeAd2PdfUrl(ctx.issueBase, icao), join(OUT_AD2, `${dateTag}_${icao}_AD2.pdf`));
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});
