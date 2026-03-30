/**
 * Shared HTTPS helpers for M-NAV North Macedonia eAIP download scripts.
 * @see docs/mnav-north-macedonia-eaip-gen-navigation.md
 */

import { mkdirSync, createWriteStream } from "fs";
import { dirname } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

export const MNAV_EAIP_ORIGIN = "https://ais.m-nav.info/eAIP";

export const MNAV_START_URL = `${MNAV_EAIP_ORIGIN}/Start.htm`;

/** If Start.htm parsing fails and no --root / env. */
export const FALLBACK_MNAV_EN_FRAME_ROOT = `${MNAV_EAIP_ORIGIN}/current/en`;

export function treeItemsUrl(enFrameRoot) {
  return `${enFrameRoot.replace(/\/$/, "")}/tree_items.js`;
}

export function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

export function parseMnavCurrentIndexHrefFromStartHtml(html) {
  const cleaned = stripHtmlComments(html);
  const re =
    /<a\s+href=["']([^"']+)["'][^>]*>\s*<b[^>]*>\s*Current version:\s*AIP NORTH MACEDONIA\s*<\/b>\s*<\/a>/i;
  const m = cleaned.match(re);
  if (!m) {
    throw new Error(
      "Could not find current version link (<a>…Current version: AIP NORTH MACEDONIA…) on M-NAV Start.htm",
    );
  }
  return m[1].trim();
}

/** Map Start.htm href (e.g. current/index.htm) to …/current/en frameset root. */
export function enFrameRootFromCurrentIndexHref(indexHref) {
  const normalized = indexHref.replace(/^\/+/, "").replace(/\/+$/, "");
  if (normalized === "current/index.htm" || normalized === "current") {
    return `${MNAV_EAIP_ORIGIN}/current/en`;
  }
  if (normalized.toLowerCase().endsWith("/index.htm")) {
    const dir = normalized.slice(0, -"/index.htm".length);
    return `${MNAV_EAIP_ORIGIN}/${dir}`;
  }
  return `${MNAV_EAIP_ORIGIN}/${normalized}`;
}

export function pdfAbsoluteUrl(enFrameRoot, pdfRel) {
  const base = enFrameRoot.replace(/\/?$/, "/");
  return new URL(pdfRel, base).href;
}

/**
 * Leaf GEN rows in tree_items.js: ['GEN 1.2 …', '../pdf/gen/LW_GEN_1_2_en.pdf'],
 * @param {string} treeJs
 * @returns {{ label: string, rel: string }[]}
 */
export function parseMnavGenPdfEntriesFromTreeItems(treeJs) {
  const re = /\['([^']*)',\s*'(\.\.\/pdf\/gen\/LW_GEN[^']+\.pdf)'\]/g;
  /** @type {{ label: string, rel: string }[]} */
  const out = [];
  let m;
  while ((m = re.exec(treeJs))) {
    out.push({ label: m[1], rel: m[2] });
  }
  const seen = new Set();
  return out.filter((e) => {
    if (seen.has(e.rel)) return false;
    seen.add(e.rel);
    return true;
  });
}

/**
 * AD 2 “Textpages” PDFs in tree_items.js.
 * @param {string} treeJs
 * @returns {string[]} upper-case ICAO
 */
export function parseMnavAd2IcaosFromTreeItems(treeJs) {
  const re = /LW_AD_2_([A-Z]{4})_en\.pdf/gi;
  const set = new Set();
  let m;
  while ((m = re.exec(treeJs))) set.add(m[1].toUpperCase());
  return [...set].sort();
}

export function mnavAd2TextpagesRel(icao) {
  const x = icao.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(x)) throw new Error(`ICAO must be 4 letters, got: ${JSON.stringify(icao)}`);
  return `../pdf/aerodromes/LW_AD_2_${x}_en.pdf`;
}

