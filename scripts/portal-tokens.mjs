// The portal's colour tokens (portal redesign, stage 1). ONE source: shared/portal-tokens.json — every token has a light
// and a dark value. This script writes shared/portal-tokens.css from it and measures contrast.
//
//   node scripts/portal-tokens.mjs            write shared/portal-tokens.css and shared/portal-contrast.json
//   node scripts/portal-tokens.mjs --check    fail if the CSS is stale or any text pair is below AA in either theme
//
// shared/design-tokens.json (no "portal") is a DIFFERENT file: the Digital Wall's. Nothing here reads or writes it.
// The wall reads no --cw-* token and no data-theme (design spec §1.4).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const SRC = arg("src", path.join(ROOT, "shared/portal-tokens.json"));
const CSS = arg("css", path.join(ROOT, "shared/portal-tokens.css"));
const CONTRAST = arg("contrast", path.join(ROOT, "shared/portal-contrast.json"));
const CHECK = process.argv.includes("--check");

const src = JSON.parse(fs.readFileSync(SRC, "utf8"));
const prefix = src.prefix ?? "--cw-";
const tokens = src.tokens;

export function renderCss(tokens, sourceName) {
  const block = (theme, indent) => Object.entries(tokens).map(([k, v]) => `${indent}${prefix}${k}: ${v[theme]};`).join("\n");
  return [
    `/* Generated from ${sourceName} — do not edit by hand. */`,
    `:root, [data-theme="light"] {`,
    `  color-scheme: light;`,
    block("light", "  "),
    `}`,
    `[data-theme="dark"] {`,
    `  color-scheme: dark;`,
    block("dark", "  "),
    `}`,
    `@media (prefers-color-scheme: dark) {`,
    `  :root:not([data-theme]) {`,
    `  color-scheme: dark;`,
    block("dark", "  "),
    `  }`,
    `}`,
    `@keyframes cw-shimmer { 0% { background-position: -320px 0 } 100% { background-position: 320px 0 } }`,
    `@keyframes cw-spin { to { transform: rotate(360deg) } }`,
    `@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`,
    ``,
  ].join("\n");
}

// WCAG 2.2 relative luminance / contrast ratio. Colours are #rrggbb; a translucent background is composited over the
// page colour of the same theme first.
const hex = (h) => { const m = /^#([0-9a-f]{6})$/i.exec(h.trim()); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
const rgba = (s) => { const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(s.trim()); return m ? [+m[1], +m[2], +m[3], +m[4]] : null; };
const over = (top, under) => { const a = top[3]; return [0, 1, 2].map((i) => Math.round(top[i] * a + under[i] * (1 - a))); };
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
export function ratio(fg, bg) { const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
function rgbOf(name, theme) {
  const v = tokens[name]?.[theme]; if (!v) throw new Error(`no token ${name}`);
  const h = hex(v); if (h) return h;
  const t = rgba(v); if (t) return over(t, hex(tokens["bg-page"][theme]));
  throw new Error(`${name}: not a colour (${v})`);
}

const css = renderCss(tokens, path.relative(ROOT, SRC));
const pairs = JSON.parse(fs.readFileSync(CONTRAST, "utf8")).pairs;
const measured = pairs.map((p) => ({ ...p, light: +ratio(rgbOf(p.fg, "light"), rgbOf(p.bg, "light")).toFixed(2), dark: +ratio(rgbOf(p.fg, "dark"), rgbOf(p.bg, "dark")).toFixed(2) }));
const failing = measured.filter((p) => !p.exempt && (p.light < (p.min ?? 4.5) || p.dark < (p.min ?? 4.5)));
const lowest = [...measured].filter((p) => !p.exempt).sort((a, b) => Math.min(a.light, a.dark) - Math.min(b.light, b.dark))[0];

if (CHECK) {
  const stale = !fs.existsSync(CSS) || fs.readFileSync(CSS, "utf8") !== css;
  if (stale) console.log(`FAIL  ${path.relative(ROOT, CSS)} is not what ${path.relative(ROOT, SRC)} generates — run node scripts/portal-tokens.mjs`);
  for (const p of failing) console.log(`FAIL  ${p.fg} on ${p.bg}: light ${p.light}, dark ${p.dark} (needs ${p.min ?? 4.5})`);
  console.log(`${Object.keys(tokens).length} tokens · ${measured.length} pairs measured (${measured.filter((p) => p.exempt).length} exempt) · lowest ${lowest.fg} on ${lowest.bg} ${Math.min(lowest.light, lowest.dark)}`);
  process.exit(stale || failing.length ? 1 : 0);
}
fs.writeFileSync(CSS, css);
fs.writeFileSync(CONTRAST, JSON.stringify({ $comment: "Text/background pairs in both themes, measured by scripts/portal-tokens.mjs (WCAG 2.2). min defaults to 4.5; exempt pairs are inactive-only.", pairs: measured }, null, 1) + "\n");
console.log(`wrote ${path.relative(ROOT, CSS)} (${Object.keys(tokens).length} tokens) and ${path.relative(ROOT, CONTRAST)} (${measured.length} pairs, ${failing.length} below AA)`);
if (failing.length) process.exit(1);
