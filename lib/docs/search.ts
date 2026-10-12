// Docs search: the index rows and the ranking. Pure (no file access), so the search box, the results page and
// rig/docs-check.mjs rank the same way.
//
// How it is built: at build time. app/docs/search-index.json/route.ts is a static route: `next build` writes the
// index once, from the same files the pages come from (lib/docs/content.ts, lib/docs/glossary.ts). The browser
// fetches it the first time someone opens search, and keeps it for the visit. A page added to content/docs/ is in
// search after the next build and deploy, like the page itself; there is no separate index to update.
//
// What is searched: section names, page names, task names (with their one-sentence summary at lower weight) and
// glossary terms (with their expansion). Not the body text: a reader looks for the thing they want to do.
// Ranking (design: Docs Site spec, Search): each query word found scores 1, or 2 when it is in the title; finding
// every word adds 5; ties put tasks first.

export type RowKind = "task" | "page" | "section" | "term";
export type IndexRow = {
  kind: RowKind;
  title: string;
  /** Section title ("Glossary" for terms). */
  section: string;
  /** Page title for tasks; empty otherwise. */
  page: string;
  href: string;
  summary: string;
  /** A task that cannot be undone. */
  danger?: boolean;
  /** A task or page that is not written yet (the link goes to the page, which lists it as planned). */
  draft?: boolean;
  /** Extra words that match but are not shown (a term's expansion). */
  also?: string;
};
export type Hit = IndexRow & { score: number };

const KIND_ORDER: Record<RowKind, number> = { task: 0, page: 1, section: 2, term: 3 };
export const KIND_LABEL: Record<RowKind, string> = { task: "Task", page: "Page", section: "Section", term: "Term" };

export const words = (q: string) => q.toLowerCase().split(/[\s,./]+/).map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, "")).filter(Boolean);
// Plural and tense endings off, so "operators" finds "operator" and "checked" finds "check".
export const stem = (w: string) => { const s = w.replace(/(ing|es|s|ed)$/, ""); return s.length >= 3 ? s : w; };

export function search(rows: IndexRow[], q: string): Hit[] {
  const ws = [...new Set(words(q).map(stem))];
  if (!ws.length) return [];
  const out: Hit[] = [];
  for (const r of rows) {
    const title = r.title.toLowerCase();
    const rest = `${r.page} ${r.section} ${r.also ?? ""} ${r.summary}`.toLowerCase();
    let score = 0; let all = true;
    for (const w of ws) {
      if (title.includes(w)) score += 2;
      else if (rest.includes(w)) score += 1;
      else all = false;
    }
    if (!score) continue;
    if (all && ws.length > 1) score += 5;
    out.push({ ...r, score });
  }
  return out.sort((a, b) => b.score - a.score || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title));
}

/** The title cut into plain and matched pieces, for <mark>. */
export function highlight(text: string, q: string): { t: string; m: boolean }[] {
  const ws = [...new Set(words(q).map(stem))].sort((a, b) => b.length - a.length);
  if (!ws.length) return [{ t: text, m: false }];
  const re = new RegExp(`(${ws.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(re).filter(Boolean).map((t) => ({ t, m: ws.includes(t.toLowerCase()) }));
}

/** Results grouped by section, in the order their best result ranks. */
export function groupBySection(hits: Hit[]) {
  const groups: { section: string; hits: Hit[] }[] = [];
  for (const h of hits) {
    let g = groups.find((x) => x.section === h.section);
    if (!g) { g = { section: h.section, hits: [] }; groups.push(g); }
    g.hits.push(h);
  }
  return groups;
}
