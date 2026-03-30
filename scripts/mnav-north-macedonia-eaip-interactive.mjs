/**
 * Interactive M-NAV North Macedonia eAIP downloader.
 * Prompts: GEN (Part 1) vs AD 2 Textpages, then sections or ICAO list.
 *
 * Usage:
 *   node scripts/mnav-north-macedonia-eaip-interactive.mjs
 *   node scripts/mnav-north-macedonia-eaip-interactive.mjs --insecure --root "https://ais.m-nav.info/eAIP/current/en"
 *
 * Env: MNAV_EAIP_PACKAGE_ROOT, MNAV_TLS_INSECURE, MNAV_TLS_STRICT
 */

import readline from "node:readline/promises";
import { stdin as input, stderr } from "node:process";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  FALLBACK_MNAV_EN_FRAME_ROOT,
  MNAV_START_URL,
  treeItemsUrl,
  parseMnavGenPdfEntriesFromTreeItems,
  parseMnavAd2IcaosFromTreeItems,
  pdfAbsoluteUrl,
  mnavAd2TextpagesRel,
  safePdfBasenameFromUrl,
  parseMnavTlsAndRoot,
  getMnavEnFrameRoot,
  createMnavFetch,
  makeMnavTlsOpts,
} from "./mnav-north-macedonia-eaip-http.mjs";
import { promptPickMnavAd2Icao, promptPickMnavGenEntries } from "./mnav-north-macedonia-eaip-prompts.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "mnav-north-macedonia-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "mnav-north-macedonia-eaip", "AD2");

function parseInteractiveArgv(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: node scripts/mnav-north-macedonia-eaip-interactive.mjs [options]

Interactive:
  [1] GEN — choose GEN_0 … GEN_4 groups, then section(s)
  [2] AD 2 — pick ICAO (Textpages PDF)

Options:
  --root URL     Force English frame root (default: resolve from ${MNAV_START_URL})
  --insecure     MNAV_TLS_INSECURE=1
  --strict-tls   MNAV_TLS_STRICT=1

Non-interactive:
  node scripts/mnav-north-macedonia-eaip-gen-download.mjs --only "GEN 1.2"
  node scripts/mnav-north-macedonia-eaip-ad2-download.mjs --icao LWSK

Fallback: ${FALLBACK_MNAV_EN_FRAME_ROOT}`);
    process.exit(0);
  }
  return parseMnavTlsAndRoot(argv);
}

async function main() {
  const { enFrameRoot: cliRoot, insecureTls, strictTls } = parseInteractiveArgv(process.argv);
  if (insecureTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[M-NAV] TLS verification disabled (--insecure / MNAV_TLS_INSECURE=1)\n");
  }
  const tlsOpts = makeMnavTlsOpts(insecureTls, strictTls);
  const http = createMnavFetch("UI");
  const enRoot = await getMnavEnFrameRoot(http, tlsOpts, cliRoot);

  const rl = readline.createInterface({ input, output: stderr, terminal: true });

  try {
    console.error("M-NAV North Macedonia eAIP — downloader\n");
    console.error(`English frame root: ${enRoot}\n`);
    const top = (
      await rl.question(
        "What to download?\n" +
          "  [1] GEN (Part 1 — tree PDFs under pdf/gen/)\n" +
          "  [2] AD 2 Textpages (per ICAO)\n" +
          "  [0] Quit\n\nChoice [1/2/0]: ",
      )
    ).trim();

    if (top === "0" || top.toLowerCase() === "q") {
      console.error("Bye.");
      return;
    }

    const treeUrl = treeItemsUrl(enRoot);
    console.error(`\nFetching ${treeUrl}…`);
    const treeJs = await http.fetchText(treeUrl, "tree_items", tlsOpts);

    if (top === "2") {
      const icaos = parseMnavAd2IcaosFromTreeItems(treeJs);
      if (icaos.length === 0) {
        console.error("No AD 2 Textpages entries found in tree_items.js.");
        return;
      }
      const icao = await promptPickMnavAd2Icao(rl, icaos);
      const rel = mnavAd2TextpagesRel(icao);
      const pdfUrl = pdfAbsoluteUrl(enRoot, rel);
      const outFile = join(OUT_AD2, safePdfBasenameFromUrl(pdfUrl));

      console.error(`\n→ PDF: ${pdfUrl}`);
      mkdirSync(OUT_AD2, { recursive: true });
      await http.downloadPdfToFile(pdfUrl, outFile, `PDF ${icao}`, tlsOpts);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (top === "1") {
      const entries = parseMnavGenPdfEntriesFromTreeItems(treeJs);
      if (entries.length === 0) {
        console.error("No GEN PDF entries found in tree_items.js.");
        return;
      }
      const picked = await promptPickMnavGenEntries(rl, entries);
      if (!picked || picked.length === 0) {
        console.error("Cancelled.");
        return;
      }

      mkdirSync(OUT_GEN, { recursive: true });
      for (const e of picked) {
        const pdfUrl = pdfAbsoluteUrl(enRoot, e.rel);
        const outFile = join(OUT_GEN, safePdfBasenameFromUrl(pdfUrl));
        console.error(`\n→ ${e.label}: ${pdfUrl}`);
        await http.downloadPdfToFile(pdfUrl, outFile, e.label, tlsOpts);
      }
      console.error(`\nDone. PDFs in: ${OUT_GEN}`);
      return;
    }

    console.error("Invalid choice. Use 1, 2, or 0.");
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
