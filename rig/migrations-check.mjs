// The rig's schema comes from the repository, not from a laptop (2026-11-07). The server rig box, built from the
// repository alone, lacked two schema files the Mac rig had been given by hand (0028, the email confirmations); the
// Mac rig passed every day because it had them. This fails when:
//   · a schema file (docs/supabase-*.sql, migrations/00NN_*.sql) is not in rig/supabase/sources.json
//   · its rig migration is missing, or a copy marked the same has drifted from its source
//   · a "not on the rig" entry gives no reason, or names a file that no longer exists
// Pure file check, no database.   node rig/migrations-check.mjs
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d !== "" ? `  · ${d}` : ""}`); if (!c) failures += 1; };
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, "rig/supabase/sources.json"), "utf8"));
const MIG = path.join(ROOT, "rig/supabase/migrations");
const schemaFiles = [
  ...fs.readdirSync(path.join(ROOT, "docs")).filter((f) => /^supabase-.*\.sql$/.test(f)).map((f) => `docs/${f}`),
  // numbered portal migrations, and the help centre's; the dated 2026MMDD_* files are the Pick'em game's (Dmitry's other project)
  ...fs.readdirSync(path.join(ROOT, "migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f) || f === "20260917_create_help_centre.sql").map((f) => `migrations/${f}`),
];
const unlisted = schemaFiles.filter((f) => !sources[f]);
ok(unlisted.length === 0, "every schema file says where the rig gets it (rig/supabase/sources.json)", unlisted.join(", ") || `${schemaFiles.length} files`);
for (const [src, v] of Object.entries(sources)) {
  if (src.startsWith("$")) continue;
  if (!fs.existsSync(path.join(ROOT, src))) { ok(false, `${src}: listed, but the file is gone`); continue; }
  if (v.not) { ok(String(v.not).trim().length > 8, `${src}: not on the rig, and why`, v.not); continue; }
  const rig = path.join(MIG, String(v.rig ?? ""));
  if (!v.rig || !fs.existsSync(rig)) { ok(false, `${src}: its rig migration exists`, v.rig ?? "none named"); continue; }
  if (v.same === false) ok(true, `${src}: rig/supabase/migrations/${v.rig} (adapted)`);
  else ok(fs.readFileSync(rig, "utf8") === fs.readFileSync(path.join(ROOT, src), "utf8"), `${src}: rig/supabase/migrations/${v.rig} is an exact copy`, "copy it again: cp " + src + " rig/supabase/migrations/" + v.rig);
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
