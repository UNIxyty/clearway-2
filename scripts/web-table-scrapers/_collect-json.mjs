/**
 * Shared helpers for headless `node ...-interactive.mjs --collect`.
 * Collect mode must print exactly one JSON line to stdout: { effectiveDate, ad2Icaos }.
 */

export function collectMode(argv = process.argv) {
  return argv.includes("--collect");
}

const NON_ICAO_TOKENS = new Set([
  "EAIP",
  "AIPM",
  "AD2A",
  "GEN1",
  "GEN2",
  "AMDT",
  "SUPP",
  "AIRA",
  "HTML",
  "PDFS",
  "NONE",
  "NULL",
]);

/** First ISO date (YYYY-MM-DD) found in a string, or null. */
export function isoDateFromText(value) {
  const s = String(value || "");
  const iso = s.match(/\b(20\d{2})[-_](\d{2})[-_](\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const compact = s.match(/\b(20\d{2})(\d{2})(\d{2})\b/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const rev = s.match(/\b(\d{2})[-_](\d{2})[-_](20\d{2})\b/);
  if (rev) return `${rev[3]}-${rev[2]}-${rev[1]}`;
  const my = s.match(/\b(\d{1,2})[-/](\d{4})\b/);
  if (my) {
    const mo = String(my[1]).padStart(2, "0");
    return `${my[2]}-${mo}-01`;
  }
  return null;
}

/** Pick item whose textFromItem contains the newest parseable date; else items[0]. */
export function pickNewestIssueByIso(items, textFromItem) {
  if (!items?.length) return null;
  let best = items[0];
  let bestTs = Number.NEGATIVE_INFINITY;
  for (const x of items) {
    const iso = isoDateFromText(String(textFromItem(x) || ""));
    const ts = iso ? Date.parse(`${iso}T00:00:00Z`) : Number.NEGATIVE_INFINITY;
    if (ts > bestTs) {
      bestTs = ts;
      best = x;
    }
  }
  return best;
}

export function printCollectJson({ effectiveDate, ad2Icaos }) {
  const icaos = [
    ...new Set(
      (ad2Icaos || [])
        .map((x) => String(x).toUpperCase().trim())
        .filter((x) => /^[A-Z]{4}$/.test(x) && !NON_ICAO_TOKENS.has(x)),
    ),
  ].sort((a, b) => a.localeCompare(b));
  let ed = null;
  if (effectiveDate != null && String(effectiveDate).trim() !== "") {
    const s = String(effectiveDate).trim();
    ed = isoDateFromText(s) ?? s;
  }
  console.log(JSON.stringify({ effectiveDate: ed, ad2Icaos: icaos }));
}
