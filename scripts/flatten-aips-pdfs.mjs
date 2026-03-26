#!/usr/bin/env node
/**
 * Copies every PDF from aips/<country>/* into aips/all-pdfs/ (flat).
 * Run: node scripts/flatten-aips-pdfs.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const aipsRoot = path.join(projectRoot, "aips");
const outDir = path.join(aipsRoot, "all-pdfs");

const SKIP_DIRS = new Set(["all-pdfs"]);

fs.mkdirSync(outDir, { recursive: true });

let n = 0;

for (const ent of fs.readdirSync(aipsRoot, { withFileTypes: true })) {
  if (!ent.isDirectory() || SKIP_DIRS.has(ent.name)) continue;
  const sub = path.join(aipsRoot, ent.name);
  for (const name of fs.readdirSync(sub)) {
    if (!name.toLowerCase().endsWith(".pdf")) continue;
    fs.copyFileSync(path.join(sub, name), path.join(outDir, name));
    n++;
  }
}

console.log(`aips/all-pdfs: wrote ${n} PDF(s)`);
