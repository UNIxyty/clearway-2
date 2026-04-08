#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvFromProjectRoot } from "./_load-env.mjs";

const ROOT = process.cwd();
const IN_DEFAULT = path.join(ROOT, "data", "dynamic-airports.json");
const BATCH_SIZE = 200;

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

async function main() {
  loadEnvFromProjectRoot(ROOT);
  const inPath = argValue("--in", IN_DEFAULT);
  const dryRun = hasFlag("--dry-run");
  const payload = JSON.parse(await fs.readFile(inPath, "utf8"));
  const airports = Array.isArray(payload.airports) ? payload.airports : [];
  console.log(`[upsert-airports] start in=${path.relative(ROOT, inPath)} airports=${airports.length} dryRun=${dryRun ? "yes" : "no"}`);
  if (!airports.length) {
    console.log("[upsert-airports] no airports to upsert.");
    return;
  }

  let droppedInvalidIcao = 0;
  const rows = airports
    .map((a) => ({
      icao: String(a.icao || "").trim().toUpperCase(),
      country: String(a.country || ""),
      state: null,
      name: String(a.name || ""),
      lat: Number.isFinite(Number(a.lat)) ? Number(a.lat) : null,
      lon: Number.isFinite(Number(a.lon)) ? Number(a.lon) : null,
      source: "web_table_scraper_dynamic",
      visible: true,
      updated_at: new Date().toISOString(),
    }))
    .filter((row) => {
      const ok = /^[A-Z]{4}$/.test(row.icao);
      if (!ok) droppedInvalidIcao += 1;
      return ok;
    });

  console.log(
    `[upsert-airports] prepared ${rows.length} rows from ${path.relative(ROOT, inPath)} droppedInvalidIcao=${droppedInvalidIcao}`,
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
    throw new Error(
      "Missing module '@supabase/supabase-js'. Run 'npm install' in the project directory on EC2 and rerun this command.",
    );
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNo = Math.floor(i / BATCH_SIZE) + 1;
    const batchTotal = Math.ceil(rows.length / BATCH_SIZE);
    console.log(`[upsert-airports] batch ${batchNo}/${batchTotal} size=${batch.length}`);
    const { error } = await supabase.from("airports").upsert(batch, { onConflict: "icao" });
    if (error) throw new Error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error.message}`);
  }
  console.log("[upsert-airports] upsert complete.");
}

main().catch((err) => {
  console.error("[upsert-airports] failed:", err?.message || err);
  process.exit(1);
});
