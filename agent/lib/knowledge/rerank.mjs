// Reranking: a listwise LLM pass on the fast tier over the full-text candidates (tier 2 only). The model sees the
// question and each candidate together, which a word match cannot do. The Bedrock Cohere path went with the AWS
// account (2026-11-03). If the pass fails, the search order stands and the result says so (method "search-order").

import { converseOnce } from "../bedrock.mjs";

const TIMEOUT_MS = 30_000;
let lastRerankModelId = null;

/**
 * Listwise LLM rerank. Asks for indices in relevance order and nothing else;
 * anything unparseable falls back to the search order rather than throwing,
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

  try {
    const results = await llmRerank(query, candidates, topN);
    return { results, model: lastRerankModelId, method: "llm-listwise" };
  } catch (error) {
    // a fallback, said (2026-11-03): the result carries it, so the tool's audit row has it
    process.stderr.write(`[rerank] LLM rerank failed, using search order: ${error.message}\n`);
    return { results: candidates.slice(0, topN), model: null, method: "search-order", fallback: { kind: "rerank", to: "search-order", reason: String(error?.message ?? error).slice(0, 200) } };
  }
}
