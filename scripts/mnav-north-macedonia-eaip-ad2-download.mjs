/**
 * M-NAV North Macedonia eAIP — AD 2 Textpages PDF per aerodrome (tree_items.js).
 *
 * Usage:
 *   node scripts/mnav-north-macedonia-eaip-ad2-download.mjs --icao LWSK
 *   node scripts/mnav-north-macedonia-eaip-ad2-download.mjs   # TTY: ICAO list prompt
 *
 * Env: MNAV_EAIP_PACKAGE_ROOT, MNAV_TLS_INSECURE, MNAV_TLS_STRICT
 *
 * Output: downloads/mnav-north-macedonia-eaip/AD2/LW_AD_2_ICAO_en.pdf
 */

import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import readline from "node:readline/promises";
import { stdin as input, stderr } from "node:process";
import {
  FALLBACK_MNAV_EN_FRAME_ROOT,
  MNAV_START_URL,
  treeItemsUrl,
  parseMnavAd2IcaosFromTreeItems,
  pdfAbsoluteUrl,
  mnavAd2TextpagesRel,
  safePdfBasenameFromUrl,
  parseMnavTlsAndRoot,
  getMnavEnFrameRoot,
  createMnavFetch,
  makeMnavTlsOpts,
} from "./mnav-north-macedonia-eaip-http.mjs";
import { promptPickMnavAd2Icao } from "./mnav-north-macedonia-eaip-prompts.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_DIR = join(PROJECT_ROOT, "downloads", "mnav-north-macedonia-eaip", "AD2");

const http = createMnavFetch("AD2");

function parseArgs(argv) {
  let dryRun = false;
  let icao = null;
  const { enFrameRoot, insecureTls, strictTls } = parseMnavTlsAndRoot(argv);
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--icao" && argv[i + 1]) icao = argv[++i];
    else if (["--insecure", "--strict-tls", "--root"].includes(a)) {
      if (a === "--root" && argv[i + 1]) i++;
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/mnav-north-macedonia-eaip-ad2-download.mjs [--icao XXXX] [options]

  --icao XXXX     Four-letter ICAO (optional in TTY — list prompt)

Options:
  --dry-run       Log URL only; no download
  --root URL      Force .../current/en (default: resolve from ${MNAV_START_URL})
  --insecure      MNAV_TLS_INSECURE=1
  --strict-tls    MNAV_TLS_STRICT=1
  --help

Flow mirrors: AD 2 Aerodromes → ICAO → Textpages.

Fallback: ${FALLBACK_MNAV_EN_FRAME_ROOT}

Env: MNAV_EAIP_PACKAGE_ROOT, MNAV_TLS_INSECURE, MNAV_TLS_STRICT`);
      process.exit(0);
    }
  }
  return { dryRun, icao, cliRoot: enFrameRoot, insecureTls, strictTls };
}

function log(step, msg) {
  console.error(`[M-NAV AD2 ${step}] ${msg}`);
}

async function main() {
  const { dryRun, icao: icaoArg, cliRoot, insecureTls, strictTls } = parseArgs(process.argv);

  if (insecureTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    log("0/3", "TLS verification disabled (--insecure / MNAV_TLS_INSECURE=1)");
  }
  const tlsOpts = makeMnavTlsOpts(insecureTls, strictTls);
  const enRoot = await getMnavEnFrameRoot(http, tlsOpts, cliRoot);

  const treeUrl = treeItemsUrl(enRoot);
  log("1/3", `GET tree_items.js: ${treeUrl}`);
  const treeJs = await http.fetchText(treeUrl, "tree_items", tlsOpts);
  const known = parseMnavAd2IcaosFromTreeItems(treeJs);

  let icao = icaoArg?.trim().toUpperCase() ?? "";
  if (!icao || !/^[A-Z]{4}$/.test(icao)) {
    if (!icaoArg && input.isTTY) {
      const rl = readline.createInterface({ input, output: stderr, terminal: true });
      try {
        icao = await promptPickMnavAd2Icao(rl, known);
      } finally {
        rl.close();
      }
    } else {
      console.error("Missing or invalid ICAO. Use: --icao LWSK  (or run in a terminal for prompts)");
      process.exit(1);
    }
  }

  if (!known.includes(icao)) {
    console.error(`ICAO ${icao} has no LW_AD_2_${icao}_en.pdf in this tree_items.js. Known: ${known.join(", ")}`);
    process.exit(1);
  }

  const rel = mnavAd2TextpagesRel(icao);
  const pdfUrl = pdfAbsoluteUrl(enRoot, rel);
  const outFile = join(OUT_DIR, safePdfBasenameFromUrl(pdfUrl));

  log("2/3", `Textpages: ${pdfUrl}`);
  if (!dryRun) {
    mkdirSync(OUT_DIR, { recursive: true });
    log("3/3", `→ ${outFile}`);
    await http.downloadPdfToFile(pdfUrl, outFile, `AD2 ${icao}`, tlsOpts);
  }

  console.error(`Done. ${dryRun ? "[dry-run] no PDF written." : `PDF → ${outFile}`}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
