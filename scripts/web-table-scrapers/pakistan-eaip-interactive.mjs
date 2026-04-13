#!/usr/bin/env node
/**
 * Interactive Pakistan eAIP downloader.
 *
 * Source page:
 * - https://paa.gov.pk/aeronautical-information/electronic-aeronautical-information-publication
 *
 * Structure notes:
 * - Effective-date buttons are served via PAA CMS API (`GetMenus` + `GetContentById`).
 * - Each effective package points to an `index.htm` under `/media/eaip/<cycle>/eAIP/`.
 * - Package navigation lives in `left.htm` and contains `stIT([...])` menu entries with direct PDF links.
 *
 * Usage:
 *   node scripts/web-table-scrapers/pakistan-eaip-interactive.mjs
 *   node scripts/web-table-scrapers/pakistan-eaip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/pakistan-eaip-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "pakistan-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "pakistan-eaip", "AD2");

const MENUS_API =
  "https://paawebadmin.paa.gov.pk/api/v1/Content/GetMenus?ApiKey=123456789_API&_IPAddress=0.0.0.0&_Header=clearway";
const CONTENT_BY_ID_API = "https://paawebadmin.paa.gov.pk/api/v1/Content/GetContentById";
const EAIP_ROUTE = "/aeronautical-information/electronic-aeronautical-information-publication";
const FETCH_TIMEOUT_MS = 45_000;
const FETCH_RETRIES = 4;
const UA = "Mozilla/5.0 (compatible; clearway-pk-scraper/1.0)";
const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function safeFilename(name) {
  return String(name || "")
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "_");
}

function parseDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) return null;
  return d;
}

function fmtDate(value) {
  const d = parseDate(value);
  if (!d) return "N/A";
  return d.toISOString().slice(0, 10);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientFetchError(err) {
  const msg = String(err?.message || "").toLowerCase();
  const cause = String(err?.cause?.message || "").toLowerCase();
  return (
    msg.includes("fetch failed") ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("aborted") ||
    cause.includes("econnreset") ||
    cause.includes("econnrefused") ||
    cause.includes("enotfound") ||
    cause.includes("etimedout") ||
    cause.includes("socket") ||
    cause.includes("tls")
  );
}

async function withRetries(label, fn) {
  let lastErr = null;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= FETCH_RETRIES || !isTransientFetchError(err)) break;
      const backoffMs = attempt * 1200;
      console.error(`[PK] ${label} failed (attempt ${attempt}/${FETCH_RETRIES}): ${err?.message || err}; retrying in ${backoffMs}ms`);
      await sleep(backoffMs);
    }
  }
  throw lastErr;
}

function formatError(err) {
  const base = String(err?.message || err || "Unknown error");
  const cause = err?.cause;
  if (!cause) return base;
  const causeMsg = String(cause?.message || cause || "").trim();
  const causeCode = String(cause?.code || "").trim();
  if (!causeMsg && !causeCode) return base;
  return `${base} (cause${causeCode ? ` ${causeCode}` : ""}: ${causeMsg || "n/a"})`;
}

async function fetchText(url) {
  return await withRetries(`fetch ${url}`, async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": UA, Accept: "*/*" },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.text();
    } finally {
      clearTimeout(timeout);
    }
  });
}

async function fetchJson(url) {
  const text = await fetchText(url);
  return JSON.parse(text);
}

function flattenMenus(root, out = []) {
  if (!root || typeof root !== "object") return out;
  out.push(root);
  for (const c of root.children || []) flattenMenus(c, out);
  return out;
}

async function resolveEaipContentId() {
  const menus = await fetchJson(MENUS_API);
  const all = [];
  for (const row of menus.data || []) {
    if (row.paaEnglishMenus) flattenMenus(row.paaEnglishMenus, all);
  }
  const match = all.find((x) => String(x.redirctFrontURL || "").toLowerCase() === EAIP_ROUTE.toLowerCase());
  if (!match?.uniqueId) throw new Error("eAIP menu node not found in PAA menu API.");
  return match.uniqueId;
}

