#!/usr/bin/env node
// Bulk AIP fetch: pulls the AIP PDF for a list of airports THROUGH OUR OWN
// PORTAL (never EAD/sources directly), zips them, and emails the result.
//
//   node scripts/bulk-aip-fetch.mjs --to you@example.com \
//     [--list airports.txt] [--icaos "EVRA,EETN,UAAA"] [--sample 5] \
//     [--delay 3000] [--force] \
//     [--base http://localhost:3000] [--workdir /mnt/ssd-cache/bulk-aip] \
//     [--cookie "<session cookie>"]   (testing off-server; default auth is
//                                      the x-debug-runner-secret header)
//
// Reuses the portal's own retrieval exactly as digital-wall/lib/
// portal-client.mjs does: GET /api/aip/resolve → cached ? /files/<key>
// : /api/aip/<source>/pdf. Sequential with a delay (be gentle — several
// sources rate-limit), generous per-airport timeout (EAD can take tens of
// seconds), each airport individually wrapped so one failure never kills
// the run. Re-runnable: existing PDFs are skipped unless --force.
// Everything (PDFs + zip) lives under the workdir on /mnt/ssd-cache — NOT
// the constrained root volume; loose PDFs are removed after zipping.
// Email: attach when the zip is under the attachment threshold, otherwise
// email the zip's server path (no splitting — simpler and robust).

import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendEmail, mailerConfigured } from "../digital-wall/lib/mailer.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The server keeps secrets in env FILES consumed by the containers — a bare
// shell doesn't have them exported. Load what we need from digital-wall/.env
// (secret + Resend) and the repo .env as fallback, without overriding
// anything already exported.
const ENV_KEYS = [
  "PORTAL_INTERNAL_SECRET",
  "DEBUG_RUNNER_INTERNAL_SECRET",
  "RESEND_API_KEY",
  "RESEND_BASE_URL",
  "DIGITAL_WALL_EMAIL_FROM",
];
for (const file of [path.join(__dirname, "../digital-wall/.env"), path.join(__dirname, "../.env")]) {
  try {
    const raw = await fs.readFile(file, "utf-8");
    for (const line of raw.split("\n")) {
      const eq = line.indexOf("=");
      if (eq < 1 || line.trimStart().startsWith("#")) continue;
      const key = line.slice(0, eq).trim();
      if (!ENV_KEYS.includes(key) || process.env[key]) continue;
      process.env[key] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* file absent (dev machine) — fine */
  }
}

// ── Defaults (edit the list here, or pass --list file with one ICAO/line) ──
const DEFAULT_LIST = `
LUKK LRBS LRSV LROP LRTR LRCK
LYBE LYNI LYTV LYPG
LBSF LBBG LBWN LBPD
LWSK LATI LQSA
LDSP LDZD LDZA LJLJ
LZIB LZKZ LHBP LHDC
EPWA EPMO EPKK EPKT EPGD EPRZ
EYVI EYKA EYSA EYPA
EVRA EVLA EVVA
EETN EEKE EEPU EETU
EFHK EFRO EFKT EFPO EFTU EFTP
ESSA ESSB
ENGM ENTO ENBR ENVA ENZV ENCN ENHD ENBG ENAL ENKB ENBO ENDU ENTC
EKCH EKBI EKOD
UGTB UGSB UGKO
UDYZ
UBBB UBBQ UBBG
UTAK UTAA
UZTP UZTT UZSS
UTDD
UCFM UCFK UCFL UCFO
UAAA UATT UAII UADD UAKD UATG UAKK UACK UAUU UAOO UACC UACP UASS UASP UATE UASZ UAAT UASK UARR UAAL UASU
`;

const ATTACH_LIMIT_BYTES = 20 * 1024 * 1024; // Resend-safe attachment ceiling
const PER_AIRPORT_TIMEOUT_MS = 120_000; // EAD cache-misses can take tens of seconds

// ── Args ────────────────────────────────────────────────────────────────────
function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}
const TO = arg("to");
const LIST_FILE = arg("list");
const ICAOS = arg("icaos"); // inline sample: --icaos "EVRA,EETN UAAA"
const SAMPLE = Number(arg("sample", 0)); // random N from the list
const DELAY_MS = Number(arg("delay", 3000));
const FORCE = process.argv.includes("--force");
const BASE = String(arg("base", "http://localhost:3000")).replace(/\/+$/, "");
const WORKDIR = String(arg("workdir", "/mnt/ssd-cache/bulk-aip"));
const COOKIE = arg("cookie"); // testing off-server; normal auth is the header

