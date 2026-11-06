// Retrieval across the two tiers.
//
// THE STANDARD RETRIEVAL SOURCE OBJECT. Every result, from either tier, is
// shaped the same way, because the conversation log has to be able to
// reconstruct which sources supported an answer months later:
//
//   { source, documentId, recordId, title, version, effectiveDate,
//     retrievalType, tier, text, verbatim, score, rerankScore, page, heading }
//
// Tier 1 results are VERBATIM: the text is the authority's wording, and the
// object says so, so the panel can put it in the ink frame and the model is
// told not to restate it in its own words.

import { rerank } from "./rerank.mjs";

const REST_TIMEOUT_MS = 20_000;

// Similarity floors. Tier 1's is higher deliberately: a weak tier-2 hit is an
// off-topic paragraph, a weak tier-1 hit is an unrelated RULE presented as
// authoritative. Enforced in the RPC and again here, so an older deployed
// function cannot quietly reintroduce unfiltered neighbours.
// Scores are now the share of the question's words a passage holds (0..1), not a cosine similarity (2026-11-03).
const MIN_SIMILARITY_TIER1 = Number(process.env.AGENT_MIN_COVERAGE_TIER1 || 0.5);
const MIN_SIMILARITY_TIER2 = Number(process.env.AGENT_MIN_COVERAGE_TIER2 || 0.34);
export const SEARCH_METHOD = "postgres-fts (english)";

function url() { return String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, ""); }
function key() { return String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(); }
export function knowledgeConfigured() { return Boolean(url() && key()); }

