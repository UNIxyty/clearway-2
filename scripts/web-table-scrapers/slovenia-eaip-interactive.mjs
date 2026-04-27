#!/usr/bin/env node
/**
 * Interactive Slovenia eAIP downloader.
 *
 * Source:
 * - https://aim.sloveniacontrol.si/aim/products/aip/
 */
import readline from "node:readline/promises";
import { collectMode, printCollectJson, isoDateFromText } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "slovenia-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "slovenia-eaip", "AD2");
const ENTRY_URL = "https://aim.sloveniacontrol.si/aim/products/aip/";
const AD2_PAGE_PATH = "/aim/products/aip/part-3-aerodromes-ad/ad-2-aerodromes/";
const GEN1_PAGE_PATH = "/aim/products/aip/part-1-general-gen/gen-1-national-regulations-and-requirements/";
const UA = "Mozilla/5.0 (compatible; clearway-slovenia-eaip/1.0)";
const FETCH_TIMEOUT_MS = 45_000;
const log = (...args) => console.error("[SLOVENIA]", ...args);
const execFileAsync = promisify(execFile);

const useInsecure = process.argv.includes("--insecure");
const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

if (useInsecure) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  log("TLS verification disabled (--insecure)");
}

function normalizeText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHref(href) {
  return String(href || "").replace(/\\/g, "/");
}