if (!TO || TO === true) {
  console.error("Usage: node scripts/bulk-aip-fetch.mjs --to you@example.com [--list f] [--delay ms] [--force]");
  process.exit(2);
}

function authHeaders() {
  if (COOKIE && COOKIE !== true) return { cookie: COOKIE };
  const secret = (process.env.PORTAL_INTERNAL_SECRET || process.env.DEBUG_RUNNER_INTERNAL_SECRET || "").trim();
  if (!secret) {
    console.error("No PORTAL_INTERNAL_SECRET / DEBUG_RUNNER_INTERNAL_SECRET in env (and no --cookie). Aborting.");
    process.exit(2);
  }
  return { "x-debug-runner-secret": secret };
}

async function loadList() {
  // Precedence: --icaos (inline codes, comma/space separated) beats --list
  // (file, one or more per line) beats the built-in default list.
  const raw =
    ICAOS && ICAOS !== true
      ? String(ICAOS).replace(/,/g, " ")
      : LIST_FILE && LIST_FILE !== true
        ? await fs.readFile(LIST_FILE, "utf-8")
        : DEFAULT_LIST;
  const seen = new Set();
  const out = [];
  for (const tok of raw.split(/\s+/)) {
    const code = tok.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code) || seen.has(code)) continue; // de-dupes ENVA etc.
    seen.add(code);
    out.push(code);
  }
  // --sample N: a random draw, so repeated smoke runs cover different
  // airports instead of always hammering the same first few.
  if (Number.isFinite(SAMPLE) && SAMPLE > 0 && SAMPLE < out.length) {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out.slice(0, SAMPLE).sort();
  }
  return out;
}

function timedFetch(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_AIRPORT_TIMEOUT_MS);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** One airport: resolve → pdf (exactly the portal-client pattern). */
async function fetchOne(icao, headers) {
  const rRes = await timedFetch(`${BASE}/api/aip/resolve?icao=${icao}`, { headers });
  if (rRes.status === 404) return { ok: false, reason: "not in airports dataset (resolve 404 — coverage gap)" };
  if (!rRes.ok) return { ok: false, reason: `resolve HTTP ${rRes.status}` };
  const resolved = await rRes.json();
  const source = resolved.source || "unknown";
  const pdfPath = resolved.cached && resolved.filesPath ? resolved.filesPath : resolved.pdfPath ? `${resolved.pdfPath}&inline=1` : null;
  if (!pdfPath) return { ok: false, source, reason: "resolve returned no PDF path (no AIP published for this airport)" };

  const pRes = await timedFetch(`${BASE}${pdfPath}`, { headers });
  const type = pRes.headers.get("content-type") || "";
  if (!pRes.ok) {
    // Collapse error bodies to one clean line — sources return whole HTML
    // pages (Cloudflare etc.) that would wreck the manifest formatting.
    const body = (await pRes.text().catch(() => ""))
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
    return { ok: false, source, reason: `pdf HTTP ${pRes.status}${body ? `: ${body}` : type ? ` (${type})` : ""}` };
  }
  if (!type.includes("pdf")) {
    // Captcha/noVNC countries and some sources answer 200 with an HTML page —
    // that is a skip, not a bug (manual-interaction flow, do not automate).
    return { ok: false, source, reason: `non-PDF response (${type.split(";")[0] || "unknown"}) — likely captcha/manual flow` };
  }
  const buf = Buffer.from(await pRes.arrayBuffer());
  if (buf.length < 1024) return { ok: false, source, reason: `suspicious tiny response (${buf.length} B)` };
  return { ok: true, source, buf };
}

// ── Minimal store-mode ZIP (no deps; PDFs are already compressed) ───────────
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

const headers = authHeaders();
const list = await loadList();
const pdfDir = path.join(WORKDIR, "pdfs");
await fs.mkdir(pdfDir, { recursive: true });
console.log(`Bulk AIP fetch: ${list.length} airports via ${BASE} → ${WORKDIR} (delay ${DELAY_MS}ms${FORCE ? ", force" : ""})`);

