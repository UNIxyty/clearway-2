#!/usr/bin/env node
/**
 * Interactive Denmark AIP downloader (Naviair API-backed).
 *
 * Source:
 * - https://aim.naviair.dk/
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "denmark-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "denmark-eaip", "AD2");
const BASE_URL = "https://aim.naviair.dk";
const SEARCH_API = `${BASE_URL}/umbraco/api/naviairapi/getsearch`;
const UA = "Mozilla/5.0 (compatible; clearway-denmark-eaip/1.0)";
const FETCH_TIMEOUT_MS = 30_000;
const log = (...args) => console.error("[DENMARK]", ...args);

const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": UA,
        accept: "application/json,text/plain,*/*",
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function searchNodes(criterion) {
  const url = `${SEARCH_API}?criterion=${encodeURIComponent(criterion)}`;
  log("Searching:", criterion);
  const json = await fetchJson(url);
  return Array.isArray(json?.nodes) ? json.nodes : [];
}

function nodeTime(node) {
  const value = String(node?.publishAt || node?.publishNodeAt || node?.publishDocumentAt || "");
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

function pickNewest(nodes) {
  return [...nodes].sort((a, b) => nodeTime(b) - nodeTime(a))[0] || null;
}

function formatDate(value) {
  const t = Date.parse(String(value || ""));
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function pickDenmarkGen12(nodes) {
  const wanted = nodes.filter((n) => /^EK_GEN_1_2(_en)?\.pdf$/i.test(String(n?.name || "")));
  return pickNewest(wanted.length ? wanted : nodes);
}

function parseDenmarkAd2(nodes) {
  const byIcao = new Map();
  for (const n of nodes) {
    const name = String(n?.name || "");
    const m = name.match(/^EK_AD_2_([A-Z0-9]{4})_en\.pdf$/i);
    if (!m) continue;
    const icao = m[1].toUpperCase();
    if (byIcao.has(icao)) continue;
    byIcao.set(icao, {
      icao,
      label: String(n?.title || icao).replace(/\s+/g, " ").trim(),
      href: String(n?.href || ""),
      publishAt: String(n?.publishAt || ""),
    });
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
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

async function resolveContext() {
  const ad2Nodes = await searchNodes("EK_AD_2");
  const ad2Entries = parseDenmarkAd2(ad2Nodes);
  const genNodes = await searchNodes("GEN 1.2");
  const genNode = pickDenmarkGen12(genNodes);
  const effectiveDate = formatDate(genNode?.publishAt) || formatDate(pickNewest(ad2Nodes)?.publishAt);
  log("AD2 entries found:", ad2Entries.length);
  if (genNode) log("GEN 1.2 file:", genNode.name);
  if (effectiveDate) log("Effective date:", effectiveDate);
  return { effectiveDate, ad2Entries, genNode };
}

function absoluteMediaUrl(href) {
  if (!href) throw new Error("Missing media href in Denmark API response.");
  return new URL(String(href), BASE_URL).href;
}

async function main() {
  const ctx = await resolveContext();
  const dateTag = ctx.effectiveDate || "unknown-date";

  if (collectMode()) {
    printCollectJson({ effectiveDate: ctx.effectiveDate, ad2Icaos: ctx.ad2Entries.map((x) => x.icao) });
    return;
  }

  if (downloadGen12) {
    if (!ctx.genNode) throw new Error("GEN 1.2 file not found.");
    mkdirSync(OUT_GEN, { recursive: true });
    await downloadPdf(absoluteMediaUrl(ctx.genNode.href), join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`));
    return;
  }

  if (downloadAd2Icao) {
    const row = ctx.ad2Entries.find((x) => x.icao === downloadAd2Icao);
    if (!row) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    await downloadPdf(absoluteMediaUrl(row.href), join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`));
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      if (!ctx.genNode) throw new Error("GEN 1.2 file not found.");
      mkdirSync(OUT_GEN, { recursive: true });
      await downloadPdf(absoluteMediaUrl(ctx.genNode.href), join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`));
      return;
    }
    if (mode === "2") {
      ctx.ad2Entries.forEach((x, i) => console.error(`${String(i + 1).padStart(3)}. ${x.icao}  ${x.label}`));
      const raw = (await rl.question(`\nAirport number 1-${ctx.ad2Entries.length} or ICAO: `)).trim().toUpperCase();
      const n = Number.parseInt(raw, 10);
      const row =
        String(n) === raw && n >= 1 && n <= ctx.ad2Entries.length
          ? ctx.ad2Entries[n - 1]
          : ctx.ad2Entries.find((x) => x.icao === raw);
      if (!row) throw new Error("Invalid selection.");
      mkdirSync(OUT_AD2, { recursive: true });
      await downloadPdf(absoluteMediaUrl(row.href), join(OUT_AD2, `${dateTag}_${row.icao}_AD2.pdf`));
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});
