#!/usr/bin/env node
/**
 * Builds data/ead-icaos-by-type-and-country.md: all EAD ICAOs grouped by country and AD type.
 * Run: node scripts/build-icaos-by-type-and-country.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const docPath = join(root, "data", "ead-document-names-by-country.json");
const outPath = join(root, "data", "ead-icaos-by-type-and-country.md");
const countryListPath = join(root, "data", "ead-countries-with-prefixes.json");

// Match _AD_N_XXXX where N is 2-9, XXXX is 4-char ICAO, then _ or - or .
const ICAO_RE = /_AD_([2-9])_([A-Z0-9]{4})(?:_|-|\.)/gi;

const TYPE_LABELS = {
  2: "AD 2 – Aerodromes",
  3: "AD 3 – Heliports",
  4: "AD 4 – Local aerodromes / Other",
  5: "AD 5",
  6: "AD 6",
  7: "AD 7",
  8: "AD 8",
  9: "AD 9",
};

function extractIcaosByType(docName) {
  const pairs = [];
  let m;
  ICAO_RE.lastIndex = 0;
  while ((m = ICAO_RE.exec(docName)) !== null) {
    pairs.push([m[1], m[2].toUpperCase()]);
  }
  return pairs;
}

const data = JSON.parse(readFileSync(docPath, "utf8"));
const docCountries = data.countries || {};

let countryLabels = Object.keys(docCountries);
if (existsSync(countryListPath)) {
  try {
    const list = JSON.parse(readFileSync(countryListPath, "utf8"));
    if (Array.isArray(list) && list.length > 0) countryLabels = list;
  } catch (_) {}
}

// Build: country -> type -> Set(icao)
const byCountry = {};
for (const country of countryLabels) {
  byCountry[country] = {};
}
for (const [country, docNames] of Object.entries(docCountries)) {
  if (!Array.isArray(docNames)) continue;
  if (!byCountry[country]) byCountry[country] = {};
  for (const name of docNames) {
    for (const [typeNum, icao] of extractIcaosByType(name)) {
      if (!byCountry[country][typeNum]) byCountry[country][typeNum] = new Set();
      byCountry[country][typeNum].add(icao);
    }
  }
}

const lines = [];
lines.push("# EAD ICAO Codes by Type and Country");
lines.push("");
lines.push("All ICAOs extracted from EAD document names, grouped by country and AD section type.");
lines.push("");
lines.push("---");
lines.push("");

const sortIcao = (a, b) => a.localeCompare(b);

for (const country of countryLabels) {
  const types = byCountry[country];
  const typeNums = Object.keys(types).filter((t) => types[t].size > 0).sort();
  if (typeNums.length === 0) {
    lines.push(`## ${country}`);
    lines.push("");
    lines.push("*(No ICAOs)*");
    lines.push("");
    continue;
  }

  lines.push(`## ${country}`);
  lines.push("");

  for (const t of typeNums) {
    const icaos = [...types[t]].sort(sortIcao);
    const label = TYPE_LABELS[t] || `AD ${t}`;
    const n = icaos.length;
    lines.push(`### ${label}`);
    lines.push(`**${n} airport${n !== 1 ? "s" : ""}**`);
    lines.push("");
    lines.push("```");
    lines.push(icaos.join(", "));
    lines.push("```");
    lines.push("");
  }
}

lines.push("---");
lines.push("");
lines.push("## Summary by type");
lines.push("");
lines.push("| Type | Description | Total ICAOs |");
lines.push("|------|--------------|-------------|");
const typeTotals = {};
for (const country of countryLabels) {
  for (const [t, set] of Object.entries(byCountry[country] || {})) {
    typeTotals[t] = (typeTotals[t] || 0) + set.size;
  }
}
const allIcaos = new Set();
for (const country of countryLabels) {
  for (const set of Object.values(byCountry[country] || {})) {
    for (const icao of set) allIcaos.add(icao);
  }
}
for (const t of Object.keys(typeTotals).sort()) {
  const label = TYPE_LABELS[t] || `AD ${t}`;
  lines.push(`| AD ${t} | ${label.split("–")[1]?.trim() || ""} | ${typeTotals[t]} |`);
}
lines.push(`| **All** | *(unique)* | **${allIcaos.size}** |`);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, lines.join("\n"), "utf8");
console.log("Wrote", outPath);
console.log("  Countries:", countryLabels.length);
console.log("  Unique ICAOs:", allIcaos.size);
