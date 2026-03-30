/**
 * Read AIM link JSON (same shape as file.json), classify each row, optionally download.
 *
 * 1) Run probe (or load existing --report JSON from aim-links-probe.mjs).
 * 2) pdf-direct-download: GET PDF → downloads/aim-from-json/<Country>.pdf (sanitized name)
 * 3) inac-venezuela-eaip-cli / mnav-north-macedonia-eaip-cli: print exact node command (no spawn by default)
 *
 * Usage:
 *   node scripts/aim-download-from-json.mjs /path/to/file.json --probe-only
 *   node scripts/aim-download-from-json.mjs /path/to/file.json --download-pdfs
 *   node scripts/aim-download-from-json.mjs /path/to/file.json --report test-results/aim-links-probe-report.json --download-pdfs
 */

import { readFileSync, mkdirSync, createWriteStream } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_BASE = join(PROJECT_ROOT, "downloads", "aim-from-json");

function safeCountryFilename(country) {
  return (
    country
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, "_")
      .slice(0, 120) || "unknown"
  );
}

function parseArgs(argv) {
  let probeOnly = false;
  let downloadPdfs = false;
  let reportPath = null;
  const paths = [];
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--probe-only") probeOnly = true;
    else if (argv[i] === "--download-pdfs") downloadPdfs = true;
    else if (argv[i] === "--report" && argv[i + 1]) reportPath = argv[++i];
    else if (!argv[i].startsWith("-")) paths.push(argv[i]);
  }
  if (paths.length === 0) {
    console.error(
      `Usage: node scripts/aim-download-from-json.mjs <file.json> [--probe-only] [--download-pdfs] [--report probe.json]`,
    );
    process.exit(1);
  }
  return { inputPath: paths[0], probeOnly, downloadPdfs, reportPath };
}

async function downloadPdf(url, destPath) {
  const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "ClearwayAIMBatch/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("pdf") && !ct.includes("octet-stream")) {
    console.warn(`[warn] unexpected Content-Type: ${ct}`);
  }
  mkdirSync(dirname(destPath), { recursive: true });
  const body = Readable.fromWeb(/** @type {import('stream/web').ReadableStream} */ (res.body));
  await pipeline(body, createWriteStream(destPath));
}

async function main() {
  const { inputPath, probeOnly, downloadPdfs, reportPath } = parseArgs(process.argv);

  /** @type {any} */
  let report;
  if (reportPath) {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } else {
    const { spawnSync } = await import("node:child_process");
    const outReport = join(PROJECT_ROOT, "test-results", "aim-links-probe-report-temp.json");
    const r = spawnSync(
      process.execPath,
      [join(__dirname, "aim-links-probe.mjs"), inputPath, "--out", outReport],
      { stdio: "inherit", cwd: PROJECT_ROOT },
    );
    if (r.status !== 0) process.exit(r.status ?? 1);
    report = JSON.parse(readFileSync(outReport, "utf8"));
  }

  console.error("\n=== suggestedIntegration summary ===\n");
  const by = new Map();
  for (const row of report.rows || []) {
    const k = row.suggestedIntegration || "?";
    by.set(k, (by.get(k) || 0) + 1);
  }
  for (const [k, n] of [...by.entries()].sort((a, b) => b[1] - a[1])) {
    console.error(`  ${k}: ${n}`);
  }

  if (probeOnly) {
    console.error("\n(--probe-only) no downloads.\n");
    return;
  }

  const inacRows = (report.rows || []).filter((r) => r.suggestedIntegration === "inac-venezuela-eaip-cli");
  const mnavRows = (report.rows || []).filter((r) => r.suggestedIntegration === "mnav-north-macedonia-eaip-cli");
  if (inacRows.length) {
    console.error("\n--- INAC Venezuela (existing CLI) ---");
    console.error("node scripts/inac-venezuela-eaip-interactive.mjs");
    console.error("node scripts/inac-venezuela-eaip-gen-download.mjs");
    console.error("node scripts/inac-venezuela-eaip-ad2-download.mjs --icao XXXX");
  }
  if (mnavRows.length) {
    console.error("\n--- M-NAV North Macedonia (existing CLI) ---");
    console.error("node scripts/mnav-north-macedonia-eaip-interactive.mjs");
  }

  if (!downloadPdfs) {
    console.error("\nPass --download-pdfs to save direct PDF links under downloads/aim-from-json/\n");
    return;
  }

  mkdirSync(OUT_BASE, { recursive: true });
  for (const row of report.rows || []) {
    if (row.suggestedIntegration !== "pdf-direct-download") continue;
    const p = row.probe;
    if (!p?.ok || !p.isLikelyPdf) continue;
    const dest = join(OUT_BASE, `${safeCountryFilename(row.country)}.pdf`);
    console.error(`PDF → ${row.country}: ${row.url}`);
    try {
      await downloadPdf(row.url, dest);
    } catch (e) {
      console.error(`  failed: ${e}`);
    }
  }
  console.error(`\nDone. PDFs in ${OUT_BASE}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
