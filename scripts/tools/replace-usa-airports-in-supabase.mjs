#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvFromProjectRoot } from "./_load-env.mjs";

const ROOT = process.cwd();
const USA_AIP_DIR = path.join(ROOT, "usa-aip");
const USA_BY_STATE_PATH = path.join(ROOT, "data", "usa-aip-icaos-by-state.json");
const AIRPORT_COORDS_PATH = path.join(ROOT, "data", "airport-coords.json");
const FAA_WEB_AIP_URL = "https://www.faa.gov/air_traffic/publications/atpubs/aip_html/";
const COUNTRY = "United States of America";
const BATCH_SIZE = 200;

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function collectIcaosFromUsaAip() {
  const entries = await fs.readdir(USA_AIP_DIR, { withFileTypes: true });
  const set = new Set();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const m = entry.name.match(/^([A-Za-z0-9]{4})_ad2\.pdf$/);
    if (!m) continue;
    set.add(m[1].toUpperCase());
  }
  return Array.from(set).sort();
}

function buildUsaMetaMaps(usaByState) {
  const stateByIcao = new Map();
  const nameByIcao = new Map();
  const byState = usaByState?.by_state ?? {};

  for (const [state, airports] of Object.entries(byState)) {
    if (!Array.isArray(airports)) continue;
    for (const airport of airports) {
      const icao = String(airport?.["Airport Code"] ?? "").trim().toUpperCase();
      if (!icao) continue;
      const name = String(airport?.["Airport Name"] ?? "").trim();
      stateByIcao.set(icao, state);
      if (name) nameByIcao.set(icao, name);
    }
  }

  return { stateByIcao, nameByIcao };
}

async function main() {
  loadEnvFromProjectRoot(ROOT);
  const dryRun = hasFlag("--dry-run");

  const [usaByState, airportCoords, usaAipIcaos] = await Promise.all([
    readJson(USA_BY_STATE_PATH),
    readJson(AIRPORT_COORDS_PATH),
    collectIcaosFromUsaAip(),
  ]);

  if (!usaAipIcaos.length) {
    throw new Error(`No *_ad2.pdf ICAOs found in ${path.relative(ROOT, USA_AIP_DIR)}`);
  }

  const { stateByIcao, nameByIcao } = buildUsaMetaMaps(usaByState);

  let missingState = 0;
  let missingName = 0;

  const rows = usaAipIcaos
    .map((icao) => {
      const state = stateByIcao.get(icao) ?? null;
      const name = nameByIcao.get(icao) ?? `${icao} Airport`;
      const coord = airportCoords?.[icao];
      if (!state) missingState += 1;
      if (!nameByIcao.has(icao)) missingName += 1;
      return {
        icao,
        country: COUNTRY,
        state,
        name,
        lat: coord?.lat ?? null,
        lon: coord?.lon ?? null,
        web_aip_url: FAA_WEB_AIP_URL,
        source: "usa_aip_static",
        visible: true,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((row) => /^[A-Z0-9]{4}$/.test(row.icao));

  console.log(
    `[usa-airports:replace] prepared=${rows.length} dryRun=${dryRun ? "yes" : "no"} missingState=${missingState} missingName=${missingName}`,
  );

  if (dryRun) return;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  let createClient;
  try {
    ({ createClient } = await import("@supabase/supabase-js"));
  } catch {
    throw new Error("Missing module '@supabase/supabase-js'. Run 'npm install' and retry.");
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Remove previously stored USA rows so the folder ICAO list becomes source-of-truth.
  {
    const { error } = await supabase.from("airports").delete().eq("country", COUNTRY);
    if (error) throw new Error(`Delete country='${COUNTRY}' failed: ${error.message}`);
  }
  {
    const { error } = await supabase.from("airports").delete().ilike("country", "%, USA");
    if (error) throw new Error(`Delete country ILIKE '%, USA' failed: ${error.message}`);
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNo = Math.floor(i / BATCH_SIZE) + 1;
    const batchTotal = Math.ceil(rows.length / BATCH_SIZE);
    console.log(`[usa-airports:replace] upsert batch ${batchNo}/${batchTotal} size=${batch.length}`);
    const { error } = await supabase.from("airports").upsert(batch, { onConflict: "icao" });
    if (error) throw new Error(`Upsert batch ${batchNo} failed: ${error.message}`);
  }

  const { count, error: countError } = await supabase
    .from("airports")
    .select("icao", { count: "exact", head: true })
    .eq("country", COUNTRY);
  if (countError) throw new Error(`Post-check count failed: ${countError.message}`);

  console.log(`[usa-airports:replace] complete country='${COUNTRY}' rowsNow=${count ?? 0}`);
}

main().catch((err) => {
  console.error("[usa-airports:replace] failed:", err?.message || err);
  process.exit(1);
});
