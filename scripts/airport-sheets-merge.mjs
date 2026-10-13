// Bring data extracted from the AIP into the airport sheets — the only sanctioned way to update them in bulk. It
// writes the EXTRACTED fields only; hand-entered fields are never touched (scripts/airport-sheets-fields.mjs).
//   node scripts/airport-sheets-merge.mjs extracted.json             # show what would change
//   node scripts/airport-sheets-merge.mjs extracted.json --write     # write it
//   --into scripts/airport-sheets/airports.json                      # the flat file instead of the per-airport folder
// `extracted.json` is an array of airport entries in the sheets' shape ({ icao, airportName, info: {…}, … }).
// Never copy a file over airports.json or the airports/ folder: that is how EYVI's hand-entered values were lost.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeExtracted } from "./airport-sheets-fields.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SHEETS = path.join(here, "airport-sheets");
const args = process.argv.slice(2);
const src = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--into");
const into = args.includes("--into") ? path.resolve(args[args.indexOf("--into") + 1]) : (fs.existsSync(path.join(SHEETS, "airports")) ? path.join(SHEETS, "airports") : path.join(SHEETS, "airports.json"));
if (!src) { console.error("usage: node scripts/airport-sheets-merge.mjs extracted.json [--write] [--into <airports dir or .json>]"); process.exit(2); }

function loadAirports(where) {
  if (fs.statSync(where).isDirectory()) {
    return fs.readdirSync(where).filter((d) => fs.existsSync(path.join(where, d, `${d}.json`))).sort()
      .map((d) => JSON.parse(fs.readFileSync(path.join(where, d, `${d}.json`), "utf8")));
  }
  return JSON.parse(fs.readFileSync(where, "utf8"));
}

const current = loadAirports(into);
const extracted = JSON.parse(fs.readFileSync(path.resolve(src), "utf8"));
const { airports, written, ignored, added } = mergeExtracted(current, Array.isArray(extracted) ? extracted : extracted.airports ?? []);

console.log(`into ${path.relative(process.cwd(), into)}: ${written.length} extracted values to write, ${added.length} new airports`);
for (const w of written) console.log(`  write   ${w}`);
for (const a of added) console.log(`  add     ${a} (extracted fields only; its hand-entered fields wait for a person)`);
if (ignored.length) {
  console.log(`  ${ignored.length} values in the extracted file are hand-entered fields and are NOT written:`);
  for (const i of ignored) console.log(`  ignore  ${i}`);
}
if (!args.includes("--write")) { console.log("\n(nothing written: add --write)"); process.exit(0); }

if (fs.statSync(into).isDirectory()) {
  const changed = new Set([...written.map((w) => w.split(" ")[0]), ...added]);
  for (const a of airports.filter((x) => changed.has(x.icao))) {
    fs.mkdirSync(path.join(into, a.icao), { recursive: true });
    fs.writeFileSync(path.join(into, a.icao, `${a.icao}.json`), JSON.stringify(a, null, 2) + "\n");
  }
} else fs.writeFileSync(into, JSON.stringify(airports, null, 2) + "\n");
console.log("written");
