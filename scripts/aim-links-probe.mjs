/**
 * Probe AIM URLs from a JSON export (array of { Country, Official AIM Page, ... }).
 * Classifies: PDF direct, HTML, error (timeout/4xx/5xx), empty URL.
 * Heuristics for eAIP-style pages: history-en-GB, index-en-GB, tree_items.js, frameset, GEN/AD2 mentions.
 *
 * Usage:
 *   node scripts/aim-links-probe.mjs /path/to/file.json
 *   node scripts/aim-links-probe.mjs /path/to/file.json --out test-results/aim-links-probe-report.json
 *
 * Does not download full PDFs; uses Content-Type, URL shape, and %PDF- magic for small GETs.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = join(__dirname, "..", "test-results", "aim-links-probe-report.json");

const UA = "ClearwayAIMProbe/1.0 (+https://github.com/UNIxyty/clearway-2)";

/** @type {Map<string, any>} */
const urlCache = new Map();

function parseArgs(argv) {
  let outPath = DEFAULT_OUT;
  const paths = [];
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--out" && argv[i + 1]) outPath = argv[++i];
    else if (!argv[i].startsWith("-")) paths.push(argv[i]);
  }
  if (paths.length === 0) {
    console.error(`Usage: node scripts/aim-links-probe.mjs <file.json> [--out report.json]`);
    process.exit(1);
  }
  return { inputPath: paths[0], outPath };
}

/**
 * @param {string} html
 * @returns {string[]}
 */
function detectEaipSignals(html) {
  if (!html || html.length < 50) return [];
  const signals = [];
  const lower = html.slice(0, 500_000).toLowerCase();
  if (/history-en-gb\.html|history-en-ms\.html|history\.html/i.test(html)) signals.push("history-page");
  if (/index-en-gb\.html|index-en-en\.html|index-fr-fr\.html|index-en-ms\.html/i.test(html)) signals.push("index-localized");
  if (/tree_items\.js/i.test(html)) signals.push("tree_items-menu");
  if (/<frameset/i.test(html)) signals.push("frameset");
  if (/menu-en-gb\.html|menu-fr-fr\.html|e\s*\/\s*menu/i.test(html)) signals.push("eaip-menu-hint");
  if (/\bGEN\s*[\d.]|\bPART\s*1\b.*GEN/i.test(html)) signals.push("mentions-GEN");
  if (/\bAD\s*2\b|AD_2|AD2\.|aerodrome/i.test(html)) signals.push("mentions-AD2");
  if (/aim\.asecna\.aero/i.test(html)) signals.push("host-asecna");
  if (/inac\.gob\.ve|m-nav\.info|caam\.gov\.my|koca\.go\.kr|aim\.caa\.gov\.om/i.test(html))
    signals.push("known-provider-dom");
  return [...new Set(signals)];
}

/**
 * Which existing Clearway integration (if any) fits this URL / probe.
 * @param {string} url
 * @param {any} probe
 */
function suggestIntegration(url, probe) {
  const u = url.toLowerCase();
  if (probe.isLikelyPdf || probe.classification === "pdf") return "pdf-direct-download";
  if (u.includes("inac.gob.ve")) return "inac-venezuela-eaip-cli";
  if (u.includes("ais.m-nav.info") || u.includes("m-nav.info")) return "mnav-north-macedonia-eaip-cli";
  if (u.includes("aim.asecna.aero")) return "asecna-multi-country-not-implemented";
  if (/history-en-gb\.html|history-en-ms\.html/i.test(url)) return "eurocontrol-like-history-page";
  if (/index-en-gb\.html|index-en-en\.html/i.test(url)) return "eurocontrol-like-index-frameset";
  if (probe.eaipSignals?.includes("tree_items-menu")) return "mnav-like-tree-items";
  return "needs-manual-or-scraper";
}

/**
 * @param {ArrayBuffer} buf
 */
function isPdfMagic(buf) {
  if (buf.byteLength < 5) return false;
  const u = new Uint8Array(buf);
  return u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46;
}

/**
 * @param {string} url
 */
