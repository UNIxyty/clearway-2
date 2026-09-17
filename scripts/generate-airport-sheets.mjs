#!/usr/bin/env node
// Airport one-pager PDF generator.
//
// Renders scripts/airport-sheets/template.html (a reproduction of the
// hand-made Clearway sheet, reference: EYVI_VILNIUS.pdf) to one A4 PDF per
// airport from scripts/airport-sheets/airports.json, via Playwright Chromium.
//
// Usage:
//   node scripts/generate-airport-sheets.mjs                 # all airports
//   node scripts/generate-airport-sheets.mjs --icao EYVI     # one (or EYVI,LROP)
//   node scripts/generate-airport-sheets.mjs --out /mnt/ssd-cache/sheets
//   node scripts/generate-airport-sheets.mjs --zip           # bundle output
//   node scripts/generate-airport-sheets.mjs --data scripts/airport-sheets/airports.stress.json
//
// Default output: /mnt/ssd-cache/airport-sheets on the server; when
// /mnt/ssd-cache does not exist (dev machine) falls back to
// data/.tmp/airport-sheets. One browser instance serves every sheet.
//
// Missing data policy: a missing info/contact field OMITS that row (no
// dangling labels, no placeholders); a missing image becomes a neutral
// grey block. Both are reported in the summary.

import fs from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHEETS_DIR = path.join(__dirname, "airport-sheets");
const ASSETS_DIR = path.join(SHEETS_DIR, "assets");

