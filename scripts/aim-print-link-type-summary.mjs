/**
 * Print linkType groups from an existing aim-links-probe-report.json (no network).
 *
 *   node scripts/aim-print-link-type-summary.mjs [report.json]
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = process.argv[2] || join(__dirname, "..", "test-results", "aim-links-probe-report.json");

const data = JSON.parse(readFileSync(path, "utf8"));
if (data.byLinkType && data.linkTypeLegend) {
  console.log(`Report: ${path}\n`);
  for (const [type, countries] of Object.entries(data.byLinkType)) {
    const leg = data.linkTypeLegend[type] || type;
    console.log(`## ${type}`);
    console.log(`${leg}\n`);
    for (const row of countries) {
      console.log(`- ${row.country}: ${row.url}`);
    }
    console.log("");
  }
} else {
  console.error("Report missing byLinkType — re-run: node scripts/aim-links-probe.mjs your-file.json");
  process.exit(1);
}
