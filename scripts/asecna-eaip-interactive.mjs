/**
 * Interactive ASECNA eAIP PDF downloader (GEN 1 / AD 2), similar to INAC Venezuela CLI.
 *
 * GEN: Regulations → country → subsection (e.g. GEN 1.2); PDF is the whole FR-NN-GEN-1.pdf for that country.
 * AD 2: Aerodromes → country → ICAO (menu check); PDF is FR-NN-AD-2.pdf for that country.
 *
 * Usage:
 *   node scripts/asecna-eaip-interactive.mjs
 *   node scripts/asecna-eaip-interactive.mjs --insecure
 *   node scripts/asecna-eaip-interactive.mjs --menu EN-menu-en-GB.html
 *
 * Env: ASECNA_TLS_INSECURE, ASECNA_TLS_STRICT, ASECNA_MENU_FILE
 */

import readline from "node:readline/promises";
import { stdin as input, stderr } from "node:process";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  DEFAULT_ASECNA_INDEX,
  asecnaMenuUrl,
  htmlUrlToPdfUrl,
  safeAsecnaPdfFilename,
  parseGen1Countries,
  parseGen1SectionsForCountry,
  parseAd2Countries,
  parseAd2IcaosForCountry,
  gen1HtmlBasenamesToTry,
  ad2HtmlBasenamesToTry,
  resolveWorkingHtmlBasename as resolveWorkingHtmlUrl,
  stemFromAsecnaHtmlFile,
  parseAsecnaCli,
  createAsecnaFetch,
} from "./asecna-eaip-http.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "asecna-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "asecna-eaip", "AD2");

/**
 * @param {import("node:readline/promises").Interface} rl
 * @param {{ code: string, name: string }[]} countries
 */
async function promptPickCountry(rl, countries, label) {
  console.error(`\n--- ${label} — pick country ---\n`);
  const cols = 3;
  const pad = 28;
  for (let i = 0; i < countries.length; i += cols) {
    const chunk = countries.slice(i, i + cols);
    console.error(
      chunk
        .map((c, j) => `${String(i + j + 1).padStart(3)}. ${(`[${c.code}] ${c.name}`).padEnd(pad)}`)
        .join("  "),
    );
  }
  console.error("");
  for (;;) {
    const raw = (await rl.question(`Number 1–${countries.length}, or 2-digit code (e.g. 01): `)).trim();
    if (!raw) {
      console.error("(empty — try again.)");
      continue;
    }
    const n = parseInt(raw, 10);
    if (String(n) === raw && n >= 1 && n <= countries.length) {
      const c = countries[n - 1];
      console.error(`Using ${c.name} (${c.code}).\n`);
      return c;
    }
    if (/^\d{1,2}$/.test(raw)) {
      const code = raw.padStart(2, "0");
      const c = countries.find((x) => x.code === code);
      if (c) {
        console.error(`Using ${c.name} (${c.code}).\n`);
        return c;
      }
      console.error(`No country with code ${code} in this menu.`);
      continue;
    }
    const q = raw.toLowerCase();
    const byName = countries.filter((c) => c.name.toLowerCase().includes(q));
    if (byName.length === 1) {
      const c = byName[0];
      console.error(`Using ${c.name} (${c.code}).\n`);
      return c;
    }
    if (byName.length > 1) {
      console.error(`Ambiguous name match (${byName.length}): ${byName.map((c) => c.name).join(", ")}`);
      continue;
    }
    console.error("Enter a list number, two-digit code, or part of the country name.");
  }
}

/**
 * @param {import("node:readline/promises").Interface} rl
 * @param {{ anchor: string, href: string, label: string }[]} sections
 */
async function promptPickGenSection(rl, sections) {
  console.error("\n--- GEN 1 — subsection (PDF is the whole GEN 1 document for this country) ---\n");
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    console.error(`  ${String(i + 1).padStart(3)}. ${s.label}  (${s.anchor})`);
  }
  console.error("");
  for (;;) {
    const raw = (await rl.question(`Section number 1–${sections.length}: `)).trim();
    const n = parseInt(raw, 10);
    if (String(n) === raw && n >= 1 && n <= sections.length) {
      const s = sections[n - 1];
      console.error(`Using ${s.label}.\n`);
      return s;
    }
    if (!raw) continue;
    const low = raw.toLowerCase();
    const byLabel = sections.filter((s) => s.label.toLowerCase().includes(low));
    if (byLabel.length === 1) {
      console.error(`Using ${byLabel[0].label}.\n`);
      return byLabel[0];
    }
    if (byLabel.length > 1) {
      console.error("Multiple matches; type the list number or a longer substring.");
      continue;
    }
    console.error("No match; enter the list number or text from the section title (e.g. 1.2 or aircraft).");
  }
}

/**
 * @param {import("node:readline/promises").Interface} rl
 * @param {string[]} icaos
 */
