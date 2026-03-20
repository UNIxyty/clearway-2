/**
 * Normalize CrewBriefing OPMET paste: strip search preamble and split METAR/TAF
 * lines into blocks for NOTAM-like UI (headline + body).
 */

export type OpmetBullet = {
  kind: "METAR" | "TAF";
  /** First token after kind (e.g. issue time 202250Z) */
  id: string;
  body: string;
};

/** Remove "(WX search performed … Searched for METAR and TAF.)" block */
export function stripWxSearchPreamble(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(
      /\(\s*WX\s+search\s+performed[\s\S]*?Searched\s+for\s+METAR\s+and\s+TAF\.\s*\)/gi,
      "",
    )
    .trim();
}

/**
 * After preamble strip: optional "Airport …" line, then METAR/TAF rows
 * (tab or space separated after the kind keyword).
 */
export function parseOpmetBullets(raw: string): {
  airportLine: string | null;
  bullets: OpmetBullet[];
} {
  const cleaned = stripWxSearchPreamble(raw);
  const compact = cleaned.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (!compact) return { airportLine: null, bullets: [] };

  // Supports both "METAR 202250Z ..." and compact "METAR202250Z ...".
  const tokenRe = /(METAR|TAF)\s*([0-9]{6}Z)\s*/gi;
  const bullets: OpmetBullet[] = [];
  let airportLine: string | null = null;

  const first = tokenRe.exec(compact);
  if (!first) {
    return { airportLine: compact || null, bullets: [] };
  }

  const firstIdx = first.index;
  const header = compact.slice(0, firstIdx).trim();
  if (header) {
    airportLine = header;
  }

  // Restart regex walk from start to collect all METAR/TAF chunks.
  tokenRe.lastIndex = 0;
  let m: RegExpExecArray | null = null;
  while ((m = tokenRe.exec(compact)) !== null) {
    const kind = m[1].toUpperCase() as "METAR" | "TAF";
    const id = m[2];
    const bodyStart = tokenRe.lastIndex;
    const next = tokenRe.exec(compact);
    const bodyEnd = next ? next.index : compact.length;
    const body = compact.slice(bodyStart, bodyEnd).trim().replace(/\s+/g, " ");
    bullets.push({ kind, id, body });
    if (!next) break;
    tokenRe.lastIndex = next.index;
  }

  return { airportLine, bullets };
}
