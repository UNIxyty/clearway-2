/**
 * Merges file (2).json (portal format, rich GEN) with blank_airports_template_filled.json.
 * Countries in file (2) are kept as-is; countries only in template are appended (GEN "No info.").
 * Run: node scripts/merge-aip-sources.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const file2Path = path.join(projectRoot, "file (2).json");
const templatePath = path.join(projectRoot, "blank_airports_template_filled.json");
const outPath = path.join(projectRoot, "data", "aip-data.json");

const file2 = JSON.parse(fs.readFileSync(file2Path, "utf8"));
const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));

const file2CountrySet = new Set(file2.map((c) => (c.country === "Bénin" ? "Benin" : c.country)));

function mapAirport(a, rowNumber) {
  return {
    row_number: rowNumber,
    "Airport Code": a.ICAO ?? "",
    "Airport Name": a.Name ?? "",
    "AD2.2 Types of Traffic Permitted": a.Types_of_traffic_permitted ?? "",
    "AD2.2 Remarks": a.Remarks_AD2_2 ?? "",
    "AD2.3 AD Operator": a.Operating_Hours ?? "No info.",
    "AD 2.3 Customs and Immigration": a.Customs_and_immigration ?? "",
    "AD2.3 ATS": a.ATS ?? "",
    "AD2.3 Remarks": a.Remarks_AD2_3 ?? "",
    "AD2.6 AD category for fire fighting": a.AD_Category_for_fire_fighting ?? "",
  };
}

const templateByCountry = new Map();
for (const a of template) {
  const c = a.country ?? "Unknown";
  if (!templateByCountry.has(c)) templateByCountry.set(c, []);
  templateByCountry.get(c).push(a);
}

// Start with file (2), normalize Bénin -> Benin
const merged = file2.map((c) => ({
  ...c,
  country: c.country === "Bénin" ? "Benin" : c.country,
}));

// Append countries only in template
for (const [country, airports] of templateByCountry.entries()) {
  if (file2CountrySet.has(country)) continue;
  merged.push({
    country,
    GEN_1_2: "No info.",
    GEN_1_2_POINT_4: "No info.",
    airports: airports.map((a, i) => mapAirport(a, i + 2)),
  });
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(merged, null, 2), "utf8");
const totalAirports = merged.reduce((n, c) => n + (c.airports?.length || 0), 0);
console.log("Wrote", outPath, "—", merged.length, "countries,", totalAirports, "airports.");
