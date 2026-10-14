// Every time the portal, the Ops Agent and the wall console show is UTC (lib/time.ts). This fails when source code
// formats a date in the reader's local zone:
//   · toLocaleString / toLocaleDateString / toLocaleTimeString on a date without an explicit `timeZone`
//   · the local getters (getHours, getMinutes, getSeconds, getDate, getDay, getMonth, getFullYear)
//   · toDateString / toTimeString, and Intl.DateTimeFormat without `timeZone`
// A line that needs local time on purpose says why with `local-time-ok: <reason>` (for example the dashboard's
// "Morning"/"Evening" greeting, which shows no time).
//   node rig/check-utc-times.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIRS = ["app", "components", "lib", "opsboard-react/src", "digital-wall", "agent"];
const EXT = /\.(tsx?|jsx?|mjs)$/;
const SKIP = /(\.test\.|\/__tests__\/|\.generated\.|node_modules)/;

function* files(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") yield* files(p); }
    else if (EXT.test(e.name) && !SKIP.test(p)) yield p;
  }
}

// The text of a call's arguments, from the "(" after `at` to its matching ")".
function argsAt(src, at) {
  let depth = 0;
  for (let i = at; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(at + 1, i);
  }
  return src.slice(at + 1, at + 400);
}

const DATE_OPTS = /\b(day|month|year|hour|minute|second|weekday|dateStyle|timeStyle)\s*:/;
const problems = [];
let checked = 0;
for (const dir of DIRS) {
  for (const file of files(path.join(ROOT, dir))) {
    checked++;
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    const lines = src.split("\n");
    const lineOf = (i) => src.slice(0, i).split("\n").length;
    const allowed = (n) => /local-time-ok:/.test(lines[n - 1] || "");
    const flag = (i, why) => { const n = lineOf(i); if (!allowed(n)) problems.push(`${rel}:${n}  ${why}  · ${lines[n - 1].trim().slice(0, 110)}`); };

    for (const m of src.matchAll(/\.(toLocaleString|toLocaleDateString|toLocaleTimeString)\s*\(/g)) {
      const args = argsAt(src, m.index + m[0].length - 1);
      const before = src.slice(Math.max(0, m.index - 60), m.index);
      const isDate = m[1] !== "toLocaleString" || DATE_OPTS.test(args) || /new Date\([^()]*(\([^()]*\))?[^()]*\)\s*$/.test(before) || /\b(date|Date|when|at|time|Time|iso|ts)\s*$/.test(before);
      if (isDate && !/\btimeZone\b/.test(args)) flag(m.index, `${m[1]} without timeZone`);
    }
    for (const m of src.matchAll(/\.(getHours|getMinutes|getSeconds|getDate|getDay|getMonth|getFullYear)\s*\(\s*\)/g)) flag(m.index, `local ${m[1]}()`);
    for (const m of src.matchAll(/\.(toDateString|toTimeString)\s*\(\s*\)/g)) flag(m.index, `${m[1]}() is local`);
    for (const m of src.matchAll(/Intl\.DateTimeFormat\s*\(/g)) {
      const args = argsAt(src, m.index + m[0].length - 1);
      if (!/\btimeZone\b/.test(args)) flag(m.index, "Intl.DateTimeFormat without timeZone");
    }
  }
}

if (problems.length) {
  for (const p of problems) console.log(`FAIL  ${p}`);
  console.log(`\n${problems.length} FAILED · ${checked} files checked. Use lib/time.ts (UTC, with a Z), or say why with local-time-ok:.`);
  process.exit(1);
}
console.log(`PASS  no time is formatted in the reader's local zone (${checked} files: ${DIRS.join(", ")})\n\nALL PASSED`);
