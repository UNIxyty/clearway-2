#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import asecnaData from "../../data/asecna-airports.json" with { type: "json" };

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

async function main() {
  const icao = String(argValue("--icao", "") || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(icao)) throw new Error("Use --icao XXXX");
  let airport = null;
  for (const country of asecnaData.countries || []) {
    const found = (country.airports || []).find((a) => String(a.icao || "").toUpperCase() === icao);
    if (found) {
      airport = found;
      break;
    }
  }
  if (!airport) throw new Error(`ICAO ${icao} not found in data/asecna-airports.json`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("asecna_jobs")
    .insert({ icao, country_code: airport.countryCode, status: "queued" })
    .select("id,status,created_at")
    .single();
  if (error) throw new Error(error.message);
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error("[ASECNA trigger] failed:", err.message || err);
  process.exit(1);
});
