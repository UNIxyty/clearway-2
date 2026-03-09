#!/usr/bin/env node
/**
 * Copy data/ead-country-icaos.json to lib/ead-country-icaos.generated.json at build time.
 * The API imports from the generated file so the bundle always has the full list (no fetch, no cache issues on Vercel).
 */
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "data", "ead-country-icaos.json");
const dest = join(root, "lib", "ead-country-icaos.generated.json");

if (!existsSync(src)) {
  console.error("embed-ead-icaos: source not found (required for build):", src);
  process.exit(1);
}
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log("embed-ead-icaos: wrote", dest);
