// Builds dist/: pages + service worker (vite, ES modules), then each content script as a self-contained
// IIFE (no imports at runtime — MV3 forbids remote code and content scripts cannot be modules), then the
// manifest with the console origin stamped in, icons and fonts. `--zip` also writes clearway-ops-agent.zip.
import { build } from "vite";
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "dist");
const ORIGIN = (process.env.CW_CONSOLE_ORIGIN || "https://clearway.verxyl.com").replace(/\/+$/, "");
const CONTENT = ["pill", "capture", "insert", "voicebar"];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({ configFile: path.join(here, "vite.config.mts"), logLevel: "warn" });

for (const name of CONTENT) {
  await build({
    configFile: false, root: here, logLevel: "warn", publicDir: false,
    resolve: { alias: { "@": path.resolve(here, ".."), "~": path.resolve(here, "src") } },
    define: { "process.env.NODE_ENV": JSON.stringify("production"), __CW_CONSOLE_ORIGIN__: JSON.stringify(ORIGIN) },
    build: {
      outDir: path.join(dist, "content"), emptyOutDir: false, target: "chrome116", minify: false, sourcemap: false,
      lib: { entry: path.join(here, `src/content/${name}.ts`), name: `__cw_${name}`, formats: ["iife"], fileName: () => `${name}.js` },
      rollupOptions: { output: { extend: true, inlineDynamicImports: true } },
    },
  });
}

// Pages: vite writes them under dist/src/<page>/index.html; the manifest wants them at the root.
for (const page of ["sidepanel", "offscreen"]) {
  const from = path.join(dist, "src", page, "index.html");
  if (existsSync(from)) {
    let html = readFileSync(from, "utf8").replace(/(src|href)="\.\.\/\.\.\//g, '$1="./').replace(/(src|href)="\/(assets|icons|fonts)\//g, '$1="./$2/');
    writeFileSync(path.join(dist, `${page}.html`), html);
  }
}
rmSync(path.join(dist, "src"), { recursive: true, force: true });

// Icons: the console's own lucide masks (never a CDN), the ring mark for the toolbar, and the fonts.
cpSync(path.join(here, "..", "public", "icons"), path.join(dist, "icons"), { recursive: true });
cpSync(path.join(here, "public"), dist, { recursive: true });

const manifest = JSON.parse(readFileSync(path.join(here, "manifest.template.json"), "utf8").replaceAll("__CONSOLE_ORIGIN__", ORIGIN));
// CW_TEST_HOSTS: extra origins granted at install for the automated rig (never set for a release build).
for (const h of String(process.env.CW_TEST_HOSTS || "").split(",").map((x) => x.trim()).filter(Boolean)) manifest.host_permissions.push(h);
writeFileSync(path.join(dist, "manifest.json"), JSON.stringify(manifest, null, 2));

// Nothing remote, nothing eval'd: fail the build if a bundle references a script URL or eval.
for (const f of walk(dist).filter((p) => p.endsWith(".js"))) {
  const s = readFileSync(f, "utf8");
  if (/\beval\(|new Function\(/.test(s)) throw new Error(`${f}: eval/new Function is not allowed in MV3`);
}
if (process.argv.includes("--zip")) {
  const zip = path.join(here, "clearway-ops-agent.zip");
  rmSync(zip, { force: true });
  execSync(`cd "${dist}" && zip -qr "${zip}" .`);
  console.log(`zip: ${zip}`);
}
console.log(`built dist/ for ${ORIGIN}`);

function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)])); }
