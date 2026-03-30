/**
 * M-NAV North Macedonia eAIP — Part 1 (GEN) TOC aligned with `current/en/tree_items.js`.
 * The framed menu uses +/- nodes: expand GEN → “GEN 1 National regulations…” → e.g. GEN 1.2.
 * Each leaf points at a PDF path relative to `current/en/` (e.g. `../pdf/gen/LW_GEN_1_2_en.pdf`).
 *
 * AD 2: expand “AD 2 Aerodromes” → airport row → “Textpages” → `../pdf/aerodromes/LW_AD_2_{ICAO}_en.pdf`.
 */

import { MNAV_PACKAGE_ROOT_FALLBACK, MNAV_START_URL } from "./mnav-north-macedonia-eaip-resolve";

export { MNAV_PACKAGE_ROOT_FALLBACK, MNAV_START_URL };

export type MnavGenSection = {
  id: string;
  label: string;
  /** Path as in tree_items.js, relative to `…/current/en/` */
  pdfRel: string;
};

export type MnavGenGroup = {
  id: string;
  /** Short id for lists (e.g. GEN_1) */
  label: string;
  /** Menu row with the + control (e.g. GEN 1 National regulations…) */
  menuHeading: string;
  sections: MnavGenSection[];
};

export const MNAV_GEN_GROUPS: MnavGenGroup[] = [
  {
    id: "GEN_0",
    label: "GEN_0",
    menuHeading: "GEN 0 General rules and procedures",
    sections: [
      { id: "GEN 0.1", label: "GEN 0.1 Preface", pdfRel: "../pdf/gen/LW_GEN_0_1_en.pdf" },
      { id: "GEN 0.2", label: "GEN 0.2 Record of AIP Amendments", pdfRel: "../pdf/gen/LW_GEN_0_2_en.pdf" },
      { id: "GEN 0.3", label: "GEN 0.3 Record of AIP Supplements", pdfRel: "../pdf/gen/LW_GEN_0_3_en.pdf" },
      { id: "GEN 0.4", label: "GEN 0.4 Checklist of AIP pages", pdfRel: "../pdf/gen/LW_GEN_0_4_en.pdf" },
      { id: "GEN 0.5", label: "GEN 0.5 List of hand amendments to the AIP", pdfRel: "../pdf/gen/LW_GEN_0_5_en.pdf" },
      { id: "GEN 0.6", label: "GEN 0.6 Table of contents to Part 1", pdfRel: "../pdf/gen/LW_GEN_0_6_en.pdf" },
    ],
  },
  {
    id: "GEN_1",
    label: "GEN_1",
    menuHeading: "GEN 1 National regulations and requirements",
    sections: [
      { id: "GEN 1.1", label: "GEN 1.1 Designated authorities", pdfRel: "../pdf/gen/LW_GEN_1_1_en.pdf" },
      {
        id: "GEN 1.2",
        label: "GEN 1.2 Entry, transit and departure of aircraft",
        pdfRel: "../pdf/gen/LW_GEN_1_2_en.pdf",
      },
      {
        id: "GEN 1.3",
        label: "GEN 1.3 Entry, transit and departure of passengers and crew",
        pdfRel: "../pdf/gen/LW_GEN_1_3_en.pdf",
      },
      { id: "GEN 1.4", label: "GEN 1.4 Entry, transit and departure of cargo", pdfRel: "../pdf/gen/LW_GEN_1_4_en.pdf" },
      {
        id: "GEN 1.5",
        label: "GEN 1.5 Aircraft instruments, equipment and flight documents",
        pdfRel: "../pdf/gen/LW_GEN_1_5_en.pdf",
      },
      {
        id: "GEN 1.6",
        label: "GEN 1.6 Summary of national regulations and international agreements/conventions",
        pdfRel: "../pdf/gen/LW_GEN_1_6_en.pdf",
      },
      {
        id: "GEN 1.7",
        label: "GEN 1.7 Differences from ICAO Standards, Recommended Practices and Procedures",
        pdfRel: "../pdf/gen/LW_GEN_1_7_en.pdf",
      },
    ],
  },
  {
    id: "GEN_2",
    label: "GEN_2",
    menuHeading: "GEN 2 Tables and codes",
    sections: [
      { id: "GEN 2.1", label: "GEN 2.1 Measuring system, aircraft markings, holidays", pdfRel: "../pdf/gen/LW_GEN_2_1_en.pdf" },
      {
        id: "GEN 2.2",
        label: "GEN 2.2 Abbreviations used in aeronautical information products",
        pdfRel: "../pdf/gen/LW_GEN_2_2_en.pdf",
      },
      { id: "GEN 2.3", label: "GEN 2.3 Chart symbols", pdfRel: "../pdf/gen/LW_GEN_2_3_en.pdf" },
      { id: "GEN 2.4", label: "GEN 2.4 Location indicators", pdfRel: "../pdf/gen/LW_GEN_2_4_en.pdf" },
      { id: "GEN 2.5", label: "GEN 2.5 List of radio navigation aids", pdfRel: "../pdf/gen/LW_GEN_2_5_en.pdf" },
      { id: "GEN 2.6", label: "GEN 2.6 Conversion of units of measurement", pdfRel: "../pdf/gen/LW_GEN_2_6_en.pdf" },
      { id: "GEN 2.7", label: "GEN 2.7 Sunrise/sunset", pdfRel: "../pdf/gen/LW_GEN_2_7_en.pdf" },
    ],
  },
  {
    id: "GEN_3",
    label: "GEN_3",
    menuHeading: "GEN 3 Services",
    sections: [
      { id: "GEN 3.1", label: "GEN 3.1 Aeronautical information services", pdfRel: "../pdf/gen/LW_GEN_3_1_en.pdf" },
      { id: "GEN 3.2", label: "GEN 3.2 Aeronautical charts", pdfRel: "../pdf/gen/LW_GEN_3_2_en.pdf" },
      { id: "GEN 3.3", label: "GEN 3.3 Air traffic services", pdfRel: "../pdf/gen/LW_GEN_3_3_en.pdf" },
      { id: "GEN 3.4", label: "GEN 3.4 Communication and navigation services", pdfRel: "../pdf/gen/LW_GEN_3_4_en.pdf" },
      { id: "GEN 3.5", label: "GEN 3.5 Meteorological services", pdfRel: "../pdf/gen/LW_GEN_3_5_en.pdf" },
      { id: "GEN 3.6", label: "GEN 3.6 Search and rescue", pdfRel: "../pdf/gen/LW_GEN_3_6_en.pdf" },
    ],
  },
  {
    id: "GEN_4",
    label: "GEN_4",
    menuHeading: "GEN 4 Charges for aerodromes/heliports and air navigation services",
    sections: [
      { id: "GEN 4.1", label: "GEN 4.1 Aerodrome/heliport charges", pdfRel: "../pdf/gen/LW_GEN_4_1_en.pdf" },
      { id: "GEN 4.2", label: "GEN 4.2 Air navigation services charges", pdfRel: "../pdf/gen/LW_GEN_4_2_en.pdf" },
    ],
  },
];

/** Aerodromes under AD 2 in tree_items.js (sync when M-NAV adds bases). */
export const MNAV_AD2_AERODROMES: { icao: string; menuLabel: string }[] = [
  { icao: "LWOH", menuLabel: "LWOH - Ohrid" },
  { icao: "LWSK", menuLabel: "LWSK - Skopje" },
];

export function mnavPdfUrlFromMenuRelative(pdfRel: string, enFrameRoot: string): string {
  const base = enFrameRoot.replace(/\/?$/, "/");
  return new URL(pdfRel, base).href;
}

/** AD 2 “Textpages” PDF for an aerodrome (menu: AD 2 Aerodromes → ICAO → Textpages). */
export function mnavAd2TextPagesPdfUrl(icao: string, enFrameRoot: string): string {
  const rel = `../pdf/aerodromes/LW_AD_2_${icao.toUpperCase()}_en.pdf`;
  return mnavPdfUrlFromMenuRelative(rel, enFrameRoot);
}
