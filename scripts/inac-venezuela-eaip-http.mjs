/**
 * Shared HTTPS helpers for INAC Venezuela eAIP download scripts (GEN, AD2, …).
 */

import { mkdirSync, createWriteStream } from "fs";
import { dirname } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

/** Used only if history resolution fails (and no --root / env). */
export const FALLBACK_INAC_PACKAGE_ROOT = "https://www.inac.gob.ve/eaip/2020-07-16";

export const INAC_EAIP_PUBLIC_BASE = "https://www.inac.gob.ve/eaip";

/** Table of releases; frame `history-body-en-GB.html` has effective-date links. */
export const INAC_HISTORY_PAGE_URL = `${INAC_EAIP_PUBLIC_BASE}/history-en-GB.html`;

export const INAC_HISTORY_BODY_URL = `${INAC_EAIP_PUBLIC_BASE}/history-body-en-GB.html`;

/** @deprecated scripts resolve automatically; kept for help text */
export const DEFAULT_INAC_PACKAGE_ROOT = FALLBACK_INAC_PACKAGE_ROOT;

export function indexUrl(packageRoot) {
  return `${packageRoot}/html/index-en-GB.html`;
}

export function menuUrl(packageRoot) {
  return `${packageRoot}/html/eAIP/Menu-en-GB.html`;
}

/** @param {string} packageRoot @param {string} htmlFile */
export function sectionHtmlUrl(packageRoot, htmlFile) {
  return `${packageRoot}/html/eAIP/${encodeURIComponent(htmlFile)}`;
}

/** @param {string} packageRoot @param {string} stem PDF stem (e.g. GEN 1.2, AD2.1SVMC) */
export function sectionPdfUrl(packageRoot, stem) {
  return `${packageRoot}/pdf/eAIP/${encodeURIComponent(stem)}.pdf`;
}

/**
 * @param {string} htmlFile e.g. SV-GEN 1.2-en-GB.html or SV-AD2.1SVMC-en-GB.html
 * @returns {string} PDF stem
 */
export function htmlFileToPdfStem(htmlFile) {
  const m = htmlFile.match(/^([A-Z]{2})-(.+)-en-GB\.html$/i);
  if (!m) throw new Error(`Unexpected INAC HTML filename: ${htmlFile}`);
  return m[2];
}

