#!/usr/bin/env node
/**
 * Interactive Albania AIP downloader.
 *
 * Source:
 * - https://www.albcontrol.al/aip/
 *
 * Usage:
 *   node scripts/web-table-scrapers/albania-aip-interactive.mjs
 *   node scripts/web-table-scrapers/albania-aip-interactive.mjs --collect
 *   node scripts/web-table-scrapers/albania-aip-interactive.mjs --download-gen12
 *   node scripts/web-table-scrapers/albania-aip-interactive.mjs --download-ad2 LATI
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "albania-aip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "albania-aip", "AD2");
const ENTRY_URL = "https://www.albcontrol.al/aip/";
const UA = "Mozilla/5.0 (compatible; clearway-albania-aip/1.0)";
const FETCH_TIMEOUT_MS = 30_000;
const PDF_FETCH_TIMEOUT_MS = 12_000;
const execFileAsync = promisify(execFile);
const log = (...args) => console.error("[ALBANIA]", ...args);

const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

function monthToNumber(m) {
  const map = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
  return map[String(m || "").slice(0, 3).toUpperCase()] || null;
}

function parseDateTextToIso(raw) {
  const m = String(raw || "").match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (!m) return null;
  const dd = String(m[1]).padStart(2, "0");
  const mm = monthToNumber(m[2]);
  if (!mm) return null;
  return `${m[3]}-${mm}-${dd}`;
}

async function fetchText(url) {
  log("Fetching HTML:", url);
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

function parseCurrentIssue(rootHtml) {
  const rx = /(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})[\s\S]*?href=["']([^"']*AIRAC\/html\/?)["'][\s\S]*?Current\s+Version/i;
  const m = String(rootHtml || "").match(rx);
  const zipHref =
    String(rootHtml || "").match(/href=["']([^"']+\.zip)["'][^>]*>\s*eAIP\s+\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/i)?.[1] ||
    "";
  if (m) return { effectiveDate: parseDateTextToIso(m[1]), issueUrl: m[2], zipUrl: zipHref };
  const fallbackHref = String(rootHtml || "").match(/href=["']([^"']*AIRAC\/html\/?)["']/i)?.[1] || "";
  return { effectiveDate: null, issueUrl: fallbackHref, zipUrl: zipHref };
}

function parseMenuUrl(indexHtml, issueUrl) {
  const src = String(indexHtml || "").match(/<frame[^>]*name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i)?.[1] ||
    String(indexHtml || "").match(/src=["']([^"']*LA-menu[^"']+\.html)["']/i)?.[1];
  if (!src) throw new Error("Could not resolve Albania eAIP menu URL.");
  return new URL(src, issueUrl).href;
}

function parseGenEntries(menuHtml, menuUrl) {
  const out = [];
  const seen = new Set();
  for (const m of String(menuHtml || "").matchAll(/href=["']([^"']*LA-GEN-[^"']+\.html(?:#[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1];
    const label = String(m[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const section = href.match(/LA-GEN-([0-9.]+)/i)?.[1];
    if (!section) continue;
    const key = `GEN-${section}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ section: key, label: label || key, htmlUrl: new URL(href, menuUrl).href });
  }
  return out.sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2Entries(menuHtml, menuUrl) {
  const out = [];
  const byIcao = new Map();
  for (const m of String(menuHtml || "").matchAll(/href=["']([^"']*AD-2\.([A-Z0-9]{4})[^"']*\.html(?:#[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const icao = m[2].toUpperCase();
    if (byIcao.has(icao)) continue;
    const href = m[1];
    const label = String(m[3] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    byIcao.set(icao, { icao, label: label || icao, htmlUrl: new URL(href, menuUrl).href });
  }
  for (const v of byIcao.values()) out.push(v);
  return out.sort((a, b) => a.icao.localeCompare(b.icao));
}

function pdfCandidatesFromHtmlUrl(htmlUrl) {
  const clean = String(htmlUrl || "").replace(/#.*$/, "");
  const candidates = [
    clean.replace("/html/eAIP/", "/pdf/").replace(".html", ".pdf"),
    clean.replace("/html/", "/pdf/").replace(".html", ".pdf"),
    clean.replace("-en-GB", "").replace("/html/eAIP/", "/pdf/").replace(".html", ".pdf"),
    clean.replace("-en-GB", "").replace("/html/", "/pdf/").replace(".html", ".pdf"),
  ];
  return [...new Set(candidates)];
}

async function downloadPdfWithFallback(htmlUrl, outFile) {
  log("Resolving PDF from HTML:", htmlUrl);
  let lastErr = null;
  for (const u of pdfCandidatesFromHtmlUrl(htmlUrl)) {
    try {
      log("Trying direct PDF candidate:", u);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PDF_FETCH_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(u, {
          signal: controller.signal,
          headers: { "User-Agent": UA },
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("not a PDF");
      writeFileSync(outFile, bytes);
      log("Saved PDF:", outFile);
      return;
    } catch (e) {
      log("Direct candidate failed:", u, "-", e?.message || e);
      lastErr = e;
    }
  }
  throw lastErr || new Error("Direct PDF URL not found.");
}

async function extractPdfFromZip(zipUrl, preferredBasenames, outFile) {
  if (!zipUrl) throw new Error("No Albania eAIP ZIP URL found for fallback extraction.");
  const zipPath = join(tmpdir(), `clearway-albania-${Date.now()}.zip`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(zipUrl, {
      signal: controller.signal,
      headers: { "User-Agent": UA },
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`ZIP fetch failed: ${res.status} ${res.statusText}`);
  writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  log("Downloaded ZIP fallback:", zipUrl);
  try {
    const { stdout: listStdout } = await execFileAsync("unzip", ["-Z1", zipPath], { maxBuffer: 32 * 1024 * 1024 });
    const names = String(listStdout || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    let chosen = null;
    const normalize = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const lowerNames = names.map((n) => n.toLowerCase());
    const normalizedNames = names.map((n) => normalize(n));
    for (const want of preferredBasenames.map((x) => String(x || "").toLowerCase())) {
      const idx = lowerNames.findIndex((n) => n.endsWith(want));
      if (idx >= 0) {
        chosen = names[idx];
        break;
      }
    }
    if (!chosen) {
      for (const want of preferredBasenames.map((x) => normalize(x))) {
        const idx = normalizedNames.findIndex((n) => n.endsWith(want));
        if (idx >= 0) {
          chosen = names[idx];
          break;
        }
      }
    }
    if (!chosen) {
      const toks = String(preferredBasenames[0] || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      chosen =
        names.find((n) => {
          const low = n.toLowerCase();
          return low.endsWith(".pdf") && toks.every((t) => low.includes(t));
        }) || null;
    }
    if (!chosen) throw new Error(`PDF not found in ZIP for ${preferredBasenames.join(" | ")}`);
    const { stdout: pdfBytes } = await execFileAsync("unzip", ["-p", zipPath, chosen], {
      encoding: "buffer",
      maxBuffer: 256 * 1024 * 1024,
    });
    const bytes = Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes || "");
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new Error(`Extracted entry is not PDF: ${chosen}`);
    }
    writeFileSync(outFile, bytes);
    log("Extracted PDF from ZIP entry:", chosen);
    log("Saved PDF:", outFile);
    return chosen;
  } catch (e) {
    throw new Error(`ZIP fallback failed: ${e?.message || e}`);
  }
}

async function resolveContext() {
  log("Resolving current issue from:", ENTRY_URL);
  const rootHtml = await fetchText(ENTRY_URL);
  const current = parseCurrentIssue(rootHtml);
  if (!current.issueUrl) throw new Error("Could not resolve current Albania issue URL.");
  const issueUrl = new URL(current.issueUrl, ENTRY_URL).href;
  const indexHtml = await fetchText(issueUrl);
  const menuUrl = parseMenuUrl(indexHtml, issueUrl);
  const menuHtml = await fetchText(menuUrl);
  log("Resolved issue URL:", issueUrl);
  log("Resolved menu URL:", menuUrl);
  if (current.effectiveDate) log("Effective date:", current.effectiveDate);
  return { effectiveDate: current.effectiveDate, menuUrl, menuHtml, zipUrl: current.zipUrl ? new URL(current.zipUrl, ENTRY_URL).href : "" };
}

async function main() {
  if (collectMode()) {
    const ctx = await resolveContext();
    const ad2 = parseAd2Entries(ctx.menuHtml, ctx.menuUrl).map((x) => x.icao);
    log("Collect mode complete. ICAOs:", ad2.length);
    printCollectJson({ effectiveDate: ctx.effectiveDate, ad2Icaos: ad2 });
    return;
  }

  const ctx = await resolveContext();
  const genEntries = parseGenEntries(ctx.menuHtml, ctx.menuUrl);
  const ad2Entries = parseAd2Entries(ctx.menuHtml, ctx.menuUrl);
  log("GEN entries found:", genEntries.length);
  log("AD2 entries found:", ad2Entries.length);
  const dateTag = ctx.effectiveDate || "unknown-date";

  if (downloadGen12) {
    const row = genEntries.find((x) => /\bGEN-1\.2\b/i.test(x.section)) ?? genEntries[0];
    if (!row) throw new Error("GEN entries not found.");
    mkdirSync(OUT_GEN, { recursive: true });
    const outFile = join(OUT_GEN, `${dateTag}_${row.section}.pdf`);
    try {
      await downloadPdfWithFallback(row.htmlUrl, outFile);
    } catch {
      await extractPdfFromZip(ctx.zipUrl, ["LA_GEN_1_2_en.pdf", "LA-GEN-1.2-en-GB.pdf", "LA-GEN-1.2.pdf"], outFile);
    }
    return;
  }

  if (downloadAd2Icao) {
    const row = ad2Entries.find((x) => x.icao === downloadAd2Icao);
    if (!row) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    const outFile = join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`);
    try {
      await downloadPdfWithFallback(row.htmlUrl, outFile);
    } catch {
      await extractPdfFromZip(
        ctx.zipUrl,
        [`LA_AD_2_${row.icao}_en.pdf`, `LA-AD-2.${row.icao}-en-GB.pdf`, `LA-AD-2.${row.icao}.pdf`],
        outFile,
      );
    }
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      const row = genEntries.find((x) => /\bGEN-1\.2\b/i.test(x.section)) ?? genEntries[0];
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, `${dateTag}_${row.section}.pdf`);
      try {
        await downloadPdfWithFallback(row.htmlUrl, outFile);
      } catch {
        await extractPdfFromZip(ctx.zipUrl, ["LA_GEN_1_2_en.pdf", "LA-GEN-1.2-en-GB.pdf", "LA-GEN-1.2.pdf"], outFile);
      }
      return;
    }
    if (mode === "2") {
      ad2Entries.forEach((x, i) => console.error(`${String(i + 1).padStart(3)}. ${x.icao}  ${x.label}`));
      const raw = (await rl.question(`\nAirport number 1-${ad2Entries.length} or ICAO: `)).trim().toUpperCase();
      const n = Number.parseInt(raw, 10);
      const row = (String(n) === raw && n >= 1 && n <= ad2Entries.length) ? ad2Entries[n - 1] : ad2Entries.find((x) => x.icao === raw);
      if (!row) throw new Error("Invalid selection.");
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`);
      try {
        await downloadPdfWithFallback(row.htmlUrl, outFile);
      } catch {
        await extractPdfFromZip(
          ctx.zipUrl,
          [`LA_AD_2_${row.icao}_en.pdf`, `LA-AD-2.${row.icao}-en-GB.pdf`, `LA-AD-2.${row.icao}.pdf`],
          outFile,
        );
      }
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});