export function safePdfBasenameFromUrl(u) {
  try {
    const path = new URL(u).pathname;
    const base = path.split("/").pop() || "download.pdf";
    return base.replace(/[/\\?%*:|"<>]/g, "-");
  } catch {
    return "download.pdf";
  }
}

/**
 * @param {string[]} argv
 */
export function parseMnavTlsAndRoot(argv) {
  let insecureTls = process.env.MNAV_TLS_INSECURE === "1";
  let strictTls = process.env.MNAV_TLS_STRICT === "1";
  let enFrameRoot = process.env.MNAV_EAIP_PACKAGE_ROOT?.replace(/\/$/, "") || null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--insecure") insecureTls = true;
    else if (a === "--strict-tls") strictTls = true;
    else if (a === "--root" && argv[i + 1]) {
      enFrameRoot = argv[++i].replace(/\/$/, "");
    }
  }
  return { enFrameRoot, insecureTls, strictTls };
}

/**
 * @param {(url: string, name: string, tls: { strictTls: boolean }) => Promise<string>} fetchText
 * @param {{ strictTls: boolean }} tlsOpts
 */
export async function resolveMnavEnFrameRootFromStart(fetchText, tlsOpts) {
  const html = await fetchText(MNAV_START_URL, "Start.htm", tlsOpts);
  const href = parseMnavCurrentIndexHrefFromStartHtml(html);
  return enFrameRootFromCurrentIndexHref(href);
}

/**
 * @param {{ fetchText: Function }} http
 * @param {{ strictTls: boolean }} tlsOpts
 * @param {string | null} cliRoot
 */
export async function getMnavEnFrameRoot(http, tlsOpts, cliRoot) {
  if (cliRoot) {
    console.error(`[M-NAV] English frame root (env or --root): ${cliRoot}`);
    return cliRoot.replace(/\/$/, "");
  }
  console.error(`[M-NAV] Resolving current AIP from ${MNAV_START_URL}`);
  try {
    const root = await resolveMnavEnFrameRootFromStart(http.fetchText, tlsOpts);
    console.error(`[M-NAV] Effective en/ root: ${root}`);
    return root;
  } catch (e) {
    console.error(`[M-NAV] Resolution failed: ${/** @type {Error} */ (e)?.message ?? e}`);
    console.error(
      `[M-NAV] Using fallback ${FALLBACK_MNAV_EN_FRAME_ROOT} (set MNAV_EAIP_PACKAGE_ROOT or --root to override).`,
    );
    return FALLBACK_MNAV_EN_FRAME_ROOT;
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
export function createMnavFetch(label) {
  let tlsRelaxedLogged = false;

  function relaxTlsEnvironment() {
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") return;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    if (!tlsRelaxedLogged) {
      tlsRelaxedLogged = true;
      console.error(
        `[M-NAV ${label}] TLS: verification failed. Retrying with relaxed TLS. ` +
          "Use --strict-tls or MNAV_TLS_STRICT=1 to disable retry, or MNAV_TLS_INSECURE=1 to skip from the start.",
      );
    }
  }

  /**
   * @param {string} url
   * @param {RequestInit} [init]
   * @param {{ strictTls: boolean }} tlsOpts
   */
  async function fetchMnav(url, init = {}, tlsOpts) {
    const merged = { redirect: "follow", ...init };
    try {
      return await fetch(url, merged);
    } catch (err) {
      if (!tlsOpts.strictTls && isTlsVerifyError(err)) {
        relaxTlsEnvironment();
        return await fetch(url, merged);
      }
      if (tlsOpts.strictTls && isTlsVerifyError(err)) {
        console.error("\nTLS verification failed. Try: MNAV_TLS_INSECURE=1 node scripts/mnav-…\n");
      }
      throw err;
    }
  }

  /** @param {{ strictTls: boolean }} tlsOpts */
  async function fetchText(url, name, tlsOpts) {
    const res = await fetchMnav(url, {}, tlsOpts);
    if (!res.ok) throw new Error(`${name}: ${res.status} ${res.statusText} — ${url}`);
    return res.text();
  }

  /** @param {{ strictTls: boolean }} tlsOpts */
  async function fetchOk(url, name, tlsOpts) {
    const res = await fetchMnav(url, { method: "GET" }, tlsOpts);
    if (!res.ok) throw new Error(`${name}: ${res.status} ${res.statusText} — ${url}`);
    return res;
  }

  /** @param {{ strictTls: boolean }} tlsOpts */
  async function downloadPdfToFile(pdfUrl, filePath, name, tlsOpts) {
    const res = await fetchMnav(pdfUrl, {}, tlsOpts);
    if (!res.ok) throw new Error(`${name}: ${res.status} ${res.statusText} — ${pdfUrl}`);
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("pdf") && !ct.includes("octet-stream")) {
      console.warn(`[warn] ${name}: unexpected Content-Type: ${ct}`);
    }
    mkdirSync(dirname(filePath), { recursive: true });
    const body = Readable.fromWeb(/** @type {import('stream/web').ReadableStream} */ (res.body));
    await pipeline(body, createWriteStream(filePath));
  }

  return { fetchMnav, fetchText, fetchOk, downloadPdfToFile };
}

/**
 * @param {boolean} insecureTls
 * @param {boolean} strictTls
 */
export function makeMnavTlsOpts(insecureTls, strictTls) {
  return { strictTls: strictTls && !insecureTls };
}
