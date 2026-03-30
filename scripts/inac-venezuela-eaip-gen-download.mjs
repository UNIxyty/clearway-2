/**
 * Imitates the INAC Venezuela eAIP GEN flow (see docs/inac-venezuela-eaip-gen-navigation.md):
 *   1) Open index frameset (optional sanity GET)
 *   2) Load AIP menu (same as frame eAISNavigation → Menu-en-GB.html)
 *   3) Discover GEN section HTML hrefs inside Part 1 (SV-GEN … -en-GB.html)
 *   4) For each section: GET HTML (as if loaded in eAISContent)
 *   5) GET PDF — same URL the toolbar "PDF" button sets ( /html → /pdf, stem.pdf )
 *
 * Usage:
 *   node scripts/inac-venezuela-eaip-gen-download.mjs [--dry-run] [--only STEM] [--insecure] [--strict-tls]
 *   node scripts/inac-venezuela-eaip-gen-download.mjs --only "GEN 1.2"
 *
 * TLS: www.inac.gob.ve often fails Node's default certificate verification. By default this script
 * retries with relaxed verification after the first TLS error. To force verification (fail fast):
 *   --strict-tls   or env INAC_TLS_STRICT=1
 * To skip verification from the start (no failed attempt):
 *   --insecure     or env INAC_TLS_INSECURE=1
 *
 * Env:
 *   INAC_EAIP_PACKAGE_ROOT  Base URL without trailing slash (default: current published tree)
 *   INAC_TLS_INSECURE=1     Same as --insecure
 *   INAC_TLS_STRICT=1       Do not auto-retry with relaxed TLS
 *
 * Output:
 *   downloads/inac-venezuela-eaip/GEN/<stem safe>.pdf
 */

import { mkdirSync, createWriteStream } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

const DEFAULT_ROOT = "https://www.inac.gob.ve/eaip/2020-07-16";
const OUT_DIR = join(PROJECT_ROOT, "downloads", "inac-venezuela-eaip", "GEN");

/** @param {string} packageRoot */
function indexUrl(packageRoot) {
  return `${packageRoot}/html/index-en-GB.html`;
}

/** @param {string} packageRoot */
function menuUrl(packageRoot) {
  return `${packageRoot}/html/eAIP/Menu-en-GB.html`;
}

/** @param {string} packageRoot @param {string} htmlFile e.g. SV-GEN 1.2-en-GB.html */
function sectionHtmlUrl(packageRoot, htmlFile) {
  return `${packageRoot}/html/eAIP/${encodeURIComponent(htmlFile)}`;
}

/**
 * @param {string} htmlFile e.g. SV-GEN 1.2-en-GB.html
 * @returns {string} stem e.g. GEN 1.2
 */
function htmlFileToPdfStem(htmlFile) {
  const m = htmlFile.match(/^([A-Z]{2})-(.+)-en-GB\.html$/i);
  if (!m) throw new Error(`Unexpected INAC GEN HTML filename: ${htmlFile}`);
  return m[2];
}

/** @param {string} packageRoot @param {string} stem */
function sectionPdfUrl(packageRoot, stem) {
  return `${packageRoot}/pdf/eAIP/${encodeURIComponent(stem)}.pdf`;
}

/** @param {string} menuHtml */
function parseGenHtmlHrefs(menuHtml) {
  const re = /href=["'](SV-GEN[^"']+-en-GB\.html)["']/gi;
  const set = new Set();
  let m;
  while ((m = re.exec(menuHtml))) set.add(m[1]);
  return [...set].sort();
}

