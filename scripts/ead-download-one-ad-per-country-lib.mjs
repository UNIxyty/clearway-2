export function argValueFromArgv(argv, name, fallback = '') {
  const exactIndex = argv.indexOf(name);
  if (exactIndex !== -1 && argv[exactIndex + 1]) return argv[exactIndex + 1];

  const withEquals = argv.find((a) => a.startsWith(`${name}=`));
  if (withEquals) {
    const [, value = ''] = withEquals.split('=');
    return value || fallback;
  }

  return fallback;
}

export function hasFlagInArgv(argv, name) {
  return argv.includes(name);
}

export function isAd2Heading(heading) {
  const h = String(heading || '').trim().replace(/\s+/g, ' ').toUpperCase();
  return /^AD 2\b/.test(h);
}

export function isAd2DocumentName(name) {
  return /_AD_2_/i.test(String(name || ''));
}

export function isAd2AirportDocumentName(name) {
  return /_AD_2_[A-Z0-9]{4}_/i.test(String(name || ''));
}

/** AD 2 section “0” / bundled intro (e.g. LG_AD_2_0_en) — not a single aerodrome. */
export function isAd2SectionZeroBundle(name) {
  return /_AD_2_0_/i.test(String(name || ''));
}

/** Non-aerodrome AD2 slot sometimes published (e.g. ENRT). */
export function isAd2NonAerodromeAirportSlot(name) {
  return /_AD_2_ENRT_/i.test(String(name || ''));
}

/**
 * Prefer this for “one airport per country”: real 4-char AD2 file, not section 0 / ENRT.
 */
export function isPreferredAd2AerodromeFile(name) {
  const s = String(name || '');
  if (!isAd2AirportDocumentName(s)) return false;
  if (isAd2SectionZeroBundle(s)) return false;
  if (isAd2NonAerodromeAirportSlot(s)) return false;
  return true;
}

/** Extract ICAO from AD2 filename segment …_AD_2_XXXX_… (first match). */
export function extractIcaoFromAd2Filename(name) {
  const m = String(name || '').match(/_AD_2_([A-Z0-9]{4})_/i);
  return m ? m[1].toUpperCase() : null;
}

/** ICAO-like prefix from EAD dropdown label, e.g. "France (LF)" → "LF". */
export function icaoPrefixFromAuthorityLabel(label) {
  const m = String(label || '').match(/\(([A-Z0-9]{2})\)\s*$/);
  return m ? m[1].toUpperCase() : null;
}

/** True if this country should be run with --only-pending (never started, or last run did not succeed). */
export function countryNeedsEadRetry(priorResult) {
  if (!priorResult) return true;
  if (priorResult.status === 'downloaded') return false;
  if (priorResult.status === 'skipped_already_downloaded') return false;
  return true;
}
