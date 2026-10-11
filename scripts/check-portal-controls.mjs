// Portal redesign, stage 2: no native browser control anywhere in the portal — no <select>, no checkbox, no radio,
// no date/time picker. They are drawn by components/kit (Select, MultiSelect, Checkbox, RadioGroup, Toggle,
// Segmented, DateInput), which look like the design in both themes and keep full keyboard support.
//
//   node scripts/check-portal-controls.mjs     exit 1 on any finding, with file:line
import fs from "node:fs";
import path from "node:path";

const EXCUSED = {};
const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); } else if (/\.(tsx|jsx)$/.test(f.name)) files.push(p); } };
["app", "components"].forEach(walk);

const RULES = [
  ["native <select>", /<select\b/g],
  ["native <option>", /<option\b/g],
  ["native checkbox/radio/date input", /\btype=\{?\s*["'`](checkbox|radio|date|time|datetime-local|month|week)["'`]\s*\}?/g],
];
const findings = [];
for (const f of files) {
  if (EXCUSED[f]) continue;
  fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, "").replace(/\s\/\/\s.*$/, "").replace(/\{\/\*.*?\*\/\}/g, "");
    for (const [what, re] of RULES) for (const m of code.matchAll(re)) findings.push(`${f}:${i + 1}  ${what}: ${m[0]}`);
  });
}
for (const x of findings) console.log(`FAIL  ${x}`);
console.log(`${files.length} portal files scanned · ${Object.keys(EXCUSED).length} excused (${Object.entries(EXCUSED).map(([f, why]) => `${f}: ${why}`).join("; ")}) · ${findings.length} native control${findings.length === 1 ? "" : "s"}`);
process.exit(findings.length ? 1 : 0);
