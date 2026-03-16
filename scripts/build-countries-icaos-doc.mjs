#!/usr/bin/env node
/**
 * Creates data/countries-and-icaos.md: all countries with their ICAOs, divided by EAD and non-EAD.
 * EAD section uses ead-icaos-summary.md as primary source (portal data; this script never overwrites it).
 * Run: node scripts/build-countries-icaos-doc.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const eadSummaryPath = path.join(root, "data", "ead-icaos-summary.md");
const eadJsonPath = path.join(root, "data", "ead-icaos-from-document-names.json");
const aipPath = path.join(root, "data", "aip-data.json");
const usaPath = path.join(root, "data", "usa-aip-icaos-by-state.json");
const outPath = path.join(root, "data", "countries-and-icaos.md");

// Load EAD: use ead-icaos-summary.md as primary (portal source, never overwrite), merge with JSON for structure
function parseEadSummary(content) {
  const countries = {};
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^###\s+(.+?)\s+\((\d+)\s+ICAOs?\)\s*$/);
    if (m) {
      const label = m[1].trim();
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const icaoLine = lines[j]?.trim();
      const icaos = icaoLine
        ? icaoLine.split(/,/).map((s) => s.trim().toUpperCase()).filter(Boolean)
        : [];
      countries[label] = [...new Set(icaos)];
    }
  }
  return countries;
}

let eadCountries = {};
if (fs.existsSync(eadSummaryPath)) {
  const summary = fs.readFileSync(eadSummaryPath, "utf8");
  eadCountries = parseEadSummary(summary);
}
const eadJson = fs.existsSync(eadJsonPath)
  ? JSON.parse(fs.readFileSync(eadJsonPath, "utf8"))
  : { countries: {} };
// Merge: summary is authoritative for ICAOs; add any country keys from JSON not in summary (with their ICAOs)
for (const [label, icaos] of Object.entries(eadJson.countries || {})) {
  if (!eadCountries[label] || eadCountries[label].length === 0) {
    const list = (icaos || []).map((i) => String(i).toUpperCase()).filter(Boolean);
    eadCountries[label] = [...new Set(list)];
  }
}

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
lines.push("Data from ead-icaos-summary.md (primary; portal source—never overwritten) and ead-icaos-from-document-names.json. These countries use the EAD sync workflow.");
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