/** @param {string} stem */
export function safePdfFilename(stem) {
  return stem.replace(/\s+/g, "_").replace(/[/\\?%*:|"<>]/g, "-") + ".pdf";
}

/** @param {string} menuHtml */
export function parseGenHtmlHrefs(menuHtml) {
  const re = /href=["'](SV-GEN[^"']+-en-GB\.html)["']/gi;
  const set = new Set();
  let m;
  while ((m = re.exec(menuHtml))) set.add(m[1]);
  return [...set].sort();
}

/** @param {string} menuHtml */
export function parseAd21HtmlHrefs(menuHtml) {
  const re = /href=["'](SV-AD2\.1[A-Z]{4}-en-GB\.html)["']/gi;
  const set = new Set();
  let m;
  while ((m = re.exec(menuHtml))) set.add(m[1]);
  return [...set].sort();
}

/** @param {string} htmlFile e.g. SV-AD2.1SVMC-en-GB.html */
export function ad21IcaoFromHtmlFile(htmlFile) {
  const m = htmlFile.match(/^SV-AD2\.1([A-Z]{4})-en-GB\.html$/i);
  return m ? m[1].toUpperCase() : null;
}

/** @param {string} icao */
export function ad21HtmlFileForIcao(icao) {
  const x = icao.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(x)) {
    throw new Error(`ICAO must be 4 letters, got: ${JSON.stringify(icao)}`);
  }
  return `SV-AD2.1${x}-en-GB.html`;
}

/**
 * @param {string[]} argv
 */
export function parseTlsAndRoot(argv) {
  let insecureTls = process.env.INAC_TLS_INSECURE === "1";
  let strictTls = process.env.INAC_TLS_STRICT === "1";
  /** Explicit override; when null, caller should resolve from INAC history. */
  let packageRoot = process.env.INAC_EAIP_PACKAGE_ROOT?.replace(/\/$/, "") || null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--insecure") insecureTls = true;
    else if (a === "--strict-tls") strictTls = true;
    else if (a === "--root" && argv[i + 1]) {
      packageRoot = argv[++i].replace(/\/$/, "");
    }
  }
  return { packageRoot, insecureTls, strictTls };
}

/**
 * Parse history-body-en-GB.html for the “Currently Effective Issue” folder.
 * @param {(url: string, name: string, tls: { strictTls: boolean }) => Promise<string>} fetchText
 * @param {{ strictTls: boolean }} tlsOpts
 */
export async function resolveInacEaipPackageRootFromHistory(fetchText, tlsOpts) {
  const html = await fetchText(INAC_HISTORY_BODY_URL, "history-body", tlsOpts);
  const start = html.indexOf("Currently Effective Issue");
  if (start === -1) {
    throw new Error('Could not find "Currently Effective Issue" on INAC history-body page');
  }
  const end = html.indexOf("Next Issues", start);
  const slice = end === -1 ? html.slice(start) : html.slice(start, end);
  const m = slice.match(/href=['"](\d{4}-\d{2}-\d{2})\/html\/index-en-GB\.html/);
  if (!m) {
    throw new Error(
      "Could not find YYYY-MM-DD/html/index-en-GB.html under Currently Effective Issue",
    );
  }
  return `${INAC_EAIP_PUBLIC_BASE}/${m[1]}`;
}

/**
 * @param {{ fetchText: Function }} http from createInacFetch
 * @param {{ strictTls: boolean }} tlsOpts
 * @param {string | null} cliRoot from parseTlsAndRoot (env or --root)
 */
export async function getInacPackageRoot(http, tlsOpts, cliRoot) {
  if (cliRoot) {
    console.error(`[INAC] Package root (env or --root): ${cliRoot}`);
    return cliRoot.replace(/\/$/, "");
  }
  console.error(`[INAC] Resolving currently effective package from ${INAC_HISTORY_BODY_URL}`);
  try {
    const root = await resolveInacEaipPackageRootFromHistory(http.fetchText, tlsOpts);
    console.error(`[INAC] Effective package: ${root}`);
    return root;
  } catch (e) {
    console.error(`[INAC] Resolution failed: ${/** @type {Error} */ (e)?.message ?? e}`);
    console.error(
      `[INAC] Using fallback ${FALLBACK_INAC_PACKAGE_ROOT} (set INAC_EAIP_PACKAGE_ROOT or --root to override).`,
    );
    return FALLBACK_INAC_PACKAGE_ROOT;
  }
}

/** @param {unknown} err */
export function isTlsVerifyError(err) {
  const c = /** @type {{ code?: string; message?: string }} */ (err)?.cause;
  const msg = `${c?.message ?? ""} ${/** @type {Error} */ (err)?.message ?? ""}`;
  return (
    c?.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    c?.code === "CERT_HAS_EXPIRED" ||
    /unable to verify the first certificate/i.test(msg)
  );
}

/**
 * @param {string} label Short tag for logs, e.g. "GEN" or "AD2"
 */
export function createInacFetch(label) {
  let tlsRelaxedLogged = false;

  function relaxTlsEnvironment() {
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") return;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    if (!tlsRelaxedLogged) {
      tlsRelaxedLogged = true;
      console.error(
        `[INAC ${label}] TLS: certificate verification failed (common for inac.gob.ve). Retrying with relaxed TLS. ` +
          "Use --strict-tls or INAC_TLS_STRICT=1 to disable, or INAC_TLS_INSECURE=1 to skip verification from the start.",
      );
    }
  }

  /**
   * @param {string} url
   * @param {RequestInit} [init]
   * @param {{ strictTls: boolean }} tlsOpts
   */
  async function fetchInac(url, init = {}, tlsOpts) {
    const merged = { redirect: "follow", ...init };
    try {
      return await fetch(url, merged);
    } catch (err) {
      if (!tlsOpts.strictTls && isTlsVerifyError(err)) {
        relaxTlsEnvironment();
        return await fetch(url, merged);
      }
      if (tlsOpts.strictTls && isTlsVerifyError(err)) {
        console.error(
          "\nTLS verification failed. Try: INAC_TLS_INSECURE=1 node scripts/inac-venezuela-eaip-…-download.mjs …\n",
        );
      }
      throw err;
    }
  }

  /** @param {{ strictTls: boolean }} tlsOpts */
  async function fetchText(url, name, tlsOpts) {
    const res = await fetchInac(url, {}, tlsOpts);
    if (!res.ok) throw new Error(`${name}: ${res.status} ${res.statusText} — ${url}`);
    return res.text();
  }

  /** @param {{ strictTls: boolean }} tlsOpts */
  async function fetchOk(url, name, tlsOpts) {
    const res = await fetchInac(url, { method: "GET" }, tlsOpts);
    if (!res.ok) throw new Error(`${name}: ${res.status} ${res.statusText} — ${url}`);
    return res;
  }

  /** @param {{ strictTls: boolean }} tlsOpts */
  async function downloadPdfToFile(pdfUrl, filePath, name, tlsOpts) {
    const res = await fetchInac(pdfUrl, {}, tlsOpts);
    if (!res.ok) throw new Error(`${name}: ${res.status} ${res.statusText} — ${pdfUrl}`);
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("pdf") && !ct.includes("octet-stream")) {
      console.warn(`[warn] ${name}: unexpected Content-Type: ${ct}`);
    }
    mkdirSync(dirname(filePath), { recursive: true });
    const body = Readable.fromWeb(/** @type {import('stream/web').ReadableStream} */ (res.body));
    await pipeline(body, createWriteStream(filePath));
  }

  return { fetchInac, fetchText, fetchOk, downloadPdfToFile };
}

/**
 * @param {boolean} insecureTls
 * @param {boolean} strictTls
 */
export function makeTlsOpts(insecureTls, strictTls) {
  return { strictTls: strictTls && !insecureTls };
}
