// The glossary: content/docs/glossary.md. One term per "## " heading:
//
//   ## NOTAM
//   Notice to air missions                      the first line: what it stands for (or a short name)
//   A short notice about something temporary…   then the definition, as many lines as needed
//   Example: `A1234/26`                         optional
//   Where: The NTM marker on a flight pill.     optional: where it shows in the portal
//
// The parser is pure (rig/docs-check.mjs uses it too); loadGlossary() reads the file (server only).
import { inline, plain, slugify, splitFrontMatter, type Inline } from "./parse.ts";

export type Term = { id: string; term: string; expansion: string; definition: Inline[]; example: Inline[]; where: Inline[] };
export type Glossary = { title: string; summary: string; terms: Term[]; problems: string[] };

export function parseGlossary(src: string, where = "glossary.md"): Glossary {
  const { meta, body, problems } = splitFrontMatter(src);
  const terms: Term[] = [];
  let cur: { term: string; lines: string[] } | null = null;
  const chunks: { term: string; lines: string[] }[] = [];
  for (const line of body.split("\n")) {
    if (/^##\s+/.test(line)) { cur = { term: line.replace(/^##\s+/, "").trim(), lines: [] }; chunks.push(cur); continue; }
    if (cur) cur.lines.push(line);
    else if (line.trim()) problems.push(`${where}: "${line.trim()}" is above the first term (each term starts with "## ")`);
  }
  const ids = new Set<string>();
  for (const c of chunks) {
    const ls = c.lines.map((l) => l.trim()).filter(Boolean);
    const expansion = ls.shift() ?? "";
    const def: string[] = []; let example: Inline[] = []; let whereIn: Inline[] = [];
    for (const l of ls) {
      if (/^example\s*:/i.test(l)) example = inline(l.replace(/^example\s*:\s*/i, ""));
      else if (/^where\s*:/i.test(l)) whereIn = inline(l.replace(/^where\s*:\s*/i, ""));
      else def.push(l);
    }
    if (!expansion) problems.push(`${where} › ${c.term}: no line under the term saying what it stands for`);
    if (!def.length) problems.push(`${where} › ${c.term}: no definition`);
    let id = `term-${slugify(c.term)}`;
    while (ids.has(id)) id = `${id}-2`;
    ids.add(id);
    terms.push({ id, term: c.term, expansion, definition: inline(def.join(" ")), example, where: whereIn });
  }
  const sorted = [...terms].sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
  if (sorted.some((t, i) => t !== terms[i])) problems.push(`${where}: terms are not in alphabetical order (they are shown as written)`);
  return { title: meta.title || "Glossary", summary: meta.summary ?? "", terms, problems };
}

export const termText = (t: Term) => `${t.term} ${t.expansion} ${plain(t.definition)}`;
