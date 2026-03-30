/**
 * INAC Venezuela eAIP — Part 1 (GEN) table of contents for portal deep links.
 * HTML filenames use a space after the prefix (e.g. `SV-GEN 1.2-en-GB.html`).
 * PDFs live under `/pdf/eAIP/` with stem `GEN 1.2` (same as the official “PDF” toolbar
 * button: `commands.js` replaces `/html` → `/pdf` and maps the current HTML name).
 * Update these constants when INAC publishes a new effective-date tree.
 */

export const INAC_EAIP_PACKAGE_ROOT =
  "https://www.inac.gob.ve/eaip/2020-07-16";

export const INAC_EAIP_HTML_BASE = `${INAC_EAIP_PACKAGE_ROOT}/html/eAIP`;

export type InacGenSection = {
  /** Stable id matching official menu, e.g. GEN_1, GEN 1.2 */
  id: string;
  label: string;
  /** Path segment under eAIP/, URL-encoded when built */
  file: string;
};

export type InacGenGroup = {
  id: string;
  label: string;
  sections: InacGenSection[];
};

export const INAC_GEN_GROUPS: InacGenGroup[] = [
  {
    id: "GEN_0",
    label: "GEN_0",
    sections: [
      { id: "GEN 0.1", label: "GEN 0.1 PREFACE", file: "SV-GEN 0.1-en-GB.html" },
      { id: "GEN 0.2", label: "GEN 0.2 RECORD OF AIP AMENDMENT", file: "SV-GEN 0.2-en-GB.html" },
      { id: "GEN 0.3", label: "GEN 0.3 RECORD OF AIP SUPPLEMEMNTS", file: "SV-GEN 0.3-en-GB.html" },
      { id: "GEN 0.4", label: "GEN 0.4 CHECKLIST", file: "SV-GEN 0.4-en-GB.html" },
      { id: "GEN 0.5", label: "GEN 0.5 LIST OF HANDWRITTEN-AMENDMENTS TO AIP", file: "SV-GEN 0.5-en-GB.html" },
      { id: "GEN 0.6", label: "GEN 0.6 PART 1 INDEX", file: "SV-GEN 0.6-en-GB.html" },
    ],
  },
  {
    id: "GEN_1",
    label: "GEN_1",
    sections: [
      { id: "GEN 1.1", label: "GEN 1.1 DESIGNATED AUTHORITIES", file: "SV-GEN 1.1-en-GB.html" },
      {
        id: "GEN 1.2",
        label: "GEN 1.2 ENTRY, TRANSIT AND DEPARTURE AIRCRAFT",
        file: "SV-GEN 1.2-en-GB.html",
      },
      {
        id: "GEN 1.3",
        label: "GEN 1.3 ENTRY, TRANSIT AND DEPARTURE OF PASSENGERS AND CREW",
        file: "SV-GEN 1.3-en-GB.html",
      },
      {
        id: "GEN 1.4",
        label: "GEN 1.4 ENTRY TRANSIT AND DEPARTURE OF CARGO",
        file: "SV-GEN 1.4-en-GB.html",
      },
      {
        id: "GEN 1.5",
        label: "GEN 1.5 AIRCRAFT INSTRUMENTS, EQUIPMENT AND FLIGHT DOCUMENTS",
        file: "SV-GEN 1.5-en-GB.html",
      },
      {
        id: "GEN 1.6",
        label: "GEN 1.6 SUMMARY OF NATIONAL REGULATIONS AND INTERNATIONAL AGREEMENTS/CONVENTIONS",
        file: "SV-GEN 1.6-en-GB.html",
      },
      {
        id: "GEN 1.7",
        label: "GEN 1.7 DIFFERENCES CONCERNING OF THE NORMS, RECOMMENDED METHODS AND PROCEDUR",
        file: "SV-GEN 1.7-en-GB.html",
      },
    ],
  },
  {
    id: "GEN_2",
    label: "GEN_2",
    sections: [
      { id: "GEN 2.1", label: "GEN 2.1 MEASURING SYSTEM, AIRCRAFT MARKINGS, HOLIDAYS", file: "SV-GEN 2.1-en-GB.html" },
      { id: "GEN 2.2", label: "GEN 2.2 ABBREVIATIONS USED IN THE PUBLISHER OF THE AIS", file: "SV-GEN 2.2-en-GB.html" },
      { id: "GEN 2.3", label: "GEN 2.3 CHART SYMBOLS", file: "SV-GEN 2.3-en-GB.html" },
      { id: "GEN 2.4", label: "GEN 2.4 LOCATION INDICATORS", file: "SV-GEN 2.4-en-GB.html" },
      { id: "GEN 2.5", label: "GEN 2.5 LIST OF RADIO NAVIGATION AIDS", file: "SV-GEN 2.5-en-GB.html" },
      { id: "GEN 2.6", label: "GEN 2.6 CONVERSION TABLES", file: "SV-GEN 2.6-en-GB.html" },
      { id: "GEN 2.7", label: "GEN 2.7 SUNRISE SUNSET TABLES", file: "SV-GEN 2.7-en-GB.html" },
    ],
  },
  {
    id: "GEN_3",
    label: "GEN_3",
    sections: [
      { id: "GEN 3.1", label: "GEN 3.1 AERONAUTICAL INFORMATION SERVICES", file: "SV-GEN 3.1-en-GB.html" },
      { id: "GEN 3.2", label: "GEN 3.2 AERONAUTICAL CHARTS", file: "SV-GEN 3.2-en-GB.html" },
      { id: "GEN 3.3", label: "GEN 3.3 AIR TRAFFIC SERVICE", file: "SV-GEN 3.3-en-GB.html" },
      { id: "GEN 3.4", label: "GEN 3.4 COMUNICATION SERVICES", file: "SV-GEN 3.4-en-GB.html" },
      { id: "GEN 3.5", label: "GEN 3.5 METEOROLOGICAL SERVICES", file: "SV-GEN 3.5-en-GB.html" },
      { id: "GEN 3.6", label: "GEN 3.6 SEARCH AND RESCUE", file: "SV-GEN 3.6-en-GB.html" },
    ],
  },
  {
    id: "GEN_4",
    label: "GEN_4",
    sections: [
      {
        id: "GEN 4.1",
        label: "GEN 4.1 CHARGES FOR AERODROMES/HELIPORTS AND AIR NAVIGATION SERVICES",
        file: "SV-GEN 4.1-en-GB.html",
      },
      { id: "GEN 4.2", label: "GEN 4.2 AIR NAVIGATION SERVICES CHARGES", file: "SV-GEN 4.2-en-GB.html" },
    ],
  },
];

