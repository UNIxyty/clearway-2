/**
 * Converts blank_airports_template_filled.json to portal aip-data.json format
 * (same structure as file (2).json). GEN sections get "No info." when missing.
 * Run: node scripts/build-aip-from-template.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const templatePath = path.join(projectRoot, "blank_airports_template_filled.json");
const outPath = path.join(projectRoot, "data", "aip-data.json");

const raw = fs.readFileSync(templatePath, "utf8");
const template = JSON.parse(raw);

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

const byCountry = new Map();
for (const a of template) {
  const c = a.country ?? "Unknown";
  if (!byCountry.has(c)) byCountry.set(c, []);
  byCountry.get(c).push(a);
}

const aipData = [];
for (const [country, airports] of byCountry.entries()) {
  aipData.push({
    country,
    GEN_1_2: "No info.",
    GEN_1_2_POINT_4: "No info.",
    airports: airports.map((a, i) => mapAirport(a, i + 2)),
  });
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(aipData, null, 2), "utf8");
console.log("Wrote", outPath, "—", aipData.length, "countries,", template.length, "airports total.");
