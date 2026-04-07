#!/usr/bin/env node
/**
 * Interactive Hong Kong eAIP downloader.
 *
 * Usage:
 *   node scripts/web-table-scrapers/hong-kong-eaip-interactive.mjs
 *   node scripts/web-table-scrapers/hong-kong-eaip-interactive.mjs --insecure
 *   node scripts/web-table-scrapers/hong-kong-eaip-interactive.mjs --collect
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson, pickNewestIssueByIso, isoDateFromText } from "./_collect-json.mjs";
import { stdin as input, stderr } from "node:process";
import { appendFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import http from "node:http";
import https from "node:https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "hong-kong-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "hong-kong-eaip", "AD2");

const HISTORY_URL = "https://www.ais.gov.hk/eaip_20260319/VH-history-en-US.html";
const FETCH_TIMEOUT_MS = 30_000;

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#xA;|\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeFilename(name) {
  return String(name || "")
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "_");
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; clearway-hk-scraper/1.0)" },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseIssues(historyHtml) {
  const re = /<a[^>]*href="([^"]*\/html\/index-en-US\.html)"[^>]*>([^<]+)<\/a>/gi;
  const out = [];
  let m;
  while ((m = re.exec(historyHtml))) {
    const href = m[1];
    const effectiveDate = stripHtml(m[2]);
    const issueCode = href.match(/(\d{4}-\d{2}-\d{2}-\d{6})/i)?.[1] ?? href;
    out.push({
      effectiveDate,
      issueCode,
      indexUrl: new URL(href, HISTORY_URL).href,
    });
  }
  const seen = new Set();
  return out.filter((x) => {
    if (seen.has(x.indexUrl)) return false;
    seen.add(x.indexUrl);
    return true;
  });
}

function parseMenuUrl(indexHtml, indexUrl) {
  const m = indexHtml.match(/<frame[^>]*name="eAISNavigation"[^>]*src="([^"]+)"/i);
  if (m?.[1]) return new URL(m[1], indexUrl).href;
  const toc = indexHtml.match(/<frame[^>]*name="eAISNavigationBase"[^>]*src="([^"]+)"/i);
  if (!toc?.[1]) throw new Error("Could not resolve navigation/menu frame from index.");
  return new URL(toc[1], indexUrl).href;
}

function parseGenEntries(menuHtml, menuUrl) {
  const re = /<a[^>]*href="([^"]*VH-GEN-[^"]+\.html#(i[^"]+|GEN-[^"]+))"[^>]*>([\s\S]*?)<\/a>/gi;
  const out = [];
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const anchor = m[2];
    const label = stripHtml(m[3]) || anchor;
    const sectionMatch = label.match(/\bGEN\s+(\d+\.\d+)/i);
    const section = sectionMatch?.[1] ?? anchor;
    if (!/GEN\s+\d+\.\d+/i.test(label)) continue;
    out.push({ anchor: section, label, htmlUrl: new URL(href, menuUrl).href });
  }
  const byUrl = new Map(out.map((x) => [x.htmlUrl, x]));
  return [...byUrl.values()].sort((a, b) => a.anchor.localeCompare(b.anchor, undefined, { numeric: true }));
}

function parseAd2Entries(menuHtml, menuUrl) {
  const re = /<a[^>]*href="([^"]*VH-AD-2[-.]([A-Z0-9]{4})-en-US\.html#(?:AD-2[-.]\2|i[^"]*))"[^>]*>([\s\S]*?)<\/a>/gi;
  const byIcao = new Map();
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const icao = m[2].toUpperCase();
    const label = stripHtml(m[3]) || icao;
    if (!byIcao.has(icao)) byIcao.set(icao, { icao, label, htmlUrl: new URL(href, menuUrl).href });
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

function htmlToPdfUrl(htmlUrl) {
  return String(htmlUrl)
    .replace(/\.html#.*/i, ".pdf")
    .replace(".html", ".pdf")
    .replace("-en-US.", ".")
    .replace("-fr-FR.", ".")
    .replace("-cs-CZ.", ".")
    .replace(/\/html\/\D{4}\//, "/pdf/");
}