export function inacEaipGenHtmlUrl(file: string): string {
  return `${INAC_EAIP_HTML_BASE}/${encodeURIComponent(file)}`;
}

/**
 * Direct PDF URL for a GEN HTML file name (e.g. `GEN 1.2.pdf` under `pdf/eAIP/`).
 */
export function inacEaipGenPdfUrl(htmlFile: string): string {
  const m = htmlFile.match(/^([A-Z]{2})-(.+)-en-GB\.html$/i);
  if (!m) {
    throw new Error(`Unexpected INAC GEN HTML filename: ${htmlFile}`);
  }
  const pdfStem = m[2];
  return `${INAC_EAIP_PACKAGE_ROOT}/pdf/eAIP/${encodeURIComponent(pdfStem)}.pdf`;
}

/** Part 3 AD 2.1 aerodrome HTML filename for Venezuela eAIP (ICAO e.g. SVMC). */
export function inacAd21HtmlFile(icao: string): string {
  const x = icao.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(x)) {
    throw new Error(`ICAO must be 4 letters: ${icao}`);
  }
  return `SV-AD2.1${x}-en-GB.html`;
}

/** Official INAC PDF URL for AD 2.1 (same as toolbar PDF after opening that aerodrome HTML). */
export function inacAd21PdfUrl(icao: string): string {
  return inacEaipGenPdfUrl(inacAd21HtmlFile(icao));
}
