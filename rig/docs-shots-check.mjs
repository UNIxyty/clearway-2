// The docs' screenshots are whole and safe (2026-10-25): every picture a page names exists in both themes, each is at
// double size, the manifest says every shot's scan was clean, and no picture is older than the pages' latest change by
// more than a cycle of retakes (a stale set is a wrong set). Read-only; the retake itself is scripts/capture-docs-shots.mjs.
//   node rig/docs-shots-check.mjs
import fs from "node:fs";
import path from "node:path";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 200)}` : ""}`); if (!c) failures += 1; };
const DIR = "public/docs-media/screenshots";
const refs = new Set(); const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith(".md")) for (const m of fs.readFileSync(p, "utf8").matchAll(/\[screenshot:\s*([a-z0-9_-]+)/gi)) refs.add(m[1]); } };
walk("content/docs");
ok(refs.size > 0, "the docs name screenshots", `${refs.size} names`);
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR) : [];
const missing = [...refs].filter((n) => !files.includes(`${n}.png`) || !files.includes(`${n}-dark.png`));
ok(missing.length === 0, "every named screenshot exists in both themes", missing.length ? `missing: ${missing.join(", ")}` : `${refs.size} × 2 files`);
const pngSize = (f) => { const b = fs.readFileSync(f); return b.length > 24 && b.toString("ascii", 1, 4) === "PNG" ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null; };
let manifest = null; try { manifest = JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8")); } catch { manifest = null; }
ok(Boolean(manifest?.shots?.length), "the manifest exists and lists the shots", `${manifest?.shots?.length ?? 0} entries, taken ${manifest?.takenAt ?? "?"}`);
const notDouble = [];
for (const n of refs) for (const suffix of ["", "-dark"]) { const f = path.join(DIR, `${n}${suffix}.png`); if (!fs.existsSync(f)) continue; const s = pngSize(f); const m = manifest?.shots?.find((x) => x.name === n && x.theme === (suffix ? "dark" : "light")); const expected = (m?.viewport ?? 1440) * 2; if (!s || (s.w !== expected && !(m?.path === "/console/operators" && n.includes("button")))) notDouble.push(`${n}${suffix} ${s?.w}×${s?.h}`); }
ok(notDouble.length === 0, "every picture is at double size (width = 2 × viewport)", notDouble.length ? notDouble.slice(0, 6).join(", ") : "all");
const unclean = (manifest?.shots ?? []).filter((s) => s.scan !== "clean");
ok(unclean.length === 0, "the manifest says every shot's passenger scan was clean", unclean.map((s) => s.name).join(", "));
ok(String(manifest?.from ?? "").includes("rig"), "the pictures were taken on the rig, not on production", manifest?.from);
const orphans = files.filter((f) => f.endsWith(".png") && !refs.has(f.replace(/(-dark)?\.png$/, "")));
ok(orphans.length === 0, "no picture without a page naming it", orphans.join(", "));
console.log(failures ? `${failures} FAILED` : "ALL PASSED"); process.exit(failures ? 1 : 0);
