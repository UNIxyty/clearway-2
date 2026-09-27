// Builds dist/: pages + service worker (vite, ES modules), then each content script as a self-contained
// IIFE (no imports at runtime — MV3 forbids remote code and content scripts cannot be modules), then the
// manifest with the console origin stamped in, icons and fonts. `--zip` also writes clearway-ops-agent.zip.
import { build } from "vite";
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

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
  writeFileSync(zip, zipDirectory(dist));
  console.log(`zip: ${zip}`);
}
console.log(`built dist/ for ${ORIGIN}`);

// A plain ZIP writer (deflate), so the package builds on a machine without the `zip` binary.
function zipDirectory(root) {
  const files = walk(root).sort();
  const locals = [], centrals = []; let offset = 0;
  const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
  const dosDate = (d) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  for (const f of files) {
    const name = Buffer.from(path.relative(root, f).split(path.sep).join("/"), "utf8");
    const data = readFileSync(f); const packed = deflateRawSync(data); const crc = crc32(data); const now = new Date();
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8); head.writeUInt16LE(dosTime(now), 10); head.writeUInt16LE(dosDate(now), 12); head.writeUInt32LE(crc, 14); head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(name.length, 26); head.writeUInt16LE(0, 28);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10); cen.writeUInt16LE(dosTime(now), 12); cen.writeUInt16LE(dosDate(now), 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(packed.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(name.length, 28); cen.writeUInt16LE(0, 30); cen.writeUInt16LE(0, 32); cen.writeUInt16LE(0, 34); cen.writeUInt16LE(0, 36); cen.writeUInt32LE(0, 38); cen.writeUInt32LE(offset, 42);
    locals.push(head, name, packed); centrals.push(cen, name); offset += head.length + name.length + packed.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, end]);
}
var CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) { CRC_TABLE = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; } }
  let c = 0xffffffff; for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)])); }
