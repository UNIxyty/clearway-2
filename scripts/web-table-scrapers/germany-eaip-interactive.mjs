#!/usr/bin/env node
/**
 * Interactive Germany eAIP downloader.
 *
 * Source:
 * - https://aip.dfs.de/
 */
import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "germany-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "germany-eaip", "AD2");
const ENTRY_URL = "https://aip.dfs.de/BasicIFR/2026APR20/chapter/279afdc243b210751d2f9f2401e5e4db.html";
const ROOT_URL = "https://aip.dfs.de/BasicIFR/";
const UA = "Mozilla/5.0 (compatible; clearway-germany-eaip/1.0)";
const FETCH_TIMEOUT_MS = 45_000;
const log = (...args) => console.error("[GERMANY]", ...args);

const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseCycleFromUrlOrHtml(url, html) {
  const fromUrl = String(url || "").match(/\/BasicIFR\/(20\d{2}[A-Z]{3}\d{2})\//i)?.[1];
  if (fromUrl) return fromUrl.toUpperCase();
  const fromHtml = String(html || "").match(/\/BasicIFR\/(20\d{2}[A-Z]{3}\d{2})\//i)?.[1];
  if (fromHtml) return fromHtml.toUpperCase();
  throw new Error("Could not resolve Germany AIRAC cycle.");
}

function cycleToIso(cycle) {
  const m = String(cycle || "").match(/^(20\d{2})([A-Z]{3})(\d{2})$/);
  if (!m) return null;
  const mm = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
    JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  }[m[2].toUpperCase()];
  if (!mm) return null;
  return `${m[1]}-${mm}-${m[3]}`;
}

function parseIcaosFromHtml(html) {
  const set = new Set();
  for (const m of String(html || "").matchAll(/\b(E[DT][A-Z0-9]{2})\b/g)) {
    set.add(String(m[1]).toUpperCase());
  }
  return [...set].sort();
}

function buildGenCandidates(airacRoot) {
  return [
    new URL("pdf/GEN1-2_en.pdf", airacRoot).href,
    new URL("pdf/GEN1-2.pdf", airacRoot).href,
    new URL("pdf/GEN_1_2_en.pdf", airacRoot).href,
  ];
}

function buildAd2Candidates(airacRoot, icao) {
  const up = String(icao || "").toUpperCase();
  return [
    new URL(`pdf/${up}_AD2_en.pdf`, airacRoot).href,
    new URL(`pdf/${up}_AD_2_en.pdf`, airacRoot).href,
    new URL(`pdf/${up}_AD2.pdf`, airacRoot).href,
  ];
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
  writeFileSync(outFile, bytes);
  log("Saved PDF:", outFile);
}

async function downloadFromCandidates(candidates, outFile) {
  let lastErr = null;
  for (const url of candidates) {
    try {
      log("Trying PDF:", url);
      await downloadPdf(url, outFile);
      return url;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("All PDF candidates failed.");
}

async function resolveContext() {
  const entryHtml = await fetchText(ENTRY_URL);
  const rootHtml = await fetchText(ROOT_URL).catch(() => "");
  const cycle = parseCycleFromUrlOrHtml(ENTRY_URL, `${entryHtml}\n${rootHtml}`);
  const airacRoot = new URL(`${cycle}/`, ROOT_URL).href;
  const effectiveDate = cycleToIso(cycle);
  const ad2Icaos = parseIcaosFromHtml(`${entryHtml}\n${rootHtml}`);
  return { cycle, airacRoot, effectiveDate, ad2Icaos };
}

async function main() {
  const ctx = await resolveContext();
  const dateTag = ctx.effectiveDate || ctx.cycle || "unknown-date";
  if (collectMode()) {
    printCollectJson({ effectiveDate: ctx.effectiveDate, ad2Icaos: ctx.ad2Icaos });
    return;
  }

  if (downloadGen12) {
    mkdirSync(OUT_GEN, { recursive: true });
    const outFile = join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`);
    await downloadFromCandidates(buildGenCandidates(ctx.airacRoot), outFile);
    return;
  }

  if (downloadAd2Icao) {
    if (!/^[A-Z0-9]{4}$/.test(downloadAd2Icao)) throw new Error("Provide a valid ICAO for --download-ad2.");
    mkdirSync(OUT_AD2, { recursive: true });
    const outFile = join(OUT_AD2, `${dateTag}_${downloadAd2Icao}_AD2.pdf`);
    await downloadFromCandidates(buildAd2Candidates(ctx.airacRoot, downloadAd2Icao), outFile);
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`);
      await downloadFromCandidates(buildGenCandidates(ctx.airacRoot), outFile);
      return;
    }
    if (mode === "2") {
      const raw = (await rl.question("ICAO (e.g. EDDF): ")).trim().toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(raw)) throw new Error("Invalid ICAO.");
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, `${dateTag}_${raw}_AD2.pdf`);
      await downloadFromCandidates(buildAd2Candidates(ctx.airacRoot, raw), outFile);
      return;
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});

