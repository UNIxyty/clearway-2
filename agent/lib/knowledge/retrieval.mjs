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

import { embed, activeEmbeddingModel } from "./embeddings.mjs";
import { rerank } from "./rerank.mjs";

const REST_TIMEOUT_MS = 20_000;

// Similarity floors. Tier 1's is higher deliberately: a weak tier-2 hit is an
// off-topic paragraph, a weak tier-1 hit is an unrelated RULE presented as
// authoritative. Enforced in the RPC and again here, so an older deployed
// function cannot quietly reintroduce unfiltered neighbours.
const MIN_SIMILARITY_TIER1 = Number(process.env.AGENT_MIN_SIMILARITY_TIER1 || 0.40);
const MIN_SIMILARITY_TIER2 = Number(process.env.AGENT_MIN_SIMILARITY_TIER2 || 0.25);

function url() { return String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, ""); }
function key() { return String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(); }
export function knowledgeConfigured() { return Boolean(url() && key()); }

async function rpc(fn, args) {
  const response = await fetch(`${url()}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key(), Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(REST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${fn} -> ${response.status}: ${(await response.text()).slice(0, 240)}`);
  return response.json();
}

export async function rest(pathAndQuery, init = {}) {
  const headers = { apikey: key(), Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...(init.headers ?? {}) };
  const response = await fetch(`${url()}/rest/v1/${pathAndQuery}`, { ...init, headers, signal: AbortSignal.timeout(REST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${pathAndQuery} -> ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function tier1Source(row) {
  return {
    source: row.source_document,
    documentId: null,
    recordId: row.record_id,
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
    score: row.similarity ?? null,
    rerankScore: null,
  };
}

function tier2Source(row) {
  return {
    source: row.source ?? row.title,
    documentId: row.document_id,
    recordId: row.chunk_id,
    reference: row.heading ?? null,
    title: row.title,
    version: row.version ?? null,
    effectiveDate: row.effective_date ?? null,
    retrievalType: "tier2-semantic",
    tier: "tier2",
    text: row.text,
    verbatim: false,
    page: row.page ?? null,
    heading: row.heading ?? null,
    score: row.similarity ?? null,
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
export async function searchKnowledge(query, { icao = null, country = null, limit = 8, tier = "both" } = {}) {
  if (!knowledgeConfigured()) throw new Error("The knowledge base is not configured.");
  const [vector] = await embed(query, { purpose: "query" });
  const embeddingModel = activeEmbeddingModel();

  const wantTier1 = tier === "both" || tier === "tier1";
  const wantTier2 = tier === "both" || tier === "tier2";

  // A swallowed RPC error here is indistinguishable from an empty corpus, which
  // is exactly how a broken migration hid for a whole test run. Failures are
  // surfaced on stderr and the tier is reported as errored, not as empty.
  const failures = [];
  const safeRpc = async (fn, args) => {
    try {
      return await rpc(fn, args);
    } catch (error) {
      failures.push(`${fn}: ${error.message}`);
      process.stderr.write(`[retrieval] ${fn} FAILED: ${error.message}\n`);
      return [];
    }
  };

  const [tier1Rows, tier2Rows] = await Promise.all([
    wantTier1
      ? safeRpc("agent_match_tier1", { query_embedding: vector, match_count: Math.min(limit, 10), filter_icao: icao, filter_country: country, min_similarity: MIN_SIMILARITY_TIER1 })
      : Promise.resolve([]),
    wantTier2
      ? safeRpc("agent_match_chunks", { query_embedding: vector, match_count: 24, filter_icao: icao, filter_country: country, min_similarity: MIN_SIMILARITY_TIER2 })
      : Promise.resolve([]),
  ]);

  const tier1 = (tier1Rows ?? []).map(tier1Source).filter((s) => (s.score ?? 0) >= MIN_SIMILARITY_TIER1);
  const candidates = (tier2Rows ?? []).map(tier2Source).filter((s) => (s.score ?? 0) >= MIN_SIMILARITY_TIER2);

  // Rerank tier 2 only — see the note above.
  const reranked = candidates.length > 0
    ? await rerank(query, candidates, { topN: limit })
    : { results: [], model: null, method: "none" };

  for (const r of reranked.results) r.rerankScore = r.rerankScore ?? null;

  return {
    query,
    tier1,
    tier2: reranked.results,
    embeddingModel,
    rerankModel: reranked.model,
    rerankMethod: reranked.method,
    candidateCount: candidates.length,
    failures,
  };
}

/** Persist what supported an answer, so it can be reconstructed later. */
export async function logRetrieval({ conversationId, userId, query, result, grounding }) {
  try {
    await rest("agent_retrievals", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{
        conversation_id: conversationId ?? null,
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
