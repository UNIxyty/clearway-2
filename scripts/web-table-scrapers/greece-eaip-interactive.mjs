#!/usr/bin/env node
/**
 * Interactive Greece eAIP downloader.
 *
 * Source:
 * - https://aisgr.hasp.gov.gr/main.php
 *
 * This scraper includes a post-captcha DOM parser. Provide HTML captured after
 * manual captcha solving via:
 *   --post-captcha-html /path/to/file.html
 * or:
 *   GREECE_POST_CAPTCHA_HTML=/path/to/file.html
 */
import readline from "node:readline/promises";
import { collectMode, printCollectJson, isoDateFromText } from "./_collect-json.mjs";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const OUT_GEN = join(PROJECT_ROOT, "downloads", "greece-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "greece-eaip", "AD2");
const ENTRY_URL = "https://aisgr.hasp.gov.gr/main.php?rand=0.7276487307378027#publications";
const UA = "Mozilla/5.0 (compatible; clearway-greece-eaip/1.0)";
const log = (...args) => console.error("[GREECE]", ...args);

const downloadAd2Icao = (() => {
  const i = process.argv.indexOf("--download-ad2");
  return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
})();
const downloadGen12 = process.argv.includes("--download-gen12");
const postCaptchaHtmlPath = (() => {
  const i = process.argv.indexOf("--post-captcha-html");
  const fromArg = i >= 0 ? String(process.argv[i + 1] || "").trim() : "";
  return fromArg || String(process.env.GREECE_POST_CAPTCHA_HTML || "").trim();
})();

function normalizeText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEffectiveDate(blob) {
  const iso = isoDateFromText(blob);
  if (iso) return iso;
  const m = String(blob || "").match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})\b/);
  if (!m) return null;
  const mm = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  }[String(m[2]).slice(0, 3).toLowerCase()];
  if (!mm) return null;
  return `${m[3]}-${mm}-${String(m[1]).padStart(2, "0")}`;
}

function parsePostCaptchaDom(html, baseUrl) {
  const normalized = normalizeText(html);
  const ad2Icaos = [...new Set([...normalized.matchAll(/\b(LG[A-Z0-9]{2})\b/g)].map((m) => String(m[1]).toUpperCase()))].sort();
  const effectiveDate = parseEffectiveDate(normalized);
  const links = [];
  for (const m of String(html || "").matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = String(m[1] || "").trim();
    if (!href || href.startsWith("javascript:")) continue;
    const text = normalizeText(m[2]);
    try {
      links.push({ url: new URL(href, baseUrl).href, text });
    } catch {
      continue;
    }
  }
  const pdfLinks = links.filter((x) => /\.pdf(?:$|[?#])/i.test(x.url));
  const genCandidates = pdfLinks.filter((x) => /gen[^a-z0-9]*1[^a-z0-9]*2/i.test(`${x.url} ${x.text}`));
  return { effectiveDate, ad2Icaos, pdfLinks, genCandidates };
}

function readPostCaptchaHtml() {
  if (!postCaptchaHtmlPath) return null;
  try {
    const html = readFileSync(postCaptchaHtmlPath, "utf8");
    return parsePostCaptchaDom(html, ENTRY_URL);
  } catch (err) {
    throw new Error(`Could not read post-captcha HTML file: ${postCaptchaHtmlPath}. ${err?.message || err}`);
  }
}

async function downloadPdf(url, outFile) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Referer: ENTRY_URL } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
  writeFileSync(outFile, bytes);
}

function guidanceError() {
  return new Error(
    `Greece is captcha-protected. Solve captcha in browser, save post-captcha HTML, then run with --post-captcha-html <file>. Entry: ${ENTRY_URL}`,
  );
}

async function main() {
  const parsed = readPostCaptchaHtml();
  if (collectMode()) {
    if (!parsed) throw guidanceError();
    printCollectJson({ effectiveDate: parsed.effectiveDate, ad2Icaos: parsed.ad2Icaos });
    return;
  }

  if (downloadGen12) {
    if (!parsed) throw guidanceError();
    const candidate = parsed.genCandidates[0] || parsed.pdfLinks.find((x) => /gen/i.test(`${x.url} ${x.text}`));
    if (!candidate) throw new Error("No GEN 1.2 PDF candidate found in post-captcha DOM.");
    mkdirSync(OUT_GEN, { recursive: true });
    const dateTag = parsed.effectiveDate || "unknown-date";
    await downloadPdf(candidate.url, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`));
    return;
  }

  if (downloadAd2Icao) {
    if (!parsed) throw guidanceError();
    const row = parsed.pdfLinks.find((x) => x.url.toUpperCase().includes(downloadAd2Icao) || x.text.toUpperCase().includes(downloadAd2Icao));
    if (!row) throw new Error(`No AD2 PDF link found for ICAO ${downloadAd2Icao} in post-captcha DOM.`);
    mkdirSync(OUT_AD2, { recursive: true });
    const dateTag = parsed.effectiveDate || "unknown-date";
    await downloadPdf(row.url, join(OUT_AD2, `${dateTag}_${downloadAd2Icao}_AD2.pdf`));
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (await rl.question("Download:\n  [1] GEN 1.2 (needs --post-captcha-html)\n  [2] AD 2 airport PDF (needs --post-captcha-html)\n  [0] Quit\n\nChoice [1/2/0]: ")).trim();
    if (mode === "0") return;
    if (!parsed) throw guidanceError();
    if (mode === "1") {
      const candidate = parsed.genCandidates[0] || parsed.pdfLinks.find((x) => /gen/i.test(`${x.url} ${x.text}`));
      if (!candidate) throw new Error("No GEN 1.2 PDF candidate found in post-captcha DOM.");
      mkdirSync(OUT_GEN, { recursive: true });
      const dateTag = parsed.effectiveDate || "unknown-date";
      await downloadPdf(candidate.url, join(OUT_GEN, `${dateTag}_GEN-1.2.pdf`));
      return;
    }
    if (mode === "2") {
      parsed.ad2Icaos.forEach((code, i) => console.error(`${String(i + 1).padStart(3)}. ${code}`));
      const raw = (await rl.question("\nAirport ICAO (LGxx): ")).trim().toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(raw)) throw new Error("Invalid ICAO.");
      const row = parsed.pdfLinks.find((x) => x.url.toUpperCase().includes(raw) || x.text.toUpperCase().includes(raw));
      if (!row) throw new Error(`No AD2 PDF link found for ICAO ${raw} in post-captcha DOM.`);
      mkdirSync(OUT_AD2, { recursive: true });
      const dateTag = parsed.effectiveDate || "unknown-date";
      await downloadPdf(row.url, join(OUT_AD2, `${dateTag}_${raw}_AD2.pdf`));
      return;
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  log("failed:", err?.message || err);
  process.exit(1);
});

