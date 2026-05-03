#!/usr/bin/env node
/**
 * Start an admin debug run that targets EAD airports only.
 *
 * Usage examples:
 *   node scripts/debug-ead-all-airports.mjs --dry-run
 *   node scripts/debug-ead-all-airports.mjs --base-url http://127.0.0.1:3000 --concurrency 1 --steps aip,pdf,gen
 *   node scripts/debug-ead-all-airports.mjs --country "Italy (LI)" --limit 20
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const EAD_COUNTRIES_PATH = join(ROOT, "data", "ead-country-icaos.json");

function loadDotEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i < 0) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function normalizeCountry(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[./_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseCountryNameFromLabel(label) {
  return String(label || "").replace(/\s*\([A-Z0-9]{2}\)\s*$/, "").trim();
}

function readEadIcaos(countryFilter) {
  if (!existsSync(EAD_COUNTRIES_PATH)) {
    throw new Error(`Missing ${EAD_COUNTRIES_PATH}`);
  }
  const json = JSON.parse(readFileSync(EAD_COUNTRIES_PATH, "utf8"));
  const out = [];
  const countryNeedle = normalizeCountry(countryFilter || "");
  for (const [label, rows] of Object.entries(json || {})) {
    const countryName = parseCountryNameFromLabel(label);
    if (countryNeedle) {
      const normalizedLabel = normalizeCountry(label);
      const normalizedCountry = normalizeCountry(countryName);
      if (!normalizedLabel.includes(countryNeedle) && !normalizedCountry.includes(countryNeedle)) continue;
    }
    for (const row of Array.isArray(rows) ? rows : []) {
      const icao = String(row || "").trim().toUpperCase();
      if (/^[A-Z0-9]{4}$/.test(icao)) out.push(icao);
    }
  }
  return Array.from(new Set(out)).sort((a, b) => a.localeCompare(b));
}

async function main() {
  loadDotEnv();
  const baseUrl = String(argValue("--base-url", process.env.DEBUG_RUNNER_BASE_URL || "http://127.0.0.1:3000")).replace(/\/$/, "");
  const concurrency = Math.max(1, Number(argValue("--concurrency", "1")) || 1);
  const stepsArg = String(argValue("--steps", "aip,notam,weather,pdf,gen"));
  const limit = Number(argValue("--limit", "0")) || 0;
  const country = argValue("--country", "");
  const dryRun = hasFlag("--dry-run");
  const steps = stepsArg
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => ["aip", "notam", "weather", "pdf", "gen"].includes(x));
  const allIcaos = readEadIcaos(country);
  const icaos = limit > 0 ? allIcaos.slice(0, limit) : allIcaos;

  if (icaos.length === 0) {
    throw new Error("No ICAOs matched. Try removing --country filter.");
  }

  const payload = {
    icaos,
    concurrency,
    steps: steps.length > 0 ? steps : ["aip", "notam", "weather", "pdf", "gen"],
    sourceMode: "ead-only",
  };

  console.log(`[ead-debug] baseUrl=${baseUrl}`);
  console.log(`[ead-debug] country=${country || "ALL"} totalIcaos=${icaos.length} concurrency=${concurrency}`);
  console.log(`[ead-debug] steps=${payload.steps.join(",")}`);
  if (dryRun) {
    console.log("[ead-debug] dry-run payload:");
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const secret = String(process.env.DEBUG_RUNNER_INTERNAL_SECRET || "").trim();
  const headers = { "Content-Type": "application/json" };
  if (secret) headers["x-debug-runner-secret"] = secret;

  const res = await fetch(`${baseUrl}/api/admin/debug/runs`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${JSON.stringify(data)}`);
  }
  console.log(`[ead-debug] started runId=${data.runId}`);
  console.log(`${baseUrl}/admin/debug?run=${encodeURIComponent(data.runId)}`);
}

main().catch((err) => {
  console.error("[ead-debug] failed:", err?.message || err);
  process.exit(1);
});
