/**
 * Extract airport fields from EAD AD 2 PDFs (data/ead-aip/*.pdf) into the same
 * schema as aip-data.json / airport database:
 *   Airport Code, Airport Name,
 *   AD2.2 Types of Traffic Permitted, AD2.2 Remarks,
 *   AD2.3 AD Operator, AD 2.3 Customs and Immigration, AD2.3 ATS, AD2.3 Remarks,
 *   AD2.6 AD category for fire fighting
 *
 * Before extracting, the script reads the PDF note "Note: The following sections in this
 * chapter are intentionally left blank: AD 2.7, AD 2.10, ...". If AD 2.2, 2.3 or 2.6 are
 * in that list, those fields are forced to NIL. AD 2.6 uses only the "AD category for
 * fire fighting" value (remarks in that section are not appended).
 *
 * Usage: node scripts/ead-extract-aip-from-pdf.mjs [dir]
 * Default dir: data/ead-aip
 * Output: data/ead-aip-extracted.json (array of airport records)
 */

import { readFile, readdir, writeFile } from "fs/promises";
import { join } from "path";
import { PDFParse } from "pdf-parse";

const DEFAULT_DIR = join(process.cwd(), "data", "ead-aip");
const OUT_PATH = join(process.cwd(), "data", "ead-aip-extracted.json");

function normalize(s) {
  if (typeof s !== "string") return "";
  return s.replace(/\s+/g, " ").trim();
}

function extractBetween(text, startMark, endMark) {
  const i = text.indexOf(startMark);
  if (i === -1) return "";
  const from = i + startMark.length;
  const j = endMark ? text.indexOf(endMark, from) : text.length;
  const raw = j === -1 ? text.slice(from) : text.slice(from, j);
  return normalize(raw);
}

// Take first line or first N chars to avoid capturing whole page
function firstLine(s, maxLen = 300) {
  const t = normalize(s);
  const line = t.split(/\n|~+/)[0] || t;
  return line.length > maxLen ? line.slice(0, maxLen) : line;
}

function firstMatch(text, regex) {
  const m = text.match(regex);
  return m ? normalize(m[1] || m[0]) : "";
}

/**
 * Parse "Note: The following sections... are intentionally left blank: AD 2.7, AD 2.10, ..."
 * Returns a Set of section numbers we care about if blank: "2.2", "2.3", "2.6"
 */
function parseIntentionallyLeftBlank(text) {
  const blank = new Set();
  const noteMatch = text.match(/Note:\s*The following sections[^.]*intentionally left blank[:\s]*([\s\S]+?)(?=\n\n|[A-Z]{4}\s+AD\s+2\.|$)/i);
  if (!noteMatch) return blank;
  const list = noteMatch[1];
  const re = /AD[- ]?2\.(\d+)/gi;
  let m;
  while ((m = re.exec(list)) !== null) blank.add("2." + m[1]);
  return blank;
}

/**
 * Parse extracted PDF text for one AD 2 PDF and return one airport record
 * matching aip-data.json airport object shape.
 * If the PDF notes that AD 2.2, 2.3 or 2.6 are "intentionally left blank", those fields are set to NIL.
 */
