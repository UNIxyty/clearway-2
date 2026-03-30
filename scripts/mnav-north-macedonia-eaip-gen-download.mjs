/**
 * M-NAV North Macedonia eAIP — download Part 1 GEN PDFs (same files as menu tree leaves).
 * Fetches current/en/tree_items.js, extracts ../pdf/gen/LW_GEN_*.pdf entries, GETs each PDF.
 *
 * Usage:
 *   node scripts/mnav-north-macedonia-eaip-gen-download.mjs [--dry-run] [--only SUBSTR] [--insecure] [--strict-tls] [--root URL]
 *
 * Env: MNAV_EAIP_PACKAGE_ROOT (optional), MNAV_TLS_INSECURE, MNAV_TLS_STRICT
 * Default en/ root is resolved from Start.htm (current version link).
 *
 * Output: downloads/mnav-north-macedonia-eaip/GEN/*.pdf
 */

import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  FALLBACK_MNAV_EN_FRAME_ROOT,
  MNAV_START_URL,
  treeItemsUrl,
  parseMnavGenPdfEntriesFromTreeItems,
  pdfAbsoluteUrl,
  safePdfBasenameFromUrl,
  parseMnavTlsAndRoot,
  getMnavEnFrameRoot,
  createMnavFetch,
  makeMnavTlsOpts,
} from "./mnav-north-macedonia-eaip-http.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_DIR = join(PROJECT_ROOT, "downloads", "mnav-north-macedonia-eaip", "GEN");

const http = createMnavFetch("GEN");

function parseArgs(argv) {
  let dryRun = false;
  let onlySubstr = null;
  const { enFrameRoot, insecureTls, strictTls } = parseMnavTlsAndRoot(argv);
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--only" && argv[i + 1]) onlySubstr = argv[++i];
    else if (["--insecure", "--strict-tls", "--root"].includes(a)) {
      if (a === "--root" && argv[i + 1]) i++;
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/mnav-north-macedonia-eaip-gen-download.mjs [options]

Options:
  --dry-run           List URLs only; no download
  --only SUBSTR       Only PDFs whose path or label contains SUBSTR (case-insensitive)
  --root URL          Force English frame root (.../current/en). Default: resolve from ${MNAV_START_URL}
  --insecure          MNAV_TLS_INSECURE=1
  --strict-tls        MNAV_TLS_STRICT=1
  --help

Fallback if resolution fails: ${FALLBACK_MNAV_EN_FRAME_ROOT}

Env: MNAV_EAIP_PACKAGE_ROOT, MNAV_TLS_INSECURE, MNAV_TLS_STRICT`);
      process.exit(0);
    }
  }
  return { dryRun, onlySubstr, cliRoot: enFrameRoot, insecureTls, strictTls };
}

function log(step, msg) {
  console.error(`[M-NAV GEN ${step}] ${msg}`);
}

async function main() {
  const { dryRun, onlySubstr, cliRoot, insecureTls, strictTls } = parseArgs(process.argv);
  if (insecureTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    log("0/3", "TLS verification disabled (--insecure / MNAV_TLS_INSECURE=1)");
  }
  const tlsOpts = makeMnavTlsOpts(insecureTls, strictTls);
  const enRoot = await getMnavEnFrameRoot(http, tlsOpts, cliRoot);

  const treeUrl = treeItemsUrl(enRoot);
  log("1/3", `GET tree_items.js: ${treeUrl}`);
  const treeJs = await http.fetchText(treeUrl, "tree_items", tlsOpts);

  let entries = parseMnavGenPdfEntriesFromTreeItems(treeJs);
  if (onlySubstr) {
    const needle = onlySubstr.toLowerCase();
    entries = entries.filter((e) => e.rel.toLowerCase().includes(needle) || e.label.toLowerCase().includes(needle));
    if (entries.length === 0) {
      console.error(`No GEN PDF entries match --only ${JSON.stringify(onlySubstr)}`);
      process.exit(1);
    }
  }

  log("2/3", `${entries.length} GEN PDF(s) from tree`);
  mkdirSync(OUT_DIR, { recursive: true });

  for (const { label, rel } of entries) {
    const pdfUrl = pdfAbsoluteUrl(enRoot, rel);
    const outName = safePdfBasenameFromUrl(pdfUrl);
    const outFile = join(OUT_DIR, outName);
    log("3/3", `${label} → ${pdfUrl}`);
    if (!dryRun) await http.downloadPdfToFile(pdfUrl, outFile, outName, tlsOpts);
  }

  console.error(`Done. ${dryRun ? "[dry-run] no writes." : `PDFs → ${OUT_DIR}`}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