function arg(name, dflt = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return dflt;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const ONLY = arg("icao");
// Default data source: the per-airport folder (airports/<ICAO>/<ICAO>.json)
// when it exists, else the flat airports.json array.
const AIRPORTS_DIR = path.join(SHEETS_DIR, "airports");
const DATA_FILE = arg("data", existsSync(AIRPORTS_DIR) ? AIRPORTS_DIR : path.join(SHEETS_DIR, "airports.json"));
const MAKE_ZIP = process.argv.includes("--zip");
const OUT_DIR =
  arg("out") ||
  (existsSync("/mnt/ssd-cache")
    ? "/mnt/ssd-cache/airport-sheets"
    : path.join(__dirname, "../data/.tmp/airport-sheets"));

// ── Fixed content ───────────────────────────────────────────────────────────
// Labels are fixed; only values come from data. Order matches the sheet.
const INFO_LABELS = [
  ["slotPpr", "Slot/PPR"],
  ["airportOfEntry", "Airport of entry"],
  ["paxHandling", "Pax handling"],
  ["customs", "Customs in facilities"],
  ["hangar", "Hangar"],
  ["rampAccess", "Ramp access"],
  ["fireCategory", "Fire category"],
  ["fuel", "Fuel"],
  ["runway", "Runway"],
  ["elevation", "Elevation"],
  ["distanceToCity", "Distance to city center"],
  ["timeZone", "Time Zone"],
];

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── Images ──────────────────────────────────────────────────────────────────
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

async function imageDataUri(relOrAbs) {
  const p = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(ASSETS_DIR, relOrAbs);
  try {
    const buf = await fs.readFile(p);
    const mime = MIME[path.extname(p).toLowerCase()] || "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// Explicit images.{hero,pax} path first, else auto-discover assets/<kind>/<ICAO>.<ext>
async function resolveImage(airport, kind) {
  const explicit = airport.images?.[kind];
  if (explicit) {
    const uri = await imageDataUri(explicit);
    if (uri) return uri;
  }
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const uri = await imageDataUri(path.join(kind, `${airport.icao}${ext}`));
    if (uri) return uri;
  }
  return null;
}

// ── Sheet HTML ──────────────────────────────────────────────────────────────
async function buildHtml(template, logos, airport, missing) {
  const heroUri = await resolveImage(airport, "hero");
  const paxUri = await resolveImage(airport, "pax");
  if (!heroUri) missing.push("hero image");
  if (!paxUri) missing.push("pax image");

  const infoRows = [];
  for (const [key, label] of INFO_LABELS) {
    const v = airport.info?.[key];
    if (v === undefined || v === null || v === "") { missing.push(key); continue; }
    infoRows.push(`<div class="row">${esc(label)}: ${esc(v)}</div>`);
  }

  const c = airport.contacts || {};
  const cell = (lbl, val, cls = "") =>
    val ? `<div class="cell"><span class="lbl">${lbl}</span> <span class="val ${cls}">${esc(val)}</span></div>` : "";
  for (const k of ["tel", "email", "sita", "aftn"]) if (!c[k]) missing.push(`contacts.${k}`);
  const contactRows =
    `<div class="crow"><div class="c1">${cell("tel. (h24):", c.tel)}</div><div class="c2">${cell("SITA:", c.sita)}</div></div>` +
    `<div class="crow"><div class="c1">${cell("e-mail:", c.email, "u")}</div><div class="c2">${cell("AFTN:", c.aftn)}</div></div>`;

  if (!airport.paxFacilities) missing.push("paxFacilities");

  return template
    .replace("{{HERO}}", heroUri ? `<img src="${heroUri}">` : `<div class="fallback"></div>`)
    .replace("{{BRAND_LOGO}}", logos.clearway ? `<img src="${logos.clearway}">` : "")
    .replace("{{COUNTRY}}", esc(airport.country || ""))
    .replace("{{AIRPORT_NAME}}", esc(airport.airportName || ""))
    .replace("{{CODES}}", esc([airport.icao, airport.iata].filter(Boolean).join(" / ")))
    .replace("{{INFO_ROWS}}", infoRows.join("\n      "))
    .replace("{{PAX_SUB}}", airport.paxFacilities ? `<div class="sub">${esc(airport.paxFacilities)}</div>` : "")
    .replace("{{PAX_PHOTO}}", paxUri ? `<img src="${paxUri}">` : "")
    .replace("{{CONTACT_ROWS}}", contactRows)
    .replace(
      "{{FOOTER_LOGOS}}",
      (logos.ebaa ? `<img class="ebaa" src="${logos.ebaa}">` : "") +
        (logos.nbaa ? `<img class="nbaa" src="${logos.nbaa}">` : "")
    );
}

// ── Deterministic PDF bytes ─────────────────────────────────────────────────
// Chromium stamps creation/mod dates and a derived doc ID; pin them so the
// same data always produces byte-identical output.
function normalizePdf(buf) {
  let s = buf.toString("latin1");
  s = s.replace(/\(D:\d{14}[^)]*\)/g, "(D:20260101000000+00'00')");
  s = s.replace(/\/ID \[<[0-9a-fA-F]+> <[0-9a-fA-F]+>\]/g, (m) => {
    const hex = "0".repeat((m.match(/<([0-9a-fA-F]+)>/)?.[1] || "").length);
    return `/ID [<${hex}> <${hex}>]`;
  });
  return Buffer.from(s, "latin1");
}

// ── Minimal store-mode ZIP (same writer as scripts/bulk-aip-fetch.mjs) ─────
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
async function writeZip(zipPath, files) {
  const out = createWriteStream(zipPath);
  const central = [];
  let offset = 0;
  const write = (b) => new Promise((res, rej) => out.write(b, (e) => (e ? rej(e) : res())));
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    await write(local); await write(nameBuf); await write(data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10); cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, nameBuf]));
    offset += 30 + nameBuf.length + data.length;
  }
  const cdStart = offset;
  for (const c of central) { await write(c); offset += c.length; }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(offset - cdStart, 12); end.writeUInt32LE(cdStart, 16);
  await write(end);
  await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
}

// ── Main ────────────────────────────────────────────────────────────────────
const template = await fs.readFile(path.join(SHEETS_DIR, "template.html"), "utf-8");
const logos = {
  clearway: await imageDataUri("logos/clearway.png"),
  ebaa: await imageDataUri("logos/ebaa.png"),
  nbaa: await imageDataUri("logos/nbaa.png"),
};
for (const [k, v] of Object.entries(logos)) if (!v) console.warn(`WARNING: shared logo missing: assets/logos/${k}.png`);