async function fetchIssuePackages() {
  const contentId = await resolveEaipContentId();
  const url = `${CONTENT_BY_ID_API}?Id=${encodeURIComponent(contentId)}&ApiKey=123456789_API`;
  const payload = await fetchJson(url);
  const items = payload?.data?.en?.properties?.addEAIP?.items || [];

  const issues = [];
  for (const item of items) {
    const p = item?.content?.properties || {};
    const rawUrl = p?.uRL?.[0]?.url;
    if (!rawUrl) continue;
    issues.push({
      title: String(p.title || "Untitled package").trim(),
      issueUrl: String(rawUrl).trim(),
      effectiveDate: p.effectiveDate || null,
      publicationDate: p.publicationDate || null,
      latest: Boolean(p.latest),
    });
  }
  return issues.sort((a, b) => {
    const da = parseDate(a.effectiveDate)?.valueOf() || 0;
    const db = parseDate(b.effectiveDate)?.valueOf() || 0;
    return db - da;
  });
}

function parseMenuEntries(leftHtml, leftUrl) {
  const re = /stIT\([^\[]*\["([^"\\]*(?:\\.[^"\\]*)*)"\s*,\s*"([^"\\]*(?:\\.[^"\\]*)*)"/gi;
  const out = [];
  let m;
  while ((m = re.exec(leftHtml))) {
    const label = stripHtml(m[1]);
    const href = String(m[2] || "").trim();
    if (!label || !href || !/\.pdf(?:$|[?#])/i.test(href)) continue;
    out.push({
      label,
      href,
      pdfUrl: new URL(href, leftUrl).href,
    });
  }
  return out;
}

function parseGenEntries(entries) {
  const bySection = new Map();
  for (const e of entries) {
    if (!/^GEN\//i.test(e.href)) continue;
    const sec =
      e.label.match(/\bGEN\s*([0-9]\.[0-9])\b/i)?.[1] ||
      e.href.match(/GEN[-_]?([0-9][._-][0-9])/i)?.[1]?.replace(/[_-]/g, ".");
    if (!sec) continue;
    const section = `GEN ${sec}`;
    if (bySection.has(section)) continue;
    bySection.set(section, { section, label: e.label, pdfUrl: e.pdfUrl });
  }
  return [...bySection.values()].sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
}

function parseAd2EntriesFromLeftHtml(leftHtml, leftUrl) {
  const source = String(leftHtml || "").replace(/\/\*[\s\S]*?\*\//g, "");
  const byIcao = new Map();
  const headings = [...source.matchAll(/stIT\([^[]*\["([^"]*\([A-Z0-9]{4}\)[^"]*)"/gi)].map((m) => ({
    icao: String(m[1] || "").match(/\(([A-Z0-9]{4})\)/i)?.[1]?.toUpperCase() || "",
    idx: Number(m.index || 0),
  }));
  const dataLinks = [...source.matchAll(/stIT\("p\d+i\d+"\s*,\["Aerodrome Data","([^"]+_data\.pdf)"/gi)].map((m) => ({
    href: String(m[1] || "").trim(),
    idx: Number(m.index || 0),
  }));

  for (let i = 0; i < headings.length; i += 1) {
    const curr = headings[i];
    const nextIdx = i + 1 < headings.length ? headings[i + 1].idx : Number.POSITIVE_INFINITY;
    const match = dataLinks.find((d) => d.idx > curr.idx && d.idx < nextIdx);
    if (!curr.icao || !match?.href || byIcao.has(curr.icao)) continue;
    byIcao.set(curr.icao, { icao: curr.icao, pdfUrl: new URL(match.href, leftUrl).href });
  }

  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

async function downloadPdf(url, outFile) {
  const bytes = await withRetries(`download ${url}`, async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`PDF fetch failed: ${res.status} ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }
  });
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("Downloaded payload is not a PDF");
  }
  writeFileSync(outFile, bytes);
}

async function pickFromList(rl, prompt, items, display) {
  for (;;) {
    const raw = (await rl.question(prompt)).trim();
    const n = Number.parseInt(raw, 10);
    if (String(n) === raw && n >= 1 && n <= items.length) return items[n - 1];
    if (raw) {
      const q = raw.toLowerCase();
      const found = items.filter((x) => display(x).toLowerCase().includes(q));
      if (found.length === 1) return found[0];
    }
    console.error("Invalid selection.");
  }
}

function pickIssueFromInput(raw, issues) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return issues[0];
  const n = Number.parseInt(trimmed, 10);
  if (String(n) === trimmed && n >= 1 && n <= issues.length) return issues[n - 1];
  throw new Error(`Invalid issue selection: ${trimmed}`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Usage: node scripts/web-table-scrapers/pakistan-eaip-interactive.mjs [--insecure] [--collect]
       node scripts/web-table-scrapers/pakistan-eaip-interactive.mjs --download-ad2 <ICAO>
       node scripts/web-table-scrapers/pakistan-eaip-interactive.mjs --download-gen12`);
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[PK] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const issues = await fetchIssuePackages();
      if (!issues.length) throw new Error("No effective-date packages found.");
      const issue = issues.find((x) => x.latest) ?? issues[0];
      const leftUrl = new URL("left.htm", issue.issueUrl).href;
      const leftHtml = await fetchText(leftUrl);
      const ad2Entries = parseAd2EntriesFromLeftHtml(leftHtml, leftUrl);
      const d = parseDate(issue.effectiveDate);
      const effectiveDate = d && !Number.isNaN(d.valueOf()) ? d.toISOString().slice(0, 10) : null;
      printCollectJson({ effectiveDate, ad2Icaos: ad2Entries.map((e) => e.icao) });
    } catch (err) {
      console.error("[PK] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("Pakistan eAIP — interactive downloader\n");
    const issues = await fetchIssuePackages();
    if (!issues.length) throw new Error("No effective-date packages found.");

    const nonInteractiveMode = Boolean(downloadAd2Icao || downloadGen12);
    if (!nonInteractiveMode) {
      rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
      issues.forEach((x, i) => {
        const latest = x.latest ? " [latest]" : "";
        console.error(
          `${String(i + 1).padStart(3)}. ${x.title}${latest}  (effective: ${fmtDate(x.effectiveDate)}, published: ${fmtDate(x.publicationDate)})`,
        );
      });
    }
    const issueRaw = nonInteractiveMode ? "" : (await rl.question(`\nIssue number [enter=1, 1-${issues.length}]: `)).trim();
    const issue = pickIssueFromInput(issueRaw, issues);

    const leftUrl = new URL("left.htm", issue.issueUrl).href;
    console.error(`\nUsing issue: ${issue.title}`);
    console.error(`[PK] Loading package menu: ${leftUrl}`);
    const leftHtml = await fetchText(leftUrl);
    const menuEntries = parseMenuEntries(leftHtml, leftUrl);
    if (!menuEntries.length) throw new Error("No PDF menu entries found in package left menu.");

    const genEntries = parseGenEntries(menuEntries);
    const ad2Entries = parseAd2EntriesFromLeftHtml(leftHtml, leftUrl);
    if (!genEntries.length) throw new Error("No GEN entries found in package menu.");
    if (!ad2Entries.length) throw new Error("No AD2 ICAO airport entries found in package menu.");

    if (downloadGen12) {
      const chosen = genEntries.find((e) => /\b1\.2\b/.test(e.section) || /\bGEN\s*1\.2\b/i.test(e.label)) ?? genEntries[0];
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${issue.title}_${chosen.section}.pdf`));
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`Saved: ${outFile}`);
      return;
    }

    if (downloadAd2Icao) {
      const chosen = ad2Entries.find((e) => e.icao === downloadAd2Icao);
      if (!chosen) throw new Error(`AD2 ICAO not found in Pakistan package: ${downloadAd2Icao}`);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${issue.title}_${chosen.icao}_AD2.pdf`));
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`Saved: ${outFile}`);
      return;
    }

    const mode = (await rl.question("\nDownload:\n  [1] GEN section PDF\n  [2] AD 2 airport DATA PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;

    if (mode === "1") {
      genEntries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.section}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nSection number 1-${genEntries.length}: `, genEntries, (e) => `${e.section} ${e.label}`);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${issue.title}_${chosen.section}.pdf`));
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (mode === "2") {
      ad2Entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.icao}`));
      const chosen = await pickFromList(rl, `\nAirport number 1-${ad2Entries.length} or ICAO: `, ad2Entries, (e) => e.icao);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${issue.title}_${chosen.icao}_AD2.pdf`));
      await downloadPdf(chosen.pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error("[PK] failed:", formatError(err));
  process.exit(1);
});
