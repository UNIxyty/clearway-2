/**
 * HTTPS helpers for ASECNA eAIP (aim.asecna.aero) — menu fetch, HTML→PDF (Eurocontrol getAsPdf rule).
 *
 * PDF mapping matches site {@link https://aim.asecna.aero/html/commands.js}:
 * replace `/html/\D{4}/` with `/pdf/`, and `.html` → `.pdf` (fragment discarded).
 *
 * Real HTML/PDF basenames follow {@link https://aim.asecna.aero/html/custom-formatter.js}
 * (applied in the browser): {@code FR-<node id>-<locale>.html}, e.g.
 * {@code FR-_01GEN-1.2-01-fr-FR.html}, {@code FR-_01AD-2.DBBB-fr-FR.html}. Raw TOC
 * hrefs like {@code FR-01-GEN-1.html} are not published as-is.
 */

import { mkdirSync, createWriteStream } from "fs";
import { dirname } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

export const ASECNA_PUBLIC_BASE = "https://aim.asecna.aero";

export const DEFAULT_ASECNA_INDEX = `${ASECNA_PUBLIC_BASE}/html/index-fr-FR.html`;

/** @param {string} [menuBasename] e.g. FR-menu-fr-FR.html */
export function asecnaMenuUrl(menuBasename = "FR-menu-fr-FR.html") {
  return `${ASECNA_PUBLIC_BASE}/html/eAIP/${menuBasename}`;
}

/**
 * @param {string} htmlUrl Absolute HTML URL (no fragment required).
 * @returns {string} PDF URL (same replacement order as site getAsPdf: .html→.pdf then /html/????/→/pdf/)
 */
