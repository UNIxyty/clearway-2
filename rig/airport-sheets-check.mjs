// The airport sheets' field rule, checked against the real incident (2026-10-09: a merged file copied over
// airports.json replaced EYVI's hand-entered values). No browser; reads git and the repo only.
//   node rig/airport-sheets-check.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { mergeExtracted, humanChanges, HUMAN_FIELDS } from "../scripts/airport-sheets-fields.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let failures = 0;
const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 300)}` : ""}`); if (!c) failures += 1; };
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" });

// The hand-made EYVI (committed 2026-09-17) and what overwrote it, as the incident's evidence. The overwriting entry
// is rebuilt here from the committed one with exactly the 2026-10-09 differences, so the check needs no untracked file.
const handMade = JSON.parse(git("show", "HEAD:scripts/airport-sheets/airports.json")).find((a) => a.icao === "EYVI");
const overwrite = structuredClone(handMade);
delete overwrite.iata; delete overwrite.paxFacilities;
for (const k of ["tel", "sita", "aftn"]) delete overwrite.contacts[k];
for (const k of ["paxHandling", "rampAccess", "timeZone"]) delete overwrite.info[k];
Object.assign(overwrite, { airportName: "VILNIUS/INTERNATIONAL" });
Object.assign(overwrite.info, { slotPpr: "required", customs: "available (H24)", distanceToCity: "171°, 5.9 KM from Vilnius" });

// ── copying the file over (what happened) is caught ──
const lost = humanChanges([handMade], [overwrite]);
ok(lost.length === 9 && lost.some((c) => c.field === "info.slotPpr" && c.is === "required"), "the 2026-10-09 overwrite is caught: 8 hand-entered values lost and slot/PPR changed", lost.map((c) => c.field).join(", "));

// ── merging the same data (what should have happened) keeps every hand-entered value ──
const { airports, written, ignored } = mergeExtracted([handMade], [overwrite]);
const merged = airports[0];
ok(humanChanges([handMade], [merged]).length === 0, "merging the same extracted data keeps every hand-entered value");
ok(merged.info.slotPpr === "not required" && ignored.includes("EYVI info.slotPpr"), "slot/PPR stays \"not required\"; the extracted \"required\" is reported and not written", ignored.join(", "));
ok(written.includes("EYVI airportName") && merged.info.customs === "available (H24)", "extracted fields are updated (name, customs, distance)", written.join(", "));
ok(mergeExtracted([], [{ icao: "XXXX", iata: "XXX", info: { runway: "1000 m", timeZone: "UTC" } }]).airports[0].iata === undefined, "a new airport gets its extracted fields only");
ok(HUMAN_FIELDS.length === 9, "the nine human fields: slot/PPR, time zone, pax handling, ramp access, pax facilities, IATA, tel, SITA, AFTN", HUMAN_FIELDS.join(", "));

// ── the data the sheets are made from has no uncommitted change to a hand-entered value ──
const dir = path.join(ROOT, "scripts/airport-sheets/airports");
const now = fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, `${d}.json`))).map((d) => JSON.parse(fs.readFileSync(path.join(dir, d, `${d}.json`), "utf8")));
const base = git("ls-tree", "-r", "--name-only", "HEAD", "--", "scripts/airport-sheets/airports").split("\n").filter((f) => f.endsWith(".json")).map((f) => JSON.parse(git("show", `HEAD:${f}`)));
const diff = humanChanges(base, now);
ok(diff.length === 0, `the per-airport data (${now.length} airports, what the generator reads) has no uncommitted change to a hand-entered value`, diff.slice(0, 5).map((c) => `${c.icao} ${c.field}`).join(", "));
const flat = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/airport-sheets/airports.json"), "utf8"));
const flatDiff = humanChanges([handMade], flat);
ok(flatDiff.length === 0, "airports.json: EYVI has its hand-entered values (restored 2026-10-13)", flatDiff.map((c) => c.field).join(", "));

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
