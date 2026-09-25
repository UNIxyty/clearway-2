// Exact-match locating (spec §V6). A citation's span is searched in the cited
// page's text first, then the whole document, after whitespace normalisation
// and with case kept. There is no fuzzy matching: a near-miss shown as a hit
// is the worst outcome this feature can produce, so it is not possible here.

import { AGENT_BASE } from "../types";

export function normalise(s: string): string {
  return String(s ?? "").replace(/ /g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}

/** Map a page's text items to one normalised string with an index → (item, offset) map. */
export type PageText = { items: { text: string; index: number }[]; joined: string; map: { item: number; offset: number }[] };

export function buildPageText(items: { str: string; hasEOL?: boolean }[]): PageText {
  const out: PageText = { items: [], joined: "", map: [] };
  let joined = "";
  const map: { item: number; offset: number }[] = [];
  items.forEach((it, index) => {
    const raw = String(it.str ?? "");
    out.items.push({ text: raw, index });
    for (let i = 0; i < raw.length; i += 1) { joined += raw[i]; map.push({ item: index, offset: i }); }
    // item boundaries are whitespace for matching purposes
    joined += " "; map.push({ item: index, offset: raw.length });
  });
  // collapse runs of whitespace while keeping the map aligned
  let collapsed = ""; const cmap: { item: number; offset: number }[] = [];
  let lastSpace = true;
  for (let i = 0; i < joined.length; i += 1) {
    const ch = joined[i] === " " ? " " : joined[i];
    if (/\s/.test(ch)) { if (lastSpace) continue; collapsed += " "; cmap.push(map[i]); lastSpace = true; continue; }
    collapsed += ch === "’" || ch === "‘" ? "'" : ch === "“" || ch === "”" ? '"' : ch; cmap.push(map[i]); lastSpace = false;
  }
  out.joined = collapsed.trim(); out.map = cmap.slice(collapsed.length - collapsed.trimStart().length);
  return out;
}

export type Hit = { start: number; end: number };

/** Exact (whitespace-normalised, case-sensitive) occurrence of `span` in a page. */
export function findExact(page: PageText, span: string): Hit | null {
  const needle = normalise(span);
  if (!needle) return null;
  const i = page.joined.indexOf(needle);
  return i === -1 ? null : { start: i, end: i + needle.length };
}

/** All case-insensitive occurrences (user search, §V4.4). */
export function findAll(page: PageText, query: string): Hit[] {
  const q = normalise(query).toLowerCase();
  if (!q) return [];
  const hay = page.joined.toLowerCase();
  const out: Hit[] = []; let i = hay.indexOf(q);
  while (i !== -1 && out.length < 500) { out.push({ start: i, end: i + q.length }); i = hay.indexOf(q, i + Math.max(1, q.length)); }
  return out;
}

/** Item-level ranges for a hit: [{ item, from, to }] so the text layer can wrap exactly the matched characters. */
export function hitToItemRanges(page: PageText, hit: Hit): { item: number; from: number; to: number }[] {
  const ranges: { item: number; from: number; to: number }[] = [];
  for (let i = hit.start; i < hit.end; i += 1) {
    const m = page.map[i]; if (!m) continue;
    const last = ranges[ranges.length - 1];
    if (last && last.item === m.item && last.to === m.offset) last.to = m.offset + 1;
    else if (!last || last.item !== m.item) ranges.push({ item: m.item, from: m.offset, to: m.offset + 1 });
    else { ranges.push({ item: m.item, from: m.offset, to: m.offset + 1 }); }
  }
  return ranges.filter((r) => r.to > r.from);
}

/** Report a citation or verbatim check to the Activity log (§V6: a miss is a fact about the data). */
export async function reportCheck(input: { kind: "citation" | "verbatim"; documentKey: string; filename?: string | null; page?: number | null; citation?: number | null; span?: string | null; found: boolean; conversationId?: string | null }) {
  try { await fetch(`${AGENT_BASE}/api/citations/check`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }); } catch { /* the log is best-effort; the UI already shows the state */ }
}
