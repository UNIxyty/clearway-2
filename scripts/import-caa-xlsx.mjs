// One-shot CAA import (Item 4): CAA_NEW.xlsx ("Permissions - Air
// Navigation") -> digital-wall/data/caa.json in the CaaStore shape.
//
//   node scripts/import-caa-xlsx.mjs [path/to/CAA_NEW.xlsx] [--out file.json]
//
// Column mapping (verbatim, human-maintained — no cleaning):
//   Country -> country (display label, may carry qualifiers like "China LND")
//   Authority Name / Validity / Function / INFO / Contact / Phone Number /
//   Mail / SITA / AFTN / VFR Flight Plan Adresses -> the entry's fields.
// Defaults: match type COUNTRY (match.countries resolved against the geo
// directory so "BELGIUM " / "China OVF" still match flights), appliesTo
// "any" (there is NO commercial/private column in the sheet — the flag is
// new and set per-entry in the app).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";
import { sanitizeCaaEntry } from "../digital-wall/lib/caa-store.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const outPath = outFlag >= 0 ? path.resolve(args[outFlag + 1]) : path.resolve(repoRoot, "digital-wall", "data", "caa.json");
const inPath = args.find((a, i) => !a.startsWith("--") && (outFlag < 0 || i !== outFlag + 1))
  ?? path.resolve(repoRoot, "CAA_NEW.xlsx");

if (!fs.existsSync(inPath)) {
  console.error(`Input not found: ${inPath}`);
  process.exit(1);
}

// Known country names for match resolution — geo snapshot if present, else
// a built-in exact/prefix pass against the raw label.
function loadKnownCountries() {
  for (const candidate of [
    path.resolve(repoRoot, "digital-wall", "data", "geo-airports.json"),
    path.resolve(process.cwd(), "data", "geo-airports.json"),
  ]) {
    try {
      const payload = JSON.parse(fs.readFileSync(candidate, "utf-8"));
      const names = [...new Set((payload.airports || []).map((a) => String(a.country || "").trim()).filter(Boolean))];
      if (names.length > 0) return names;
    } catch { /* try next */ }
  }
  return [];
}

/** "China LND" -> "China", "BELGIUM " -> "Belgium" (against the geo list). */
function resolveMatchCountry(rawLabel, knownCountries) {
  const raw = String(rawLabel || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const exact = knownCountries.find((c) => c.toLowerCase() === lower);
  if (exact) return exact;
  const prefix = knownCountries
    .filter((c) => lower.startsWith(c.toLowerCase()))
    .sort((a, b) => b.length - a.length)[0];
  if (prefix) return prefix;
  return raw; // keep the label — name-based matching is case-insensitive
}

const workbook = xlsx.readFile(inPath);
const sheetName = workbook.SheetNames.includes("Permissions - Air Navigation")
  ? "Permissions - Air Navigation"
  : workbook.SheetNames[0];
const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null });
const knownCountries = loadKnownCountries();

const text = (v) => String(v ?? "").trim();
const entries = [];
let skippedEmpty = 0;
let unresolvedCountries = 0;

for (const row of rows.slice(1)) {
  const [country, authorityName, validity, func, info, contact, phone, mail, sita, aftn, vfr] = row;
  if (!text(country) && !text(authorityName)) {
    skippedEmpty += 1;
    continue;
  }
  const matchCountry = resolveMatchCountry(country, knownCountries);
  if (matchCountry === text(country) && knownCountries.length > 0 && !knownCountries.some((c) => c.toLowerCase() === matchCountry.toLowerCase())) {
    unresolvedCountries += 1;
    console.warn(`  ! country label not in geo directory (kept as-is): "${text(country)}"`);
  }
  entries.push(
    sanitizeCaaEntry({
      country: text(country),
      authorityName: text(authorityName),
      validity: text(validity),
      functionText: text(func),
      info: text(info),
      contact: text(contact),
      phones: text(phone),
      mail: text(mail),
      sita: text(sita),
      aftn: text(aftn),
      vfrAddresses: text(vfr),
      match: { countries: matchCountry ? [matchCountry] : [], airportIcaos: [] },
      appliesTo: "any",
      source: "xlsx-import",
    })
  );
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ entries, updatedAt: new Date().toISOString() }, null, 1), "utf-8");
console.log(`Imported ${entries.length} CAA entr${entries.length === 1 ? "y" : "ies"} from "${sheetName}" (${path.basename(inPath)})`);
console.log(`  skipped ${skippedEmpty} empty row(s); ${unresolvedCountries} country label(s) not resolved against the geo directory`);
console.log(`  -> ${outPath}`);
const kinds = {};
for (const e of entries) kinds[e.functionKind] = (kinds[e.functionKind] ?? 0) + 1;
console.log(`  function kinds: ${JSON.stringify(kinds)}`);
