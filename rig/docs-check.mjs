// The docs site's own check (no browser): content, links, media, the furniture rule and contrast.
//   node --no-warnings rig/docs-check.mjs
//   · every page and section file parses with no problem the writer would need to fix
//   · every section folder has its _section.md and an icon that exists (public/icons)
//   · every internal link resolves: the section, the page, and the task (#…) if one is named; related: entries too
//   · every referenced screenshot and video exists, or is counted as "to come" (missing is allowed; it shows its
//     empty state); no file in public/docs-media is left unreferenced
//   · the furniture names nothing: no product or builder name in app/docs or components/docs (brand is site.json)
//   · site.json: support goes to the portal's Help & support while supportEmail is empty; public is a boolean
//   · contrast: every pair in shared/docs-contrast.json recomputed from the token files, ≥ 4.5:1 in both themes
import fs from "node:fs";
import path from "node:path";
import { parsePage, splitFrontMatter, blocks as parseBlocks, walkBlocks, walkInline } from "../lib/docs/parse.ts";
import { resolveLink } from "../lib/docs/links.ts";

const ROOT = "content/docs";
let failures = 0;
const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 600)}` : ""}`); if (!c) failures += 1; };

// ── load everything the way the site does ──
const ORDERED = /^(\d+)-([a-z0-9][a-z0-9-]*?)(\.md)?$/;
const problems = [];
const sections = [];
for (const dir of fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  const m = ORDERED.exec(dir);
  if (!m) { problems.push(`${dir}: a section folder must be named NN-name (e.g. 04-digital-wall)`); continue; }
  const secFile = path.join(ROOT, dir, "_section.md");
  let meta = {};
  if (fs.existsSync(secFile)) { const fm = splitFrontMatter(fs.readFileSync(secFile, "utf8")); meta = fm.meta; problems.push(...fm.problems.map((p) => `${dir}/_section.md: ${p}`)); parseBlocks(fm.body.split("\n"), problems, `${dir}/_section.md`); }
  else problems.push(`${dir}: no _section.md`);
  const pages = [];
  for (const f of fs.readdirSync(path.join(ROOT, dir)).sort()) {
    if (f === "_section.md" || !f.endsWith(".md")) continue;
    const pm = ORDERED.exec(f);
    if (!pm) { problems.push(`${dir}/${f}: a page file must be named NN-name.md (e.g. 04-operators.md)`); continue; }
    const parsed = parsePage(fs.readFileSync(path.join(ROOT, dir, f), "utf8"), `${dir}/${f}`);
    if (!parsed.meta.title) parsed.problems.push(`${dir}/${f}: no title in the header`);
    if (parsed.meta.status && !["written", "draft"].includes(parsed.meta.status)) parsed.problems.push(`${dir}/${f}: status must be "written" or "draft"`);
    problems.push(...parsed.problems);
    pages.push({ slug: pm[2], file: `${dir}/${f}`, ...parsed });
  }
  sections.push({ slug: m[2], dir, meta, pages });
}
const glossaryFile = path.join(ROOT, "glossary.md");
const hasGlossary = fs.existsSync(glossaryFile);
const nPages = sections.reduce((a, s) => a + s.pages.length, 0);
const nFns = sections.reduce((a, s) => a + s.pages.reduce((b, p) => b + p.fns.length, 0), 0);
ok(problems.length === 0, `every file in content/docs parses (${sections.length} sections, ${nPages} pages, ${nFns} tasks)`, problems.join(" | "));

// ── sections: title and a real icon; no duplicate addresses ──
const badSec = sections.filter((s) => !s.meta.title || !fs.existsSync(`public/icons/${s.meta.icon || "file-text"}.svg`)).map((s) => `${s.dir} (${!s.meta.title ? "no title" : `icon "${s.meta.icon}" is not in public/icons`})`);
ok(badSec.length === 0, "every section has a title and an icon that exists", badSec.join(", "));
const dupes = [...sections.map((s) => s.slug), ...sections.flatMap((s) => s.pages.map((p) => `${s.slug}/${p.slug}`))].filter((x, i, a) => a.indexOf(x) !== i);
ok(dupes.length === 0, "no two sections or pages share an address", dupes.join(", "));

