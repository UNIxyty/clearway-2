#!/usr/bin/env node
// Backfill revision sidecars for AIP PDFs already in the shared storage.
//
// For every `aip/<ns>/<NAME>.pdf` without a `<NAME>.meta.json`:
//   1. look for a dated source copy with IDENTICAL bytes (sha256) in the local
//      download folders (data/ead-aip, data/ead-gen, downloads/*/AD2, downloads/*/GEN*) —
//      its filename carries the source's effective date → revisionSource "filename";
//   2. otherwise write a sidecar that says the date is unknown (fetchedAt = the
//      file's mtime, which is real) → revisionSource "none".
// Nothing is guessed: a copy whose source date we do not hold is UNKNOWN.
//
// Usage (inside the aip-sync container, which has the repo and /storage):
//   node scripts/tools/backfill-aip-revisions.mjs [--dry-run]
// Prints how many copies landed in each state.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { STORAGE_ROOT, saveFile } from "../../lib/storage.mjs";
import { buildRevisionMeta, metaKeyFor, sha256Of, effectiveDateFromFilename } from "../../lib/aip-revision-meta.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(HERE, "..", "..");
const DRY = process.argv.includes("--dry-run");
const NAMESPACES = { "ead-pdf": "ead", "scraper-pdf": "scraper", "usa-pdf": "usa", "asecna-pdf": "asecna", "gen-pdf": "gen", "non-ead-gen-pdf": "gen", "scraper-gen-pdf": "scraper-gen" };

// Index every dated local download by sha256.
function* walkPdfs(dir, depth = 0) {
  if (!existsSync(dir) || depth > 3) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) yield* walkPdfs(p, depth + 1);
    else if (/\.pdf$/i.test(name)) yield p;
  }
}
const localIndex = new Map();
for (const dir of [join(PROJECT_ROOT, "data", "ead-aip"), join(PROJECT_ROOT, "data", "ead-gen"), join(PROJECT_ROOT, "downloads")]) {
  for (const p of walkPdfs(dir)) {
    const date = effectiveDateFromFilename(basename(p));
    if (!date) continue;
    try { localIndex.set(sha256Of(readFileSync(p)), { path: p, date }); } catch { /* unreadable */ }
  }
}
console.log(`dated local downloads indexed: ${localIndex.size}`);

// Same state rules as lib/airac.ts, inlined so the script has no TS dependency.
const AIRAC_EPOCH_UTC = Date.UTC(2026, 0, 22), CYCLE_MS = 28 * 86400 * 1000;
const inForceFrom = new Date(AIRAC_EPOCH_UTC + Math.floor((Date.now() - AIRAC_EPOCH_UTC) / CYCLE_MS) * CYCLE_MS).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);
function stateOf(meta) {
  if (!meta.effectiveDate) return "unknown";
  if (meta.effectiveDate > today) return "future";
  if ((meta.fetchedAt ?? "").slice(0, 10) < inForceFrom) return "unknown";
  return "current";
}

const counts = { current: 0, future: 0, superseded: 0, unknown: 0 }, bySource = { filename: 0, none: 0 };
let existing = 0, written = 0;
for (const [ns, source] of Object.entries(NAMESPACES)) {
  const dir = join(STORAGE_ROOT, "aip", ns);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir).filter((f) => /\.pdf$/i.test(f))) {
    const key = `aip/${ns}/${name}`;
    if (existsSync(join(STORAGE_ROOT, metaKeyFor(key)))) { existing += 1; continue; }
    const path = join(dir, name);
    const body = readFileSync(path);
    const st = statSync(path);
    const match = localIndex.get(sha256Of(body));
    const icao = /^([A-Z0-9]{4})\.pdf$/i.exec(name)?.[1] ?? /^([A-Z0-9]{4})-GEN/i.exec(name)?.[1] ?? null;
    const meta = buildRevisionMeta({
      icao, source, body,
      sourceFilename: match ? basename(match.path) : null,
      sidecar: match ? { effectiveDate: match.date } : null,
      fetchedAt: st.mtime.toISOString(),
    });
    const state = stateOf(meta);
    counts[state] += 1; bySource[meta.revisionSource === "none" ? "none" : "filename"] += 1;
    if (!DRY) { await saveFile(metaKeyFor(key), JSON.stringify(meta, null, 2)); written += 1; }
    console.log(`${DRY ? "would write" : "wrote"} ${metaKeyFor(key)} → ${state}${meta.effectiveDate ? ` (${meta.effectiveDate})` : ""} [${meta.revisionSource}]`);
  }
}
console.log(JSON.stringify({ existingSidecars: existing, written, states: counts, revisionSource: bySource, inForceFrom, dryRun: DRY }, null, 2));