function parseAd2Text(text, icaoFromFilename) {
  const leftBlank = parseIntentionallyLeftBlank(text);
  const blank22 = leftBlank.has("2.2");
  const blank23 = leftBlank.has("2.3");
  const blank26 = leftBlank.has("2.6");
  const out = {
    "Airport Code": icaoFromFilename,
    "Airport Name": "",
    "AD2.2 Types of Traffic Permitted": "IFR / VFR",
    "AD2.2 Remarks": "NIL",
    "AD2.3 AD Operator": "NIL",
    "AD 2.3 Customs and Immigration": "NIL",
    "AD2.3 ATS": "NIL",
    "AD2.3 Remarks": "NIL",
    "AD2.6 AD category for fire fighting": "NIL",
  };

  // ICAO from text if not from filename (e.g. "EVAD AD 2.1" or "EBAM AD 2.1")
  const icaoMatch = text.match(/\b([A-Z]{4})\s+AD\s+2\.1\b/i);
  if (icaoMatch) out["Airport Code"] = icaoMatch[1].toUpperCase();

  // AD 2.1 — Name: line like "EVAD — ADAZI" or "EBAM - AMOUGIES" (right after AD 2.1 title)
  const ad21Block = extractBetween(text, "AD 2.1", "AD 2.2");
  const nameMatch = ad21Block.match(/\b[A-Z]{4}\s*[—\-]\s*([^\n~]+)/) || text.match(/\b[A-Z]{4}\s*[—\-]\s*([A-Za-z\u00C0-\u024F\s\-']+?)(?=\s*~|\n\n|AD\s+2\.)/);
  if (nameMatch) {
    let name = normalize(nameMatch[1]);
    if (out["Airport Code"] && name.endsWith(" " + out["Airport Code"])) name = name.slice(0, -out["Airport Code"].length - 1).trim();
    out["Airport Name"] = name;
  }

  // AD 2.2 block (until AD 2.3) — skip if section is "intentionally left blank"
  if (!blank22) {
    const ad22 = extractBetween(text, "AD 2.2", "AD 2.3");
    if (ad22) {
      const traffic = firstMatch(ad22, /(?:7\s+Types of traffic permitted\s*\(IFR\/VFR\))\s*([^\n8]+)/i)
        || firstMatch(ad22, /Types of traffic permitted[^\n]*\s+([A-Za-z\s\/]+?)(?=\s*8\s+Remarks|\n8\s|$)/i)
        || firstMatch(ad22, /\b(VFR(?:\s+by\s+day\/night)?|IFR(?:\s*\/\s*VFR)?)\b/);
      if (traffic) out["AD2.2 Types of Traffic Permitted"] = firstLine(traffic, 80);
      const remarks2 = firstMatch(ad22, /(?:8\s+)?Remarks\s+([^\n]+?)(?=\s*~|$)/i) || firstMatch(ad22, /Remarks\s+([^\n]+)/i);
      if (remarks2 && !/^NIL$/i.test(remarks2)) out["AD2.2 Remarks"] = firstLine(remarks2, 200);
    }
    if (/subject to prior permission from the operator/i.test(ad22) || /subject to prior permission from the operator/i.test(text))
      out["AD2.2 Remarks"] = "The use of the aerodrome is subject to prior permission from the operator.";
  }

  // AD 2.3 block — skip if section is "intentionally left blank"
  if (!blank23) {
  const ad23 = extractBetween(text, "AD 2.3 OPERATIONAL", "AD 2.4");
  const ad23b = extractBetween(text, "AD 2.3 Operational", "AD 2.4");
  const ad23c = extractBetween(text, "AD 2.3", "AD 2.4");
  const ad23Block = (ad23 || ad23b || ad23c).slice(0, 1200);
  if (ad23Block) {
    const operator = firstMatch(ad23Block, /AD operator[:\s]+(MON[- ]?FRI[^\n]+?)(?=\s*2\s+Customs|Customs)/i)
      || firstMatch(ad23Block, /(MON[- ]?FRI\s+[\d\-:()]+[^\n]*)/i)
      || firstMatch(ad23Block, /(?:1\s+)?AD operator[:\s]+([^\n]+?)(?=\s*2\s+Customs|Customs|$)/i)
      || firstMatch(ad23Block, /(H24|HS|O\/R)/i);
    if (operator) out["AD2.3 AD Operator"] = firstLine(operator, 120);
    const customs = firstMatch(ad23Block, /(?:2\s+)?Customs and immigration\s+([^\n]+)/i);
    if (customs) out["AD 2.3 Customs and Immigration"] = firstLine(customs.split(/\d+\s+Health/)[0], 80);
    const ats = firstMatch(ad23Block, /(?:7\s+ATS)\s+(NIL|H24|O\/R|AFIS[^\n]*?)(?=\s*8\s+Fuelling|\s*8\s+|\n|$)/i)
      || firstMatch(ad23Block, /(?:3\s+)?ATS\s+(NIL|H24|O\/R|AFIS[^\n]*?)(?=\s*\d+\s+|\n|$)/i);
    if (ats && !/sanitation|Health|ARO Riga|Briefing/i.test(ats)) out["AD2.3 ATS"] = firstLine(ats, 50);
    const remarks3 = firstMatch(ad23Block, /(?:3\s+)?Remarks\s+([^\n]+)/i);
    if (remarks3 && !/^NIL$/i.test(remarks3)) out["AD2.3 Remarks"] = firstLine(remarks3, 120);
  }
  }

  // AD 2.6 — use only "AD category for fire fighting" value (do not append Remarks). Skip if "intentionally left blank".
  if (!blank26) {
    const ad26 = extractBetween(text, "AD 2.6 RESCUE", "AD 2.7");
    const ad26b = extractBetween(text, "AD 2.6", "AD 2.7");
    const ad26c = extractBetween(text, "AD 2.6", "AD 2.8");
    const ad26Block = (ad26 || ad26b || ad26c).slice(0, 500);
    if (ad26Block) {
      const fire = firstMatch(ad26Block, /(?:1\s+)?AD category for fire fighting\s+([^\n]+?)(?=\s*2\s+Rescue|\n2\s|$)/i);
      if (fire) out["AD2.6 AD category for fire fighting"] = firstLine(fire, 80);
    }
  }

  return out;
}

async function extractPdf(pdfPath) {
  const buf = await readFile(pdfPath);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  await parser.destroy();
  const text = result?.text ?? (result?.pages && result.pages.map((p) => p.text).join("\n")) ?? "";
  const name = pdfPath.split("/").pop() || "";
  const icaoMatch = name.match(/^[A-Z]{2}_AD_2_([A-Z0-9]{4})_/i);
  const icao = icaoMatch ? icaoMatch[1].toUpperCase() : name.slice(0, 4).toUpperCase();
  return parseAd2Text(text, icao);
}

async function main() {
  const dir = process.argv[2] || DEFAULT_DIR;
  const files = await readdir(dir).catch(() => []);
  const pdfs = files.filter((f) => f.endsWith(".pdf"));
  if (pdfs.length === 0) {
    console.error("No PDFs in", dir);
    process.exit(1);
  }

  const records = [];
  for (const f of pdfs) {
    const path = join(dir, f);
    try {
      const rec = await extractPdf(path);
    rec._source = f;
    for (const k of Object.keys(rec)) if (typeof rec[k] === "string") rec[k] = rec[k].trim();
    records.push(rec);
      console.error("[EAD extract]", rec["Airport Code"], rec["Airport Name"] || "(no name)");
    } catch (e) {
      console.error("[EAD extract] Error", f, e.message);
    }
  }

  const out = { source: "EAD AD 2 PDFs", extracted: new Date().toISOString(), airports: records };
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2), "utf8");
  console.error("Wrote", records.length, "airports →", OUT_PATH);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
