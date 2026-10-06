// Passenger Manifest — the four open questions from the spec (§7), each ONE named constant so ops can change the
// answer here without touching the layout. Defaults per the build brief.

/**
 * 1. Persons on Board — does it include crew?
 *    true  = passengers + crew (default: the form already has its own "Number of Crew" line directly above).
 *    false = passengers only.
 * Leon has no Persons-on-Board field; its own passenger counts are compared and any disagreement is a warning.
 */
export const PERSONS_ON_BOARD_INCLUDES_CREW = true;

/**
 * 2. Nationality format.
 *    "as-stored" = Leon's Country.name exactly as the operator entered it (default: what should match the document).
 *    "iso"       = Leon's Country.codeIso as stored (no conversion of our own either way).
 */
export const NATIONALITY_FORMAT = "as-stored";

/**
 * 3. Which travel document fills PASSPORT No. / EXPIRES.
 *    "departure" (default, as the spec has it) or "arrival".
 * When the other leg's document differs, the generator returns a warning naming the passenger's row.
 */
export const DOCUMENT_LEG = "departure";

/**
 * 4. Logo source.
 *    "svg"    = the design's SVG fitted inside the reference's image box (default).
 *    "raster" = the reference PDF's own logo image at exactly 163.58 × 33.02.
 * Chosen by overlay against CWY PAX Manifest.pdf: the SVG is different artwork (larger mark, heavier lettering) and
 * its ink box missed the reference's by up to 10 pt, so the reference's own image is used (see README.md).
 */
export const LOGO_SOURCE = "raster";

/** Days a generated manifest's bytes are kept (the row recording that it was generated stays). */
export const MANIFEST_RETENTION_DAYS = 30;
