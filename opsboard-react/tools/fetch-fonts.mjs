// Downloads OFL fonts from Google Fonts as woff2 (latin + latin-ext subsets) into public/fonts. Run once; the
// files are committed. Variable fonts come as ONE file per subset covering the weight range. Nunito is NOT
// fetched: the wall ships its own dotted-zero build.
import { writeFileSync, mkdirSync } from "node:fs"; import { createHash } from "node:crypto";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
// Pass family names as arguments to fetch only those (e.g. node tools/fetch-fonts.mjs "Inter" "Source Sans 3").
const ALL = [["Roboto", [400, 600, 700, 800]], ["Public Sans", [400, 500, 600, 700, 800]], ["IBM Plex Sans", [400, 500, 600, 700, 800]], ["IBM Plex Mono", [400, 500, 600]],
  // Bug report 7 item 4c: Inter, Source Sans 3, Atkinson Hyperlegible Next; and plain Nunito 400 — what the old
  // Digital Wall loaded (fonts.googleapis.com/css2?family=Nunito: weight 400 only; its bold was synthesised).
  ["Inter", [400, 600, 700, 800]], ["Source Sans 3", [400, 600, 700, 800]], ["Atkinson Hyperlegible Next", [400, 600, 700, 800]], ["Nunito", [400]]];
const pick = process.argv.slice(2);
const WANT = pick.length ? ALL.filter(([f]) => pick.includes(f)) : ALL;
mkdirSync("public/fonts", { recursive: true });
const faces = [];
for (const [family, weights] of WANT) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weights.join(";")}&display=swap`, { headers: { "user-agent": UA } })).text();
  const got = new Map();   // subset → { hash → entries }
  for (const m of css.matchAll(/\/\* ([a-z-]+) \*\/\s*@font-face\s*\{([^}]*)\}/g)) {
    const subset = m[1], body = m[2]; if (!["latin", "latin-ext"].includes(subset)) continue;
    const weight = Number(/font-weight:\s*(\d+)/.exec(body)[1]); const src = /url\((https:[^)]+\.woff2)\)/.exec(body)[1]; const range = /unicode-range:\s*([^;]+);/.exec(body)[1].trim();
    const buf = Buffer.from(await (await fetch(src, { headers: { "user-agent": UA } })).arrayBuffer());
    const h = createHash("md5").update(buf).digest("hex");
    const bySub = got.get(subset) ?? got.set(subset, new Map()).get(subset);
    (bySub.get(h) ?? bySub.set(h, { buf, range, weights: [] }).get(h)).weights.push(weight);
  }
  const slug = family === "Nunito" ? "Nunito-plain" : family.replace(/ /g, "");
  for (const [subset, byHash] of got) for (const [, e] of byHash) {
    const variable = e.weights.length > 1; const name = variable ? `${slug}-var-${subset}.woff2` : `${slug}-${e.weights[0]}-${subset}.woff2`;
    writeFileSync(`public/fonts/${name}`, e.buf);
    faces.push({ family, file: name, weight: variable ? `${Math.min(...e.weights)} ${Math.max(...e.weights)}` : String(e.weights[0]), subset, range: e.range, bytes: e.buf.length });
    console.log(name, e.buf.length, e.range.slice(0, 24));
  }
}
// Merge into the manifest (a partial run must not drop the other families).
let prior = []; try { prior = JSON.parse((await import("node:fs")).readFileSync("public/fonts/manifest.json", "utf8")); } catch {}
const fetched = new Set(faces.map((f) => f.file));
writeFileSync("public/fonts/manifest.json", JSON.stringify([...prior.filter((f) => !fetched.has(f.file)), ...faces], null, 1));
