/**
 * INAC Venezuela eAIP AD 2.1 (per-aerodrome) — same UX as the framed site:
 *   1) GET index frameset
 *   2) GET Menu-en-GB.html (navigate to Part 3 → AD_2 in the menu)
 *   3) Find SV-AD2.1{ICAO}-en-GB.html for the requested ICAO (or build and verify)
 *   4) GET HTML (eAISContent — as if user opened that aerodrome)
 *   5) GET PDF (toolbar “PDF” → /pdf/eAIP/AD2.1{ICAO}.pdf)
 *
 * Usage:
 *   node scripts/inac-venezuela-eaip-ad2-download.mjs --icao SVMC
 *   node scripts/inac-venezuela-eaip-ad2-download.mjs --icao svbc --dry-run
 *
 * Env: INAC_EAIP_PACKAGE_ROOT, INAC_TLS_INSECURE, INAC_TLS_STRICT
 *
 * Output: downloads/inac-venezuela-eaip/AD2/AD2.1_ICAO.pdf
 */

import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  DEFAULT_INAC_PACKAGE_ROOT,
  indexUrl,
  menuUrl,
  sectionHtmlUrl,
  sectionPdfUrl,
  htmlFileToPdfStem,
  safePdfFilename,
  parseTlsAndRoot,
  createInacFetch,
  makeTlsOpts,
} from "./inac-venezuela-eaip-http.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_DIR = join(PROJECT_ROOT, "downloads", "inac-venezuela-eaip", "AD2");

const http = createInacFetch("AD2");

/** @param {string} menuHtml */
function parseAd21HtmlHrefs(menuHtml) {
  const re = /href=["'](SV-AD2\.1[A-Z]{4}-en-GB\.html)["']/gi;
  const set = new Set();
  let m;
  while ((m = re.exec(menuHtml))) set.add(m[1]);
  return [...set].sort();
}

/** @param {string} icao */
function ad21HtmlFileForIcao(icao) {
  const x = icao.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(x)) throw new Error(`ICAO must be 4 letters, got: ${JSON.stringify(icao)}`);
  return `SV-AD2.1${x}-en-GB.html`;
}

function parseArgs(argv) {
  let dryRun = false;
  let icao = null;
  const { packageRoot, insecureTls, strictTls } = parseTlsAndRoot(argv);
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--icao" && argv[i + 1]) icao = argv[++i];
    else if (["--insecure", "--strict-tls", "--root"].includes(a)) {
      if (a === "--root" && argv[i + 1]) i++;
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/inac-venezuela-eaip-ad2-download.mjs --icao XXXX [options]

Required:
  --icao XXXX     Four-letter ICAO (e.g. SVMC, SVBC)

Options:
  --dry-run       Log URLs only; do not download PDF
  --root URL      Package root (default: ${DEFAULT_INAC_PACKAGE_ROOT})
  --insecure      Skip TLS from the start (INAC_TLS_INSECURE=1)
  --strict-tls    No auto TLS retry (INAC_TLS_STRICT=1)
  --help

Flow mirrors: open menu → AD_2 → pick aerodrome → PDF button.

Env: INAC_EAIP_PACKAGE_ROOT, INAC_TLS_INSECURE, INAC_TLS_STRICT`);
      process.exit(0);
    }
  }
  return { dryRun, icao, packageRoot, insecureTls, strictTls };
}

function log(step, msg) {
  console.error(`[INAC AD2 ${step}] ${msg}`);
}

async function main() {
  const { dryRun, icao: icaoArg, packageRoot, insecureTls, strictTls } = parseArgs(process.argv);
  if (!icaoArg) {
    console.error("Missing --icao XXXX (four-letter ICAO). Example: --icao SVMC");
    process.exit(1);
  }

  const icao = icaoArg.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(icao)) {
    console.error("ICAO must be 4 letters.");
    process.exit(1);
  }

  if (insecureTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    log("0/5", "TLS verification disabled (--insecure or INAC_TLS_INSECURE=1)");
  }
  const tlsOpts = makeTlsOpts(insecureTls, strictTls);

  log("1/5", `GET index frameset: ${indexUrl(packageRoot)}`);
  await http.fetchText(indexUrl(packageRoot), "index", tlsOpts);

  log("2/5", `GET AIP menu (Part 3 contains AD_2): ${menuUrl(packageRoot)}`);
  const menuHtml = await http.fetchText(menuUrl(packageRoot), "menu", tlsOpts);

  const knownHrefs = parseAd21HtmlHrefs(menuHtml);
  const htmlFile = ad21HtmlFileForIcao(icao);
  if (!knownHrefs.includes(htmlFile)) {
    const inMenu = knownHrefs.filter((h) => h.includes(icao)).slice(0, 5);
    console.error(
      `ICAO ${icao} not found under AD_2 in menu (no ${htmlFile}).` +
        (inMenu.length ? ` Similar: ${inMenu.join(", ")}` : ` Listed AD2.1 count: ${knownHrefs.length}.`),
    );
    process.exit(1);
  }

  const stem = htmlFileToPdfStem(htmlFile);
  const htmlU = sectionHtmlUrl(packageRoot, htmlFile);
  const pdfU = sectionPdfUrl(packageRoot, stem);
  const outFile = join(OUT_DIR, safePdfFilename(stem));

  log("3/5", `Resolved AD_2 → ${htmlFile} (PDF stem: ${stem})`);
  log("4/5", `GET HTML (content frame): ${htmlU}`);
  if (!dryRun) await http.fetchOk(htmlU, `HTML ${icao}`, tlsOpts);

  log("5/5", `GET PDF (toolbar PDF): ${pdfU} → ${outFile}`);
  if (!dryRun) {
    mkdirSync(OUT_DIR, { recursive: true });
    await http.downloadPdfToFile(pdfU, outFile, `PDF ${icao}`, tlsOpts);
  }

  console.error(`Done. ${dryRun ? "[dry-run] no PDF written." : `PDF → ${outFile}`}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
