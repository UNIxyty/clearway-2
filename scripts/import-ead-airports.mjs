#!/usr/bin/env node
/**
 * Import EAD airports from a JSON file into Supabase airports table.
 *
 * Usage:
 *   node scripts/import-ead-airports.mjs
 *   node scripts/import-ead-airports.mjs --input "/path/to/file.json" --dry-run
 */

import fs from "fs/promises";
import path from "path";
import process from "process";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_INPUT = "/Users/whae/Downloads/icao_codes_by_country_v3_cleaned.json";
const ROOT = process.cwd();
const COORDS_PATH = path.join(ROOT, "data", "airport-coords.json");
const MISSING_REPORT_PATH = path.join(ROOT, "data", "missing-coords.json");
const BATCH_SIZE = 200;

function getArg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function parseCountryLabel(countryLabel) {
  // Example: "Albania (LA)" -> "Albania"
  return String(countryLabel || "")
    .replace(/\s*\([^)]+\)\s*$/, "")
    .trim();
}

function toUpperIcao(value) {
  return String(value || "").trim().toUpperCase();
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function buildRows(inputJson, coordsMap) {
  const countries = inputJson?.countries ?? {};
  const rows = [];
  const missingCoords = [];

  for (const [countryLabel, airports] of Object.entries(countries)) {
    const country = parseCountryLabel(countryLabel);
    if (!Array.isArray(airports)) continue;
    for (const airport of airports) {
      const icao = toUpperIcao(airport?.icao);
      const name = String(airport?.name || "").trim();
      if (!icao) continue;
      const coord = coordsMap[icao] || null;
      if (!coord || typeof coord.lat !== "number" || typeof coord.lon !== "number") {
        missingCoords.push({ icao, country, name });
      }
      rows.push({
        icao,
        country,
        name,
        lat: coord?.lat ?? null,
        lon: coord?.lon ?? null,
        source: "ead_v3_cleaned",
        visible: true,
        updated_at: new Date().toISOString(),
      });
    }
  }

  return { rows, missingCoords };
}

async function main() {
  const inputPath = getArg("--input", DEFAULT_INPUT);
  const dryRun = hasFlag("--dry-run");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const [inputJson, coordsMap] = await Promise.all([
    readJson(inputPath),
    readJson(COORDS_PATH),
  ]);

  const { rows, missingCoords } = buildRows(inputJson, coordsMap);
  await fs.writeFile(MISSING_REPORT_PATH, JSON.stringify(missingCoords, null, 2) + "\n", "utf8");

  if (rows.length === 0) {
    console.log("No rows to import.");
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Build existing ICAO set to avoid relying on a unique constraint.
  const existingIcaoSet = new Set();
  let page = 0;
  while (true) {
    const from = page * 1000;
    const to = from + 999;
    const { data, error } = await supabase
      .from("airports")
      .select("icao")
      .range(from, to);
    if (error) {
      console.error("Failed to read existing airports:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      const icao = toUpperIcao(row?.icao);
      if (icao) existingIcaoSet.add(icao);
    }
    if (data.length < 1000) break;
    page += 1;
  }

  const inserts = [];
  const updates = [];
  for (const row of rows) {
    if (existingIcaoSet.has(row.icao)) updates.push(row);
    else inserts.push(row);
  }

  console.log(`Prepared ${rows.length} rows (${inserts.length} inserts, ${updates.length} updates).`);
  console.log(`Missing coords reported: ${missingCoords.length} -> ${MISSING_REPORT_PATH}`);

  if (dryRun) {
    console.log("Dry run enabled. No database writes performed.");
    return;
  }

  // Inserts in batches
  for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
    const batch = inserts.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("airports").insert(batch);
    if (error) {
      console.error("Insert batch failed:", error.message);
      process.exit(1);
    }
  }

  // Updates in batches via upsert-like merge by icao (update fields only)
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      const { error } = await supabase
        .from("airports")
        .update({
          country: row.country,
          name: row.name,
          lat: row.lat,
          lon: row.lon,
          source: row.source,
          updated_at: row.updated_at,
        })
        .eq("icao", row.icao);
      if (error) {
        console.error(`Update failed for ${row.icao}:`, error.message);
        process.exit(1);
      }
    }
  }

  console.log("Import complete.");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