async function probeUrl(url) {
  if (urlCache.has(url)) return { ...urlCache.get(url), fromCache: true };

  const result = {
    url,
    ok: false,
    finalUrl: url,
    status: null,
    error: null,
    contentType: null,
    classification: "unknown",
    isLikelyPdf: false,
    bytesSampled: 0,
    eaipSignals: [],
    notes: [],
  };

  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 30_000);
    const res = await fetch(url, {
      redirect: "follow",
      signal: ac.signal,
      headers: { "User-Agent": UA, Accept: "*/*" },
    });
    clearTimeout(t);
    result.ok = res.ok;
    result.status = res.status;
    result.finalUrl = res.url;
    result.contentType = res.headers.get("content-type") || "";

    const ct = result.contentType.toLowerCase();
    if (ct.includes("application/pdf") || ct.includes("application/x-pdf")) {
      result.isLikelyPdf = true;
      result.classification = "pdf";
      urlCache.set(url, result);
      return result;
    }

    const urlLooksPdf = /\.pdf(\?|$)/i.test(url) || /format=pdf/i.test(url);
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
      const ab = await res.clone().arrayBuffer();
      result.bytesSampled = ab.byteLength;
      if (isPdfMagic(ab)) {
        result.isLikelyPdf = true;
        result.classification = "pdf";
        if (urlLooksPdf) result.notes.push("pdf-magic-nonstandard-ct");
      } else if (urlLooksPdf) {
        result.classification = "maybe-pdf-url-not-pdf-body";
        result.notes.push("url-suggests-pdf-but-body-not-pdf-magic");
      } else {
        result.classification = "non-html";
      }
      urlCache.set(url, result);
      return result;
    }

    const text = await res.text();
    result.bytesSampled = text.length;
    result.classification = res.ok ? "html" : "html-error-status";
    result.eaipSignals = detectEaipSignals(text);
    if (result.eaipSignals.length) result.notes.push(`signals:${result.eaipSignals.join(",")}`);
    urlCache.set(url, result);
    return result;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    result.classification = "fetch-error";
    urlCache.set(url, result);
    return result;
  }
}

async function main() {
  const { inputPath, outPath } = parseArgs(process.argv);
  const raw = readFileSync(inputPath, "utf8");
  /** @type {any[]} */
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) {
    console.error("JSON must be an array");
    process.exit(1);
  }

  /** @type {any[]} */
  const report = [];
  /** @type {string[]} */
  const failed = [];
  /** @type {string[]} */
  const pdfDirect = [];
  /** @type {string[]} */
  const htmlPages = [];

  let i = 0;
  for (const row of rows) {
    i++;
    const country = row.Country ?? row.country ?? "?";
    let page = row["Official AIM Page"] ?? row.url ?? "";
    if (typeof page !== "string") page = String(page ?? "");

    const entry = {
      country,
      url: page.trim(),
      sourcePageType: row["Page type"] ?? row.pageType,
      probe: null,
    };

    if (!entry.url || entry.url === "AIP" || entry.url === "...") {
      entry.probe = { classification: "no-url", notes: ["missing-or-placeholder"], ok: false };
      entry.suggestedIntegration = "no-url";
      report.push(entry);
      failed.push(`${country}: no/placeholder URL`);
      continue;
    }

    process.stderr.write(`[${i}/${rows.length}] ${country}\n`);
    const probe = await probeUrl(entry.url);
    entry.probe = probe;
    entry.suggestedIntegration = suggestIntegration(entry.url, probe);

    if (probe.classification === "fetch-error" || !probe.ok) {
      failed.push(`${country}: ${entry.url} — ${probe.error ?? `HTTP ${probe.status}`}`);
    }
    if (probe.isLikelyPdf || probe.classification === "pdf") pdfDirect.push(`${country}: ${entry.url}`);
    if (probe.classification === "html") htmlPages.push(`${country}: ${entry.url}`);

    report.push(entry);
    await new Promise((r) => setTimeout(r, 80));
  }

  const summary = {
    total: rows.length,
    pdfOrLikely: report.filter((r) => r.probe?.isLikelyPdf || r.probe?.classification === "pdf").length,
    html: report.filter((r) => r.probe?.classification === "html").length,
    fetchErrors: report.filter((r) => r.probe?.classification === "fetch-error").length,
    noUrl: report.filter((r) => r.probe?.classification === "no-url").length,
    httpErrors: report.filter((r) => r.probe && !r.probe.ok && r.probe.classification !== "fetch-error").length,
    uniqueUrlsCached: urlCache.size,
  };

  const output = {
    generatedAt: new Date().toISOString(),
    inputPath,
    summary,
    failedLoads: failed,
    pdfLinks: pdfDirect,
    htmlLinks: htmlPages,
    rows: report,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
  console.error(`\nWrote ${outPath}`);
  console.error(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
