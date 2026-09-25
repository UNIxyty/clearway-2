// Revision sidecar for cached AIP PDFs — plain ESM so the aip-sync worker, the
// backfill script and the portal (via lib/airac.ts) share one definition.
//
// Every cached PDF `aip/<ns>/<NAME>.pdf` gets a sibling `aip/<ns>/<NAME>.meta.json`:
//
//   {
//     icao, source,                       // "EVRA", "ead" | "scraper" | "usa" | "asecna" | "gen" | ...
//     effectiveDate: "2026-01-22" | null, // what the SOURCE said (EAD table column / dated filename)
//     airac: "2601" | null,               // derived from effectiveDate when it falls on a cycle date
//     airacFlag: true | false | null,     // EAD's own "AIRAC" column, when read
//     revisionSource: "ead-table" | "filename" | "none",
//     sourceFilename, sourceUrl,          // the file as the source named it
//     sha256, bytes, fetchedAt,           // this copy
//     history: [{ effectiveDate, airac, sha256, fetchedAt }]  // earlier copies under the same key
//   }
//
// The rule: UNKNOWN IS NOT CURRENT. When the source gave no date the sidecar
// still exists (fetchedAt is real) with effectiveDate null — never a guess.

import { createHash } from "node:crypto";

export function metaKeyFor(pdfKey) {
  return String(pdfKey).replace(/\.pdf$/i, "") + ".meta.json";
}

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const pad = (n) => String(n).padStart(2, "0");

/** "2026-01-22", "22 JAN 2026", "22-JAN-26", "22/01/2026" → "2026-01-22"; null when nothing parses. */
export function parseSourceDate(text) {
  const s = String(text ?? "").trim();
  if (!s) return null;
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /(\d{1,2})[ \-/.]([A-Za-z]{3})[ \-/.](\d{2,4})/.exec(s);
  if (m && MONTHS[m[2].toUpperCase()]) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return `${y}-${pad(MONTHS[m[2].toUpperCase()])}-${pad(m[1])}`; }
  m = /(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}

/** Effective date embedded in a source filename: EAD `LZ_AD_2_LZIB_en_2026-01-22.pdf`, scrapers `2026-10-01_UM_AD_2_UMGG_en.pdf`. */
export function effectiveDateFromFilename(name) {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(String(name ?? ""));
  return m ? m[1] : null;
}

// AIRAC calendar: 28-day cycles; 2026-01-22 is AIRAC 2601. Same maths as lib/airac.ts and agent/lib/knowledge/revision.mjs.
const AIRAC_EPOCH_UTC = Date.UTC(2026, 0, 22);
const CYCLE_MS = 28 * 24 * 3600 * 1000;
function firstCycleOfYear(year) {
  let first = new Date(AIRAC_EPOCH_UTC);
  while (first.getUTCFullYear() < year) first = new Date(first.getTime() + CYCLE_MS);
  while (first.getUTCFullYear() > year) first = new Date(first.getTime() - CYCLE_MS);
  while (new Date(first.getTime() - CYCLE_MS).getUTCFullYear() === year) first = new Date(first.getTime() - CYCLE_MS);
  return first;
}
/** "2601" when the date is exactly an AIRAC effective date, else null (a non-AIRAC amendment date is not a cycle). */
export function airacForDate(effectiveDate) {
  if (!effectiveDate) return null;
  const t = Date.parse(`${effectiveDate}T00:00:00Z`);
  if (Number.isNaN(t) || (t - AIRAC_EPOCH_UTC) % CYCLE_MS !== 0) return null;
  const d = new Date(t); const first = firstCycleOfYear(d.getUTCFullYear());
  return `${String(d.getUTCFullYear()).slice(2)}${pad(Math.round((t - first.getTime()) / CYCLE_MS) + 1)}`;
}

export function sha256Of(buffer) { return createHash("sha256").update(buffer).digest("hex"); }

/**
 * Build the sidecar for a copy about to be stored.
 * @param {object} p { icao, source, body, sourceFilename, sourceUrl, sidecar (downloader's .meta.json contents), previous (existing sidecar) }
 */
export function buildRevisionMeta({ icao, source, body, sourceFilename = null, sourceUrl = null, sidecar = null, previous = null, fetchedAt = new Date().toISOString() }) {
  const fromTable = sidecar?.effectiveDate ? parseSourceDate(sidecar.effectiveDate) : null;
  const fromName = effectiveDateFromFilename(sourceFilename ?? sidecar?.sourceFilename ?? "");
  const effectiveDate = fromTable ?? fromName ?? null;
  const sha256 = sha256Of(body);
  const history = Array.isArray(previous?.history) ? [...previous.history] : [];
  if (previous?.sha256 && previous.sha256 !== sha256) {
    history.push({ effectiveDate: previous.effectiveDate ?? null, airac: previous.airac ?? null, sha256: previous.sha256, fetchedAt: previous.fetchedAt ?? null });
  }
  return {
    icao: icao ? String(icao).toUpperCase() : null,
    source: source ?? null,
    effectiveDate,
    airac: airacForDate(effectiveDate),
    airacFlag: typeof sidecar?.airacFlag === "boolean" ? sidecar.airacFlag : null,
    revisionSource: fromTable ? "ead-table" : fromName ? "filename" : "none",
    sourceFilename: sourceFilename ?? sidecar?.sourceFilename ?? null,
    sourceUrl: sourceUrl ?? sidecar?.sourceUrl ?? null,
    sha256,
    bytes: body.length,
    fetchedAt,
    history: history.slice(-12),
  };
}
