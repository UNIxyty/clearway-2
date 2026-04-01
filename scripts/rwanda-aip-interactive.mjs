#!/usr/bin/env node
/**
 * Interactive Rwanda AIP downloader through the ASECNA "AIP RWANDA" entrypoint.
 *
 * Flow:
 * 1) Open ASECNA index page
 * 2) Resolve "AIP RWANDA" button target
 * 3) Load Rwanda menu (eAIP/menu.html)
 * 4) Let user download:
 *    - GEN 1.2 PDF
 *    - AD 2 airport PDF by ICAO
 *
 * Usage:
 *   node scripts/rwanda-aip-interactive.mjs
 *   node scripts/rwanda-aip-interactive.mjs --insecure
 */

import readline from "node:readline/promises";
import { stdin as input, stderr } from "node:process";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createAsecnaFetch, parseAsecnaCli } from "./asecna-eaip-http.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "rwanda-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "rwanda-eaip", "AD2");
const ASECNA_MENU_WITH_RWANDA = "https://aim.asecna.aero/html/eAIP/FR-menu-fr-FR.html";

function usage() {
  console.log(`Usage: node scripts/rwanda-aip-interactive.mjs [options]

Options:
  --insecure     Disable TLS verification
  --strict-tls   Disable TLS auto-retry fallback
  -h, --help     Show this help
`);
}

