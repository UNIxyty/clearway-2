#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from "fs";
import { basename, join } from "path";

const OUTPUT_DIR = process.env.TEST_RESULTS_DIR || "test-results";
const RAW_DIR = join(OUTPUT_DIR, "raw");

function parseArg(name, fallback = "") {
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(`--${name}=`.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function pickLatestRawFile() {
  if (!existsSync(RAW_DIR)) return null;
  const files = readdirSync(RAW_DIR)
    .filter((name) => name.endsWith(".json") && name.startsWith("ead-ad-"))
    .map((name) => ({ path: join(RAW_DIR, name), mtimeMs: statSync(join(RAW_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.path ?? null;
}

function stampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function buildReport(raw, inputPath) {
  const lines = [];
  const summary = raw?.summary || {};
  const countries = Array.isArray(raw?.countries) ? raw.countries : [];
  const failed = countries.filter((c) => c.status !== "succeeded");

  lines.push("# EAD AD Document Names Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Run started: ${raw?.startedAt || "unknown"}`);
  lines.push(`Run ended: ${raw?.endedAt || "unknown"}`);
  lines.push(`Input raw file: ${basename(inputPath)}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Total countries: ${Number(summary.totalCountries || 0)}`);
  lines.push(`- Succeeded countries: ${Number(summary.succeededCountries || 0)}`);
  lines.push(`- Failed countries: ${Number(summary.failedCountries || 0)}`);
  lines.push(`- Total documents: ${Number(summary.totalDocuments || 0)}`);
  lines.push(`- Total pages visited: ${Number(summary.totalPages || 0)}`);
  lines.push(`- Total rows collected: ${Number(summary.totalRows || 0)}`);
  lines.push("");
  lines.push("## Per-Country Counts");
  lines.push("");
  lines.push("| Country | Status | Attempts | Documents | Pages | Rows |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const c of countries) {
    const status = c.status === "succeeded" ? "OK" : "FAIL";
    lines.push(
      `| ${c.country || "Unknown"} | ${status} | ${Number(c.attempts || 0)} | ${Number(c.documentCount || 0)} | ${Number(c.pagesVisited || 0)} | ${Number(c.rowsCollected || 0)} |`,
    );
  }
  lines.push("");
  lines.push("## Failed Countries");
  lines.push("");
  if (failed.length === 0) {
    lines.push("- None");
  } else {
    for (const c of failed) {
      const firstError = Array.isArray(c.errors) && c.errors.length > 0 ? c.errors[0] : "Unknown error";
      lines.push(`- ${c.country || "Unknown"}: ${firstError}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const inputPath = parseArg("input") || pickLatestRawFile();
  if (!inputPath) {
    throw new Error("No EAD AD raw JSON found. Run extractor first or pass --input=...");
  }
  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const raw = JSON.parse(readFileSync(inputPath, "utf8"));
  const reportPath = join(OUTPUT_DIR, `report-ead-ad-${stampForFile()}.md`);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const markdown = buildReport(raw, inputPath);
  writeFileSync(reportPath, markdown, "utf8");
  console.log(`Report generated: ${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
