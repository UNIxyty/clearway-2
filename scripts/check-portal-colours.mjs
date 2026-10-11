// Portal redesign, stage 1: no hard-coded colour anywhere in the portal. Every colour is a --cw-* token
// (shared/portal-tokens.json), so it follows the light/dark theme. Fails (exit 1) on, in app/, components/ and lib/:
//   · a hex colour (#rgb, #rrggbb, #rrggbbaa), an rgb()/rgba()/hsl()/hsla() with literal numbers, a named colour as a
//     CSS value ("white", "black", …)
//   · a Tailwind colour class that is not a token (bg-white, text-gray-500, border-red-200, text-muted-foreground,
//     bg-[#…], the pre-token cw-* names) and any dark: variant (the tokens carry both themes)
//   · an import of shared/design-tokens.json — the Digital Wall's file — anywhere in the portal (app/, components/, lib/)
//
//   node scripts/check-portal-colours.mjs            report and exit 1 on any finding
//   node scripts/check-portal-colours.mjs --count    also print how many colour tokens are in use
import fs from "node:fs";
import path from "node:path";

// Files that are not themed by the portal, with the reason. Nothing else is excused.
const EXCUSED = {
  "components/help/TelegramSupportApp.tsx": "the Telegram mini app takes Telegram's own theme (themeParams), not the portal's",
  "app/api/unsubscribe/route.ts": "a standalone HTML page opened from an email; it does not load the portal stylesheet",
  "app/api/blocked-hitl-vnc/route.ts": "reads a remote page's colours as data (no UI)",
  "lib/netherlands-eaip-navigation.mjs": "reads a remote page's colours as data (no UI)",
};
const ROOTS = ["app", "components", "lib"];
const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); } else if (/\.(tsx?|jsx?|css|mjs)$/.test(f.name)) files.push(p); } };
ROOTS.forEach(walk);

const NAMED = "white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|navy|teal|maroon|olive|lime|aqua|fuchsia|pink|gold|greenyellow";
const RULES = [
  ["hex colour", /(?<![\w&/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|(?=[0-9a-fA-F]{0,2}[a-fA-F])[0-9a-fA-F]{3}|000)(?![\w-])/g],
  ["rgb/hsl literal", /\b(?:rgba?|hsla?)\(\s*\d/g],
  // a named colour as a quoted value (JS/JSX/SVG) or a bare CSS value
  ["named colour", new RegExp(`(?:color|background|background-color|backgroundColor|border|borderColor|border-color|fill|stroke|stop-color|outline)\\s*[:=]\\s*(?:["'\`](?:[^"'\`]*\\s)?(?:${NAMED})["'\`\\s;]|(?:${NAMED})\\s*[;!])`, "g")],
  ["Tailwind palette class", /(?<=^|[\s"'`{(:!])(?:[a-z]+:)*(?:bg|text|border(?:-[tblrxy])?|ring|ring-offset|from|via|to|fill|stroke|divide|outline|placeholder|accent|caret|decoration|shadow)-(?:white|black|(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|\[#[0-9a-fA-F]+\]|\[(?:rgb|hsl)a?\([^\]]*\)\])(?:\/[\d.[\]]+)?(?=$|[\s"'`}):])/g],
  ["shadcn colour class", /(?<=^|[\s"'`{(:!])(?:[a-z]+:)*(?:bg|text|border|ring|ring-offset|from|to|placeholder)-(?:background|foreground|card(?:-foreground)?|popover(?:-foreground)?|primary(?:-foreground)?|secondary(?:-foreground)?|muted(?:-foreground)?|accent(?:-foreground)?|destructive(?:-foreground)?|input)(?:\/[\d.[\]]+)?(?=$|[\s"'`}):])/g],
  ["pre-token cw class", /(?<=^|[\s"'`{(:!])(?:[a-z]+:)*(?:bg|text|border(?:-[tblrxy])?|ring|divide|from|to)-cw-(?:page|card|sidebar|borderInner|body|muted|faint|primaryDeep|primaryTint|green|amber|red|hover|navActive|borderControl|amberTint|amberDeep)(?![\w-])/g],
  ["dark: variant", /(?<=^|[\s"'`])dark:[^\s"'`]+/g],
  // colour names from before the tokens (the Pickem palette and the old page grey); they no longer exist, so the class
  // silently paints nothing
  ["retired colour class", /(?<=^|[\s"'`{(:!])(?:[a-z]+:)*(?:bg|text|border|ring|from|to)-(?:page|navy(?:-light)?|bk-(?:blue|amber|accent)(?:-dark)?|pickfill)(?![\w-])/g],
];
const findings = [];
for (const f of files) {
  if (EXCUSED[f]) continue;
  const lines = fs.readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    // comments may name a colour; code may not
    const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, "").replace(/\s\/\/\s.*$/, "").replace(/\{\/\*.*?\*\/\}/g, "");
    for (const [what, re] of RULES) for (const m of code.matchAll(re)) findings.push(`${f}:${i + 1}  ${what}: ${m[0].trim()}`);
  });
}
// The wall's token file must not be read by the portal.
for (const root of ROOTS) {
  const all = []; const w = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (!/node_modules|\.next/.test(p)) w(p); } else if (/\.(tsx?|jsx?|mjs)$/.test(f.name)) all.push(p); } };
  w(root);
  for (const f of all) fs.readFileSync(f, "utf8").split("\n").forEach((l, i) => { if (/^\s*import\b.*shared\/design-tokens\.json/.test(l)) findings.push(`${f}:${i + 1}  imports shared/design-tokens.json (the Digital Wall's file)`); });
}
for (const x of findings) console.log(`FAIL  ${x}`);
console.log(`${files.length} portal files scanned · ${Object.keys(EXCUSED).length} excused (${Object.entries(EXCUSED).map(([f, why]) => `${f}: ${why}`).join("; ")}) · ${findings.length} hard-coded colour${findings.length === 1 ? "" : "s"}`);
if (process.argv.includes("--count")) {
  const used = new Set(); for (const f of files) for (const m of fs.readFileSync(f, "utf8").matchAll(/--cw-([a-z0-9-]+)|\bcw\.([a-zA-Z0-9]+)|-cw-([a-z0-9-]+)/g)) used.add(m[1] ?? m[2]?.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`) ?? m[3]);
  console.log(`${used.size} distinct tokens referenced`);
}
process.exit(findings.length ? 1 : 0);
