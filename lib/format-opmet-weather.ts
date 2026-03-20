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
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let airportLine: string | null = null;
  const bullets: OpmetBullet[] = [];
  let i = 0;
  if (lines[0]?.match(/^Airport\s+/i)) {
    airportLine = lines[0];
    i = 1;
  }

  for (; i < lines.length; i++) {
    const line = lines[i];
    const tabParts = line.split("\t");
    const kindToken = tabParts[0]?.trim().toUpperCase() ?? "";

    if (kindToken === "METAR" || kindToken === "TAF") {
      let rest =
        tabParts.length > 1
          ? tabParts.slice(1).join("\t").trim()
          : line.replace(/^(METAR|TAF)\s+/i, "").trim();

      if (!rest) continue;

      const tokenMatch = rest.match(/^(\S+)\s*(.*)$/s);
      const id = tokenMatch ? tokenMatch[1] : rest;
      const body = tokenMatch ? tokenMatch[2].trim() : "";
      bullets.push({
        kind: kindToken as "METAR" | "TAF",
        id,
        body: body || rest,
      });
      continue;
    }

    const sm = line.match(/^(METAR|TAF)\s+(\S+)\s+(.*)$/i);
    if (sm) {
      bullets.push({
        kind: sm[1].toUpperCase() as "METAR" | "TAF",
        id: sm[2],
        body: sm[3].trim(),
      });
    }
  }

  return { airportLine, bullets };
}
