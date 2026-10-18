// Wall console, Stage 1 (2026-10-18): the console is themed by the portal; the wall display is not. Two rules, one
// check, exit 1 on any finding:
//
//   1. CONSOLE files (opsboard-react/src/components/console/*, ConsoleApp.jsx, hooks/useAgentDock.jsx,
//      theme/portalTheme.js) carry no
//      hard-coded colour: no hex, no rgb()/rgba()/hsl() with literal numbers, no named colour as a value. Every colour
//      is a --cw-* / --ca-* / --mx-* token (the kit's `t`). A line that must hold a literal (a colour picker's own
//      gradients, a cursor ring that reads on any colour, identity colours) says why and ends in `// colour-data`;
//      the check prints those so they stay few. They may not import shared/design-tokens.json (the wall's file).
//   2. DISPLAY files (everything else under opsboard-react/src, including components/wall-preview/*) read no portal
//      token: no `--cw-`, `--ca-`, `--mx-`, no `data-theme` or `data-motion`, no portal-tokens / client-tokens / mobile-tokens import,
//      no import from components/console/ui. The wall keeps its own per-account colours and font.
//   3. Every data-wall-display root lives in components/wall-preview/ (nothing under it may be themed).
//
//   node scripts/check-console-theme.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "opsboard-react/src");
const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(jsx?|css)$/.test(f.name)) files.push(p); } };
walk(SRC);
const rel = (p) => path.relative(ROOT, p);
const isConsole = (p) => /opsboard-react\/src\/(components\/console\/|ConsoleApp\.jsx|hooks\/useAgentDock\.jsx|theme\/portalTheme\.js)/.test(p);

const NAMED = "white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|navy|teal|maroon|olive|lime|aqua|fuchsia|pink|gold";
const RULES = [
  ["hex colour", /(?<![\w&/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|(?=[0-9a-fA-F]{0,2}[a-fA-F])[0-9a-fA-F]{3}|000)(?![\w-])/g],
  ["rgb/hsl literal", /\b(?:rgba?|hsla?)\(\s*\d/g],
  ["named colour", new RegExp(`(?:color|background|backgroundColor|border|borderColor|fill|stroke|outline)\\s*[:=]\\s*(?:["'\`](?:[^"'\`]*\\s)?(?:${NAMED})["'\`\\s;])`, "g")],
];
const findings = [];
const excused = [];
let consoleCount = 0, displayCount = 0;
for (const f of files) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  if (isConsole(f)) {
    consoleCount += 1;
    lines.forEach((line, i) => {
      if (/^\s*import\b.*shared\/design-tokens\.json/.test(line)) findings.push(`${rel(f)}:${i + 1}  imports shared/design-tokens.json (the Digital Wall's file)`);
      // comments may name a colour; code may not
      const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, "").replace(/\s\/\/\s.*$/, "").replace(/\{\/\*.*?\*\/\}/g, "");
      for (const [what, re] of RULES) for (const m of code.matchAll(re)) {
        if (/\/\/\s*colour-data\b/.test(line)) { excused.push(`${rel(f)}:${i + 1}  ${m[0].trim()}`); continue; }
        findings.push(`${rel(f)}:${i + 1}  ${what}: ${m[0].trim()}`);
      }
    });
  } else {
    displayCount += 1;
    lines.forEach((line, i) => {
      const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, "").replace(/\s\/\/\s.*$/, "");
      if (/--cw-|--ca-|--mx-/.test(code)) findings.push(`${rel(f)}:${i + 1}  a display file reads a portal token: ${code.trim().slice(0, 100)}`);
      if (/data-theme|data-motion/.test(code)) findings.push(`${rel(f)}:${i + 1}  a display file reads data-theme or data-motion`);
      if (/portal-tokens|client-tokens|mobile-tokens|components\/console\/ui['"]/.test(code) && /import|from|@import|href/.test(code)) findings.push(`${rel(f)}:${i + 1}  a display file imports the console's theme: ${code.trim().slice(0, 100)}`);
    });
  }
  if (/data-wall-display=/.test(fs.readFileSync(f, "utf8")) && !/components\/wall-preview\//.test(f)) findings.push(`${rel(f)}  a data-wall-display root outside components/wall-preview/`);
}
// The console's index.html: the theme script must be guarded to console paths.
const html = fs.readFileSync(path.join(ROOT, "opsboard-react/index.html"), "utf8");
if (/data-theme/.test(html) && !/\/console\(/.test(html)) findings.push("opsboard-react/index.html  sets data-theme without the /console path guard");

for (const x of excused) console.log(`DATA  ${x}`);
for (const x of findings) console.log(`FAIL  ${x}`);
console.log(`${consoleCount} console files: no hard-coded colour (${excused.length} colour-data line${excused.length === 1 ? "" : "s"}) · ${displayCount} display files: no portal token, no data-theme · ${findings.length} finding${findings.length === 1 ? "" : "s"}`);
process.exit(findings.length ? 1 : 0);
