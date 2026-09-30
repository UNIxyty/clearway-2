// Writes Lucide icons into public/icons/<name>.svg from the installed lucide-react package (no CDN, no network).
//   node scripts/make-lucide-icons.mjs circle-x hourglass ...
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const ver = JSON.parse(readFileSync("node_modules/lucide-react/package.json", "utf8")).version;
for (const name of process.argv.slice(2)) {
  const src = `node_modules/lucide-react/dist/esm/icons/${name}.js`;
  if (!existsSync(src)) { console.error(`no lucide icon "${name}"`); process.exitCode = 1; continue; }
  const js = readFileSync(src, "utf8");
  const nodes = [...js.replace(/\s+/g, " ").matchAll(/\[ ?"(\w+)", ?\{([^}]*)\} ?\]/g)].map(([, tag, attrs]) => {
    const a = [...attrs.matchAll(/(\w+): "([^"]*)"/g)].filter(([, k]) => k !== "key").map(([, k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${v}"`).join(" ");
    return `  <${tag} ${a} />`;
  });
  writeFileSync(`public/icons/${name}.svg`, `<!-- @license lucide-react v${ver} - ISC -->\n<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n${nodes.join("\n")}\n</svg>\n`);
  console.log(`wrote ${name} (${nodes.length} shapes)`);
}