async function promptPickIcao(rl, icaos) {
  console.error("\n--- AD 2 — aerodrome (PDF is the combined AD 2 document for this country) ---\n");
  console.error("Pick an ICAO from the menu to confirm; the file is still FR-NN-AD-2.pdf for the whole AD 2.\n");
  const cols = 5;
  const pad = 6;
  for (let i = 0; i < icaos.length; i += cols) {
    const chunk = icaos.slice(i, i + cols);
    console.error(chunk.map((icao, j) => `${String(i + j + 1).padStart(3)}. ${icao.padEnd(pad)}`).join("  "));
  }
  console.error("");
  for (;;) {
    const raw = (await rl.question(`Number 1–${icaos.length}, or 4-letter ICAO: `)).trim().toUpperCase();
    if (!raw) continue;
    const n = parseInt(raw, 10);
    if (String(n) === raw && n >= 1 && n <= icaos.length) {
      const icao = icaos[n - 1];
      console.error(`Using ${icao}.\n`);
      return icao;
    }
    if (/^[A-Z]{4}$/.test(raw)) {
      if (icaos.includes(raw)) {
        console.error(`Using ${raw}.\n`);
        return raw;
      }
      console.error(`ICAO ${raw} not listed under this country in the menu.`);
      continue;
    }
    console.error("Enter a list number or four letters (ICAO).");
  }
}

function parseArgv(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: node scripts/asecna-eaip-interactive.mjs [options]

Portal: ${DEFAULT_ASECNA_INDEX}

Options:
  --insecure     ASECNA_TLS_INSECURE=1 (disable TLS verification)
  --strict-tls   ASECNA_TLS_STRICT=1 (no auto-retry on cert errors)
  --menu FILE    Menu HTML under /html/eAIP/ (default: FR-menu-fr-FR.html)

Output: downloads/asecna-eaip/GEN/ and downloads/asecna-eaip/AD2/
`);
    process.exit(0);
  }
  return parseAsecnaCli(argv);
}

async function main() {
  const { insecureTls, strictTls, menuBasename } = parseArgv(process.argv);
  if (insecureTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[ASECNA] TLS verification disabled (--insecure / ASECNA_TLS_INSECURE=1)\n");
  }
  const tlsOpts = { strictTls };
  const http = createAsecnaFetch("UI");
  const menuUrl = asecnaMenuUrl(menuBasename);
  const menuDirUrl = `${menuUrl.replace(/[^/]+$/, "")}`;

  const rl = readline.createInterface({ input, output: stderr, terminal: true });
  try {
    console.error("ASECNA eAIP — PDF downloader\n");
    console.error(`Menu: ${menuUrl}\n`);
    const top = (
      await rl.question(
        "What to download?\n" +
          "  [1] GEN 1 — Regulations → country → subsection (PDF = whole national GEN 1)\n" +
          "  [2] AD 2 — Aerodromes → country → ICAO (PDF = whole national AD 2)\n" +
          "  [0] Quit\n\nChoice [1/2/0]: ",
      )
    ).trim();

    if (top === "0" || top.toLowerCase() === "q") {
      console.error("Bye.");
      return;
    }

    console.error("\nFetching menu…");
    const menuHtml = await http.fetchText(menuUrl, "menu", tlsOpts);

    if (top === "1") {
      const countries = parseGen1Countries(menuHtml, menuBasename);
      if (countries.length === 0) {
        console.error("No GEN 1 countries found in menu (unexpected HTML).");
        return;
      }
      const country = await promptPickCountry(rl, countries, "GEN 1 Regulations");
      const sections = parseGen1SectionsForCountry(menuHtml, country.code, menuBasename);
      if (sections.length === 0) {
        console.error(`No GEN 1 sections for ${country.name} in menu.`);
        return;
      }
      const section = await promptPickGenSection(rl, sections);
      const tryNames = gen1HtmlBasenamesToTry(country.code, menuBasename);
      const { htmlUrl: htmlU, basename: htmlFile } = await resolveWorkingHtmlUrl(
        http,
        tryNames,
        menuDirUrl,
        `HTML GEN ${country.code}`,
        tlsOpts,
      );
      const pdfU = htmlUrlToPdfUrl(htmlU);
      const stem = stemFromAsecnaHtmlFile(htmlFile);
      const outFile = join(OUT_GEN, safeAsecnaPdfFilename(`${stem}_${section.anchor}`));

      console.error(`→ HTML: ${htmlU}`);
      console.error(`→ PDF:  ${pdfU}`);
      mkdirSync(OUT_GEN, { recursive: true });
      await http.downloadPdfToFile(pdfU, outFile, `PDF GEN ${country.code}`, tlsOpts);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (top === "2") {
      const countries = parseAd2Countries(menuHtml, menuBasename);
      if (countries.length === 0) {
        console.error("No AD 2 countries found in menu.");
        return;
      }
      const country = await promptPickCountry(rl, countries, "AD 2 Aerodromes");
      const icaos = parseAd2IcaosForCountry(menuHtml, country.code, menuBasename);
      if (icaos.length === 0) {
        console.error(`No AD 2 aerodromes listed for ${country.name} in menu.`);
        return;
      }
      await promptPickIcao(rl, icaos);
      const tryNames = ad2HtmlBasenamesToTry(country.code, menuBasename);
      const { htmlUrl: htmlU, basename: htmlFile } = await resolveWorkingHtmlUrl(
        http,
        tryNames,
        menuDirUrl,
        `HTML AD2 ${country.code}`,
        tlsOpts,
      );
      const pdfU = htmlUrlToPdfUrl(htmlU);
      const stem = stemFromAsecnaHtmlFile(htmlFile);
      const outFile = join(OUT_AD2, safeAsecnaPdfFilename(stem));

      console.error(`→ HTML: ${htmlU}`);
      console.error(`→ PDF:  ${pdfU}`);
      mkdirSync(OUT_AD2, { recursive: true });
      await http.downloadPdfToFile(pdfU, outFile, `PDF AD2 ${country.code}`, tlsOpts);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    console.error("Unknown choice; use 1, 2, or 0.");
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
