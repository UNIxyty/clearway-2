#!/usr/bin/env node
// Load the pre-classified IMPORTANT.docx entries (seeds/important-seed.json)
// into the Important store (data/important.json).
//
//   node scripts/import-important-seed.mjs [path/to/seed.json]
//
// Idempotent: entries merge by id, so re-running after a seed update is safe.
// The provided reviewed flags are preserved (false = surfaced under the
// Important page's "needs review" filter). Body text is kept verbatim.
//
// Notes on semantics (decisions, also in IMPLEMENTATION-NOTES.md):
// - countries[] are ISO 3166-1 alpha-2; matching resolves a flight's country
//   from its ICAO prefix (lib/icao-country.mjs), so it works for airports the
//   local directory doesn't know (e.g. EGLL).
// - direction "overfly" entries are imported but match no flights (the wall
//   has no route data) — they stay visible on the Important page.
// - Date windows stay ABSOLUTE (seed uses 2026 dates). Seasonal entries like
//   IMP-001 (LFTZ, Jul 1 – Oct 15) need an annual bump; no year-agnostic
//   recurrence is applied, to keep window semantics predictable.
// - Date-only validTo values are widened to end-of-day so a window's last
//   day still matches.

import fs from "node:fs/promises";
import path from "node:path";
import { JsonFileStore } from "../lib/json-store.mjs";
import { sanitizeImportantEntry } from "../lib/important-store.mjs";

const seedPath = path.resolve(process.argv[2] || path.join("seeds", "important-seed.json"));

const raw = JSON.parse(await fs.readFile(seedPath, "utf-8"));
const seedEntries = Array.isArray(raw.entries) ? raw.entries : [];
if (seedEntries.length === 0) {
  console.error(`No entries[] found in ${seedPath}`);
  process.exit(1);
}

function endOfDayIfDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? `${value}T23:59:59Z` : value;
}

const store = new JsonFileStore("important.json", { entries: [] });
const payload = await store.read();
const byId = new Map((Array.isArray(payload.entries) ? payload.entries : []).map((e) => [e.id, e]));

let added = 0;
let updated = 0;
for (const entry of seedEntries) {
  const existing = byId.get(entry.id) ?? null;
  const sanitized = sanitizeImportantEntry(
    {
      ...entry,
      source: entry.source || "important.docx",
      match: { ...entry.match, validTo: endOfDayIfDateOnly(entry.match?.validTo) },
    },
    existing
  );
  sanitized.reviewed = entry.reviewed === true;
  if (existing) updated += 1;
  else added += 1;
  byId.set(sanitized.id, sanitized);
}

const entries = [...byId.values()];
await store.write({ entries, updatedAt: new Date().toISOString() });

const active = entries.filter((e) => e.isActive !== false);
const needsReview = entries.filter((e) => !e.reviewed);
const overfly = entries.filter((e) => e.match?.direction === "overfly");
console.log(`Imported ${seedEntries.length} seed entries -> data/important.json (${added} added, ${updated} updated)`);
console.log(`  total in store: ${entries.length}`);
console.log(`  active:         ${active.length}`);
console.log(`  needs review:   ${needsReview.length}  (${needsReview.map((e) => e.id).join(", ")})`);
console.log(`  overfly-scoped: ${overfly.length}  (match no flights until route data exists: ${overfly.map((e) => e.id).join(", ")})`);
console.log(`  inactive/dated: ${entries.length - active.length}`);
console.log("Restart the digital-wall backend to pick the entries up (it loads the store at boot).");
