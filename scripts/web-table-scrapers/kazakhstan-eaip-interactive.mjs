#!/usr/bin/env node
/**
 * Interactive Kazakhstan eAIP downloader.
 *
 * Source:
 * - https://www.ans.kz/en/ais/eaip
 * Uses package ZIP extraction (stable and bypasses HTML anti-bot PDF endpoints).
 */

import readline from "node:readline/promises";
import { collectMode, printCollectJson } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "kazakhstan-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "kazakhstan-eaip", "AD2");
const ENTRY_URL = "https://www.ans.kz/en/ais/eaip";
const UA = "Mozilla/5.0 (compatible; clearway-kazakhstan-eaip/1.0)";
const FETCH_TIMEOUT_MS = 45_000;
const DOWNLOAD_TIMEOUT_MS = 240_000;
const MAX_RETRIES = 3;
const log = (...args) => console.error("[KAZAKHSTAN]", ...args);

const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { "User-Agent": UA } });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url) {
  log("Fetching HTML:", url);
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt >= MAX_RETRIES) break;
      log(`Fetch failed (attempt ${attempt}/${MAX_RETRIES}):`, err?.message || err);
      await sleep(800 * attempt);
    }
  }
  throw lastErr || new Error(`Failed to fetch ${url}`);
}

async function downloadFile(url, dest) {
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log(`Downloading ZIP (attempt ${attempt}/${MAX_RETRIES}):`, url);
      const res = await fetchWithTimeout(url, DOWNLOAD_TIMEOUT_MS);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const total = Number(res.headers.get("content-length") || 0);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Response body stream unavailable");
      const chunks = [];
      let loaded = 0;
      let nextLogAt = 5 * 1024 * 1024;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(Buffer.from(value));
          loaded += value.length;
          if (loaded >= nextLogAt) {
            if (total > 0) {
              const pct = ((loaded / total) * 100).toFixed(1);
              log(`ZIP progress: ${pct}% (${Math.round(loaded / 1024 / 1024)}MB/${Math.round(total / 1024 / 1024)}MB)`);
            } else {
              log(`ZIP progress: ${Math.round(loaded / 1024 / 1024)}MB downloaded`);
            }
            nextLogAt += 5 * 1024 * 1024;
          }
        }
      }
      writeFileSync(dest, Buffer.concat(chunks));
      return;
    } catch (err) {
      lastErr = err;
      if (attempt >= MAX_RETRIES) break;
      log(`ZIP download failed (attempt ${attempt}/${MAX_RETRIES}):`, err?.message || err);
      await sleep(1_000 * attempt);
    }
  }
  throw lastErr || new Error(`Failed to download ${url}`);
}

function parseIssueLinks(html) {
  const out = [];
  for (const m of String(html || "").matchAll(/href=["']([^"']*\/(20\d{2})-(\d{2})-(\d{2})-AIRAC\/(?:\2-\3-\4-AIRAC\.zip)?)["']/gi)) {
    out.push(new URL(m[1], ENTRY_URL).href);
  }
  return [...new Set(out)];
}

function parseZipUrl(issueLinks) {
  const zipLinks = issueLinks.filter((x) => /\.zip$/i.test(x)).sort().reverse();
  if (!zipLinks.length) throw new Error("Could not resolve Kazakhstan eAIP ZIP URL.");
  return zipLinks[0];
}

