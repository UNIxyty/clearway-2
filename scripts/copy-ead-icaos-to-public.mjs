#!/usr/bin/env node
/** Copy data/ead-country-icaos.json to public/ so Vercel serves it and API can fetch when data/ is not in serverless bundle. */
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "data", "ead-country-icaos.json");
const dest = join(root, "public", "ead-country-icaos.json");

if (!existsSync(src)) {
  console.warn("copy-ead-icaos-to-public: source not found, skipping:", src);
  process.exit(0);
}
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log("copy-ead-icaos-to-public: copied to", dest);
