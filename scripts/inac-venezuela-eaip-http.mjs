/**
 * Shared HTTPS helpers for INAC Venezuela eAIP download scripts (GEN, AD2, …).
 */

import { mkdirSync, createWriteStream } from "fs";
import { dirname } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

export const DEFAULT_INAC_PACKAGE_ROOT =
  "https://www.inac.gob.ve/eaip/2020-07-16";

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
 * @param {{ defaultRoot?: string }} [opts]
 */
export function parseTlsAndRoot(argv, opts = {}) {
  const def = opts.defaultRoot ?? DEFAULT_INAC_PACKAGE_ROOT;
  let insecureTls = process.env.INAC_TLS_INSECURE === "1";
  let strictTls = process.env.INAC_TLS_STRICT === "1";
  let packageRoot = process.env.INAC_EAIP_PACKAGE_ROOT || def;
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