function parseDotDate(value) {
  const m = String(value || "").match(/\b(\d{2})\.(\d{2})\.(20\d{2})\b/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

async function runCurl(url, { insecure = false, binary = false } = {}) {
  const args = ["-L", "-sS", "--max-time", String(Math.ceil(FETCH_TIMEOUT_MS / 1000)), "-A", UA];
  if (insecure) args.unshift("-k");
  args.push(url);
  const { stdout } = await execFileAsync("curl", args, {
    maxBuffer: 24 * 1024 * 1024,
    encoding: binary ? "buffer" : "utf8",
  });
  return stdout;
}

function shouldRetryInsecure(err) {
  const msg = String(err?.stderr || err?.message || "");
  return /SSL certificate problem|unable to get local issuer certificate|certificate/i.test(msg);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } catch (err) {
    try {
      const out = await runCurl(url, { insecure: useInsecure, binary: false });
      if (String(out || "").trim()) return String(out);
    } catch (curlErr) {
      if (useInsecure || shouldRetryInsecure(curlErr)) {
        const out = await runCurl(url, { insecure: true, binary: false });
        if (String(out || "").trim()) return String(out);
      }
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBytes(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    try {
      const out = await runCurl(url, { insecure: useInsecure, binary: true });
      return Buffer.isBuffer(out) ? out : Buffer.from(out || "", "utf8");
    } catch (curlErr) {
      if (useInsecure || shouldRetryInsecure(curlErr)) {
        const out = await runCurl(url, { insecure: true, binary: true });
        return Buffer.isBuffer(out) ? out : Buffer.from(out || "", "utf8");
      }
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function parseEntryIssue(entryHtml) {
  const links = [...String(entryHtml || "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ href: normalizeHref(m[1]), label: normalizeText(m[2]) }));
  const chosen =
    links.find((x) => /eAIP/i.test(x.label) && /Effective/i.test(x.label)) ||
    links.find((x) => /eAIP/i.test(x.href) && /effective|history|index/i.test(x.href)) ||
    links.find((x) => /eAIP/i.test(x.href));
  return {
    issueUrl: chosen?.href ? new URL(chosen.href, ENTRY_URL).href : ENTRY_URL,
    effectiveDate: chosen?.label ? isoDateFromText(chosen.label) : null,
  };
}

function parseGen12PdfUrl(html, baseUrl) {
  const m = String(html || "").match(/href=["']([^"']*LJ_GEN_1_2_en\.pdf[^"']*)["']/i);
  if (!m?.[1]) return null;
  return new URL(normalizeHref(m[1]), baseUrl).href;
}

function parseAd2EntriesFromPdfLinks(html, baseUrl) {
  const byIcao = new Map();
  for (const m of String(html || "").matchAll(/href=["']([^"']*LJ_AD_2_([A-Z0-9]{4})_en\.pdf[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const icao = String(m[2] || "").toUpperCase();
    if (!icao || byIcao.has(icao)) continue;
    byIcao.set(icao, {
      icao,
      label: normalizeText(m[3]) || icao,
      htmlUrl: new URL(normalizeHref(m[1]), baseUrl).href,
    });
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

function htmlToPdfCandidates(htmlUrl) {
  const clean = String(htmlUrl || "").replace(/#.*$/, "");
  if (/\.pdf(\?|$)/i.test(clean)) return [clean];
  const out = [
    clean.replace(/\/eAIP\//i, "/pdf/").replace(/\.html?$/i, ".pdf"),
    clean.replace(/\/html\/eAIP\//i, "/pdf/").replace(/\.html?$/i, ".pdf"),
    clean.replace(/-en-GB/i, "").replace(/\.html?$/i, ".pdf"),
  ].filter(Boolean);
  return [...new Set(out)];
}

async function downloadPdf(url, outFile) {
  const bytes = await fetchBytes(url);
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("Downloaded payload is not a PDF");
  }
  writeFileSync(outFile, bytes);
}

async function downloadFromCandidates(candidates, outFile) {
  let lastErr = null;
  for (const c of candidates) {
    try {
      await downloadPdf(c, outFile);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("All PDF candidates failed.");
}

async function renderHtmlToPdf(htmlUrl, outFile) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error(
      "Playwright is required for HTML-to-PDF fallback. Install it with `npm i playwright` and run `npx playwright install chromium`.",
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

async function savePdf(htmlOrPdfUrl, outFile) {
  const candidates = htmlToPdfCandidates(htmlOrPdfUrl);
  try {
    await downloadFromCandidates(candidates, outFile);
  } catch {
    await renderHtmlToPdf(htmlOrPdfUrl, outFile);
  }
}

async function resolveContext() {
  const entryHtml = await fetchText(ENTRY_URL);
  const issue = parseEntryIssue(entryHtml);
  const issueHtml = await fetchText(issue.issueUrl);

  const ad2PageUrl = new URL(AD2_PAGE_PATH, issue.issueUrl).href;
  const gen1PageUrl = new URL(GEN1_PAGE_PATH, issue.issueUrl).href;
  const ad2Html = await fetchText(ad2PageUrl);
  const gen1Html = await fetchText(gen1PageUrl);

  let genHtmlUrl = parseGen12PdfUrl(issueHtml, issue.issueUrl);
  if (!genHtmlUrl) genHtmlUrl = parseGen12PdfUrl(entryHtml, ENTRY_URL);
  if (!genHtmlUrl) genHtmlUrl = parseGen12PdfUrl(gen1Html, gen1PageUrl);

  let ad2Entries = parseAd2EntriesFromPdfLinks(issueHtml, issue.issueUrl);
  if (!ad2Entries.length) ad2Entries = parseAd2EntriesFromPdfLinks(entryHtml, ENTRY_URL);
  if (!ad2Entries.length) ad2Entries = parseAd2EntriesFromPdfLinks(ad2Html, ad2PageUrl);

  if (!ad2Entries.length) throw new Error("No AD2 ICAOs found in Slovenia source pages.");

  const effectiveDate = issue.effectiveDate || parseDotDate(issueHtml) || parseDotDate(entryHtml);
  return {
    effectiveDate,
    menuUrl: issue.issueUrl,
    genHtmlUrl,
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
    if (!ctx.genHtmlUrl) throw new Error("GEN 1.2 PDF URL not found in Slovenia source pages.");
    mkdirSync(OUT_GEN, { recursive: true });
    await savePdf(ctx.genHtmlUrl, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`));
    return;
  }

  if (downloadAd2Icao) {
    const row = ctx.ad2Entries.find((x) => x.icao === downloadAd2Icao);
    if (!row || !row.htmlUrl) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    await savePdf(row.htmlUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`));
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      if (!ctx.genHtmlUrl) throw new Error("GEN 1.2 PDF URL not found in Slovenia source pages.");
      mkdirSync(OUT_GEN, { recursive: true });
      await savePdf(ctx.genHtmlUrl, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`));
      return;
    }
    if (mode === "2") {
      ctx.ad2Entries.forEach((row, i) => console.error(`${String(i + 1).padStart(3)}. ${row.icao}  ${row.label}`));
      const raw = (await rl.question("\nAirport number or ICAO: ")).trim().toUpperCase();
      const n = Number.parseInt(raw, 10);
      const row =
        String(n) === raw && n >= 1 && n <= ctx.ad2Entries.length
          ? ctx.ad2Entries[n - 1]
          : ctx.ad2Entries.find((x) => x.icao === raw);
      if (!row || !row.htmlUrl) throw new Error("Invalid selection.");
      mkdirSync(OUT_AD2, { recursive: true });
      await savePdf(row.htmlUrl, join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`));
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});