// ── links ──
const target = (raw) => {
  const l = resolveLink(raw);
  if (!l.internal) return null;
  if (l.section === "glossary") return hasGlossary ? null : "the glossary does not exist";
  const s = sections.find((x) => x.slug === l.section);
  if (!s) return `no section "${l.section}"`;
  if (!l.page) return l.task ? "a task needs a page (section/page#task)" : null;
  const p = s.pages.find((x) => x.slug === l.page);
  if (!p) return `no page "${l.section}/${l.page}"`;
  if (l.task && !p.fns.some((f) => f.id === l.task)) return `no task "#${l.task}" on ${l.section}/${l.page} (tasks: ${p.fns.map((f) => f.id).join(", ")})`;
  return null;
};
const broken = []; let nLinks = 0;
const portalPages = new Set(fs.readdirSync("app", { recursive: true }).filter((f) => /(^|\/)page\.tsx$/.test(f)).map((f) => "/" + path.dirname(f).replace(/\\/g, "/").replace(/^\.$/, "")));
for (const s of sections) for (const p of s.pages) {
  const all = [...p.intro, ...p.fns.flatMap((f) => [{ kind: "p", text: f.summary }, ...f.blocks])];
  for (const x of walkInline(all)) if (x.kind === "link") {
    nLinks += 1;
    const why = target(x.href);
    if (why) broken.push(`${p.file}: [${x.href}] ${why}`);
    if (x.href.startsWith("/") && !x.href.startsWith("/docs") && !portalPages.has(x.href.split(/[?#]/)[0])) broken.push(`${p.file}: [${x.href}] is not a portal page`);
  }
  for (const r of (p.meta.related ?? "").split(",").map((x) => x.trim()).filter(Boolean)) { nLinks += 1; const why = target(r); if (why) broken.push(`${p.file}: related "${r}" ${why}`); }
}
ok(broken.length === 0, `every internal link resolves (${nLinks} links and related entries)`, broken.join(" | "));

// ── media ──
const shots = new Map(); const videos = new Map();
const note = (map, name, where) => map.set(name, [...(map.get(name) ?? []), where]);
for (const s of sections) for (const p of s.pages) {
  const v = (p.meta.video ?? "").split("|")[0].trim().toLowerCase();
  if (v) note(videos, v, p.file);
  for (const b of walkBlocks([...p.intro, ...p.fns.flatMap((f) => f.blocks)])) {
    if (b.kind === "shot") note(shots, b.shot.name, p.file);
    if (b.kind === "video") note(videos, b.name, p.file);
    if (b.kind === "steps") for (const st of b.steps) if (st.shot) note(shots, st.shot.name, p.file);
  }
}
const exists = (dir, name, exts) => exts.some((e) => fs.existsSync(`public/docs-media/${dir}/${name}${e}`));
const shotHave = [...shots.keys()].filter((n) => exists("screenshots", n, [".png", ".jpg", ".jpeg", ".webp"]));
const vidHave = [...videos.keys()].filter((n) => exists("videos", n, [".mp4"]));
ok(true, `screenshots: ${shots.size} referenced, ${shotHave.length} present, ${shots.size - shotHave.length} shown as "Screenshot to come"`);
ok(true, `videos: ${videos.size} referenced, ${vidHave.length} present, ${videos.size - vidHave.length} shown as "Video to come"`);
const orphan = ["screenshots", "videos"].flatMap((d) => (fs.existsSync(`public/docs-media/${d}`) ? fs.readdirSync(`public/docs-media/${d}`) : [])
  .filter((f) => !/^README/.test(f)).map((f) => [d, f])).filter(([d, f]) => !(d === "screenshots" ? shots : videos).has(f.replace(/\.[a-z0-9]+$/i, "").toLowerCase()) && !(d === "videos" && /\.(png|jpe?g|webp)$/i.test(f) && videos.has(f.replace(/\.[a-z0-9]+$/i, ""))));
ok(orphan.length === 0, "no file in public/docs-media that no page uses", orphan.map(([d, f]) => `${d}/${f}`).join(", "));
// The component sheet's stand-in: one picture, in its own folder, which no page can reach.
const sheetImgs = fs.existsSync("public/docs-media/sheet") ? fs.readdirSync("public/docs-media/sheet").filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f)) : [];
ok(sheetImgs.length <= 1, "at most one stand-in picture, in public/docs-media/sheet (component sheet only)", sheetImgs.join(", "));
const pagesUsingSheet = [...shots.entries()].filter(([n]) => n.startsWith("sheet-")).map(([n, w]) => `${w.join(", ")} uses ${n}`);
ok(pagesUsingSheet.length === 0, "no docs page uses the component sheet's pictures", pagesUsingSheet.join(" | "));

// ── the component sheet shows every block, written in the page format ──
const sheet = parsePage(fs.readFileSync("app/developer/docs-components/sheet.md", "utf8"), "sheet.md");
const kinds = new Set();
for (const b of walkBlocks([...sheet.intro, ...sheet.fns.flatMap((f) => f.blocks)])) kinds.add(b.kind === "callout" ? `callout:${b.tone}` : b.kind);
const wanted = ["p", "list", "steps", "callout:note", "callout:warning", "callout:irreversible", "example", "how", "code", "table", "statuses", "news", "history"];
ok(sheet.problems.length === 0 && wanted.every((k) => kinds.has(k)), "the component sheet (sheet.md) parses and uses every block", [...sheet.problems, ...wanted.filter((k) => !kinds.has(k)).map((k) => `missing ${k}`)].join(" | "));

// ── the furniture names nothing ──
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "site.json"), "utf8"));
const names = [site.product, site.credit?.name].filter(Boolean);
const furniture = [...fs.readdirSync("app/docs", { recursive: true }).map((f) => `app/docs/${f}`), ...fs.readdirSync("components/docs", { recursive: true }).map((f) => `components/docs/${f}`), "lib/docs/view.ts"]
  .filter((f) => /\.(tsx?|css)$/.test(f) && fs.statSync(f).isFile());
