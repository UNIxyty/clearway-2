#!/usr/bin/env node
// Passenger Manifest from a script — the same generator the agent command calls, without the chat.
//
//   node scripts/pax-manifest.mjs --blank --out blank.pdf
//   node scripts/pax-manifest.mjs --flight klj:74375326 --user <supabase user id> --out manifest.pdf
//        (reads Leon with THAT user's linked Leon account; on the server: docker compose exec agent-service …)
//   node scripts/pax-manifest.mjs --rig <state id> --out file.pdf     (rig/manifest/fixtures.mjs, stub Leon; repo only)
//
// Prints the result object (warnings by row number, missing fields, page count) as JSON. It never prints a passenger
// field — the PDF is the only place those exist.
import { writeFileSync } from "node:fs";
import { generatePassengerManifest, generateBlankManifest } from "../lib/manifest/index.mjs";
import { assertManifestFont } from "../lib/manifest/fonts.mjs";

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : null; };
const out = arg("out");
if (!out) { console.error("--out <file.pdf> is required"); process.exit(2); }
assertManifestFont();

let made;
if (process.argv.includes("--blank")) {
  made = await generateBlankManifest();
} else if (arg("rig")) {
  const { STATES, stubLeon } = await import("../../rig/manifest/fixtures.mjs");
  const state = STATES.find((s) => s.id === arg("rig"));
  if (!state) { console.error(`unknown rig state; one of: ${STATES.map((s) => s.id).join(", ")}`); process.exit(2); }
  made = state.blank ? await generateBlankManifest() : await generatePassengerManifest({ flightId: "rig:101", user: null, leon: stubLeon(state.flight()) });
} else if (arg("flight")) {
  if (!arg("user")) { console.error("--user <id> is required: the manifest reads Leon as that user, never as a service account"); process.exit(2); }
  made = await generatePassengerManifest({ flightId: arg("flight"), user: { userId: arg("user") } });
} else {
  console.error("give --blank, --flight <oprId:nid> --user <id>, or --rig <state>"); process.exit(2);
}
writeFileSync(out, made.pdf, { mode: 0o600 });
console.log(JSON.stringify({ filename: made.filename, ...made.result }, null, 1));
