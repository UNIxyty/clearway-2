export type AipExtractRecord = {
  "Publication Date": string;
  "Airport Code": string;
  "Airport Name": string;
  "AD2.2 Types of Traffic Permitted": string;
  "AD2.2 Remarks": string;
  "AD2.2 AD Operator": string;
  "AD2.2 Address": string;
  "AD2.2 Telephone": string;
  "AD2.2 Telefax": string;
  "AD2.2 E-mail": string;
  "AD2.2 AFS": string;
  "AD2.2 Website": string;
  "AD2.3 AD Operator": string;
  "AD 2.3 Customs and Immigration": string;
  "AD2.3 ATS": string;
  "AD2.3 Remarks": string;
  "AD2.6 AD category for fire fighting": string;
  "AD2.12 Runway Number": string;
  "AD2.12 Runway Dimensions": string;
};

export const SCHEMA_KEYS: (keyof AipExtractRecord)[] = [
  "Publication Date",
  "Airport Code",
  "Airport Name",
  "AD2.2 Types of Traffic Permitted",
  "AD2.2 Remarks",
  "AD2.2 AD Operator",
  "AD2.2 Address",
  "AD2.2 Telephone",
  "AD2.2 Telefax",
  "AD2.2 E-mail",
  "AD2.2 AFS",
  "AD2.2 Website",
  "AD2.3 AD Operator",
  "AD 2.3 Customs and Immigration",
  "AD2.3 ATS",
  "AD2.3 Remarks",
  "AD2.6 AD category for fire fighting",
  "AD2.12 Runway Number",
  "AD2.12 Runway Dimensions",
];

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function between(text: string, startRe: RegExp, endRe: RegExp): string {
  const s = text.search(startRe);
  if (s < 0) return "";
  const tail = text.slice(s);
  const e = tail.search(endRe);
  return (e < 0 ? tail : tail.slice(0, e)).trim();
}

function firstMatch(text: string, re: RegExp): string {
  const m = text.match(re);
  if (!m) return "";
  return normalize((m[1] || m[0] || "").trim());
}

function allMatches(text: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    const v = normalize((m[1] || m[0] || "").trim());
    if (v) out.push(v);
  }
  return out;
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function extractValueNearLabel(section: string, labelRe: RegExp): string {
  const lines = section
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (!labelRe.test(lines[i])) continue;
    // In many AIP tables, value is just before label line.
    const prev = lines[i - 1] || "";
    if (prev && !/^\d+$/.test(prev) && !labelRe.test(prev)) return normalize(prev);
    // Fallback to next line value.
    const next = lines[i + 1] || "";
    if (next && !/^\d+$/.test(next) && !labelRe.test(next)) return normalize(next);
  }
  return "";
}

function extractLinesAfterLabel(section: string, labelRe: RegExp, maxLines = 2): string {
  const lines = section
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (!labelRe.test(lines[i])) continue;
    const collected: string[] = [];
    for (let j = i + 1; j < lines.length && collected.length < maxLines; j++) {
      const cand = lines[j];
      if (/^\d+$/.test(cand)) continue;
      if (/^AD\s*2\.\d+/i.test(cand)) break;
      collected.push(cand);
    }
    if (collected.length > 0) return normalize(collected.join(" "));
  }
  return "";
}

