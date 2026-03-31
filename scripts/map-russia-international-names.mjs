#!/usr/bin/env node
/**
 * Normalize Russian airport names to international English names.
 *
 * Source: OurAirports dataset (airports.csv)
 *   https://ourairports.com/data/airports.csv
 *
 * Usage:
 *   node scripts/map-russia-international-names.mjs
 *   node scripts/map-russia-international-names.mjs --dry-run
 */

import process from "process";
import { createClient } from "@supabase/supabase-js";

const DATA_URL = "https://ourairports.com/data/airports.csv";

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function buildRussiaNameMap(csvText) {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return new Map();
  const header = parseCsvLine(lines[0]);
  const idxIso = header.indexOf("iso_country");
  const idxIcao = header.indexOf("ident");
  const idxName = header.indexOf("name");
  if (idxIso === -1 || idxIcao === -1 || idxName === -1) {
    throw new Error("Unexpected OurAirports CSV format");
  }

  const map = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const iso = String(cols[idxIso] || "").trim().toUpperCase();
    if (iso !== "RU") continue;
    const icao = String(cols[idxIcao] || "").trim().toUpperCase();
    const name = String(cols[idxName] || "").trim();
    if (!icao || !name) continue;
    map.set(icao, name);
  }
  return map;
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${DATA_URL}: ${response.status}`);
  }
  const csvText = await response.text();
  const nameMap = buildRussiaNameMap(csvText);
  console.log(`Loaded ${nameMap.size} RU airport names from OurAirports.`);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await supabase
    .from("airports")
    .select("icao,name,country")
    .eq("country", "Russia");
  if (error) {
    console.error("Failed to load Russia airports:", error.message);
    process.exit(1);
  }

  const updates = [];
  for (const row of rows || []) {
    const icao = String(row.icao || "").toUpperCase();
    const mapped = nameMap.get(icao);
    if (!mapped) continue;
    if (String(row.name || "").trim() === mapped) continue;
    updates.push({ icao, name: mapped });
  }

  console.log(`Prepared ${updates.length} name updates.`);
  if (dryRun) {
    console.log("Dry run enabled. No database writes performed.");
    return;
  }

  for (const u of updates) {
    const { error: upErr } = await supabase
      .from("airports")
      .update({ name: u.name, updated_at: new Date().toISOString() })
      .eq("icao", u.icao)
      .eq("country", "Russia");
    if (upErr) {
      console.error(`Failed updating ${u.icao}:`, upErr.message);
      process.exit(1);
    }
  }

  console.log("Russia name normalization complete.");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