function parseEffectiveDate(zipUrl) {
  const m = String(zipUrl || "").match(/\/(20\d{2})-(\d{2})-(\d{2})-AIRAC\//);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

async function listZipEntries(zipUrl) {
  const tmp = mkdtempSync(join(tmpdir(), "kz-eaip-"));
  const zipFile = join(tmp, "eaip.zip");
  try {
    await downloadFile(zipUrl, zipFile);
    log("Listing ZIP entries...");
    const { stdout } = await execFileAsync("unzip", ["-Z1", zipFile], { maxBuffer: 16 * 1024 * 1024 });
    return String(stdout || "")
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function parseAd2Icaos(entries) {
  const set = new Set();
  for (const e of entries) {
    const m = String(e).match(/\/pdf\/UA_AD_2_([A-Z0-9]{4})_en\.pdf$/i);
    if (m) set.add(m[1].toUpperCase());
  }
  return [...set].sort();
}

async function extractPdfFromZip(zipUrl, candidates, outFile) {
  const tmp = mkdtempSync(join(tmpdir(), "kz-extract-"));
  const zipFile = join(tmp, "eaip.zip");
  try {
    await downloadFile(zipUrl, zipFile);
    log("Downloaded ZIP:", zipUrl);
    let selected = "";
    for (const c of candidates) {
      try {
        await execFileAsync("unzip", ["-p", zipFile, c], { encoding: "buffer", maxBuffer: 128 * 1024 * 1024 });
        selected = c;
        break;
      } catch {
        // try next candidate
      }
    }
    if (!selected) {
      const { stdout } = await execFileAsync("unzip", ["-Z1", zipFile], { maxBuffer: 32 * 1024 * 1024 });
      const files = String(stdout || "").split(/\r?\n/).filter(Boolean);
      for (const c of candidates) {
        const tail = c.split("/").pop();
        const found = files.find((x) => x.endsWith(`/${tail}`));
        if (found) {
          selected = found;
          break;
        }
      }
    }
    if (!selected) throw new Error(`ZIP entry not found. Candidates: ${candidates.join(", ")}`);
    log("Extracting ZIP entry:", selected);
    const { stdout } = await execFileAsync("unzip", ["-p", zipFile, selected], {
      encoding: "buffer",
      maxBuffer: 128 * 1024 * 1024,
    });
    const bytes = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || "");
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Extracted payload is not a PDF");
    writeFileSync(outFile, bytes);
    log("Extracted PDF from ZIP entry:", selected);
    log("Saved PDF:", outFile);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function resolveContext() {
  const html = await fetchText(ENTRY_URL);
  const issueLinks = parseIssueLinks(html);
  const zipUrl = parseZipUrl(issueLinks);
  const effectiveDate = parseEffectiveDate(zipUrl);
  const entries = await listZipEntries(zipUrl);
  const ad2Icaos = parseAd2Icaos(entries);
  log("Resolved ZIP URL:", zipUrl);
  if (effectiveDate) log("Effective date:", effectiveDate);
  log("AD2 entries found:", ad2Icaos.length);
  return { zipUrl, effectiveDate, ad2Icaos };
}

async function resolveZipMeta() {
  const html = await fetchText(ENTRY_URL);
  const issueLinks = parseIssueLinks(html);
  const zipUrl = parseZipUrl(issueLinks);
  const effectiveDate = parseEffectiveDate(zipUrl);
  log("Resolved ZIP URL:", zipUrl);
  if (effectiveDate) log("Effective date:", effectiveDate);
  return { zipUrl, effectiveDate };
}

async function main() {
  if (downloadGen12) {
    const ctx = await resolveZipMeta();
    const dateTag = ctx.effectiveDate || "unknown-date";
    mkdirSync(OUT_GEN, { recursive: true });
    await extractPdfFromZip(ctx.zipUrl, ["UA_GEN_1_2_en.pdf"], join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`));
    return;
  }

  if (downloadAd2Icao) {
    const ctx = await resolveZipMeta();
    const dateTag = ctx.effectiveDate || "unknown-date";
    mkdirSync(OUT_AD2, { recursive: true });
    await extractPdfFromZip(
      ctx.zipUrl,
      [`UA_AD_2_${downloadAd2Icao}_en.pdf`],
      join(OUT_AD2, `${dateTag}_${downloadAd2Icao}_AD2.pdf`),
    );
    return;
  }

  const ctx = await resolveContext();
  const dateTag = ctx.effectiveDate || "unknown-date";

  if (collectMode()) {
    printCollectJson({ effectiveDate: ctx.effectiveDate, ad2Icaos: ctx.ad2Icaos });
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      mkdirSync(OUT_GEN, { recursive: true });
      await extractPdfFromZip(ctx.zipUrl, ["UA_GEN_1_2_en.pdf"], join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`));
      return;
    }
    if (mode === "2") {
      ctx.ad2Icaos.forEach((icao, i) => console.error(`${String(i + 1).padStart(3)}. ${icao}`));
      const raw = (await rl.question(`\nAirport number 1-${ctx.ad2Icaos.length} or ICAO: `)).trim().toUpperCase();
      const n = Number.parseInt(raw, 10);
      const icao =
        String(n) === raw && n >= 1 && n <= ctx.ad2Icaos.length ? ctx.ad2Icaos[n - 1] : raw;
      if (!ctx.ad2Icaos.includes(icao)) throw new Error("Invalid selection.");
      mkdirSync(OUT_AD2, { recursive: true });
      await extractPdfFromZip(ctx.zipUrl, [`UA_AD_2_${icao}_en.pdf`], join(OUT_AD2, `${dateTag}_${icao}_AD2.pdf`));
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});
