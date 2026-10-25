// data/airac-dates.json agrees with lib/airac.ts on every cycle, and reaches at least six months ahead (AIP refresh
// plan, step 1). Both derive the same 28-day arithmetic from 22 Jan 2026 — the point is that the table a worker reads
// from disk and the code a page uses never drift, and that nobody notices the table ran out by the refresh not running.
//   node rig/airac-dates-check.mjs
import fs from "node:fs";
const { airacCycleLabel, airacForDate } = await import("../lib/airac.ts").catch(async () => {
  // lib/airac.ts is TypeScript; the plain-ESM twin in lib/aip-revision-meta.mjs carries the same maths.
  const m = await import("../lib/aip-revision-meta.mjs"); return { airacCycleLabel: null, airacForDate: m.airacForDate };
});
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${d}` : ""}`); if (!c) failures += 1; };
const table = JSON.parse(fs.readFileSync("data/airac-dates.json", "utf8"));
ok(Array.isArray(table.cycles) && table.cycles.length > 0 && typeof table.source === "string" && table.source.length > 20, "the table has cycles and names its source", `${table.cycles?.length} cycles`);
let drift = 0;
for (const c of table.cycles) { const code = airacForDate(c.effective); if (code !== c.airac) { drift += 1; if (drift <= 3) console.log(`   ${c.effective}: table says ${c.airac}, lib says ${code}`); } }
ok(drift === 0, "every date in the table is a cycle date lib/airac maths agrees with, under the same label", `${drift} differ`);
let gaps = 0; for (let i = 1; i < table.cycles.length; i++) { const a = Date.parse(table.cycles[i - 1].effective), b = Date.parse(table.cycles[i].effective); if (b - a !== 28 * 86400e3) gaps += 1; }
ok(gaps === 0, "consecutive cycles are exactly 28 days apart", `${gaps} gaps`);
const last = Date.parse(table.cycles[table.cycles.length - 1].effective);
ok(last - Date.now() > 182 * 86400e3, "the table reaches at least six months ahead", `last ${table.cycles[table.cycles.length - 1].effective}`);
const today = new Date().toISOString().slice(0, 10);
const current = [...table.cycles].reverse().find((c) => c.effective <= today);
ok(Boolean(current), "a cycle is in force today", `${current?.airac} since ${current?.effective}`);
console.log(failures ? `${failures} FAILED` : "ALL PASSED"); process.exit(failures ? 1 : 0);