export async function rest(pathAndQuery, init = {}) {
  const headers = { apikey: key(), Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...(init.headers ?? {}) };
  const response = await fetch(`${url()}/rest/v1/${pathAndQuery}`, { ...init, headers, signal: AbortSignal.timeout(REST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${pathAndQuery} -> ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Every row a query matches, a page at a time (2026-11-07). A plain read stops at the database's page limit (1000
 * rows, max_rows) with no error, and a total built from it is a wrong count, not a partial one (docs/success-too-early.md).
 * `pathAndQuery` must carry a stable `order=` (paging without one can skip or repeat rows). Past `max` rows it throws:
 * a ceiling that is reached says so, it never stops quietly.
 */
export async function restAll(pathAndQuery, { pageSize = 1000, max = 200_000 } = {}) {
  if (!/[?&]order=/.test(pathAndQuery)) throw new Error(`restAll needs a stable order= (${pathAndQuery.split("?")[0]})`);
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const page = (await rest(pathAndQuery, { headers: { "Range-Unit": "items", Range: `${from}-${from + pageSize - 1}` } })) ?? [];
    out.push(...page);
    if (page.length < pageSize) return out;
    if (out.length >= max) throw new Error(`restAll: more than ${max} rows in ${pathAndQuery.split("?")[0]}; refusing to report a partial set`);
  }
}

/** The exact number of rows a filter matches, counted by the database (never the length of a capped read). */
export async function restCount(tableAndFilter) {
  const headers = { apikey: key(), Authorization: `Bearer ${key()}`, Prefer: "count=exact", "Range-Unit": "items", Range: "0-0" };
  const sep = tableAndFilter.includes("?") ? "&" : "?";
  const response = await fetch(`${url()}/rest/v1/${tableAndFilter}${sep}select=*`, { headers, signal: AbortSignal.timeout(REST_TIMEOUT_MS) });
  if (!response.ok && response.status !== 206) throw new Error(`count ${tableAndFilter.split("?")[0]} -> ${response.status}`);
  const total = Number(String(response.headers.get("content-range") ?? "").split("/")[1]);
  if (!Number.isFinite(total)) throw new Error(`count ${tableAndFilter.split("?")[0]}: no exact count in the answer`);
  return total;
}

function tier1Source(row) {
  return {
    source: row.source_document,
    documentId: row.document_id ?? null,
    recordId: row.id,
    reference: row.reference,
    title: row.title,
    version: row.version ?? null,
    effectiveDate: row.effective_date ?? null,
    retrievalType: "tier1-verbatim",
    tier: "tier1",
    text: row.text,
    // The defining property: this text is quoted, not summarised.
    verbatim: true,
    approvedBy: row.approved_by_email ?? null,
    approvedAt: row.approved_at ?? null,
    score: row.score ?? null,
    rerankScore: null,
  };
}

function tier2Source(row) {
  return {
    source: row.agent_documents?.source ?? row.agent_documents?.title,
    documentId: row.document_id,
    recordId: row.id,
    reference: row.heading ?? null,
    title: row.agent_documents?.title ?? null,
    version: row.agent_documents?.version ?? null,
    effectiveDate: row.agent_documents?.effective_date ?? null,
    retrievalType: "tier2-fulltext",
    tier: "tier2",
    text: row.text,
    verbatim: false,
    page: row.page ?? null,
    heading: row.heading ?? null,
    score: row.score ?? null,
    rerankScore: null,
  };
}

/**
 * Search both tiers for one question.
 *
 * Tier 1 is searched first and separately, and its hits are NOT reranked
 * against tier 2: an approved operational rule and a paragraph of an SOP are
 * not competing for the same slot, and letting a reranker drop a live
 * limitation because a manual paragraph reads more relevant would be exactly
 * the failure this design exists to prevent.
 */
// Postgres full-text search (2026-11-03), replacing Bedrock embeddings: the corpus is one document and a handful of
// verbatim records, so matching runs on the columns at query time through PostgREST's fts filter (to_tsvector('english',
// text) @@ to_tsquery(...)), with the question's words joined by OR. Ranking is ours: the share of the question's words a
// passage holds, plus a little for how often. An index migration (a tsvector column with GIN) is for when it grows.
const STOP = new Set("a an and are as at be by can do does for from has have how i in is it its may me my of on or our please should so that the there this to was we what when where which who why will with would you your".split(" "));
export function queryTerms(q) {
  return [...new Set(String(q ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{2,}/g) ?? [])].filter((t) => !STOP.has(t)).slice(0, 16);
}
/** A word's stem, roughly as Postgres's English stemmer would cut it: enough for scoring what Postgres already matched. */
const stem = (t) => (t.length > 5 ? t.slice(0, Math.max(4, t.length - 3)) : t);
export function coverage(text, terms) {
  if (!terms.length) return 0;
  const low = String(text ?? "").toLowerCase();
  let hit = 0, freq = 0;
  for (const t of terms) { const re = new RegExp(`\\b${stem(t)}`, "g"); const n = (low.match(re) ?? []).length; if (n) { hit += 1; freq += n; } }
  return Math.round(((hit / terms.length) * 0.85 + Math.min(0.15, freq / 100)) * 1000) / 1000;
}
const scopeFilter = (icao, country, today, withExpiry) => {
  const parts = [];
  if (icao) parts.push(`or(icao.is.null,icao.eq.${encodeURIComponent(icao)})`);
  if (country) parts.push(`or(country.is.null,country.eq.${encodeURIComponent(country)})`);
  if (withExpiry) parts.push(`or(expires_date.is.null,expires_date.gte.${today})`);
  return parts.length ? `and=(${parts.join(",")})` : "";
};

export async function searchKnowledge(query, { icao = null, country = null, limit = 8, tier = "both" } = {}) {
  if (!knowledgeConfigured()) throw new Error("The knowledge base is not configured.");
  const terms = queryTerms(query);
  const wantTier1 = tier === "both" || tier === "tier1";
  const wantTier2 = tier === "both" || tier === "tier2";
  const failures = []; const fallbacks = [];
  if (!terms.length) return { query, tier1: [], tier2: [], embeddingModel: SEARCH_METHOD, rerankModel: null, rerankMethod: "none", candidateCount: 0, failures, fallbacks };
  const tsq = encodeURIComponent(terms.join(" | "));
  const today = new Date().toISOString().slice(0, 10);

  // A failed search is reported as failed, never as empty (an empty result hid a broken migration once).
  const safe = async (what, path) => { try { return (await rest(path)) ?? []; } catch (error) { failures.push(`${what}: ${error.message}`); process.stderr.write(`[retrieval] ${what} FAILED: ${error.message}\n`); return []; } };
  const t1 = scopeFilter(icao, country, today, true);
  const t2 = scopeFilter(icao, country, today, false).replace(/^and=/, "agent_documents.and=");
  const [tier1Rows, tier2Rows] = await Promise.all([
    wantTier1 ? safe("tier 1 search", `agent_tier1_records?select=id,document_id,reference,title,text,source_document,version,effective_date,approved_by_email,approved_at&retired_at=is.null&text=fts(english).${tsq}${t1 ? `&${t1}` : ""}&limit=200`) : [],
    wantTier2 ? safe("tier 2 search", `agent_chunks?select=id,document_id,ordinal,text,page,heading,agent_documents!inner(title,source,version,effective_date,status)&agent_documents.status=in.(indexed,approved)&text=fts(english).${tsq}${t2 ? `&${t2}` : ""}&limit=300`) : [],
  ]);

  const scored = (rows, min) => rows.map((r) => ({ ...r, score: coverage(`${r.title ?? ""} ${r.heading ?? ""} ${r.text}`, terms) })).filter((r) => r.score >= min).sort((a, b) => b.score - a.score);
  const tier1 = scored(tier1Rows, MIN_SIMILARITY_TIER1).slice(0, Math.min(limit, 10)).map(tier1Source);
  const candidates = scored(tier2Rows, MIN_SIMILARITY_TIER2).slice(0, 24).map(tier2Source);

  // Rerank tier 2 only — see the note above.
  const reranked = candidates.length > 0 ? await rerank(query, candidates, { topN: limit }) : { results: [], model: null, method: "none" };
  if (reranked.fallback) fallbacks.push(reranked.fallback);
  for (const r of reranked.results) r.rerankScore = r.rerankScore ?? null;

  return {
    query,
    tier1,
    tier2: reranked.results,
    embeddingModel: SEARCH_METHOD,
    rerankModel: reranked.model,
    rerankMethod: reranked.method,
    candidateCount: candidates.length,
    failures,
    fallbacks,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Persist what supported an answer, so it can be reconstructed later.
 *
 * `conversation_id` is a uuid column, but a tool can be invoked outside any
 * conversation (the direct-invoke path passes a label). A non-uuid is coerced
 * to null rather than failing the insert — losing the conversation link is
 * acceptable, losing the whole retrieval record is not.
 */
export async function logRetrieval({ conversationId, userId, query, result, grounding }) {
  const conversationUuid = UUID.test(String(conversationId ?? "")) ? conversationId : null;
  try {
    await rest("agent_retrievals", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{
        conversation_id: conversationUuid,
        user_id: userId ?? null,
        query,
        tier: result.tier1.length > 0 ? (result.tier2.length > 0 ? "both" : "tier1") : "tier2",
        // Text is dropped from the log: the ids and scores are what make an
        // answer reconstructible, and storing every passage again would
        // duplicate the corpus on every question.
        sources: [...result.tier1, ...result.tier2].map((s) => ({
          source: s.source, documentId: s.documentId, recordId: s.recordId,
          title: s.title, version: s.version, effectiveDate: s.effectiveDate,
          retrievalType: s.retrievalType, tier: s.tier, verbatim: s.verbatim,
          score: s.score, rerankScore: s.rerankScore,
        })),
        embedding_model: result.embeddingModel,
        rerank_model: result.rerankModel,
        grounding: grounding ?? null,
      }]),
    });
  } catch (error) {
    process.stderr.write(`[retrieval-log] failed: ${error.message}\n`);
  }
}
