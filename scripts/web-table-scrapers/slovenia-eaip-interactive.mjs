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
const UA = "Mozilla/5.0 (compatible; clearway-slovenia-eaip/1.0)";
const FETCH_TIMEOUT_MS = 45_000;
const log = (...args) => console.error("[SLOVENIA]", ...args);
const execFileAsync = promisify(execFile);

const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

function normalizeText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHref(href) {
  return String(href || "").replace(/\\/g, "/");
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } catch (err) {
    // Some hosts fail TLS handshakes with Node fetch in specific server stacks.
    // Fallback to curl keeps scraper behavior consistent in those environments.
    try {
      const { stdout } = await execFileAsync(
        "curl",
        ["-L", "-sS", "--max-time", String(Math.ceil(FETCH_TIMEOUT_MS / 1000)), "-A", UA, url],
        { maxBuffer: 16 * 1024 * 1024 },
      );
      const html = String(stdout || "");
      if (!html.trim()) throw err;
      return html;
    } catch {
      throw err;
    }
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

function parseNavigationUrls(issueHtml, issueUrl) {
  const navBase = String(issueHtml || "").match(/<frame[^>]*name=["']eAISNavigationBase["'][^>]*src=["']([^"']+)["']/i)?.[1];
  if (!navBase) return { tocUrl: issueUrl, menuUrl: issueUrl };
  const tocUrl = new URL(normalizeHref(navBase), issueUrl).href;
  return { tocUrl, menuUrl: tocUrl };
}

function parseMenuUrl(tocHtml, tocUrl) {
  const nav = String(tocHtml || "").match(/<frame[^>]*name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i)?.[1];
  if (!nav) return tocUrl;
  return new URL(normalizeHref(nav), tocUrl).href;
}

function parseGenHtmlUrl(menuHtml, menuUrl) {
  const m =
    String(menuHtml || "").match(/href=["']([^"']*LJ-GEN-1\.2[^"']*\.html[^"']*)["']/i) ||
    String(menuHtml || "").match(/href=["']([^"']*GEN[^"']*1\.2[^"']*\.html[^"']*)["']/i) ||
    String(menuHtml || "").match(/href=["']([^"']*gen[^"']*1[^"']*2[^"']*)["'][^>]*>[^<]*GEN\s*1\.?2/i);
  if (!m?.[1]) return null;
  return new URL(normalizeHref(m[1]), menuUrl).href;
}

function parseAd2Entries(menuHtml, menuUrl) {
  const byIcao = new Map();
  for (const m of String(menuHtml || "").matchAll(/href=["']([^"']*LJ-AD-2\.([A-Z0-9]{4})[^"']*\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const icao = String(m[2] || "").toUpperCase();
    if (!icao || byIcao.has(icao)) continue;
    byIcao.set(icao, {
      icao,
      label: normalizeText(m[3]) || icao,
      htmlUrl: new URL(normalizeHref(m[1]), menuUrl).href,
    });
  }
  if (!byIcao.size) {
    for (const m of String(menuHtml || "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const href = normalizeHref(m[1]);
      const label = normalizeText(m[2]);
      const icao = String(label.match(/\b(LJ[A-Z0-9]{2})\b/i)?.[1] || href.match(/\b(LJ[A-Z0-9]{2})\b/i)?.[1] || "").toUpperCase();
      if (!icao || byIcao.has(icao)) continue;
      byIcao.set(icao, {
        icao,
        label: label || icao,
        htmlUrl: new URL(href, menuUrl).href,
      });
    }
  }
  if (!byIcao.size) {
    for (const m of String(menuHtml || "").matchAll(/\b(LJ[A-Z0-9]{2})\b/g)) {
      const code = String(m[1]).toUpperCase();
      if (byIcao.has(code)) continue;
      byIcao.set(code, {
        icao: code,
        label: code,
        htmlUrl: "",
      });
    }
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

function extractAnchors(html, baseUrl) {
  const out = [];
  for (const m of String(html || "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = normalizeHref(m[1]);
    if (!href) continue;
    try {
      out.push({
        url: new URL(href, baseUrl).href,
        label: normalizeText(m[2]),
      });
    } catch {
      continue;
    }
  }
  return out;
}

async function crawlWordpressSection(seedUrl, pathPrefix, maxPages = 36) {
  const origin = new URL(seedUrl).origin;
  const queue = [seedUrl];
  const seen = new Set();
  const pages = [];
  while (queue.length && pages.length < maxPages) {
    const url = String(queue.shift() || "");
    if (!url || seen.has(url)) continue;
    seen.add(url);
    let html = "";
    try {
      html = await fetchText(url);
    } catch {
      continue;
    }
    pages.push({ url, html });
    for (const a of extractAnchors(html, url)) {
      if (!a.url.startsWith(origin)) continue;
      if (!a.url.includes(pathPrefix)) continue;
      if (!seen.has(a.url)) queue.push(a.url);
    }
  }
  return pages;
}

async function discoverGen12HtmlUrl(menuUrl) {
  const root = new URL("/aim/products/aip/part-1-general-gen/", menuUrl).href;
  const pages = await crawlWordpressSection(root, "/aim/products/aip/part-1-general-gen/");
  for (const page of pages) {
    if (/gen-1-2/i.test(page.url)) return page.url;
    const text = normalizeText(page.html);
    if (/\bGEN\s*1\.2\b/i.test(text)) return page.url;
  }
  return null;
}

async function discoverAd2Entries(menuUrl) {
  const root = new URL("/aim/products/aip/part-3-aerodromes-ad/ad-2-aerodromes/", menuUrl).href;
  const pages = await crawlWordpressSection(root, "/aim/products/aip/part-3-aerodromes-ad/");
  const byIcao = new Map();
  for (const page of pages) {
    const text = normalizeText(page.html);
    for (const m of text.matchAll(/\b(LJ[A-Z0-9]{2})\b/g)) {
      const icao = String(m[1]).toUpperCase();
      if (byIcao.has(icao)) continue;
      byIcao.set(icao, { icao, label: icao, htmlUrl: page.url });
    }
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

function htmlToPdfCandidates(htmlUrl) {
  const clean = String(htmlUrl || "").replace(/#.*$/, "");
  const out = [
    clean.replace(/\/eAIP\//i, "/pdf/").replace(/\.html?$/i, ".pdf"),
    clean.replace(/\/html\/eAIP\//i, "/pdf/").replace(/\.html?$/i, ".pdf"),
    clean.replace(/-en-GB/i, "").replace(/\.html?$/i, ".pdf"),
  ].filter(Boolean);
  return [...new Set(out)];
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
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

async function savePdf(htmlUrl, outFile) {
  const candidates = htmlToPdfCandidates(htmlUrl);
  try {
    await downloadFromCandidates(candidates, outFile);
  } catch {
    await renderHtmlToPdf(htmlUrl, outFile);
  }
}

async function resolveContext() {
  const entryHtml = await fetchText(ENTRY_URL);
  const issue = parseEntryIssue(entryHtml);
  const issueHtml = await fetchText(issue.issueUrl);
  const nav = parseNavigationUrls(issueHtml, issue.issueUrl);
  const tocHtml = await fetchText(nav.tocUrl);
  const menuUrl = parseMenuUrl(tocHtml, nav.tocUrl);
  const menuHtml = await fetchText(menuUrl);
  let genHtmlUrl = parseGenHtmlUrl(menuHtml, menuUrl);
  let ad2Entries = parseAd2Entries(menuHtml, menuUrl);
  if (!genHtmlUrl) {
    genHtmlUrl = await discoverGen12HtmlUrl(menuUrl);
  }
  if (!ad2Entries.length) {
    ad2Entries = await discoverAd2Entries(menuUrl);
  }
  if (!ad2Entries.length) throw new Error("No AD2 ICAOs found in Slovenia menu.");
  const dotDate = String(entryHtml || "").match(/\b(\d{2})\.(\d{2})\.(20\d{2})\b/);
  const effectiveDate = issue.effectiveDate || (dotDate ? `${dotDate[3]}-${dotDate[2]}-${dotDate[1]}` : null);
  return {
    effectiveDate,
    menuUrl,
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
    if (!ctx.genHtmlUrl) throw new Error("GEN 1.2 HTML URL not found in Slovenia menu.");
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
      if (!ctx.genHtmlUrl) throw new Error("GEN 1.2 HTML URL not found in Slovenia menu.");
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

