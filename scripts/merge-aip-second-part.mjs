#!/usr/bin/env node
/**
 * Merges data/AIP_SECOND_PART.json into data/aip-data.json.
 * AIP_SECOND_PART is a flat array of airport rows; GEN parts are skipped.
 * Run: node scripts/merge-aip-second-part.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const secondPartPath = path.join(projectRoot, "data", "AIP_SECOND_PART.json");
const aipPath = path.join(projectRoot, "data", "aip-data.json");
const regionsPath = path.join(projectRoot, "data", "regions.json");

const secondPart = JSON.parse(fs.readFileSync(secondPartPath, "utf8"));
const aipData = JSON.parse(fs.readFileSync(aipPath, "utf8"));
const regions = JSON.parse(fs.readFileSync(regionsPath, "utf8"));

/** Map new country -> region */
const COUNTRY_TO_REGION = {
  "Sri Lanka": "Asia",
  "France": "Europe",
  "Taiwan": "Asia",
  "Tajikistan": "Asia",
  "Thailand": "Asia",
  "Turkmenistan": "Asia",
  "United Arab Emirates": "Asia",
  "Hong Kong": "Asia",
  "Belarus": "Europe",
  "Costa Rica": "North America & Caribbean",
  "Kosovo": "Europe",
  "Saudi Arabia": "Asia",
};

function mapRowToAirport(row, rowIdx) {
  return {
    row_number: rowIdx + 2,
    "Airport Code": row["Airport Code"] ?? "",
    "Airport Name": row["Airport Name"] ?? "",
    "AD2.2 Types of Traffic Permitted": row["AD2.2 Types of Traffic Permitted"] ?? "",
    "AD2.2 Remarks": row["AD2.2 Remarks"] ?? "",
    "AD2.3 AD Operator": row["AD2.3 AD Operator/Administration"] ?? "",
    "AD 2.3 Customs and Immigration": row["AD 2.3 Customs and Immigration"] ?? "",
    "AD2.3 ATS": row["AD2.3 ATS"] ?? "",
    "AD2.3 Remarks": row["AD2.3 Remarks"] ?? "",
    "AD2.6 AD category for fire fighting": row["AD2.6 AD category for fire fighting"] ?? "",
  };
}

/** Normalize country names for display */
function normalizeCountry(name) {
  const n = (name ?? "").trim();
  if (n === "HONG KONG") return "Hong Kong";
  return n;
}

// Group AIP_SECOND_PART by country
const byCountry = new Map();
for (const row of secondPart) {
  const country = normalizeCountry(row["Country "]);
  if (!country) continue;
  if (!byCountry.has(country)) byCountry.set(country, []);
  byCountry.get(country).push(row);
}

const existingCountrySet = new Set(aipData.map((c) => c.country));
let rowCounter = aipData.reduce((n, c) => n + (c.airports?.length || 0), 0) + 2;

// Merge: add new countries, merge airports for overlapping countries
for (const [country, rows] of byCountry.entries()) {
  const airports = rows.map((r, i) => mapRowToAirport(r, rowCounter + i - 2));
  rowCounter += airports.length;

  if (existingCountrySet.has(country)) {
    // Country exists: merge airports by ICAO, prefer existing, add new from second part
    const existing = aipData.find((c) => c.country === country);
    const existingIcaos = new Set(
      (existing.airports || []).map((a) => (a["Airport Code"] ?? "").toUpperCase())
    );
    for (const ap of airports) {
      const icao = (ap["Airport Code"] ?? "").toUpperCase();
      if (!existingIcaos.has(icao)) {
        existing.airports = existing.airports ?? [];
        existing.airports.push(ap);
        existingIcaos.add(icao);
      }
    }
  } else {
    // New country: add with empty GEN (skip GEN parts)
    aipData.push({
      country,
      GEN_1_2: "",
      GEN_1_2_POINT_4: "",
      airports,
    });
    existingCountrySet.add(country);

    // Add to regions
    const region = COUNTRY_TO_REGION[country];
    if (region) {
      const regionEntry = regions.find((r) => r.region === region);
      if (regionEntry && !regionEntry.countries.includes(country)) {
        regionEntry.countries.push(country);
        regionEntry.countries.sort();
      }
    }
  }
}

fs.writeFileSync(aipPath, JSON.stringify(aipData, null, 2), "utf8");
fs.writeFileSync(regionsPath, JSON.stringify(regions, null, 2), "utf8");

const totalAirports = aipData.reduce((n, c) => n + (c.airports?.length || 0), 0);
console.log("merge-aip-second-part: wrote", aipPath);
console.log("  ", aipData.length, "countries,", totalAirports, "airports");
console.log("  Updated", regionsPath);
