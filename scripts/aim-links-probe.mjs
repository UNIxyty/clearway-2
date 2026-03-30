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

/** Browser-like UA — some AIS sites block or throttle non-browser clients (KOCA, PAA, CAAN, Oman). */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ClearwayAIMProbe/1.0";

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
 * High-level taxonomy for AIM source links (grouped report).
 * @param {string} url
 * @param {any} probe
 * @param {string} [sourcePageType] from import JSON "Page type"
 * @returns {{ linkType: string, linkTypeDescription: string }}
 */
function classifyAimLinkType(url, probe, sourcePageType = "") {
  const u = (url || "").toLowerCase();
  const st = (sourcePageType || "").toLowerCase();

  if (!url || url === "AIP" || url === "...") {
    return { linkType: "invalid_empty", linkTypeDescription: "Missing or placeholder URL" };
  }
  if (probe.classification === "no-url") {
    return { linkType: "invalid_empty", linkTypeDescription: "No URL" };
  }
  if (probe.classification === "fetch-error") {
    return { linkType: "error_fetch", linkTypeDescription: "Network / TLS / timeout" };
  }
  if (probe.isLikelyPdf || probe.classification === "pdf") {
    return { linkType: "pdf", linkTypeDescription: "Direct PDF (or PDF magic)" };
  }
  if (probe.classification === "non-html" || probe.classification === "maybe-pdf-url-not-pdf-body") {
    return { linkType: "other_binary", linkTypeDescription: "Non-HTML response (not classified as PDF)" };
  }

  if (u.includes("aim.asecna.aero")) {
    return { linkType: "asecna", linkTypeDescription: "ASECNA aim.asecna.aero (shared FR portal, many states)" };
  }

  if (u.includes("ais.m-nav.info") || u.includes("m-nav.info")) {
    return { linkType: "eaip_mnav_tree", linkTypeDescription: "M-NAV-style: tree_items.js + PDF leaves" };
  }
  if (probe.eaipSignals?.includes("tree_items-menu")) {
    return { linkType: "eaip_mnav_tree", linkTypeDescription: "HTML references tree_items.js (M-NAV-like)" };
  }

  const eurocontrolUrl =
    u.includes("inac.gob.ve") ||
    /history-en-gb\.html|history-en-ms\.html/i.test(url) ||
    /index-en-gb\.html|index-en-en\.html/i.test(url) ||
    u.includes("aim.caa.gov.om") ||
    u.includes("aim.koca.go.kr") ||
    u.includes("aip.caam.gov.my") ||
    u.includes("e-aip.azurefd.net") ||
    u.includes("ashna-ks.org") ||
    u.includes("eaip.bhansa.gov.ba") ||
    u.includes("ops.skeyes.be") && u.includes("eaip") ||
    u.includes("ban.by/aip") ||
    u.includes("scaa.gov.so") ||
    u.includes("ais.gov.mm") && u.includes("eaip") ||
    u.includes("airport.lk/aasl") && u.includes("aip") ||
    u.includes("ahac.gob.hn") && u.includes("eaip") ||
    u.includes("dgac.gob.gt") && u.includes("aip") ||
    u.includes("cocesna.org/aipca") ||
    u.includes("aismet.avianet.cu") ||
    u.includes("aipchile.dgac.gob.cl") ||
    u.includes("aip.caat.or.th") ||
    u.includes("ais.caa.gov.tw") && u.includes("eaip") ||
    (u.includes("/eaip/") && (u.includes("html") || u.includes("index")));

  if (eurocontrolUrl) {
    return {
      linkType: "eaip_eurocontrol_like",
      linkTypeDescription:
        "Eurocontrol-style eAIP: history/index-en-GB, frameset, ISAIP (e.g. Venezuela INAC, Malaysia, Korea KOCA, Oman)",
    };
  }

  if (probe.notes?.some((n) => String(n).includes("likely-spa-shell"))) {
    return { linkType: "web_spa", linkTypeDescription: "Single-page app shell (React/Vite); needs browser or API" };
  }

  if (!probe.ok && probe.classification === "html-error-status") {
    return { linkType: "error_http", linkTypeDescription: `HTTP error with HTML body (${probe.status})` };
  }

  if (probe.classification === "html" || probe.classification === "html-error-status") {
    if (st.includes("pdf") && u.includes(".pdf")) {
      return { linkType: "pdf", linkTypeDescription: "Marked PDF in source; HTML wrapper or redirect page" };
    }
    if (st.includes("login")) {
      return { linkType: "web_login_wall", linkTypeDescription: "Source notes login required" };
    }
    if (u.includes("caab.gov.bd") || u.includes("afgais.com") || u.includes("notam") || u.includes("supplement")) {
      return { linkType: "web_portal_listings", linkTypeDescription: "Portal / listings / supplements page (tables, not full eAIP frame)" };
    }
    return {
      linkType: "web_portal_other",
      linkTypeDescription: "General HTML portal (gov/CMS); not ASECNA / not classified eAIP URL pattern",
    };
  }

  return { linkType: "unknown", linkTypeDescription: "Could not classify" };
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
    if (
      /<div\s+id=["']root["']\s*>\s*<\/div>/i.test(text) &&
      /type=["']module["'][^>]*(src=["'][^"']*\/assets\/)/i.test(text)
    ) {
      result.notes.push("likely-spa-shell");
    }
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
      const t = classifyAimLinkType("", entry.probe, entry.sourcePageType);
      entry.linkType = t.linkType;
      entry.linkTypeDescription = t.linkTypeDescription;
      report.push(entry);
      failed.push(`${country}: no/placeholder URL`);
      continue;
    }

    process.stderr.write(`[${i}/${rows.length}] ${country}\n`);
    const probe = await probeUrl(entry.url);
    entry.probe = probe;
    entry.suggestedIntegration = suggestIntegration(entry.url, probe);
    const typeInfo = classifyAimLinkType(entry.url, probe, entry.sourcePageType);
    entry.linkType = typeInfo.linkType;
    entry.linkTypeDescription = typeInfo.linkTypeDescription;

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

  /** @type {Record<string, { country: string, url: string, sourcePageType?: string }[]>} */
  const byLinkType = {};
  for (const r of report) {
    const key = r.linkType || "unknown";
    if (!byLinkType[key]) byLinkType[key] = [];
    byLinkType[key].push({
      country: r.country,
      url: r.url,
      ...(r.sourcePageType ? { sourcePageType: r.sourcePageType } : {}),
    });
  }
  const linkTypeOrder = [
    "asecna",
    "eaip_eurocontrol_like",
    "eaip_mnav_tree",
    "pdf",
    "web_portal_listings",
    "web_portal_other",
    "web_spa",
    "web_login_wall",
    "error_fetch",
    "error_http",
    "invalid_empty",
    "other_binary",
    "unknown",
  ];
  const byLinkTypeSorted = {};
  for (const k of linkTypeOrder) {
    if (byLinkType[k]?.length) byLinkTypeSorted[k] = byLinkType[k];
  }
  for (const k of Object.keys(byLinkType).sort()) {
    if (!byLinkTypeSorted[k]) byLinkTypeSorted[k] = byLinkType[k];
  }

  const linkTypeLegend = {
    asecna: "ASECNA multi-country FR portal (aim.asecna.aero)",
    eaip_eurocontrol_like: "Eurocontrol-style eAIP (history / index-en-GB / frameset — e.g. Venezuela)",
    eaip_mnav_tree: "M-NAV style menu tree + direct PDFs",
    pdf: "Direct PDF document",
    web_portal_listings: "Web listings / supplements / portal tables",
    web_portal_other: "Other HTML government/CMS pages",
    web_spa: "JS SPA (empty #root until bundle runs)",
    web_login_wall: "Login required (per source metadata)",
    error_fetch: "Fetch failed",
    error_http: "HTTP error",
    invalid_empty: "No usable URL",
    other_binary: "Non-HTML body",
    unknown: "Unclassified",
  };

  const output = {
    generatedAt: new Date().toISOString(),
    inputPath,
    summary,
    linkTypeLegend,
    byLinkType: byLinkTypeSorted,
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
