#!/usr/bin/env node
import { readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const INPUT_PATH = join(ROOT, "data", "asecna-airports.json");
const LOCAL_COORDS_PATH = join(ROOT, "data", "airport-coords.json");
const OURAIRPORTS_URL = "https://ourairports.com/data/airports.csv";
const BATCH_SIZE = 200;

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        cur += "\"";
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

function buildOurAirportsMap(csvText) {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return new Map();
  const header = parseCsvLine(lines[0]);
  const idxIcao = header.indexOf("ident");
  const idxName = header.indexOf("name");
  const idxLat = header.indexOf("latitude_deg");
  const idxLon = header.indexOf("longitude_deg");
  const map = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const icao = String(cols[idxIcao] || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(icao)) continue;
    const name = String(cols[idxName] || "").trim();
    const lat = Number(cols[idxLat]);
    const lon = Number(cols[idxLon]);
    map.set(icao, {
      name: name || null,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
    });
  }
  return map;
}

function normCountryName(name) {
  const raw = String(name || "").trim();
  const map = {
    "Bénin": "Benin",
    Cameroun: "Cameroon",
    "Congo (Brazza)": "Congo",
    "Côte d’Ivoire": "Cote d'Ivoire",
    "Côte d'Ivoire": "Cote d'Ivoire",
    "Guinée Bissau": "Guinea-Bissau",
    "République Centrafricaine": "Central African Republic",
    Tchad: "Chad",
    "Comores": "Comoros",
    Mauritanie: "Mauritania",
    Niger: "Niger",
    Sénégal: "Senegal",
    Togo: "Togo",
    Gabon: "Gabon",
    Guinée: "Guinea",
    Madagascar: "Madagascar",
    Mali: "Mali",
    "Burkina Faso": "Burkina Faso",
    "Equatorial Guinea": "Equatorial Guinea",
    Rwanda: "Rwanda",
  };
  return map[raw] ?? raw;
}

function toRows(payload, ourMap, localCoords) {
  const now = new Date().toISOString();
  const rows = [];
  for (const country of payload.countries || []) {
    const countryName = normCountryName(country.name);
    for (const airport of country.airports || []) {
      const icao = String(airport.icao || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(icao)) continue;
      const fromOur = ourMap.get(icao) || null;
      const fromLocal = localCoords?.[icao] || null;
      const gen12Label = country.gen12?.label ?? null;
      const gen12Href = country.gen12?.href ?? null;
      rows.push({
        icao,
        country: countryName,
        state: null,
        name: fromOur?.name || `${icao} Airport`,
        lat: fromOur?.lat ?? fromLocal?.lat ?? null,
        lon: fromOur?.lon ?? fromLocal?.lon ?? null,
        source: "asecna_dynamic",
        source_type: "ASECNA",
        dynamic_updated: true,
        web_aip_url: airport.webAipUrl || payload.menuUrl || null,
        country_code: country.code || airport.countryCode || null,
        ad2_html_url: null,
        gen12_label: gen12Label,
        gen12_href: gen12Href,
        visible: true,
        updated_at: now,
      });
    }
  }
  rows.sort((a, b) => a.icao.localeCompare(b.icao));
  return rows;
}

async function main() {
  const input = argValue("--input", INPUT_PATH);
  const dryRun = hasFlag("--dry-run");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const payload = JSON.parse(readFileSync(input, "utf8"));
  const localCoords = JSON.parse(readFileSync(LOCAL_COORDS_PATH, "utf8"));
  const ourRes = await fetch(OURAIRPORTS_URL);
  if (!ourRes.ok) throw new Error(`Failed to fetch ${OURAIRPORTS_URL}: ${ourRes.status}`);
  const ourMap = buildOurAirportsMap(await ourRes.text());
  const rows = toRows(payload, ourMap, localCoords);

  if (rows.length === 0) {
    console.log("[ASECNA->Supabase] no rows to import.");
    return;
  }

  console.log(`[ASECNA->Supabase] prepared ${rows.length} rows from ${payload.countries?.length || 0} countries`);
  if (dryRun) return;

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("airports")
      .upsert(batch, { onConflict: "icao" });
    if (error) throw new Error(`Upsert failed for batch ${i / BATCH_SIZE + 1}: ${error.message}`);
  }
  console.log("[ASECNA->Supabase] import complete.");
}

main().catch((err) => {
  console.error("[ASECNA->Supabase] failed:", err.message || err);
  process.exit(1);
});