export function htmlUrlToPdfUrl(htmlUrl) {
  const base = htmlUrl.replace(/#.*$/, "");
  const withPdf = base.replace(/\.html$/i, ".pdf");
  return withPdf.replace(/\/html\/\D{4}\//, "/pdf/");
}

/**
 * @param {string} htmlHref From menu, e.g. FR-01-GEN-1.html#_01GEN-1.2-01
 * @param {string} [menuDirUrl] Base for relative hrefs
 */
export function resolveAsecnaHtmlUrl(htmlHref, menuDirUrl = `${ASECNA_PUBLIC_BASE}/html/eAIP/`) {
  const pathOnly = htmlHref.trim().replace(/#.*$/, "");
  if (/^https?:\/\//i.test(pathOnly)) return pathOnly;
  return new URL(pathOnly, menuDirUrl).href;
}

/**
 * @param {string} stem e.g. FR-01-GEN-1
 */
export function safeAsecnaPdfFilename(stem) {
  return stem.replace(/\s+/g, "_").replace(/[/\\?%*:|"<>]/g, "-") + ".pdf";
}

/**
 * Country rows under GEN 1 Regulations.
 * @param {string} menuHtml
 * @param {string} [menuBasename] drives href locale/prefix (default FR-menu-fr-FR.html)
 * @returns {{ code: string, name: string }[]}
 */
export function parseGen1Countries(menuHtml, menuBasename = "FR-menu-fr-FR.html") {
  const meta = parseMenuBasename(menuBasename);
  const locale = meta?.locale ?? "fr-FR";
  const prefix = meta?.prefix ?? "FR";
  const escL = locale.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escP = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<a[^>]*\\bhref="${escP}-(\\d{2})-GEN-1-${escL}\\.html#\\1-GEN-1"[^>]*\\bid="\\1-GEN-1"[^>]*>[\\s\\S]*?<span class="foreign"[^>]*>([^<]+)<\\/span>\\s*<\\/a>`,
    "gi",
  );
  /** @type {{ code: string, name: string }[]} */
  const out = [];
  let m;
  while ((m = re.exec(menuHtml))) {
    out.push({ code: m[1], name: decodeEaipTitle(m[2].trim()) });
  }
  return out;
}

/**
 * Leaf sections for GEN 1 / one country (NN).
 * @param {string} menuHtml
 * @param {string} code Two digits, e.g. 01
 * @param {string} [menuBasename]
 * @returns {{ anchor: string, href: string, label: string }[]}
 */
export function parseGen1SectionsForCountry(menuHtml, code, menuBasename = "FR-menu-fr-FR.html") {
  const meta = parseMenuBasename(menuBasename);
  const prefix = meta?.prefix ?? "FR";
  const esc = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escP = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<a[^>]*\\bhref="(${escP}-${esc}-GEN-1\\.html#([^"]+))"[^>]*\\btitle="([^"]*)"`,
    "gi",
  );
  /** @type {Map<string, { anchor: string, href: string, label: string }>} */
  const byAnchor = new Map();
  let m;
  while ((m = re.exec(menuHtml))) {
    const href = m[1];
    const anchor = m[2];
    const rawTitle = m[3];
    const label = pickEnglishSubtitle(rawTitle);
    if (!byAnchor.has(anchor)) byAnchor.set(anchor, { anchor, href, label });
  }
  return [...byAnchor.values()].sort((a, b) => a.href.localeCompare(b.href));
}

/**
 * Countries under AD 2 Aerodromes.
 * @param {string} menuHtml
 * @param {string} [menuBasename]
 */
export function parseAd2Countries(menuHtml, menuBasename = "FR-menu-fr-FR.html") {
  const meta = parseMenuBasename(menuBasename);
  const locale = meta?.locale ?? "fr-FR";
  const prefix = meta?.prefix ?? "FR";
  const escL = locale.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escP = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<a[^>]*\\bhref="${escP}-(\\d{2})-AD-2-${escL}\\.html#\\1-AD-2"[^>]*\\bid="\\1-AD-2"[^>]*>[\\s\\S]*?<span class="foreign"[^>]*>([^<]+)<\\/span>\\s*<\\/a>`,
    "gi",
  );
  /** @type {{ code: string, name: string }[]} */
  const out = [];
  let m;
  while ((m = re.exec(menuHtml))) {
    out.push({ code: m[1], name: decodeEaipTitle(m[2].trim()) });
  }
  return out;
}

/**
 * ICAO aerodrome codes under AD 2 for country NN (from menu anchors).
 * @param {string} menuHtml
 * @param {string} code
 * @returns {string[]} Uppercase ICAO
 */
export function parseAd2IcaosForCountry(menuHtml, code, menuBasename = "FR-menu-fr-FR.html") {
  const meta = parseMenuBasename(menuBasename);
  const prefix = meta?.prefix ?? "FR";
  const esc = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escP = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(?:href="${escP}-${esc}-AD-2\\.html#_${esc}AD-2\\.([A-Z0-9]{4})"|id="_${esc}AD-2\\.([A-Z0-9]{4})")`,
    "gi",
  );
  const set = new Set();
  let m;
  while ((m = re.exec(menuHtml))) {
    const icao = (m[1] || m[2] || "").toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(icao)) set.add(icao);
  }
  return [...set].sort();
}

/**
 * @param {string} menuBasename e.g. FR-menu-fr-FR.html
 * @returns {{ prefix: string, locale: string } | null}
 */
export function parseMenuBasename(menuBasename) {
  const m = String(menuBasename).match(/^([A-Za-z]{2})-menu-(.+)\.html$/i);
  if (!m) return null;
  return { prefix: m[1].toUpperCase(), locale: m[2] };
}

/**
 * GEN/ENR leaf basename after {@code formatLinks()} rewrites H4 {@code href} to
 * {@code FR + '-' + a.id + '-' + locale + '.html'}.
 * @param {string} anchorId Menu / DOM id, e.g. {@code _01GEN-1.2-01}
 * @param {string} [menuBasename]
 */
export function asecnaFormattedLeafBasename(anchorId, menuBasename = "FR-menu-fr-FR.html") {
  const meta = parseMenuBasename(menuBasename);
  const prefix = meta?.prefix ?? "FR";
  const locale = meta?.locale ?? "fr-FR";
  return `${prefix}-${anchorId}-${locale}.html`;
}

/**
 * AD 2 aerodrome basename: {@code FR-_NNAD-2.ICAO-locale.html} (H4 id is {@code _01AD-2.DBBB}).
 * @param {string} countryCode Two digits
 * @param {string} icao Four letters
 * @param {string} [menuBasename]
 */
export function asecnaAd2AirportBasename(countryCode, icao, menuBasename = "FR-menu-fr-FR.html") {
  const meta = parseMenuBasename(menuBasename);
  const prefix = meta?.prefix ?? "FR";
  const locale = meta?.locale ?? "fr-FR";
  const cc = String(countryCode).padStart(2, "0");
  const blockId = `_${cc}AD-2.${icao.toUpperCase()}`;
  return `${prefix}-${blockId}-${locale}.html`;
}

/** @param {string} htmlFile e.g. FR-_01GEN-1.2-01-fr-FR.html */
export function stemFromAsecnaHtmlFile(htmlFile) {
  return htmlFile.replace(/\.html$/i, "");
}

export function decodeEaipTitle(s) {
  if (!s) return s;
  return s
    .replace(/&#xA;|\r?\n/g, " ")
    .replace(/&#x9;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prefer English fragment in bilingual title= (French often precedes English). */
export function pickEnglishSubtitle(titleAttr) {
  const t = decodeEaipTitle(
    titleAttr.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"),
  );
  const englishHints = [
    /\bEntry,[\s\S]+$/i,
    /\bOverflight[\s\S]+$/i,
    /\bDesignated[\s\S]+$/i,
    /\bSummary of national[\s\S]+$/i,
    /\bDifferences from ICAO[\s\S]+$/i,
    /\bIndex to Aerodromes\b[\s\S]*$/i,
    /\bAERODROME LOCATION\b[\s\S]*$/,
  ];
  for (const re of englishHints) {
    const m = t.match(re);
    if (m) return m[0].replace(/\s+/g, " ").trim();
  }
  const parts = t.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1];
  return t;
}

/** @param {string[]} argv */
export function parseAsecnaCli(argv) {
  let insecureTls = process.env.ASECNA_TLS_INSECURE === "1";
  let strictTls = process.env.ASECNA_TLS_STRICT === "1";
  /** @type {string | null} */
  let menuBasename = process.env.ASECNA_MENU_FILE || null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--insecure") insecureTls = true;
    else if (a === "--strict-tls") strictTls = true;
    else if (a === "--menu" && argv[i + 1]) menuBasename = argv[++i];
  }
  return {
    insecureTls,
    strictTls: strictTls && !insecureTls,
    menuBasename: menuBasename || "FR-menu-fr-FR.html",
  };
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
 * @param {string} label
 */
export function createAsecnaFetch(label) {
  let tlsRelaxedLogged = false;

  function relaxTlsEnvironment() {
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") return;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    if (!tlsRelaxedLogged) {
      tlsRelaxedLogged = true;
      console.error(
        `[ASECNA ${label}] TLS verification failed; retrying with relaxed TLS. ` +
          "Use --strict-tls or ASECNA_TLS_STRICT=1 to disable auto-retry.",
      );
    }
  }

  /**
   * @param {string} url
   * @param {RequestInit} [init]
   * @param {{ strictTls: boolean }} tlsOpts
   */
  async function fetchAsecna(url, init = {}, tlsOpts) {
    const merged = { redirect: "follow", ...init };
    try {
      return await fetch(url, merged);
    } catch (err) {
      if (!tlsOpts.strictTls && isTlsVerifyError(err)) {
        relaxTlsEnvironment();
        return await fetch(url, merged);
      }
      throw err;
    }
  }

  /** @param {{ strictTls: boolean }} tlsOpts */
  async function fetchText(url, name, tlsOpts) {
    const res = await fetchAsecna(url, {}, tlsOpts);
    if (!res.ok) throw new Error(`${name}: ${res.status} ${res.statusText} — ${url}`);
    return res.text();
  }

  /** @param {{ strictTls: boolean }} tlsOpts */
  async function fetchOk(url, name, tlsOpts) {
    const res = await fetchAsecna(url, { method: "GET" }, tlsOpts);
    if (!res.ok) throw new Error(`${name}: ${res.status} ${res.statusText} — ${url}`);
    return res;
  }

  /** @param {{ strictTls: boolean }} tlsOpts */
  async function downloadPdfToFile(pdfUrl, filePath, name, tlsOpts) {
    const res = await fetchAsecna(pdfUrl, {}, tlsOpts);
    if (!res.ok) throw new Error(`${name}: ${res.status} ${res.statusText} — ${pdfUrl}`);
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("pdf") && !ct.includes("octet-stream")) {
      console.warn(`[warn] ${name}: unexpected Content-Type: ${ct}`);
    }
    mkdirSync(dirname(filePath), { recursive: true });
    const body = Readable.fromWeb(/** @type {import('stream/web').ReadableStream} */ (res.body));
    await pipeline(body, createWriteStream(filePath));
  }

  return { fetchAsecna, fetchText, fetchOk, downloadPdfToFile };
}
