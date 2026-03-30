/**
 * Interactive INAC Venezuela eAIP downloader.
 * Prompts: GEN (Part 1) vs AD 2.1 (Part 3 / AD_2), then section number or ICAO list.
 *
 * Usage:
 *   node scripts/inac-venezuela-eaip-interactive.mjs
 *   node scripts/inac-venezuela-eaip-interactive.mjs --insecure --root "https://..."
 *
 * Env: INAC_EAIP_PACKAGE_ROOT, INAC_TLS_INSECURE, INAC_TLS_STRICT
 */

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
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
  parseAd21HtmlHrefs,
  ad21HtmlFileForIcao,
  parseTlsAndRoot,
  createInacFetch,
  makeTlsOpts,
} from "./inac-venezuela-eaip-http.mjs";
import { promptPickAd21Icao, promptPickGenHrefs } from "./inac-venezuela-eaip-prompts.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "inac-venezuela-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "inac-venezuela-eaip", "AD2");

function parseInteractiveArgv(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: node scripts/inac-venezuela-eaip-interactive.mjs [options]

Interactive prompts:
  1 — GEN: choose GEN_0 … GEN_4 (like the site), then section(s); or download all / flat list
  2 — AD 2.1: numbered ICAO list from menu, then PDF download

Options:
  --root URL    Package root (default: ${DEFAULT_INAC_PACKAGE_ROOT})
  --insecure    INAC_TLS_INSECURE
  --strict-tls  INAC_TLS_STRICT

For non-interactive use:
  node scripts/inac-venezuela-eaip-gen-download.mjs --only "GEN 1.2"
  node scripts/inac-venezuela-eaip-ad2-download.mjs --icao SVMC`);
    process.exit(0);
  }
  return parseTlsAndRoot(argv);
}

async function main() {
  const { packageRoot, insecureTls, strictTls } = parseInteractiveArgv(process.argv);
  if (insecureTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[INAC] TLS verification disabled (--insecure / INAC_TLS_INSECURE=1)\n");
  }
  const tlsOpts = makeTlsOpts(insecureTls, strictTls);
  const http = createInacFetch("UI");

  const rl = readline.createInterface({ input, output });

  try {
    console.error("INAC Venezuela eAIP — downloader\n");
    console.error(`Package: ${packageRoot}\n`);
    const top = (
      await rl.question(
        "What to download?\n" +
          "  [1] GEN (Part 1 — choose GEN_0 / GEN_1 / … then PDF section(s))\n" +
          "  [2] AD 2.1 (Part 3 — pick ICAO from list, then PDF)\n" +
          "  [0] Quit\n\nChoice [1/2/0]: ",
      )
    ).trim();

    if (top === "0" || top.toLowerCase() === "q") {
      console.error("Bye.");
      return;
    }

    console.error("\nFetching index and menu…");
    await http.fetchText(indexUrl(packageRoot), "index", tlsOpts);
    const menuHtml = await http.fetchText(menuUrl(packageRoot), "menu", tlsOpts);

    if (top === "2") {
      const knownHrefs = parseAd21HtmlHrefs(menuHtml);
      if (knownHrefs.length === 0) {
        console.error("No AD 2.1 entries found in menu.");
        return;
      }
      const icao = await promptPickAd21Icao(rl, knownHrefs);
      const htmlFile = ad21HtmlFileForIcao(icao);
      const stem = htmlFileToPdfStem(htmlFile);
      const htmlU = sectionHtmlUrl(packageRoot, htmlFile);
      const pdfU = sectionPdfUrl(packageRoot, stem);
      const outFile = join(OUT_AD2, safePdfFilename(stem));

      console.error(`\n→ HTML: ${htmlU}`);
      console.error(`→ PDF:  ${pdfU}`);
      mkdirSync(OUT_AD2, { recursive: true });
      await http.fetchOk(htmlU, `HTML ${icao}`, tlsOpts);
      await http.downloadPdfToFile(pdfU, outFile, `PDF ${icao}`, tlsOpts);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (top === "1") {
      const genHrefs = parseGenHtmlHrefs(menuHtml);
      if (genHrefs.length === 0) {
        console.error("No GEN entries found in menu.");
        return;
      }
      const picked = await promptPickGenHrefs(rl, genHrefs);
      if (!picked || picked.length === 0) {
        console.error("Cancelled.");
        return;
      }

      mkdirSync(OUT_GEN, { recursive: true });
      for (const htmlFile of picked) {
        const stem = htmlFileToPdfStem(htmlFile);
        const htmlU = sectionHtmlUrl(packageRoot, htmlFile);
        const pdfU = sectionPdfUrl(packageRoot, stem);
        const outFile = join(OUT_GEN, safePdfFilename(stem));
        console.error(`\n→ ${stem}: ${pdfU}`);
        await http.fetchOk(htmlU, `HTML ${stem}`, tlsOpts);
        await http.downloadPdfToFile(pdfU, outFile, `PDF ${stem}`, tlsOpts);
      }
      console.error(`\nDone. PDFs in: ${OUT_GEN}`);
      return;
    }

    console.error('Invalid choice. Use 1, 2, or 0.');
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
