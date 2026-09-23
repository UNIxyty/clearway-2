// Reranking — the cheapest large quality gain available, per the brief.
//
// THE CONSTRAINT: Cohere Rerank is not offered in eu-north-1 (established in
// Part 0 and re-confirmed for Part 4; `--list` shows Cohere Embed only). Moving
// this one call to a US region would take flight-operations text out of the EU,
// which is not a trade worth making for ranking.
//
// So: the Cohere path is implemented and is used the moment a rerank model
// appears in an EU region, and until then the fallback is a listwise LLM
// reranker on the cheap tier. It is a real cross-encoder-style pass — the model
// sees the query and each candidate together, which is exactly what a bi-encoder
// embedding cannot do — at a fraction of the reasoning model's cost.
//
// The chosen path is recorded on every retrieval, so an answer's ranking
// provenance is never a guess.

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { loadModelConfig } from "../models.mjs";
// converseOnce already walks the tier's candidate list and falls through when a
// model is unavailable to this account. Calling Bedrock directly here meant
// taking only the first candidate — which is account-gated — so reranking
// silently degraded to embedding order on every request.
import { converseOnce } from "../bedrock.mjs";

const TIMEOUT_MS = 30_000;
let lastRerankModelId = null;

let client = null;
function runtime() {
  if (!client) client = new BedrockRuntimeClient({ region: loadModelConfig().region });
  return client;
}

function cohereRerankModelId() {
  // Empty unless an EU rerank model exists; set BEDROCK_RERANK_MODEL_ID to enable.
  return String(process.env.BEDROCK_RERANK_MODEL_ID || "").trim();
}

async function cohereRerank(query, candidates, topN) {
  const modelId = cohereRerankModelId();
  const response = await runtime().send(
    new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({ query, documents: candidates.map((c) => c.text), top_n: topN, api_version: 2 }),
    }),
    { abortSignal: AbortSignal.timeout(TIMEOUT_MS) }
  );
  const payload = JSON.parse(Buffer.from(response.body).toString("utf8"));
  if (!Array.isArray(payload.results)) throw new Error("Cohere rerank returned no results");
  return payload.results.map((r) => ({ ...candidates[r.index], rerankScore: r.relevance_score }));
}

/**
 * Listwise LLM rerank. Asks for indices in relevance order and nothing else;
 * anything unparseable falls back to the embedding order rather than throwing,
 * because a worse ORDER is recoverable and a failed answer is not.
 */
async function llmRerank(query, candidates, topN) {
  const numbered = candidates
    .map((c, i) => `[${i}] ${String(c.text).replace(/\s+/g, " ").slice(0, 700)}`)
    .join("\n\n");
  const prompt =
    `Question: ${query}\n\nPassages:\n${numbered}\n\n` +
    `List the passage numbers that actually help answer the question, most relevant first, ` +
    `as a JSON array of integers and nothing else. Omit passages that do not help. ` +
    `Return at most ${topN}.`;

  const { text, modelId } = await converseOnce({
    tier: "fast",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 256,
    temperature: 0,
  });
  lastRerankModelId = modelId;
  const match = /\[[\s\S]*?\]/.exec(text);
  if (!match) return candidates.slice(0, topN);
  let order;
  try {
    order = JSON.parse(match[0]);
  } catch {
    return candidates.slice(0, topN);
  }
  const picked = [];
  for (const idx of order) {
    const candidate = candidates[Number(idx)];
    if (candidate && !picked.includes(candidate)) {
      // Rank position is the only score a listwise reranker can honestly give.
      picked.push({ ...candidate, rerankScore: 1 - picked.length / Math.max(order.length, 1) });
    }
    if (picked.length >= topN) break;
  }
  return picked.length > 0 ? picked : candidates.slice(0, topN);
}

/**
 * Rerank candidates. Returns { results, model, method } — the method is stored
 * with the retrieval so a later reader knows how the order was arrived at.
 */
export async function rerank(query, candidates, { topN = 8 } = {}) {
  if (candidates.length === 0) return { results: [], model: null, method: "none" };
  if (candidates.length === 1) return { results: candidates, model: null, method: "single" };

  if (cohereRerankModelId()) {
    try {
      return { results: await cohereRerank(query, candidates, topN), model: cohereRerankModelId(), method: "cohere-rerank" };
    } catch (error) {
      process.stderr.write(`[rerank] Cohere rerank failed, falling back to LLM: ${error.message}\n`);
    }
  }
  try {
    const results = await llmRerank(query, candidates, topN);
    return { results, model: lastRerankModelId, method: "llm-listwise" };
  } catch (error) {
    process.stderr.write(`[rerank] LLM rerank failed, using embedding order: ${error.message}\n`);
    return { results: candidates.slice(0, topN), model: null, method: "embedding-order" };
  }
}
