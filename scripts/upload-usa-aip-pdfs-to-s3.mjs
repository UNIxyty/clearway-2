#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { saveFile } from "../lib/storage.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const USA_DIR = join(ROOT, "usa-aip");
const AD2_PREFIX = "aip/usa-pdf";
const GEN_KEY = "aip/usa-gen-pdf/GEN-1.2.pdf";

function loadEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] != null) continue;
    const value = line.slice(eq + 1).replace(/^["']|["']$/g, "").trim();
    process.env[key] = value;
  }
}

function isAd2Pdf(name) {
  return /^[A-Z0-9]{4}_ad2\.pdf$/i.test(name);
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes("--dry-run");

  if (!existsSync(USA_DIR)) {
    throw new Error(`Folder not found: ${USA_DIR}`);
  }
  const names = readdirSync(USA_DIR).filter((n) => n.toLowerCase().endsWith(".pdf"));
  const ad2 = names.filter(isAd2Pdf);
  const gen = names.find((n) => n.toUpperCase() === "GEN1.2.PDF");
  if (!gen) throw new Error("Missing usa-aip/GEN1.2.pdf");

  console.log(`[usa-aip-upload] ad2=${ad2.length} gen=1 dryRun=${dryRun ? "yes" : "no"}`);

  for (const file of ad2) {
    const icao = file.slice(0, 4).toUpperCase();
    const key = `${AD2_PREFIX}/${icao}.pdf`;
    const body = readFileSync(join(USA_DIR, file));
    if (dryRun) {
      console.log(`[DRY] ${file} -> /storage/${key}`);
      continue;
    }
    await saveFile(key, body);
    console.log(`[OK] ${file} -> /storage/${key}`);
  }

  const genBody = readFileSync(join(USA_DIR, gen));
  if (dryRun) {
    console.log(`[DRY] ${gen} -> /storage/${GEN_KEY}`);
  } else {
    await saveFile(GEN_KEY, genBody);
    console.log(`[OK] ${gen} -> /storage/${GEN_KEY}`);
  }
}

main().catch((err) => {
  console.error("[usa-aip-upload] failed:", err?.message || err);
  process.exit(1);
});
