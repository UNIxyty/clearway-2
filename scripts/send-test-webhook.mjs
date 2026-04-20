#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, basename } from "path";

const OUTPUT_DIR = process.env.TEST_RESULTS_DIR || "test-results";
const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || process.env.WEBHOOK_URL || "";
const FILES_BASE_URL = process.env.FILES_BASE_URL || "";

function latestFile(dir, ext) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(ext))
    .map((name) => ({ path: join(dir, name), mtimeMs: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.path ?? null;
}

function parseArg(name) {
  const full = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(full));
  return arg ? arg.slice(full.length) : "";
}

async function getReportUrl(reportPath) {
  const explicit = parseArg("report-url") || process.env.REPORT_URL || "";
  if (explicit) return explicit;
  if (!FILES_BASE_URL) return "";
  return `${FILES_BASE_URL.replace(/\/$/, "")}/reports/${basename(reportPath)}`;
}

function readSummary(rawJsonPath) {
  if (!rawJsonPath || !existsSync(rawJsonPath)) {
    return { total: 0, passed: 0, failed: 0 };
  }
  const json = JSON.parse(readFileSync(rawJsonPath, "utf8"));
  return {
    total: Number(json?.summary?.totalAirports || 0),
    passed: Number(json?.summary?.passedAirports || 0),
    failed: Number(json?.summary?.failedAirports || 0),
  };
}

async function main() {
  if (!WEBHOOK_URL) {
    throw new Error("Missing webhook URL. Set N8N_WEBHOOK_URL or WEBHOOK_URL.");
  }

  const reportPath = parseArg("report-path") || latestFile(OUTPUT_DIR, ".md");
  if (!reportPath) {
    throw new Error("No report markdown found. Generate report first or pass --report-path=...");
  }
  const rawJsonPath = parseArg("raw-json-path") || latestFile(join(OUTPUT_DIR, "raw"), ".json");
  const summary = readSummary(rawJsonPath);
  const reportUrl = await getReportUrl(reportPath);

  const payload = {
    event: "e2e_test_complete",
    timestamp: new Date().toISOString(),
    summary,
    reportUrl,
    reportFile: basename(reportPath),
    rawResultsFile: rawJsonPath ? basename(rawJsonPath) : null,
  };

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`Webhook failed (${response.status}): ${responseText || response.statusText}`);
  }

  console.log("Webhook sent successfully.");
  console.log(`Report file: ${reportPath}`);
  console.log(`Report URL: ${reportUrl || "(not provided)"}`);
  if (responseText) console.log(`Response: ${responseText}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
