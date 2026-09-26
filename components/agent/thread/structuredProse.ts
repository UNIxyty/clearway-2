// Item 8b — the model's text and the designed components must not say the same thing twice.
//
// The PRIMARY fix is upstream: components are built from tool return values (never parsed from prose),
// and the system prompt tells the model the console renders those results, so its text introduces or
// interprets instead of restating (agent/config/system-prompt.md "What the console shows for you").
// This is the backstop for when a model still writes the data out:
//  - a markdown pipe table is NEVER rendered as markdown (§4.13 exists): if a component already shows
//    the result it is dropped; otherwise it becomes a §4.13 table result;
//  - a list line naming something a component on this reply already shows (a callsign, ICAO,
//    registration, document or file name) is dropped from the prose.

import type { TableData } from "../types";

const isRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isSep = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim().replace(/\*\*(.*?)\*\*/g, "$1").replace(/`([^`]*)`/g, "$1"));

export function splitStructured(text: string, keys: string[]): { prose: string; tables: TableData[]; droppedLines: number } {
  const lines = String(text ?? "").split("\n");
  const out: string[] = [];
  const tables: TableData[] = [];
  let dropped = 0;
  const needles = keys.map((k) => String(k ?? "").trim()).filter((k) => k.length >= 3).map((k) => k.toLowerCase());
  for (let i = 0; i < lines.length; i += 1) {
    if (isRow(lines[i]) && i + 1 < lines.length && isSep(lines[i + 1])) {
      const header = cells(lines[i]);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && isRow(lines[j])) { rows.push(cells(lines[j])); j += 1; }
      tables.push({ id: `md-${tables.length}-${header.join("|").slice(0, 40)}`, columns: header, rows, monoColumns: header.map((h, n) => (/\b(icao|iata|reg|registration|callsign|flight|time|std|sta|etd|eta|utc|z)\b/i.test(h) ? n : -1)).filter((n) => n >= 0) });
      i = j - 1;
      continue;
    }
    const listItem = /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]);
    if (listItem && needles.length && needles.some((n) => lines[i].toLowerCase().includes(n))) { dropped += 1; continue; }
    out.push(lines[i]);
  }
  // Collapse the blank lines left behind.
  const prose = out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/(^|\n)#{1,6} [^\n]*\n*$/, "$1").trim();
  return { prose, tables, droppedLines: dropped };
}
