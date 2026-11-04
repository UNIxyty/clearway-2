// Citations next to the claim (2026-11-03). The API attaches citations to the answer's text blocks itself — for its own
// web search (web_search_result_location, by URL) and for search results our tools returned (search_result_location:
// Tavily by URL, the knowledge base by kb:<document id>). This turns them into what the console draws (Sources.tsx
// ClaimedProse): numbered sources, and claim spans over the answer's text, each with the source numbers beside it.
//
// The mark: a claim whose every source is outside the approved list (lib/web-sources.mjs classifyUrl → "other") carries
// "not from an official source: <host>, <date>" — on that claim, never on the whole answer. An industry reference is
// approved and named, not marked. Pure: no network, so the rig proves it with invented blocks.
import { classifyUrl, hostOf } from "./web-sources.mjs";

const CLASS_LABEL = { official: "Official", industry: "Industry reference", other: "Web · not approved" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A source's date as the mark shows it: "2 Nov", or "2 Nov 2025" for another year. From "3 days ago", an ISO date or a written one. */
export function shortDate(raw, now = new Date()) {
  if (!raw) return null;
  let t = NaN;
  const rel = /^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/i.exec(String(raw).trim());
  if (rel) { const n = Number(rel[1]); const unit = { minute: 60e3, hour: 3600e3, day: 86400e3, week: 7 * 86400e3, month: 30 * 86400e3, year: 365 * 86400e3 }[rel[2].toLowerCase()]; t = now.getTime() - n * unit; }
  else t = Date.parse(String(raw));
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${d.getUTCFullYear() === now.getUTCFullYear() ? "" : ` ${d.getUTCFullYear()}`}`;
}

/**
 * @param answer       the reply as stored (what the console shows)
 * @param answerBlocks [{ text, citations }] from bedrock.mjs's done chunk, in order
 * @param sources      the turn's sources so far (sourcesFromToolCalls), extended here
 * @param web          done.web: { results: [{ url, title, pageAge, pass }], settings: { official, industry } }
 * @param toolCalls    the turn's tool calls (for Tavily's results: published date, pass)
 * @returns { sources, claims, counts: { official, industry, other, company }, dropped }
 */
export function citationsToClaims({ answer, answerBlocks = [], sources = [], web = null, toolCalls = [], now = new Date() }) {
  const out = [...sources];
  const settings = web?.settings ?? null;
  const counts = { official: 0, industry: 0, other: 0, company: 0, ours: 0 };
  const joined = answerBlocks.map((b) => b.text).join("");
  if (!joined || !answerBlocks.some((b) => b.citations?.length)) return { sources: out, claims: [], counts, dropped: null };
  // the blocks are the last part of the stored answer (thinking aloud before a tool call was taken out of it)
  const offset = answer === joined ? 0 : answer.endsWith(joined) ? answer.length - joined.length : -1;
  const tavily = new Map();
  for (const c of toolCalls) if (c.name === "tavily_search" && c.ok !== false) for (const r of c.result?.results ?? []) if (r.url && !tavily.has(r.url)) tavily.set(r.url, { title: r.title, published: r.published, pass: c.result.pass });
  const api = new Map((web?.results ?? []).map((r) => [r.url, r]));

  const webSource = (url, title) => {
    const found = out.find((s) => s.tier === "web" && s.href === url);
    if (found) return found;
    const cls = classifyUrl(url, settings);
    const t = tavily.get(url), a = api.get(url);
    const published = t?.published ?? a?.pageAge ?? null;
    const host = hostOf(url);
    const s = { n: out.length + 1, tier: "web", tierLabel: CLASS_LABEL[cls], label: `${host} · ${String(title ?? a?.title ?? t?.title ?? url).slice(0, 90)}`, tool: t ? "tavily_search" : "web_search", href: url, domainClass: cls, host, published: shortDate(published, now), pass: t?.pass ?? a?.pass ?? null, meta: shortDate(published, now) };
    out.push(s);
    return s;
  };
  const kbSource = (ref, title) => {
    const id = String(ref).replace(/^kb:/, "").replace(/#.*$/, "");
    const page = Number(/#p(\d+)$/.exec(ref)?.[1]) || null;
    const found = out.find((s) => s.documentId === id || (id.startsWith("record:") && s.recordId === id.slice(7)));
    if (found) return found;
    const s = { n: out.length + 1, tier: "company", tierLabel: "Company", label: String(title ?? "Company document").slice(0, 90), tool: "search_knowledge", documentId: id.startsWith("record:") ? null : id, recordId: id.startsWith("record:") ? id.slice(7) : null, documentSource: "knowledge", page };
    out.push(s);
    return s;
  };

  // our own data (2026-11-04): a NOTAM from the CrewBriefing cache, a record from the wall's stores, a page of a GEN 1.2 —
  // "Clearway data", with the store and its read or cache time in the label, never marked
  const KIND = { notam: "NOTAM", limitation: "Limitation", important: "IMPORTANT", caa: "CAA record", gen: "GEN 1.2" };
  const oursSource = (ref, title) => {
    const found = out.find((s) => s.ref === ref);
    if (found) return found;
    const kind = String(ref).split(":")[1] ?? "";
    const s = { n: out.length + 1, tier: "internal", tierLabel: "Clearway data", domainClass: "ours", ref, label: String(title ?? KIND[kind] ?? "Clearway data").slice(0, 120), tool: kind === "notam" ? "get_notams" : kind === "gen" ? "read_gen_document" : `list_${kind === "caa" ? "caa" : kind === "important" ? "important" : "limitations"}`, meta: /(read|cache) ([^·]+)$/.exec(String(title ?? ""))?.[0] ?? null };
    out.push(s);
    return s;
  };
  const claims = [];
  let pos = 0;
  for (const b of answerBlocks) {
    const start = pos, end = pos + b.text.length; pos = end;
    if (!b.citations?.length || offset < 0) continue;
    const cited = [];
    for (const c of b.citations) {
      const src = c.type === "web_search_result_location" ? webSource(c.url, c.title)
        : c.type === "search_result_location" ? (String(c.source).startsWith("kb:") ? kbSource(c.source, c.title) : String(c.source).startsWith("cw:") ? oursSource(c.source, c.title) : webSource(c.source, String(c.title ?? "").replace(/^[^—]+—\s*/, "")))
        : null;
      if (src && !cited.includes(src)) cited.push(src);
    }
    if (!cited.length) continue;
    // a claim's span is its text without the surrounding spaces, so the underline sits on words
    const text = b.text; const lead = text.length - text.trimStart().length; const trail = text.length - text.trimEnd().length;
    const others = cited.filter((s) => s.tier === "web" && s.domainClass === "other");
    const marked = others.length === cited.length;
    for (const s of cited) counts[s.domainClass === "ours" ? "ours" : s.tier === "company" ? "company" : s.domainClass ?? "other"] += 1;
    claims.push({
      start: offset + start + lead, end: offset + end - trail, n: cited[0].n, ns: cited.map((s) => s.n),
      ...(marked ? { mark: `not from an official source: ${[...new Set(others.map((s) => s.host))].join(", ")}${others[0].published ? `, ${others[0].published}` : ""}` } : {}),
    });
  }
  return { sources: out, claims: claims.filter((c) => c.end > c.start), counts, dropped: offset < 0 ? "the cited text is not the end of the stored answer" : null };
}