// --data accepts either a JSON array file or a folder of airports/<ICAO>/*.json
async function loadAirports(src) {
  if (!(await fs.stat(src)).isDirectory()) {
    const arr = JSON.parse(await fs.readFile(src, "utf-8"));
    if (!Array.isArray(arr)) throw new Error(`${src} must be a JSON array`);
    return arr;
  }
  const out = [];
  for (const entry of (await fs.readdir(src, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const files = entry.isDirectory()
      ? (await fs.readdir(path.join(src, entry.name))).filter((f) => f.endsWith(".json")).map((f) => path.join(src, entry.name, f))
      : entry.name.endsWith(".json") ? [path.join(src, entry.name)] : [];
    for (const f of files) out.push(JSON.parse(await fs.readFile(f, "utf-8")));
  }
  return out;
}
let airports = await loadAirports(DATA_FILE);
const skipped = [];
// Placeholder files that were never filled in produce no sheet.
airports = airports.filter((a) => {
  if (a.country || a.airportName) return true;
  skipped.push([a.icao || "(no icao)", "placeholder not filled in"]);
  return false;
});
if (ONLY && ONLY !== true) {
  const want = String(ONLY).toUpperCase().split(",").map((s) => s.trim()).filter(Boolean);
  const have = new Set(airports.map((a) => String(a.icao || "").toUpperCase()));
  for (const w of want) if (!have.has(w)) skipped.push([w, "not in data file"]);
  airports = airports.filter((a) => want.includes(String(a.icao || "").toUpperCase()));
}

await fs.mkdir(OUT_DIR, { recursive: true });
console.log(`Airport sheets: ${airports.length} airport(s) from ${path.relative(process.cwd(), DATA_FILE)} → ${OUT_DIR}`);

const browser = await chromium.launch();
const page = await browser.newPage();
const generated = [];
const withMissing = [];

try {
  let n = 0;
  for (const airport of airports) {
    n++;
    const icao = String(airport.icao || "").toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(icao)) {
      skipped.push([airport.icao || "(no icao)", "invalid ICAO"]);
      console.log(`[${n}/${airports.length}] ${airport.icao || "????"} … SKIPPED (invalid ICAO)`);
      continue;
    }
    const missing = [];
    const html = await buildHtml(template, logos, airport, missing);
    await page.setContent(html, { waitUntil: "load" });
    // Long country/airport names: shrink the title until it clears the info panel.
    await page.evaluate(() => {
      const t = document.querySelector(".titleblock");
      const h1 = t.querySelector("h1");
      let fs = 33;
      while (fs > 16 && t.getBoundingClientRect().bottom > 272) {
        fs -= 1;
        h1.style.fontSize = `${fs}px`;
        h1.style.lineHeight = `${Math.round(fs * 1.26)}px`;
      }
    });
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true });
    await fs.writeFile(path.join(OUT_DIR, `${icao}.pdf`), normalizePdf(pdf));
    generated.push(icao);
    if (missing.length) withMissing.push([icao, missing]);
    console.log(`[${n}/${airports.length}] ${icao} … ok${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
  }
} finally {
  await browser.close();
}

if (MAKE_ZIP && generated.length) {
  const zipPath = path.join(OUT_DIR, "airport-sheets.zip");
  const files = [];
  for (const icao of generated) files.push({ name: `${icao}.pdf`, data: await fs.readFile(path.join(OUT_DIR, `${icao}.pdf`)) });
  await writeZip(zipPath, files);
  console.log(`zip: ${zipPath} (${(files.reduce((s, f) => s + f.data.length, 0) / 1024 / 1024).toFixed(1)} MB)`);
}

console.log("\n── Summary ─────────────────────────────");
console.log(`generated ${generated.length}, skipped ${skipped.length}`);
for (const [icao, why] of skipped) console.log(`  SKIPPED ${icao}: ${why}`);
if (withMissing.length) {
  console.log("missing data/images:");
  for (const [icao, m] of withMissing) console.log(`  ${icao}: ${m.join(", ")}`);
} else {
  console.log("no airports with missing data or images");
}
