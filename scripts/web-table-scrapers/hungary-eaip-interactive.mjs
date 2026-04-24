#!/usr/bin/env node
/**
 * Interactive Hungary eAIP downloader.
 *
 * Source:
 * - https://ais-en.hungarocontrol.hu/aip/aip-archive/
 * Uses package ZIP extraction (stable and deterministic).
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
const OUT_GEN = join(PROJECT_ROOT, "downloads", "hungary-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "hungary-eaip", "AD2");
const ENTRY_URL = "https://ais-en.hungarocontrol.hu/aip/aip-archive/";
const UA = "Mozilla/5.0 (compatible; clearway-hungary-eaip/1.0)";
const log = (...args) => console.error("[HUNGARY]", ...args);

const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");

async function fetchText(url) {
  log("Fetching HTML:", url);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
}

async function downloadFile(url, dest) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function parseZipUrls(html) {
  const out = [];
  for (const m of String(html || "").matchAll(/href=["']([^"']*\/(20\d{2})-(\d{2})-(\d{2})\/eaip\.zip)["']/gi)) {
    out.push(new URL(m[1], ENTRY_URL).href);
  }
  return [...new Set(out)].sort((a, b) => {
    const da = parseEffectiveDate(a) || "0000-00-00";
    const db = parseEffectiveDate(b) || "0000-00-00";
    return db.localeCompare(da);
  });
}

function parseEffectiveDate(zipUrl) {
  const m = String(zipUrl || "").match(/\/(20\d{2})-(\d{2})-(\d{2})\/eaip\.zip$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

async function listZipEntries(zipUrl) {
  const tmp = mkdtempSync(join(tmpdir(), "hu-eaip-"));
  const zipFile = join(tmp, "eaip.zip");
  try {
    await downloadFile(zipUrl, zipFile);
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
    const m = String(e).match(/\/pdf\/LH_AD_2_([A-Z0-9]{4})_en\.pdf$/i);
    if (m) set.add(m[1].toUpperCase());
  }
  return [...set].sort();
}

async function extractPdfFromZip(zipUrl, candidates, outFile) {
  const tmp = mkdtempSync(join(tmpdir(), "hu-extract-"));
  const zipFile = join(tmp, "eaip.zip");
  try {
    await downloadFile(zipUrl, zipFile);
    log("Downloaded ZIP:", zipUrl);
    let selected = "";
    const { stdout: allEntriesOut } = await execFileAsync("unzip", ["-Z1", zipFile], { maxBuffer: 32 * 1024 * 1024 });
    const allEntries = String(allEntriesOut || "").split(/\r?\n/).filter(Boolean);
    for (const c of candidates) {
      const found = allEntries.find((x) => x.endsWith(`/${c}`) || x === c);
      if (found) {
        selected = found;
        break;
      }
    }
    if (!selected) throw new Error(`ZIP entry not found. Candidates: ${candidates.join(", ")}`);
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
  const zipUrls = parseZipUrls(html);
  if (!zipUrls.length) throw new Error("Could not resolve Hungary eAIP ZIP URL.");
  const zipUrl = zipUrls[0];
  const effectiveDate = parseEffectiveDate(zipUrl);
  const entries = await listZipEntries(zipUrl);
  const ad2Icaos = parseAd2Icaos(entries);
  log("Resolved ZIP URL:", zipUrl);
  if (effectiveDate) log("Effective date:", effectiveDate);
  log("AD2 entries found:", ad2Icaos.length);
  return { zipUrl, effectiveDate, ad2Icaos };
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
    await extractPdfFromZip(ctx.zipUrl, ["LH_GEN_1_2_en.pdf"], join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`));
    return;
  }

  if (downloadAd2Icao) {
    if (!ctx.ad2Icaos.includes(downloadAd2Icao)) throw new Error(`AD2 ICAO not found: ${downloadAd2Icao}`);
    mkdirSync(OUT_AD2, { recursive: true });
    await extractPdfFromZip(
      ctx.zipUrl,
      [`LH_AD_2_${downloadAd2Icao}_en.pdf`],
      join(OUT_AD2, `${dateTag}_${downloadAd2Icao}_AD2.pdf`),
    );
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (mode === "1") {
      mkdirSync(OUT_GEN, { recursive: true });
      await extractPdfFromZip(ctx.zipUrl, ["LH_GEN_1_2_en.pdf"], join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`));
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
      await extractPdfFromZip(ctx.zipUrl, [`LH_AD_2_${icao}_en.pdf`], join(OUT_AD2, `${dateTag}_${icao}_AD2.pdf`));
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});
