#!/usr/bin/env node
import { loadEnvFromProjectRoot } from "./_load-env.mjs";

const ROOT = process.cwd();

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function parseIcaos(raw) {
  return Array.from(
    new Set(
      String(raw || "")
        .split(",")
        .map((part) => part.trim().toUpperCase())
        .filter((icao) => /^[A-Z0-9]{4}$/.test(icao)),
    ),
  );
}

async function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function main() {
  loadEnvFromProjectRoot(ROOT);
  const icaos = parseIcaos(argValue("--icaos", ""));
  const dryRun = hasFlag("--dry-run");
  const confirm = hasFlag("--confirm");

  if (icaos.length === 0) {
    throw new Error("No valid ICAOs provided. Use --icaos LBWB,LIBI,...");
  }

  console.log(`[delete-airports-by-icao] targets=${icaos.join(",")} dryRun=${dryRun ? "yes" : "no"}`);
  if (!dryRun && !confirm) {
    throw new Error("Refusing to delete without --confirm. Use --dry-run to preview.");
  }

  const supabase = await createSupabaseClient();
  const { data: existing, error: readError } = await supabase
    .from("airports")
    .select("icao,country,name")
    .in("icao", icaos)
    .order("icao", { ascending: true });
  if (readError) {
    throw new Error(`Read failed: ${readError.message}`);
  }

  const found = existing || [];
  const foundSet = new Set(found.map((row) => row.icao));
  const missing = icaos.filter((icao) => !foundSet.has(icao));

  for (const row of found) {
    console.log(`[delete-airports-by-icao] found ${row.icao} | ${row.country || "?"} | ${row.name || "?"}`);
  }
  if (missing.length) {
    console.log(`[delete-airports-by-icao] notFound=${missing.join(",")}`);
  }

  if (dryRun) return;
  if (found.length === 0) {
    console.log("[delete-airports-by-icao] nothing to delete.");
    return;
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("airports")
    .delete()
    .in("icao", found.map((row) => row.icao))
    .select("icao");
  if (deleteError) {
    throw new Error(`Delete failed: ${deleteError.message}`);
  }

  const deletedIcaos = (deleted || []).map((row) => row.icao).sort((a, b) => a.localeCompare(b));
  console.log(`[delete-airports-by-icao] deleted=${deletedIcaos.length} (${deletedIcaos.join(",")})`);
}

main().catch((err) => {
  console.error("[delete-airports-by-icao] failed:", err?.message || err);
  process.exit(1);
});
