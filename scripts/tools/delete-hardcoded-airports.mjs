#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DYNAMIC_PATH = path.join(ROOT, "data", "dynamic-airports.json");
const AIP_DATA_PATH = path.join(ROOT, "data", "aip-data.json");

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function main() {
  const confirm = hasFlag("--confirm");
  const dynamic = JSON.parse(await fs.readFile(DYNAMIC_PATH, "utf8"));
  const aipData = JSON.parse(await fs.readFile(AIP_DATA_PATH, "utf8"));
  const dynamicIcaos = new Set(
    (dynamic.airports || [])
      .map((a) => String(a.icao || "").toUpperCase())
      .filter((v) => /^[A-Z0-9]{4}$/.test(v)),
  );

  let removedCount = 0;
  const next = (Array.isArray(aipData) ? aipData : []).map((country) => {
    const airports = Array.isArray(country.airports) ? country.airports : [];
    const kept = airports.filter((a) => {
      const icao = String(a["Airport Code"] || "").toUpperCase();
      const remove = dynamicIcaos.has(icao);
      if (remove) removedCount += 1;
      return !remove;
    });
    return { ...country, airports: kept };
  });

  console.log(`[delete-hardcoded] would remove ${removedCount} airport rows from data/aip-data.json`);
  if (!confirm) {
    console.log("[delete-hardcoded] dry-run only. Re-run with --confirm to apply changes.");
    return;
  }

  await fs.writeFile(AIP_DATA_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
  console.log("[delete-hardcoded] changes applied.");
}

main().catch((err) => {
  console.error("[delete-hardcoded] failed:", err?.message || err);
  process.exit(1);
});
