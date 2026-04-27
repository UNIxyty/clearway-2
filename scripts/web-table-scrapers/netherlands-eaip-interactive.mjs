#!/usr/bin/env node
/**
 * Interactive Netherlands eAIP downloader.
 *
 * Source:
 * - https://eaip.lvnl.nl/web/eaip/default.html
 */
import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "netherlands-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "netherlands-eaip", "AD2");
const ENTRY_URL = "https://eaip.lvnl.nl/web/eaip/default.html";
const MENU_URL = "https://eaip.lvnl.nl/web/eaip/html/eAIP/EH-menu-en-GB.html";
const GEN12_HTML_URL = "https://eaip.lvnl.nl/web/eaip/html/eAIP/EH-GEN-1.2-en-GB.html";
const UA = "Mozilla/5.0 (compatible; clearway-netherlands-eaip/1.0)";
const FETCH_TIMEOUT_MS = 45_000;
const log = (...args) => console.error("[NETHERLANDS]", ...args);

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
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 403 && /cf-challenge|just a moment|verify you are human/i.test(text)) {
        throw new Error(
          "Cloudflare challenge detected for Netherlands. Use the HITL noVNC flow (same as Lithuania/Greece) to solve verification first.",
        );
      }
      throw new Error(`${res.status} ${res.statusText}`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEffectiveDate(entryHtml) {
  const src = normalizeText(entryHtml);
  const m =
    src.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})\b/) ||
    src.match(/\bAIRAC[^0-9]*(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})\b/i);
  if (!m) return null;
  const mm = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  }[String(m[2]).slice(0, 3).toLowerCase()];
  if (!mm) return null;
  return `${m[3]}-${mm}-${String(m[1]).padStart(2, "0")}`;
}

function parseAd2Icaos(menuHtml) {
  const out = new Set();
  for (const m of String(menuHtml || "").matchAll(/EH-AD-2\.(EH[A-Z0-9]{2})-en-GB\.html/gi)) {
    out.add(String(m[1]).toUpperCase());
  }
  return [...out].sort();
}

function ad2HtmlUrl(icao) {
  return `https://eaip.lvnl.nl/web/eaip/html/eAIP/EH-AD-2.${icao}-en-GB.html`;
}

function parseMenuUrl(entryHtml) {
  const src =
    String(entryHtml || "").match(/<(?:frame|iframe)\b[^>]*\bsrc=["']([^"']*menu[^"']*)["']/i)?.[1] ||
    String(entryHtml || "").match(/href=["']([^"']*EH-menu[^"']*\.html[^"']*)["']/i)?.[1];
  if (!src) return MENU_URL;
  return new URL(src, ENTRY_URL).href;
}

function parseGen12HtmlUrl(menuHtml, menuUrl) {
  const href =
    String(menuHtml || "").match(/href=["']([^"']*EH-GEN-1\.2[^"']*\.html[^"']*)["']/i)?.[1] ||
    String(menuHtml || "").match(/href=["']([^"']*GEN[^"']*1\.2[^"']*\.html[^"']*)["']/i)?.[1];
  if (!href) return GEN12_HTML_URL;
  return new URL(href, menuUrl).href;
}

async function renderHtmlToPdf(htmlUrl, outFile) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error(
      "Playwright is required for Netherlands PDF rendering. Install it with `npm i playwright` and run `npx playwright install chromium`.",
    );
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      userAgent: UA,
      viewport: { width: 1366, height: 900 },
    });
    await page.goto(htmlUrl, { waitUntil: "networkidle", timeout: 120_000 });
    await page.pdf({
      path: outFile,
      format: "A4",
      printBackground: true,
      margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" },
    });
  } finally {
    await browser.close();
  }
}

async function resolveContext() {
  const entryHtml = await fetchText(ENTRY_URL);
  const menuUrl = parseMenuUrl(entryHtml);
  const menuHtml = await fetchText(menuUrl);
  const effectiveDate = parseEffectiveDate(entryHtml);
  const ad2Icaos = parseAd2Icaos(menuHtml);
  if (!ad2Icaos.length) throw new Error("No AD2 ICAOs found in Netherlands menu.");
  const gen12HtmlUrl = parseGen12HtmlUrl(menuHtml, menuUrl);
  return { effectiveDate, ad2Icaos, gen12HtmlUrl };
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
    await renderHtmlToPdf(ctx.gen12HtmlUrl, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`));
    return;
  }

  if (downloadAd2Icao) {
    const icao = downloadAd2Icao;
    if (!ctx.ad2Icaos.includes(icao)) throw new Error(`AD2 ICAO not found: ${icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    await renderHtmlToPdf(ad2HtmlUrl(icao), join(OUT_AD2, `${dateTag}_${icao}_AD2.pdf`));
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      mkdirSync(OUT_GEN, { recursive: true });
      await renderHtmlToPdf(ctx.gen12HtmlUrl, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`));
      return;
    }
    if (mode === "2") {
      ctx.ad2Icaos.forEach((code, i) => console.error(`${String(i + 1).padStart(3)}. ${code}`));
      const raw = (await rl.question("\nAirport number or ICAO: ")).trim().toUpperCase();
      const n = Number.parseInt(raw, 10);
      const icao = String(n) === raw && n >= 1 && n <= ctx.ad2Icaos.length ? ctx.ad2Icaos[n - 1] : raw;
      if (!ctx.ad2Icaos.includes(icao)) throw new Error("Invalid selection.");
      mkdirSync(OUT_AD2, { recursive: true });
      await renderHtmlToPdf(ad2HtmlUrl(icao), join(OUT_AD2, `${dateTag}_${icao}_AD2.pdf`));
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

