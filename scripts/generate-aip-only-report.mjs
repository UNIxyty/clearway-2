#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { basename, join, relative } from "path";

const OUTPUT_DIR = process.env.TEST_RESULTS_DIR || "test-results";
const RAW_DIR = join(OUTPUT_DIR, "raw");
const FILES_BASE_URL = process.env.FILES_BASE_URL || "";

function pickLatestRawFile() {
  if (!existsSync(RAW_DIR)) return null;
  const files = readdirSync(RAW_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({
      path: join(RAW_DIR, name),
      mtimeMs: statSync(join(RAW_DIR, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.path ?? null;
}

function checkMark(pass) {
  return pass ? "✅" : "❌";
}

function airportPassed(airport) {
  const c = airport.checks || {};
  return Boolean(c.pageLoad?.pass && c.aip?.pass);
}

function sanitize(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9._-]+/g, "_");
}

async function uploadScreenshotAndGetUrl(client, filePath, reportStem, country, icao) {
  const key = ["aip", "screenshots", sanitize(reportStem), sanitize(country), `${sanitize(icao)}.png`].join("/");
  const url = FILES_BASE_URL ? `${FILES_BASE_URL.replace(/\/$/, "")}/files/${key}` : "";
  return { key, url };
}

async function buildScreenshotUrlMap(data, reportStem) {
  const screenshotUrls = new Map();
  if (!FILES_BASE_URL) return screenshotUrls;
  for (const country of data.countries || []) {
    for (const airport of country.airports || []) {
      const shotPath = airport?.checks?.screenshot?.path;
      const icao = String(airport?.icao || "unknown");
      if (!shotPath || !existsSync(shotPath)) continue;
      try {
        const { key, url } = await uploadScreenshotAndGetUrl(null, shotPath, reportStem, country.country, icao);
        screenshotUrls.set(shotPath, url);
        console.log(`Mapped screenshot URL for /files/${key}`);
      } catch (error) {
        console.warn(`Failed to upload screenshot for ${icao}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return screenshotUrls;
}

function buildFailedByCountry(data) {
  const failed = [];
  for (const country of data.countries || []) {
    const items = [];
    for (const airport of country.airports || []) {
      if (airportPassed(airport)) continue;
      const firstError = Array.isArray(airport.errors) && airport.errors.length > 0
        ? airport.errors[0]
        : "Unknown failure";
      items.push({
        icao: airport.icao || "UNKNOWN",
        name: airport.name || "Unknown name",
        error: firstError,
      });
    }
    if (items.length > 0) {
      failed.push({ country: country.country, airports: items });
    }
  }
  return failed;
}

function buildMarkdown(data, reportPath, screenshotUrls = new Map()) {
  const lines = [];
  lines.push("# AIP-Only E2E Test Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Source run started: ${data.startedAt || "unknown"}`);
  lines.push(`Portal URL: ${data.portalUrl || "unknown"}`);
  lines.push(`Test type: ${data.testType || "unknown"}`);
  lines.push(`AI disabled for testing: ${data.disableAiForTesting ? "true" : "false"}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Total Countries: ${data.summary?.totalCountries ?? 0}`);
  lines.push(`- Total Airports: ${data.summary?.totalAirports ?? 0}`);
  lines.push(`- Passed Airports: ${data.summary?.passedAirports ?? 0}`);
  lines.push(`- Failed Airports: ${data.summary?.failedAirports ?? 0}`);
  lines.push("");

  lines.push("## Failed Airports");
  lines.push("");
  const failedByCountry = buildFailedByCountry(data);
  if (failedByCountry.length === 0) {
    lines.push("- None");
    lines.push("");
  } else {
    for (const group of failedByCountry) {
      lines.push(`### ${group.country}`);
      lines.push("");
      for (const airport of group.airports) {
        lines.push(`- ${airport.icao} — ${airport.error}`);
      }
      lines.push("");
    }
  }

  lines.push("## Results by Country");
  lines.push("");
  for (const country of data.countries || []) {
    const total = country.airports?.length ?? 0;
    const passed = (country.airports || []).filter((a) => airportPassed(a)).length;
    lines.push(`### ${country.country} (${passed}/${total} passed)`);
    lines.push("");
    for (const airport of country.airports || []) {
      const c = airport.checks || {};
      const status = airportPassed(airport) ? "✅" : "❌";
      lines.push(`#### ${status} ${airport.icao} - ${airport.name || "Unknown name"}`);
      lines.push("");
      lines.push(`- Page Load: ${checkMark(c.pageLoad?.pass)}`);
      lines.push(`- AIP Loading: ${checkMark(c.aip?.pass)}${c.aip?.skippedAi ? " (AI skipped)" : ""}`);
      lines.push(`- Screenshot: ${checkMark(c.screenshot?.pass)}`);
      if (c.screenshot?.path) {
        const hostedUrl = screenshotUrls.get(c.screenshot.path);
        if (hostedUrl) {
          lines.push(`- Screenshot Path: [${basename(c.screenshot.path)}](${hostedUrl})`);
        } else {
          const relativePath = relative(dirnameOrCwd(reportPath), c.screenshot.path).replace(/\\/g, "/");
          lines.push(`- Screenshot Path: [${basename(c.screenshot.path)}](${relativePath})`);
        }
      }
      if (Array.isArray(airport.errors) && airport.errors.length > 0) {
        lines.push("- Errors:");
        for (const error of airport.errors) {
          lines.push(`  - ${error}`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

function dirnameOrCwd(pathname) {
  const idx = pathname.lastIndexOf("/");
  if (idx <= 0) return process.cwd();
  return pathname.slice(0, idx);
}

async function main() {
  const argInput = process.argv.find((a) => a.startsWith("--input="))?.split("=")[1];
  const inputPath = argInput || process.env.E2E_RESULTS_JSON || pickLatestRawFile();
  if (!inputPath) {
    throw new Error("No raw results JSON found. Run e2e test first or pass --input=path/to/results.json");
  }
  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const data = JSON.parse(readFileSync(inputPath, "utf8"));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = join(OUTPUT_DIR, `report-${stamp}.md`);
  const reportStem = basename(reportPath, ".md");
  const screenshotUrls = await buildScreenshotUrlMap(data, reportStem);
  const markdown = buildMarkdown(data, reportPath, screenshotUrls);
  writeFileSync(reportPath, markdown);
  console.log(`Report generated: ${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