/** @param {string} stem */
function safePdfFilename(stem) {
  return stem.replace(/\s+/g, "_").replace(/[/\\?%*:|"<>]/g, "-") + ".pdf";
}

function parseArgs(argv) {
  let dryRun = false;
  let onlyStem = null;
  let insecureTls = process.env.INAC_TLS_INSECURE === "1";
  let strictTls = process.env.INAC_TLS_STRICT === "1";
  let packageRoot = process.env.INAC_EAIP_PACKAGE_ROOT || DEFAULT_ROOT;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--insecure") insecureTls = true;
    else if (a === "--strict-tls") strictTls = true;
    else if (a === "--only" && argv[i + 1]) {
      onlyStem = argv[++i];
    } else if (a === "--root" && argv[i + 1]) {
      packageRoot = argv[++i].replace(/\/$/, "");
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/inac-venezuela-eaip-gen-download.mjs [options]

Options:
  --dry-run       List steps and URLs without downloading
  --only STEM     Single section stem, e.g. "GEN 1.2" (must match PDF stem)
  --root URL      INAC package root (default: ${DEFAULT_ROOT})
  --insecure      Skip TLS verification from the start (or set INAC_TLS_INSECURE=1)
  --strict-tls    Fail on TLS errors; do not auto-retry (or INAC_TLS_STRICT=1)
  --help          This help

Env: INAC_EAIP_PACKAGE_ROOT, INAC_TLS_INSECURE, INAC_TLS_STRICT`);
      process.exit(0);
    }
  }
  return { dryRun, onlyStem, packageRoot, insecureTls, strictTls };
}

/** @param {unknown} err */
function isTlsVerifyError(err) {
  const c = /** @type {{ code?: string; message?: string }} */ (err)?.cause;
  const msg = `${c?.message ?? ""} ${/** @type {Error} */ (err)?.message ?? ""}`;
  return (
    c?.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    c?.code === "CERT_HAS_EXPIRED" ||
    /unable to verify the first certificate/i.test(msg)
  );
}

let tlsRelaxedLogged = false;

function relaxTlsEnvironment() {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") return;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  if (!tlsRelaxedLogged) {
    tlsRelaxedLogged = true;
    console.error(
      "[INAC GEN] TLS: certificate verification failed (common for inac.gob.ve). Retrying with relaxed TLS. " +
        "Use --strict-tls or INAC_TLS_STRICT=1 to disable, or INAC_TLS_INSECURE=1 to skip verification from the start.",
    );
  }
}

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {{ strictTls: boolean }} opts
 */
async function fetchInac(url, init = {}, opts) {
  const { strictTls } = opts;
  const merged = { redirect: "follow", ...init };
  try {
    return await fetch(url, merged);
  } catch (err) {
    if (!strictTls && isTlsVerifyError(err)) {
      relaxTlsEnvironment();
      return await fetch(url, merged);
    }
    if (strictTls && isTlsVerifyError(err)) {
      console.error(
        "\nTLS verification failed. Try one of:\n" +
          "  node scripts/inac-venezuela-eaip-gen-download.mjs --insecure --only \"GEN 1.2\"\n" +
          "  INAC_TLS_INSECURE=1 node scripts/inac-venezuela-eaip-gen-download.mjs --only \"GEN 1.2\"\n" +
          "Or unset INAC_TLS_STRICT if set.\n",
      );
    }
    throw err;
  }
}

/** @param {{ strictTls: boolean }} tlsOpts */
async function fetchText(url, label, tlsOpts) {
  const res = await fetchInac(url, {}, tlsOpts);
  if (!res.ok) throw new Error(`${label}: ${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

/** @param {{ strictTls: boolean }} tlsOpts */
async function fetchOk(url, label, tlsOpts) {
  const res = await fetchInac(url, { method: "GET" }, tlsOpts);
  if (!res.ok) throw new Error(`${label}: ${res.status} ${res.statusText} — ${url}`);
  return res;
}

/** @param {{ strictTls: boolean }} tlsOpts */
async function downloadPdfToFile(pdfUrl, filePath, label, tlsOpts) {
  const res = await fetchInac(pdfUrl, {}, tlsOpts);
  if (!res.ok) throw new Error(`${label}: ${res.status} ${res.statusText} — ${pdfUrl}`);
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("pdf") && !ct.includes("octet-stream")) {
    console.warn(`[warn] ${label}: unexpected Content-Type: ${ct}`);
  }
  mkdirSync(dirname(filePath), { recursive: true });
  const body = Readable.fromWeb(/** @type {import('stream/web').ReadableStream} */ (res.body));
  await pipeline(body, createWriteStream(filePath));
}

function log(step, msg) {
  console.error(`[INAC GEN ${step}] ${msg}`);
}

async function main() {
  const { dryRun, onlyStem, packageRoot, insecureTls, strictTls } = parseArgs(process.argv);
  if (insecureTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    log("0/5", "TLS verification disabled (--insecure or INAC_TLS_INSECURE=1)");
  }
  const tlsOpts = { strictTls: strictTls && !insecureTls };

  log("1/5", `GET index frameset (eAIS shell): ${indexUrl(packageRoot)}`);
  await fetchText(indexUrl(packageRoot), "index", tlsOpts);

  log("2/5", `GET AIP menu (frame eAISNavigation): ${menuUrl(packageRoot)}`);
  const menuHtml = await fetchText(menuUrl(packageRoot), "menu", tlsOpts);
  let hrefs = parseGenHtmlHrefs(menuHtml);

  if (onlyStem) {
    hrefs = hrefs.filter((h) => htmlFileToPdfStem(h) === onlyStem);
    if (hrefs.length === 0) {
      console.error(`No menu href with PDF stem equal to: ${JSON.stringify(onlyStem)}`);
      process.exit(1);
    }
  }

  log("3/5", `Parsed ${hrefs.length} GEN HTML href(s) from menu (SV-GEN … -en-GB.html)`);

  mkdirSync(OUT_DIR, { recursive: true });

  for (const htmlFile of hrefs) {
    const stem = htmlFileToPdfStem(htmlFile);
    const htmlU = sectionHtmlUrl(packageRoot, htmlFile);
    const pdfU = sectionPdfUrl(packageRoot, stem);
    const outFile = join(OUT_DIR, safePdfFilename(stem));

    log("4/5", `Section "${stem}": GET HTML (content frame): ${htmlU}`);
    if (!dryRun) await fetchOk(htmlU, `HTML ${stem}`, tlsOpts);

    log("5/5", `Section "${stem}": GET PDF (toolbar PDF): ${pdfU} → ${outFile}`);
    if (!dryRun) await downloadPdfToFile(pdfU, outFile, `PDF ${stem}`, tlsOpts);
  }

  console.error(`Done. ${dryRun ? "[dry-run] skipped HTML/PDF per-section GETs and file writes." : `PDFs → ${OUT_DIR}`}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
