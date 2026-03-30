/**
 * Imitates the INAC Venezuela eAIP GEN flow (see docs/inac-venezuela-eaip-gen-navigation.md):
 *   1) Open index frameset
 *   2) Load AIP menu (Menu-en-GB.html)
 *   3) Discover GEN section HTML hrefs (SV-GEN … -en-GB.html)
 *   4) For each: GET HTML (eAISContent) then GET PDF (toolbar PDF)
 *
 * Usage:
 *   node scripts/inac-venezuela-eaip-interactive.mjs   # prompts: GEN vs AD 2.1
 *   node scripts/inac-venezuela-eaip-gen-download.mjs [--dry-run] [--only STEM] [--insecure] [--strict-tls]
 *
 * Env: INAC_EAIP_PACKAGE_ROOT, INAC_TLS_INSECURE, INAC_TLS_STRICT
 *
 * Output: downloads/inac-venezuela-eaip/GEN/<stem>.pdf
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
  parseGenHtmlHrefs,
  parseTlsAndRoot,
  createInacFetch,
  makeTlsOpts,
} from "./inac-venezuela-eaip-http.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_DIR = join(PROJECT_ROOT, "downloads", "inac-venezuela-eaip", "GEN");

const http = createInacFetch("GEN");

function parseArgs(argv) {
  let dryRun = false;
  let onlyStem = null;
  const { packageRoot, insecureTls, strictTls } = parseTlsAndRoot(argv);
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--only" && argv[i + 1]) onlyStem = argv[++i];
    else if (["--insecure", "--strict-tls", "--root"].includes(a)) {
      if (a === "--root" && argv[i + 1]) i++;
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/inac-venezuela-eaip-gen-download.mjs [options]

Options:
  --dry-run       List steps and URLs without downloading
  --only STEM     Single section stem, e.g. "GEN 1.2"
  --root URL      Package root (default: ${DEFAULT_INAC_PACKAGE_ROOT})
  --insecure      Skip TLS verification from the start (or INAC_TLS_INSECURE=1)
  --strict-tls    Fail on TLS errors; no auto-retry (INAC_TLS_STRICT=1)
  --help

Env: INAC_EAIP_PACKAGE_ROOT, INAC_TLS_INSECURE, INAC_TLS_STRICT`);
      process.exit(0);
    }
  }
  return { dryRun, onlyStem, packageRoot, insecureTls, strictTls };
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
  const tlsOpts = makeTlsOpts(insecureTls, strictTls);

  log("1/5", `GET index frameset: ${indexUrl(packageRoot)}`);
  await http.fetchText(indexUrl(packageRoot), "index", tlsOpts);

  log("2/5", `GET AIP menu: ${menuUrl(packageRoot)}`);
  const menuHtml = await http.fetchText(menuUrl(packageRoot), "menu", tlsOpts);
  let hrefs = parseGenHtmlHrefs(menuHtml);

  if (onlyStem) {
    hrefs = hrefs.filter((h) => htmlFileToPdfStem(h) === onlyStem);
    if (hrefs.length === 0) {
      console.error(`No menu href with PDF stem equal to: ${JSON.stringify(onlyStem)}`);
      process.exit(1);
    }
  }

  log("3/5", `Parsed ${hrefs.length} GEN HTML href(s)`);

  mkdirSync(OUT_DIR, { recursive: true });

  for (const htmlFile of hrefs) {
    const stem = htmlFileToPdfStem(htmlFile);
    const htmlU = sectionHtmlUrl(packageRoot, htmlFile);
    const pdfU = sectionPdfUrl(packageRoot, stem);
    const outFile = join(OUT_DIR, safePdfFilename(stem));

    log("4/5", `Section "${stem}": GET HTML: ${htmlU}`);
    if (!dryRun) await http.fetchOk(htmlU, `HTML ${stem}`, tlsOpts);

    log("5/5", `Section "${stem}": GET PDF: ${pdfU} → ${outFile}`);
    if (!dryRun) await http.downloadPdfToFile(pdfU, outFile, `PDF ${stem}`, tlsOpts);
  }

  console.error(`Done. ${dryRun ? "[dry-run] no writes." : `PDFs → ${OUT_DIR}`}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
