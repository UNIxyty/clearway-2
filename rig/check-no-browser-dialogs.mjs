// No browser dialogs anywhere (2026-11-09). Every confirmation, prompt and notice is our own designed overlay: a native
// confirm() shows the host name, ignores our fonts and colours, looks nothing like the product, and on the ops-room TV
// it is a grey box in the middle of the wall. This fails on any alert(), confirm() or prompt() — through window.,
// globalThis., self., top., parent., bracket access, or bare — in every place a person uses: the portal, both wall
// apps, the agent, the client view, the phone views, the Chrome extension and the static pages the portal serves.
// A bare call in a file that defines its own function of that name (an intake "confirm()" that sends to Leon) is ours.
// The browser's own, which cannot be ours, are allowed and counted: the leave-page warning (beforeunload), the file
// picker, and the print dialog.
//   node rig/check-no-browser-dialogs.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIRS = ["app", "components", "lib", "shared", "opsboard-react/src", "digital-wall/server.mjs", "digital-wall/lib", "digital-wall/guide", "extension/src", "agent/lib", "agent/server.mjs", "agent/public", "public", "content"];
const EXT = /\.(tsx?|jsx?|mjs|cjs|html?)$/;
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d !== "" ? `  · ${d}` : ""}`); if (!c) failures += 1; };

const NAMED = /\b(?:window|globalThis|self|top|parent)\s*(?:\.\s*|\[\s*["'`])(alert|confirm|prompt)\b/;
// (not after "|": a regular expression's alternative, "…|confirm(ed)?|…", is not a call)
const BARE = /(?:^|[^A-Za-z0-9_.$'"`|])(alert|confirm|prompt)\s*\(/;
const OWN = (name) => new RegExp(`(?:function\\s+${name}\\b|(?:const|let|var)\\s+${name}\\b|[{,(]\\s*${name}\\s*[,})=]|\\b${name}\\s*\\([^)]*\\)\\s*\\{)`);
const COMMENT_LINE = /^\s*(\/\/|\*|\/\*|<!--)/;

export function scanText(text, file = "planted.js") {
  const hits = []; const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (COMMENT_LINE.test(line)) return;
    const code = line.replace(/\/\/.*$/, "").replace(/(["'`])(?:\\.|(?!\1).)*\1/g, (m) => (/^["'`](alert|confirm|prompt)["'`]$/.test(m) ? m : '""'));
    const n = NAMED.exec(code);
    if (n) { hits.push(`${file}:${i + 1}  ${n[1]}() through ${code.trim().slice(0, 60)}`); return; }
    const b = BARE.exec(code);
    if (b && !OWN(b[1]).test(text)) hits.push(`${file}:${i + 1}  a bare ${b[1]}()`);
  });
  return hits;
}

function* files(p) {
  const abs = path.join(ROOT, p); if (!fs.existsSync(abs)) return;
  if (fs.statSync(abs).isFile()) { yield p; return; }
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (["node_modules", "dist", ".next", "docs-media"].includes(e.name)) continue;
    const rel = path.join(p, e.name);
    if (e.isDirectory()) yield* files(rel); else if (EXT.test(e.name)) yield rel;
  }
}

// the control: every form is caught, and our own functions of the same name are not
const planted = scanText([
  'if (!confirm("Delete?")) return;', 'window.alert("x");', "globalThis.prompt('y');", 'window["confirm"]("z");', "self.confirm(1)",
  "// confirm() in a comment", "const yes = /^(yes|confirm(ed)?)$/;",
].join("\n"), "planted.js");
ok(planted.length === 5, "control: a planted confirm(), window.alert(), globalThis.prompt(), window[\"confirm\"]() and self.confirm() are all caught", planted.length);
ok(scanText("async function confirm() { send(); }\nvoid confirm();", "ours.js").length === 0, "control: our own function called confirm() is not a browser dialog");

const hits = []; let checked = 0; const allowed = { beforeunload: [], filePicker: [], print: [] };
for (const dir of DIRS) for (const rel of files(dir)) {
  checked += 1;
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  hits.push(...scanText(text, rel));
  if (/beforeunload/.test(text)) allowed.beforeunload.push(rel);
  if (/type=["']file["']|\btype:\s*["']file["']|showOpenFilePicker/.test(text)) allowed.filePicker.push(rel);
  if (/\b(?:window\.)?print\s*\(\s*\)/.test(text) && /window\.print|[^.\w]print\(\)/.test(text)) allowed.print.push(rel);
}
ok(hits.length === 0, `no browser alert(), confirm() or prompt() in ${checked} files`, hits.slice(0, 10).join(" | "));
for (const [k, list] of Object.entries(allowed)) console.log(`      allowed, the browser's own: ${k} in ${list.length} file(s)${list.length ? `: ${list.slice(0, 6).join(", ")}` : ""}`);
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