const named = furniture.flatMap((f) => names.filter((n) => new RegExp(`\\b${n}\\b`, "i").test(fs.readFileSync(f, "utf8"))).map((n) => `${f} says "${n}"`));
ok(named.length === 0, `the docs shell names no product or builder (${furniture.length} files; names come from content/docs/site.json)`, named.join(", "));
ok(typeof site.public === "boolean", `site.json "public" is true or false (now: ${site.public}; false = behind the portal's sign-in)`);
ok(site.supportEmail || (site.supportLink && site.supportLink.startsWith("/")), "with no support email, support goes to a portal page", site.supportLink);

// ── contrast, recomputed ──
function tokens(file) {
  const css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const out = { light: {}, dark: {} };
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    const theme = /\[data-theme="dark"\]/.test(sel) && !/:not/.test(sel) ? "dark" : /^:root\s*,\s*\[data-theme="light"\]|^:root$/.test(sel) ? "light" : null;
    if (!theme) continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[theme][d[1]] = d[2].trim();
  }
  return out;
}
const portal = tokens("shared/portal-tokens.css"); const docsT = tokens("shared/docs-tokens.css");
const all = { light: { ...portal.light, ...docsT.light }, dark: { ...portal.light, ...portal.dark, ...docsT.light, ...docsT.dark } };
const rgb = (v, theme, depth = 0) => {
  if (depth > 8 || v === undefined) return null;
  const ref = /^var\((--[\w-]+)\)$/.exec(v); if (ref) return rgb(all[theme][ref[1]], theme, depth + 1);
  let m = /^#([0-9a-f]{6})$/i.exec(v); if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4), 16), a: 1 };
  m = /^#([0-9a-f]{3})$/i.exec(v); if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 };
  m = /^rgba?\(([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\)$/.exec(v); if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  return null;
};
const over = (c, base) => ({ r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a), a: 1 });
const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const pairs = JSON.parse(fs.readFileSync("shared/docs-contrast.json", "utf8")).pairs;
const low = []; const unknown = []; const drift = [];
const WHITE = { r: 255, g: 255, b: 255, a: 1 };
for (const p of pairs) for (const theme of ["light", "dark"]) {
  let fg = rgb(all[theme][p.fg], theme); let bg = rgb(all[theme][p.bg], theme);
  if (!fg || !bg) { unknown.push(`${p.fg} on ${p.bg} (${theme})`); continue; }
  const page = rgb(all[theme]["--cw-bg-page"], theme) ?? WHITE;
  if (bg.a < 1) bg = over(bg, /video/i.test(p.use) ? WHITE : page);   // video chips: over a white poster, the worst case
  if (fg.a < 1) fg = over(fg, bg);
  const r = ratio(fg, bg);
  if (r < 4.5) low.push(`${p.fg} on ${p.bg} (${theme}) ${r.toFixed(2)}`);
  if (Math.abs(r - p[theme]) > 0.15) drift.push(`${p.fg} on ${p.bg} (${theme}): file says ${p[theme]}, tokens give ${r.toFixed(2)}`);
}
ok(unknown.length === 0, `every pair in shared/docs-contrast.json names tokens that exist (${pairs.length} pairs)`, unknown.join(", "));
ok(low.length === 0, `every pair is at least 4.5:1 in both themes, recomputed from the token files`, low.join(", "));
ok(drift.length === 0, "the ratios written in shared/docs-contrast.json match the tokens", drift.slice(0, 8).join(" | "));

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
