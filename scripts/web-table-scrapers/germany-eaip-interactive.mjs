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
const PRINT_ROOT = "https://aip.dfs.de/basicIFR/print/";
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

function normalizeText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAnchors(html) {
  return [...String(html || "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ href: String(m[1] || "").trim(), text: normalizeText(m[2]) }))
    .filter((x) => x.href);
}

function chapterHashFromHref(href) {
  const m = String(href || "").match(/^([a-f0-9]{32})\.html$/i);
  return m?.[1] || "";
}

function printUrl(section, chapterHash, title) {
  return `${PRINT_ROOT}${encodeURIComponent(section)}/${encodeURIComponent(chapterHash)}/${encodeURIComponent(title)}`;
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
  writeFileSync(outFile, bytes);
  log("Saved PDF:", outFile);
}

async function resolveSectionRoots(airacRoot) {
  const rootHtml = await fetchText(new URL("chapter/279afdc243b210751d2f9f2401e5e4db.html", airacRoot).href);
  const links = parseAnchors(rootHtml);
  const genHref = links.find((x) => /\bGEN\b/i.test(x.text) && chapterHashFromHref(x.href))?.href || "";
  const adHref = links.find((x) => /\bAD\b/i.test(x.text) && chapterHashFromHref(x.href))?.href || "";
  const genHash = chapterHashFromHref(genHref);
  const adHash = chapterHashFromHref(adHref);
  if (!genHash || !adHash) throw new Error("Could not resolve Germany GEN/AD roots.");
  return {
    genRootUrl: new URL(`chapter/${genHash}.html`, airacRoot).href,
    adRootUrl: new URL(`chapter/${adHash}.html`, airacRoot).href,
  };
}

async function resolveGen12PrintUrl(genRootUrl) {
  const genRootHtml = await fetchText(genRootUrl);
  const gen1Hash =
    chapterHashFromHref(parseAnchors(genRootHtml).find((x) => /\bGEN\s*1\b/i.test(x.text))?.href || "");
  if (!gen1Hash) throw new Error("Could not resolve Germany GEN 1 chapter.");

  const gen1Html = await fetchText(new URL(`${gen1Hash}.html`, new URL("./", genRootUrl)).href);
  const gen12Hash =
    chapterHashFromHref(parseAnchors(gen1Html).find((x) => /\bGEN\s*1\.2\b/i.test(x.text))?.href || "");
  if (!gen12Hash) throw new Error("Could not resolve Germany GEN 1.2 chapter.");

  return printUrl("GEN", gen12Hash, "GEN 1.2");
}

async function crawlAd2Chapters(adRootUrl, targetIcao = "") {
  const wanted = String(targetIcao || "").toUpperCase();
  const chapterBase = new URL("./", adRootUrl).href;
  const queue = [new URL(adRootUrl).pathname.split("/").pop() || ""];
  const seen = new Set();
  const map = new Map();

  while (queue.length) {
    const rel = queue.shift();
    const hash = chapterHashFromHref(rel);
    if (!hash || seen.has(hash)) continue;
    seen.add(hash);

    let html = "";
    try {
      html = await fetchText(new URL(`${hash}.html`, chapterBase).href);
    } catch {
      continue;
    }
    for (const m of html.matchAll(/\bAD\s*2\s*([A-Z0-9]{4})\b/gi)) {
      const icao = String(m[1]).toUpperCase();
      if (!map.has(icao)) map.set(icao, hash);
      if (wanted && icao === wanted) {
        return { targetHash: hash, map };
      }
    }
    for (const a of parseAnchors(html)) {
      const nextHash = chapterHashFromHref(a.href);
      if (nextHash && !seen.has(nextHash)) queue.push(`${nextHash}.html`);
    }
  }
  return { targetHash: wanted ? map.get(wanted) || "" : "", map };
}

async function resolveContext() {
  const entryHtml = await fetchText(ENTRY_URL);
  const rootHtml = await fetchText(ROOT_URL).catch(() => "");
  const cycle = parseCycleFromUrlOrHtml(ENTRY_URL, `${entryHtml}\n${rootHtml}`);
  const airacRoot = new URL(`${cycle}/`, ROOT_URL).href;
  const effectiveDate = cycleToIso(cycle);
  const roots = await resolveSectionRoots(airacRoot);
  return { cycle, airacRoot, effectiveDate, ...roots };
}

async function main() {
  const ctx = await resolveContext();
  const dateTag = ctx.effectiveDate || ctx.cycle || "unknown-date";
  if (collectMode()) {
    const ad2 = await crawlAd2Chapters(ctx.adRootUrl);
    printCollectJson({ effectiveDate: ctx.effectiveDate, ad2Icaos: [...ad2.map.keys()].sort() });
    return;
  }

  if (downloadGen12) {
    mkdirSync(OUT_GEN, { recursive: true });
    const outFile = join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`);
    const url = await resolveGen12PrintUrl(ctx.genRootUrl);
    log("Trying PDF:", url);
    await downloadPdf(url, outFile);
    return;
  }

  if (downloadAd2Icao) {
    if (!/^[A-Z0-9]{4}$/.test(downloadAd2Icao)) throw new Error("Provide a valid ICAO for --download-ad2.");
    const ad2 = await crawlAd2Chapters(ctx.adRootUrl, downloadAd2Icao);
    if (!ad2.targetHash) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    const outFile = join(OUT_AD2, `${dateTag}_${downloadAd2Icao}_AD2.pdf`);
    const url = printUrl("AD", ad2.targetHash, `AD 2 ${downloadAd2Icao}`);
    log("Trying PDF:", url);
    await downloadPdf(url, outFile);
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`);
      const url = await resolveGen12PrintUrl(ctx.genRootUrl);
      log("Trying PDF:", url);
      await downloadPdf(url, outFile);
      return;
    }
    if (mode === "2") {
      const ad2 = await crawlAd2Chapters(ctx.adRootUrl);
      const ad2Icaos = [...ad2.map.keys()].sort();
      if (!ad2Icaos.length) throw new Error("No AD2 ICAOs found.");
      ad2Icaos.forEach((code, i) => console.error(`${String(i + 1).padStart(3)}. ${code}`));
      const raw = (await rl.question("\nAirport number or ICAO (e.g. EDDF): ")).trim().toUpperCase();
      const n = Number.parseInt(raw, 10);
      const icao = String(n) === raw && n >= 1 && n <= ad2Icaos.length ? ad2Icaos[n - 1] : raw;
      if (!/^[A-Z0-9]{4}$/.test(icao)) throw new Error("Invalid ICAO.");
      const target = await crawlAd2Chapters(ctx.adRootUrl, icao);
      if (!target.targetHash) throw new Error(`AD2 ICAO not found: ${icao}`);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, `${dateTag}_${icao}_AD2.pdf`);
      const url = printUrl("AD", target.targetHash, `AD 2 ${icao}`);
      log("Trying PDF:", url);
      await downloadPdf(url, outFile);
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

