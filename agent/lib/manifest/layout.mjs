// Passenger Manifest — page geometry, from passenger-manifest-spec.md (the design project's spec, measured from
// CWY PAX Manifest.pdf's own drawing operators). Units are PDF points; x from the page's LEFT edge, y from the page's
// TOP edge (the renderer flips to PDF's bottom-up space in one place). Where an overlay on the reference PDF showed
// a spec value to be off, the line is marked "OVERLAY" with both values (and README.md lists them).
//
// The source PDF was laid out in a 1021-unit-wide space with its origin at (28.8, 28.8). Every rule, cell and font
// size is a whole number of those units, so they are written here IN UNITS and converted with the exact scale.
// OVERLAY: the spec converts with 0.768 pt per unit; the reference's own matrix is 0.48 × 1.60039174 = 0.768188.
// The difference grows to 0.19 pt at the table's right edge, so the exact factor is used. Text positions in the spec
// (label x, baselines) were MEASURED, not converted, and are used as given.

export const UNIT = 0.48 * 1.60039174; // 0.7681880352 pt
export const ORIGIN = 28.8;
const at = (u) => ORIGIN + u * UNIT; // a position, in units from the origin
const len = (u) => u * UNIT; // a length, in units

export const PAGE = { width: 842, height: 595 }; // A4 landscape
export const CONTENT = { left: at(0), right: at(1021) }; // 28.8 … 813.12
export const RULE = len(1);

// Font sizes are whole units: 32 / 14 / 12 / 10 (24.58 / 10.75 / 9.22 / 7.68 pt).
export const SIZE = { title: len(32), label: len(14), value: len(12), heading: len(10), caption: len(10), pageNo: len(10) };

// §3.1 Top
export const LOGO_BOX = { x: at(0), y: at(0), width: len(213), height: len(43) }; // 163.62 × 33.03
// OVERLAY: the spec centres the title on 420.87 (the box 28.8–812.93); the reference's own title is centred on
// 420.76 (measured from the PDF). The reference wins: it is the document being reproduced.
export const TITLE = { text: "Passenger Manifest", centreX: 420.76, baseline: 49.54 };
export const PAGE_NO = { right: at(1021), baseline: 35.75 }; // the table's right edge

// §3.2 Header block. Labels left-aligned at labelX (measured); underlines 162 units long; values centred on the
// underline, on the label's baseline.
export const UNDERLINE_WIDTH = len(162); // 124.45
export const HEADER_FIELDS = [
  { key: "operatorName", label: "Owner or Operator", labelX: 29.57, baseline: 102.55, lineX: at(240), lineTop: at(102) },
  { key: "registration", label: "Marks of Nationality and Registration", labelX: 29.57, baseline: 127.13, lineX: at(240), lineTop: at(134) },
  { key: "flightNumber", label: "Flight No", labelX: 338.38, baseline: 127.13, lineX: at(469), lineTop: at(134) },
  { key: "flightDate", label: "Date", labelX: 514.29, baseline: 127.13, lineX: at(672), lineTop: at(134) },
  { key: "departureIcao", label: "Departure from", labelX: 29.57, baseline: 151.71, lineX: at(240), lineTop: at(166) },
  { key: "arrivalIcao", label: "Arrival at", labelX: 338.38, baseline: 151.71, lineX: at(469), lineTop: at(166) },
];

// §3.3 Table: 16 horizontal rules (top of the heading row, under it, and 14 row bottoms) + 8 verticals.
const TABLE_TOP_U = 187;
const ROW_U = 20;
export const TABLE = {
  x: at(0),
  width: len(1021),
  top: at(TABLE_TOP_U), // 172.45
  rowPitch: len(ROW_U), // 15.36
  rows: 14, // passenger rows per page (plus one heading row)
  verticals: [0, 239, 285, 449, 627, 783, 876, 1020].map(at),
  verticalHeight: len(301),
  headingBaseline: 180.90,
};
const col = (key, heading, fromU, toU) => ({ key, heading, x: at(fromU), width: len(toU - fromU) });
export const COLUMNS = [
  col("name", "SURNAME AND NAMES", 0, 239),
  col("sex", "SEX", 239, 285),
  col("dateOfBirth", "DATE OF BIRTH", 285, 449),
  col("placeOfBirth", "PLACE OF BIRTH", 449, 627),
  col("documentNumber", "PASSPORT No.", 627, 783),
  col("documentExpiry", "EXPIRES", 783, 876),
  col("nationality", "NATIONALITY", 876, 1021),
];
/** Top of passenger row n (1–14). */
export const rowTop = (n) => at(TABLE_TOP_U + ROW_U * n);
/** Single-line baseline in a row, for a given size: centred in the row (spec §3.3). */
export const rowBaseline = (top, size) => top + 7.68 + 0.358 * size;
export const ROW_WRAP_BASELINES = [6.60, 13.50]; // two-line cell: rowTop + these

// §3.4 Overflow rule
export const FIT = {
  pad: 3.07, // 1.54 each side
  sizes: [len(12), len(11), len(10), len(9)], // 9.22, 8.45, 7.68, 6.91
  wrapSize: len(8), // 6.14
  fieldLine1Above: 7.0, // header/footer two-line field: line 2 on the baseline, line 1 this far above
  ellipsis: "…",
};

// §3.5 Footer (last page only)
export const FOOTER = {
  crew: { label: "Number of Crew", labelX: 29.57, baseline: 431.33, lineX: at(123), lineTop: at(530) },
  pob: { label: "Persons on Board", labelX: 29.57, baseline: 455.91, lineX: at(123), lineTop: at(562) },
  signature: { label: "Signature", labelX: 29.57, baseline: 495.86 },
  dots: { text: ".".repeat(69), x: 145.18, baseline: 495.86 },
  // OVERLAY: the spec centres the caption in 145.18–291.77 (centre 218.48); the reference draws it centred on 217.83.
  caption: { text: "Authorized Agent or pilot-in Command", centreX: 217.83, baseline: 510.45 },
};

export const PASSENGERS_PER_PAGE = TABLE.rows;