const manifest = []; // { icao, status, source, bytes, reason }
for (let i = 0; i < list.length; i++) {
  const icao = list[i];
  const tag = `[${i + 1}/${list.length}] ${icao}`;
  const dest = path.join(pdfDir, `${icao}.pdf`);
  try {
    if (!FORCE) {
      const st = await fs.stat(dest).catch(() => null);
      if (st && st.size > 1024) {
        manifest.push({ icao, status: "ok", source: "(already downloaded)", bytes: st.size, reason: "" });
        console.log(`${tag} … skipped (already have ${mb(st.size)}; --force to refetch)`);
        continue;
      }
    }
    const r = await fetchOne(icao, headers);
    if (r.ok) {
      await fs.writeFile(dest, r.buf);
      manifest.push({ icao, status: "ok", source: r.source, bytes: r.buf.length, reason: "" });
      console.log(`${tag} … ok (${r.source}), ${mb(r.buf.length)}`);
    } else {
      manifest.push({ icao, status: "failed", source: r.source || "", bytes: 0, reason: r.reason });
      console.log(`${tag} … FAILED — ${r.reason}`);
    }
  } catch (e) {
    const reason = e?.name === "AbortError" ? `timeout after ${PER_AIRPORT_TIMEOUT_MS / 1000}s` : e?.message || String(e);
    manifest.push({ icao, status: "failed", source: "", bytes: 0, reason });
    console.log(`${tag} … FAILED — ${reason}`);
  }
  if (i < list.length - 1) await sleep(DELAY_MS);
}

// ── Zip (PDFs + manifest), clean loose PDFs ────────────────────────────────
const stamp = new Date().toISOString().slice(0, 10);
const zipPath = path.join(WORKDIR, `aip-bundle-${stamp}.zip`);
// Manifest ships as markdown: one line per requested airport, done/errored
// at a glance, with source + size on success and the real reason on failure.
const okCount = manifest.filter((m) => m.status === "ok").length;
const manifestMd = [
  `# AIP bundle — ${stamp}`,
  "",
  `${okCount}/${manifest.length} airports fetched through the Clearway portal.`,
  "",
  ...manifest.map((m) =>
    m.status === "ok"
      ? `- [x] **${m.icao}** — done (${m.source}, ${(m.bytes / 1024 / 1024).toFixed(1)} MB)`
      : `- [ ] **${m.icao}** — ERRORED: ${m.reason}`
  ),
  "",
].join("\n");
const zipFiles = [];
for (const m of manifest) {
  if (m.status !== "ok") continue;
  zipFiles.push({ name: `${m.icao}.pdf`, data: await fs.readFile(path.join(pdfDir, `${m.icao}.pdf`)) });
}
zipFiles.push({ name: "manifest.md", data: Buffer.from(manifestMd) });
await writeZip(zipPath, zipFiles);
const zipSize = (await fs.stat(zipPath)).size;
for (const m of manifest) if (m.status === "ok") await fs.rm(path.join(pdfDir, `${m.icao}.pdf`), { force: true });

// ── Summary ────────────────────────────────────────────────────────────────
const ok = manifest.filter((m) => m.status === "ok");
const failed = manifest.filter((m) => m.status !== "ok");
console.log(`\n── Summary ─────────────────────────────`);
console.log(`ok ${ok.length}/${manifest.length}, failed ${failed.length} · zip ${mb(zipSize)} → ${zipPath}`);
for (const m of failed) console.log(`  FAILED ${m.icao}${m.source ? ` (${m.source})` : ""}: ${m.reason}`);

// ── Email: attach under the limit, otherwise send the path ─────────────────
const summaryHtml = `
  <p>Bulk AIP fetch: <strong>${ok.length}/${manifest.length}</strong> airports fetched, zip ${mb(zipSize)}.</p>
  ${failed.length ? `<p>Failed:</p><ul>${failed.map((m) => `<li><code>${m.icao}</code> — ${m.reason}</li>`).join("")}</ul>` : ""}
  ${zipSize > ATTACH_LIMIT_BYTES ? `<p>The zip exceeds the ${mb(ATTACH_LIMIT_BYTES)} attachment limit, so it was NOT attached. It is saved on the server at:<br><code>${zipPath}</code></p>` : ""}
  <p>Full per-airport details are in manifest.md inside the zip.</p>`;
if (!mailerConfigured()) {
  console.log(`\nRESEND_API_KEY not configured — no email sent. Zip is at: ${zipPath}`);
} else {
  const attachments = zipSize <= ATTACH_LIMIT_BYTES
    ? [{ filename: path.basename(zipPath), content: await fs.readFile(zipPath) }]
    : undefined;
  await sendEmail({
    to: TO,
    subject: `AIP bundle: ${ok.length}/${manifest.length} airports (${mb(zipSize)})`,
    html: summaryHtml,
    attachments,
  });
  console.log(`\nEmailed ${TO}: ${attachments ? "zip attached" : `path only (zip over ${mb(ATTACH_LIMIT_BYTES)})`}.`);
}