export function parseAipFieldsFromText(inputText: string, icaoHint = ""): AipExtractRecord {
  const text = inputText || "";
  const out: AipExtractRecord = {
    "Publication Date": "NIL",
    "Airport Code": icaoHint || "NIL",
    "Airport Name": "NIL",
    "AD2.2 Types of Traffic Permitted": "NIL",
    "AD2.2 Remarks": "NIL",
    "AD2.2 AD Operator": "NIL",
    "AD2.2 Address": "NIL",
    "AD2.2 Telephone": "NIL",
    "AD2.2 Telefax": "NIL",
    "AD2.2 E-mail": "NIL",
    "AD2.2 AFS": "NIL",
    "AD2.2 Website": "NIL",
    "AD2.3 AD Operator": "NIL",
    "AD 2.3 Customs and Immigration": "NIL",
    "AD2.3 ATS": "NIL",
    "AD2.3 Remarks": "NIL",
    "AD2.6 AD category for fire fighting": "NIL",
    "AD2.12 Runway Number": "NIL",
    "AD2.12 Runway Dimensions": "NIL",
  };

  const topOfDoc = text.split(/\r?\n/).slice(0, 120).join("\n");
  const month3 = "(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)";
  const publicationDate =
    firstMatch(topOfDoc, new RegExp(`\\b(\\d{2}-${month3}-\\d{2})\\b`, "i")) ||
    firstMatch(topOfDoc, new RegExp(`\\b(\\d{2}\\s+${month3}\\s+\\d{2})\\b`, "i")) ||
    firstMatch(topOfDoc, new RegExp(`\\b(\\d{1,2}\\s+${month3}\\s+\\d{4})\\b`, "i"));
  if (publicationDate) out["Publication Date"] = publicationDate;

  const icao =
    firstMatch(text, /\b([A-Z]{4})\s+AD\s+2\.1\b/i) ||
    firstMatch(text, /\b([A-Z]{4})\s+2\.1\b/i) ||
    icaoHint;
  if (icao) out["Airport Code"] = icao.toUpperCase();

  const ad21 = between(text, /\bAD\s*2\.1\b/i, /\bAD\s*2\.2\b/i);
  const name =
    firstMatch(ad21, /\b[A-Z]{4}\s+(.+)/) ||
    firstMatch(text, /\b[A-Z]{4}\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'\/\-\s]+)\b/);
  if (name) out["Airport Name"] = name;

  const ad22 = between(text, /\bAD\s*2\.2\b/i, /\bAD\s*2\.3\b/i);
  const traffic =
    firstMatch(ad22, /Types of traffic permitted[^\n]*\s+([A-Z\/,\s\(\)\.\-]+)\s*(?:Remarks|$)/i) ||
    firstMatch(ad22, /\b(IFR\s*\/\s*VFR|VFRN?\s*(?:and|,)\s*IFR|VFRN?|IFR)\b/i);
  if (traffic) out["AD2.2 Types of Traffic Permitted"] = traffic;
  const remarks22Candidates = uniq([
    extractValueNearLabel(ad22, /\bRemarks?\b/i),
    extractLinesAfterLabel(ad22, /\bRemarks?\b/i, 2),
    firstMatch(ad22, /Remarks\s+(.+?)(?:\bAD\s*2\.3\b|$)/i),
  ].filter(Boolean));
  const remarks22 = remarks22Candidates.join(" ");
  if (remarks22) out["AD2.2 Remarks"] = remarks22;
  const ad22Operator =
    extractValueNearLabel(ad22, /\bAD administration\b|\bAD operator\b|\bAerodrome operator\b/i) ||
    firstMatch(
      ad22,
      /(?:AD administration|AD operator|Aerodrome operator)\s+(.+?)(?:Address|Telephone|Telefax|E-?mail|AFS|Website|Types of traffic|Remarks|$)/i
    );
  if (ad22Operator) out["AD2.2 AD Operator"] = ad22Operator;
  const ad22Address =
    extractValueNearLabel(ad22, /\bAddress\b/i) ||
    firstMatch(
      ad22,
      /Address\s+(.+?)(?:Telephone|Telefax|E-?mail|AFS|Website|Types of traffic|Remarks|$)/i
    );
  if (ad22Address) out["AD2.2 Address"] = ad22Address;
  const ad22Telephone =
    extractValueNearLabel(ad22, /\bTelephone\b|\bTEL\b|\bTel\.?\b/i) ||
    firstMatch(ad22, /(?:Telephone|Tel\.?)\s*[:.]?\s+(.+?)(?:Telefax|Fax|E-?mail|AFS|Website|$)/i) ||
    firstMatch(ad22, /\b(Tel\.?\s*[:.]?\s*[+0-9][^,\n;]*)/i);
  if (ad22Telephone) out["AD2.2 Telephone"] = ad22Telephone;
  const ad22Telefax =
    extractValueNearLabel(ad22, /\bTelefax\b|\bFAX\b|\bFax\b/i) ||
    firstMatch(ad22, /(?:Telefax|Fax)\s*[:.]?\s+(.+?)(?:E-?mail|AFS|Website|$)/i) ||
    firstMatch(ad22, /\b(Fax\s*[:.]?\s*[+0-9][^,\n;]*)/i);
  if (ad22Telefax) out["AD2.2 Telefax"] = ad22Telefax;
  const ad22Email =
    extractValueNearLabel(ad22, /\bE-?mail\b/i) ||
    firstMatch(
    ad22,
    /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i
  );
  if (ad22Email) out["AD2.2 E-mail"] = ad22Email;
  const ad22Afs =
    extractValueNearLabel(ad22, /\bAFS\b|\bAFTN\b/i) ||
    firstMatch(ad22, /(?:AFS|AFTN)\s*[:.]?\s+([A-Z0-9]{4,8})\b/i);
  if (ad22Afs) out["AD2.2 AFS"] = ad22Afs;
  const ad22Website =
    extractValueNearLabel(ad22, /\bWebsite\b|\bURL\b/i) ||
    firstMatch(ad22, /Website\s*[:.]?\s+([A-Za-z0-9./:_-]+)/i) ||
    firstMatch(ad22, /\b((?:https?:\/\/)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[^\s]*)?)\b/i);
  if (ad22Website) out["AD2.2 Website"] = ad22Website;

  const ad23 = between(text, /\bAD\s*2\.3\b/i, /\bAD\s*2\.4\b/i);
  const adOperator = firstMatch(ad23, /Airport\s+(.+?)(?:Custom|Health|AIS|ATS|$)/i);
  if (adOperator) out["AD2.3 AD Operator"] = adOperator;
  const customs = firstMatch(ad23, /Custom(?:s)? and Immigration\s+(.+?)(?:Health|AIS|$)/i);
  if (customs) out["AD 2.3 Customs and Immigration"] = customs;
  const ats = firstMatch(ad23, /ATS\s+(.+?)(?:Fuelling|Handling|Security|$)/i);
  if (ats) out["AD2.3 ATS"] = ats;
  const remarks23 = firstMatch(ad23, /Remarks\s+(.+?)(?:\bAD\s*2\.4\b|$)/i);
  if (remarks23) out["AD2.3 Remarks"] = remarks23;

  const ad26 = between(text, /\bAD\s*2\.6\b/i, /\bAD\s*2\.7\b/i);
  const fire = firstMatch(ad26, /AD category for fire fighting\s+(.+?)(?:Rescue|Remarks|$)/i);
  if (fire) out["AD2.6 AD category for fire fighting"] = fire;

  const ad212 = between(text, /\bAD\s*2\.12\b/i, /\bAD\s*2\.13\b/i);
  if (ad212) {
    const ad212Lines = ad212
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const standaloneRunways = ad212Lines.filter((l) => /^\d{2}[LRC]?$/.test(l));
    const runwayNums = uniq([
      ...allMatches(ad212, /\b((?:\d{2}[LRC]?\/\d{2}[LRC]?)|(?:RWY\s*\d{2}[LRC]?\/\d{2}[LRC]?))\b/gi).map(
        (v) => v.replace(/^RWY\s*/i, "")
      ),
      ...allMatches(ad212, /\bTHR\s*(\d{2}[LRC]?)\b/gi),
      ...standaloneRunways,
    ]).filter((v) => /^\d{2}[LRC]?(\/\d{2}[LRC]?)?$/.test(v));
    if (runwayNums.length > 0) out["AD2.12 Runway Number"] = runwayNums.join(", ");

    const dims = uniq(
      allMatches(
        ad212,
        /\b(\d{3,4}\s*[x×]\s*\d{2,3}\s*(?:M|m|FT|ft)?)\b/gi
      )
    );
    if (dims.length > 0) out["AD2.12 Runway Dimensions"] = dims.join("; ");
  }

  return out;
}

export function parseAipFieldsFromOpenAiJson(value: unknown): AipExtractRecord {
  const obj = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const out = {} as AipExtractRecord;
  for (const key of SCHEMA_KEYS) {
    const raw = obj[key];
    out[key] = typeof raw === "string" && raw.trim() ? raw.trim() : "NIL";
  }
  return out;
}