async function downloadPdf(url, outFile) {
  const userAgent = "Mozilla/5.0 (compatible; clearway-hk-scraper/1.0)";
  const chunkSize = 2 * 1024 * 1024;

  async function requestBinary(requestUrl, redirectCount = 0, extraHeaders = {}, method = "GET") {
    if (redirectCount > 5) throw new Error("Too many redirects while downloading PDF.");

    const u = new URL(requestUrl);
    const client = u.protocol === "https:" ? https : http;

    return await new Promise((resolve, reject) => {
      const req = client.get(
        requestUrl,
        {
          method,
          headers: {
            "User-Agent": userAgent,
            Accept: "application/pdf,*/*",
            "Accept-Encoding": "identity",
            ...extraHeaders,
          },
        },
        (res) => {
          const status = res.statusCode ?? 0;
          const location = res.headers.location;

          if (status >= 300 && status < 400 && location) {
            res.resume();
            const nextUrl = new URL(location, requestUrl).href;
            requestBinary(nextUrl, redirectCount + 1, extraHeaders, method).then(resolve).catch(reject);
            return;
          }

          if (status < 200 || status >= 300) {
            res.resume();
            reject(new Error(`PDF fetch failed: ${status}`));
            return;
          }

          if (method === "HEAD") {
            const lenHeader = res.headers["content-length"];
            const len = Number(Array.isArray(lenHeader) ? lenHeader[0] : lenHeader);
            res.resume();
            resolve({ length: Number.isFinite(len) ? len : 0 });
            return;
          }

          const chunks = [];
          res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          res.on("end", () => resolve(Buffer.concat(chunks)));
          res.on("error", reject);
        }
      );

      req.setTimeout(FETCH_TIMEOUT_MS, () => {
        req.destroy(new Error("PDF download timeout"));
      });
      req.on("error", reject);
    });
  }

  async function requestWithRetry(requestUrl, extraHeaders = {}, method = "GET", retries = 4) {
    let lastError = null;
    for (let i = 0; i <= retries; i++) {
      try {
        return await requestBinary(requestUrl, 0, extraHeaders, method);
      } catch (err) {
        lastError = err;
        const msg = String(err?.message || err).toLowerCase();
        const retryable = msg.includes("aborted") || msg.includes("terminated") || msg.includes("econnreset") || msg.includes("timeout");
        if (!retryable || i === retries) break;
      }
    }
    throw lastError || new Error("Unknown download failure.");
  }

  const head = await requestWithRetry(url, {}, "HEAD");
  const totalLength = Number(head?.length ?? 0);

  if (!Number.isFinite(totalLength) || totalLength <= 0) {
    console.error("Downloading PDF (unknown size)...");
    const bytes = await requestWithRetry(url);
    writeFileSync(outFile, bytes);
    return;
  }

  if (existsSync(outFile)) unlinkSync(outFile);
  writeFileSync(outFile, Buffer.alloc(0));
  console.error(`Downloading PDF (${(totalLength / (1024 * 1024)).toFixed(1)} MB)...`);

  let start = 0;
  let chunkIndex = 0;
  while (start < totalLength) {
    const end = Math.min(start + chunkSize - 1, totalLength - 1);
    const rangeValue = `bytes=${start}-${end}`;
    const part = await requestWithRetry(url, { Range: rangeValue });
    appendFileSync(outFile, part);
    start += part.length;
    chunkIndex += 1;
    if (chunkIndex % 5 === 0 || start >= totalLength) {
      const pct = ((start / totalLength) * 100).toFixed(1);
      console.error(`  progress: ${pct}% (${(start / (1024 * 1024)).toFixed(1)} / ${(totalLength / (1024 * 1024)).toFixed(1)} MB)`);
    }
  }

  // chunks are already appended incrementally; this keeps memory bounded.
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

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Usage: node scripts/web-table-scrapers/hong-kong-eaip-interactive.mjs [--insecure] [--collect]`);
    return;
  }
  if (process.argv.includes("--insecure")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[HK] TLS verification disabled (--insecure)\n");
  }

  if (collectMode()) {
    try {
      const historyHtml = await fetchText(HISTORY_URL);
      const issues = parseIssues(historyHtml);
      if (!issues.length) throw new Error("No issue links found.");
      const issue = pickNewestIssueByIso(issues, (x) => x.effectiveDate);
      const indexHtml = await fetchText(issue.indexUrl);
      const menuUrl = parseMenuUrl(indexHtml, issue.indexUrl);
      const menuHtml = await fetchText(menuUrl);
      const entries = parseAd2Entries(menuHtml, menuUrl);
      printCollectJson({
        effectiveDate: isoDateFromText(issue.effectiveDate) ?? issue.effectiveDate,
        ad2Icaos: entries.map((e) => e.icao),
      });
    } catch (err) {
      console.error("[HK] collect failed:", err?.message || err);
      process.exit(1);
    }
    return;
  }

  let rl = null;
  try {
    console.error("Hong Kong eAIP — interactive downloader\n");
    const historyHtml = await fetchText(HISTORY_URL);
    const issues = parseIssues(historyHtml);
    if (!issues.length) throw new Error("No issue links found.");

    console.error("--- Available issues ---\n");
    issues.forEach((x, i) => console.error(`${String(i + 1).padStart(3)}. ${x.effectiveDate}  ${x.issueCode}`));

    rl = readline.createInterface({ input, output: stderr, terminal: Boolean(input.isTTY) });
    const issue = await pickFromList(rl, `\nIssue number 1-${issues.length}: `, issues, (x) => `${x.effectiveDate} ${x.issueCode}`);

    const indexHtml = await fetchText(issue.indexUrl);
    const menuUrl = parseMenuUrl(indexHtml, issue.indexUrl);
    const menuHtml = await fetchText(menuUrl);

    console.error(`\nSelected: ${issue.effectiveDate} (${issue.issueCode})`);
    console.error(`Menu: ${menuUrl}\n`);

    const mode = (await rl.question("Download:\n  [1] GEN section PDF\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;

    if (mode === "1") {
      const entries = parseGenEntries(menuHtml, menuUrl);
      if (!entries.length) throw new Error("No GEN entries found.");
      entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. GEN ${e.anchor}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nSection number 1-${entries.length}: `, entries, (e) => `${e.anchor} ${e.label}`);
      const pdfUrl = htmlToPdfUrl(chosen.htmlUrl);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, safeFilename(`${issue.issueCode}_GEN_${chosen.anchor}.pdf`));
      await downloadPdf(pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (mode === "2") {
      const entries = parseAd2Entries(menuHtml, menuUrl);
      if (!entries.length) throw new Error("No AD2 entries found.");
      entries.forEach((e, i) => console.error(`${String(i + 1).padStart(3)}. ${e.icao}  ${e.label}`));
      const chosen = await pickFromList(rl, `\nAirport number 1-${entries.length} or ICAO: `, entries, (e) => `${e.icao} ${e.label}`);
      const pdfUrl = htmlToPdfUrl(chosen.htmlUrl);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, safeFilename(`${issue.issueCode}_${chosen.icao}_AD2.pdf`));
      await downloadPdf(pdfUrl, outFile);
      console.error(`\nSaved: ${outFile}`);
      return;
    }
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error("[HK] failed:", err?.message || err);
  process.exit(1);
});
