// One live check of the type 1 reference look-up against the real portal: ONE login, the flight list only, no
// record opened. Prints the list row for the reference (quote number, dates, aircraft, type code: no personal
// data). Credentials are read from .env (only the two CNAIR lines) and never printed.
//   node rig/cnair/resolve-check.mjs <reference>
import fs from "node:fs"; import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
for (const l of fs.readFileSync(path.join(root, ".env"), "utf8").split("\n")) { const m = /^(CNAIR_USER|CNAIR_PASSWORD)=(.*)$/.exec(l); if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ""); }
process.env.INTAKE_CNAIR_LOOKUP = "on"; delete process.env.CNAIR_PORTAL_BASE;
const { resolveReference, lookupState } = await import("../../agent/lib/intake/providers/cnair.mjs");
console.log("look-up:", JSON.stringify(lookupState()));
const t0 = Date.now(); const r = await resolveReference(process.argv[2] ?? "");
console.log(`${Math.round((Date.now() - t0) / 1000)} s →`, JSON.stringify(r));