function resolveRwandaTocUrl(menuHtmlWithButton) {
  const idFirst =
    menuHtmlWithButton.match(/id\s*=\s*["']AIP_RWANDA["'][\s\S]*?href\s*=\s*["']([^"']+)["']/i) ||
    menuHtmlWithButton.match(/href\s*=\s*["']([^"']+)["'][\s\S]*?id\s*=\s*["']AIP_RWANDA["']/i);
  const raw = idFirst?.[1] ?? "";
  if (!raw) throw new Error("AIP RWANDA button target not found in ASECNA FR menu.");
  const href = raw.replace(/\\/g, "/");
  return new URL(href, "https://aim.asecna.aero/html/eAIP/").href;
}

function resolveRwandaMenuUrl(tocFramesetHtml, tocUrl) {
  const m =
    tocFramesetHtml.match(/<frame[^>]*name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i) ||
    tocFramesetHtml.match(/<frame[^>]*src=["']([^"']*menu\.html[^"']*)["']/i);
  const src = m?.[1];
  if (!src) throw new Error("Could not find Rwanda menu frame URL.");
  return new URL(src, tocUrl).href;
}

function rwandaHtmlToPdfUrl(htmlUrl) {
  let out = htmlUrl.replace(/#.*$/, "");
  out = out.replace("-en-GB", "");
  out = out.replace(".html", ".pdf");
  out = out.replace("/eAIP/", "/documents/PDF/");
  return out;
}

function parseRwandaGen12(menuHtml) {
  const m =
    menuHtml.match(/href=['"]([^'"]*GEN[^'"]*1\.2[^'"]*)['"][^>]*title=['"]([^'"]*)/i) ||
    menuHtml.match(/href=['"]([^'"]*GEN[^'"]*1\.2[^'"]*)['"]/i);
  if (!m) return null;
  return {
    href: m[1],
    label: m[2] || "GEN 1.2 Entry, transit and departure of aircraft",
  };
}

function parseRwandaAd2Icaos(menuHtml) {
  const ids = [...menuHtml.matchAll(/AD 2\s+([A-Z0-9]{4})/g)].map((x) => x[1].toUpperCase());
  return [...new Set(ids)].sort();
}

function findRwandaAd2Href(menuHtml, icao) {
  const re = new RegExp(`href=['"]([^'"]*AD\\s*2\\s*${icao}[^'"]*\\.html#[^'"]*)['"]`, "i");
  const m = menuHtml.match(re);
  return m?.[1] ?? null;
}

async function pickIcao(rl, icaos) {
  const cols = 5;
  const pad = 6;
  console.error("\n--- Rwanda AD 2 airports ---\n");
  for (let i = 0; i < icaos.length; i += cols) {
    const chunk = icaos.slice(i, i + cols);
    console.error(chunk.map((icao, j) => `${String(i + j + 1).padStart(3)}. ${icao.padEnd(pad)}`).join("  "));
  }
  for (;;) {
    const raw = (await rl.question(`\nPick number 1-${icaos.length} or ICAO: `)).trim().toUpperCase();
    const n = parseInt(raw, 10);
    if (String(n) === raw && n >= 1 && n <= icaos.length) return icaos[n - 1];
    if (/^[A-Z0-9]{4}$/.test(raw) && icaos.includes(raw)) return raw;
    console.error("Invalid selection.");
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }

  const { insecureTls, strictTls } = parseAsecnaCli(process.argv);
  if (insecureTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error("[RWANDA] TLS verification disabled (--insecure).\n");
  }
  const tlsOpts = { strictTls };
  const http = createAsecnaFetch("RWANDA");
  const rl = readline.createInterface({ input, output: stderr, terminal: Boolean(input.isTTY) });

  try {
    console.error("Rwanda AIP via ASECNA — interactive downloader\n");
    console.error(`Menu with AIP RWANDA button: ${ASECNA_MENU_WITH_RWANDA}\n`);

    const menuWithButton = await http.fetchText(ASECNA_MENU_WITH_RWANDA, "ASECNA FR menu", tlsOpts);
    const tocUrl = resolveRwandaTocUrl(menuWithButton);
    const tocHtml = await http.fetchText(tocUrl, "Rwanda toc-frameset", tlsOpts);
    const menuUrl = resolveRwandaMenuUrl(tocHtml, tocUrl);
    const menuHtml = await http.fetchText(menuUrl, "Rwanda menu", tlsOpts);

    console.error(`Resolved Rwanda menu: ${menuUrl}\n`);
    const mode = (await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") {
      console.error("Bye.");
      return;
    }

    if (mode === "1") {
      const gen12 = parseRwandaGen12(menuHtml);
      if (!gen12) {
        console.error("GEN 1.2 link not found in Rwanda menu.");
        return;
      }
      const htmlUrl = new URL(gen12.href, menuUrl).href;
      const pdfUrl = rwandaHtmlToPdfUrl(htmlUrl);
      mkdirSync(OUT_GEN, { recursive: true });
      const outFile = join(OUT_GEN, "RWANDA_GEN_1.2.pdf");
      console.error(`\nGEN 1.2: ${gen12.label}`);
      console.error(`HTML: ${htmlUrl}`);
      console.error(`PDF : ${pdfUrl}`);
      await http.fetchOk(htmlUrl, "Rwanda GEN 1.2 HTML", tlsOpts);
      await http.downloadPdfToFile(pdfUrl, outFile, "Rwanda GEN 1.2 PDF", tlsOpts);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    if (mode === "2") {
      const icaos = parseRwandaAd2Icaos(menuHtml);
      if (icaos.length === 0) {
        console.error("No AD 2 ICAOs found in Rwanda menu.");
        return;
      }
      const icao = await pickIcao(rl, icaos);
      const ad2Href = findRwandaAd2Href(menuHtml, icao);
      if (!ad2Href) {
        console.error(`Could not find AD 2 href for ${icao} in Rwanda menu.`);
        return;
      }
      const htmlUrl = new URL(ad2Href, menuUrl).href;
      const pdfUrl = rwandaHtmlToPdfUrl(htmlUrl);
      mkdirSync(OUT_AD2, { recursive: true });
      const outFile = join(OUT_AD2, `RWANDA_AD2_${icao}.pdf`);
      console.error(`\nICAO: ${icao}`);
      console.error(`HTML: ${htmlUrl}`);
      console.error(`PDF : ${pdfUrl}`);
      await http.fetchOk(htmlUrl, `Rwanda AD2 HTML ${icao}`, tlsOpts);
      await http.downloadPdfToFile(pdfUrl, outFile, `Rwanda AD2 PDF ${icao}`, tlsOpts);
      console.error(`\nSaved: ${outFile}`);
      return;
    }

    console.error("Unknown choice.");
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("[RWANDA] failed:", err);
  process.exit(1);
});
