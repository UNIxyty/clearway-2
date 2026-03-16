#!/usr/bin/env node
/**
 * Creates data/countries-and-icaos.md: all countries with their ICAOs, divided by EAD and non-EAD.
 * EAD data from ead-icaos-from-document-names.json. (ead-icaos-summary.md is just a readable view of that JSON.)
 * Run: node scripts/build-countries-icaos-doc.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const eadJsonPath = path.join(root, "data", "ead-icaos-from-document-names.json");
const aipPath = path.join(root, "data", "aip-data.json");
const usaPath = path.join(root, "data", "usa-aip-icaos-by-state.json");
const outPath = path.join(root, "data", "countries-and-icaos.md");

// Load EAD from JSON (portal uses same source via embed-ead-icaos.mjs)
const eadJson = fs.existsSync(eadJsonPath)
  ? JSON.parse(fs.readFileSync(eadJsonPath, "utf8"))
  : { countries: {} };
const eadCountries = eadJson.countries || {};

// EAD base names (e.g. "Austria" from "Austria (LO)") for exclusion from non-EAD
const eadBaseNames = new Set();
for (const label of Object.keys(eadCountries)) {
  const base = label.replace(/\s*\([A-Z0-9]+\)\s*$/, "").trim();
  if (base) eadBaseNames.add(base);
}

// Load AIP (non-EAD)
const aipData = JSON.parse(fs.readFileSync(aipPath, "utf8"));

// Load USA
let usaByState = {};
try {
  const usa = JSON.parse(fs.readFileSync(usaPath, "utf8"));
  usaByState = usa.by_state || {};
} catch (_) {}

// Build non-EAD: country -> ICAOs (exclude EAD base names)
const nonEad = new Map();
for (const c of aipData) {
  const country = c.country || "";
  if (eadBaseNames.has(country)) continue;
  const icaos = (c.airports || []).map((a) => (a["Airport Code"] || "").trim().toUpperCase()).filter(Boolean);
  if (country === "United States of America") {
    const usaList = [];
    for (const stateAirports of Object.values(usaByState)) {
      for (const a of stateAirports || []) {
        const icao = (a["Airport Code"] || "").trim().toUpperCase();
        if (icao) usaList.push(icao);
      }
    }
    nonEad.set(country, [...new Set(usaList)]);
  } else if (icaos.length) {
    const existing = nonEad.get(country) || [];
    nonEad.set(country, [...new Set([...existing, ...icaos])]);
  }
}

// Sort helpers
const sortCountry = (a, b) => a[0].localeCompare(b[0]);
const sortIcao = (a, b) => a.localeCompare(b);

// Build markdown
const lines = [];
lines.push("# Countries and ICAO Codes");
lines.push("");
lines.push("All countries in the Clearway portal with their airport ICAO codes, divided by data source.");
lines.push("");
lines.push("---");
lines.push("");
lines.push("## EAD Countries (European AIP - EU)")
lines.push("");
lines.push("Data from ead-icaos-from-document-names.json. These countries use the EAD sync workflow.");
lines.push("");

const eadEntries = Object.entries(eadCountries).sort(sortCountry);
let eadTotal = 0;
for (const [label, icaos] of eadEntries) {
  const list = (icaos || []).map((i) => String(i).toUpperCase()).filter(Boolean);
  eadTotal += list.length;
  const sorted = [...new Set(list)].sort(sortIcao);
  lines.push(`### ${label}`);
  const n = sorted.length;
  lines.push(`**${n} airport${n !== 1 ? "s" : ""}**`);
  lines.push("");
  if (sorted.length) {
    lines.push("```");
    lines.push(sorted.join(", "));
    lines.push("```");
  } else {
    lines.push("*(No ICAOs)*");
  }
  lines.push("");
}

lines.push("---");
lines.push("");
lines.push("## Non-EAD Countries");
lines.push("");
lines.push("Data from aip-data.json and usa-aip-icaos-by-state.json. Static AIP data.");
lines.push("");

const nonEadEntries = [...nonEad.entries()].sort(sortCountry);
let nonEadTotal = 0;
for (const [country, icaos] of nonEadEntries) {
  const sorted = [...new Set(icaos)].sort(sortIcao);
  nonEadTotal += sorted.length;
  lines.push(`### ${country}`);
  const n = sorted.length;
  lines.push(`**${n} airport${n !== 1 ? "s" : ""}**`);
  lines.push("");
  if (sorted.length) {
    lines.push("```");
    lines.push(sorted.join(", "));
    lines.push("```");
  } else {
    lines.push("*(No ICAOs)*");
  }
  lines.push("");
}

lines.push("---");
lines.push("");
lines.push("## Summary");
lines.push("");
lines.push(`| Source | Countries | Airports |`);
lines.push(`|--------|-----------|----------|`);
lines.push(`| EAD | ${eadEntries.length} | ${eadTotal} |`);
lines.push(`| Non-EAD | ${nonEadEntries.length} | ${nonEadTotal} |`);
lines.push(`| **Total** | **${eadEntries.length + nonEadEntries.length}** | **${eadTotal + nonEadTotal}** |`);

fs.writeFileSync(outPath, lines.join("\n"), "utf8");
console.log("Wrote", outPath);
console.log("  EAD:", eadEntries.length, "countries,", eadTotal, "airports");
console.log("  Non-EAD:", nonEadEntries.length, "countries,", nonEadTotal, "airports");
