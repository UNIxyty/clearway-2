// Embeddings, behind a provider interface so the model is configuration.
//
// Two candidates, as the prompt asks: Amazon Titan Text Embeddings V2 and
// Cohere Embed v4. scripts/agent-embedding-benchmark.mjs measures both on our
// OWN documents; the status file records which was chosen and why.
//
// Note the asymmetry Cohere requires and Titan does not: an embedding for a
// stored passage and an embedding for a user's question are different things
// (`search_document` vs `search_query`). Getting that backwards costs real
// retrieval quality and is invisible — it just returns slightly worse results
// forever. The interface makes the caller state which it wants.

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { loadModelConfig } from "../models.mjs";

const TIMEOUT_MS = 30_000;

let client = null;
function runtime() {
  if (!client) client = new BedrockRuntimeClient({ region: loadModelConfig().region });
  return client;
}

export const EMBEDDING_MODELS = {
  "cohere-embed-v4": {
    id: "eu.cohere.embed-v4:0",
    dimensions: 1536,
    batch: 96,
    /** Cohere distinguishes passage from query embeddings. */
    body: (texts, purpose) => ({
      texts,
      input_type: purpose === "query" ? "search_query" : "search_document",
      embedding_types: ["float"],
    }),
    parse: (payload) => {
      const raw = Array.isArray(payload.embeddings) ? payload.embeddings : payload.embeddings?.float;
      if (!Array.isArray(raw)) throw new Error(`Cohere returned no embeddings: ${JSON.stringify(payload).slice(0, 200)}`);
      return raw;
    },
  },
  "titan-v2": {
    id: "amazon.titan-embed-text-v2:0",
    dimensions: 1024,
    batch: 1, // Titan embeds one input per call
    body: (texts) => ({ inputText: texts[0], dimensions: 1024, normalize: true }),
    parse: (payload) => {
      if (!Array.isArray(payload.embedding)) throw new Error(`Titan returned no embedding: ${JSON.stringify(payload).slice(0, 200)}`);
      return [payload.embedding];
    },
  },
};

export function activeEmbeddingModel() {
  return process.env.AGENT_EMBEDDING_MODEL || "cohere-embed-v4";
}

/**
 * Embed texts. `purpose` is "document" for stored passages and "query" for a
 * user's question — see the note above; it is not cosmetic.
 */
export async function embed(texts, { purpose = "document", model = activeEmbeddingModel() } = {}) {
  const spec = EMBEDDING_MODELS[model];
  if (!spec) throw new Error(`Unknown embedding model "${model}"`);
  const input = (Array.isArray(texts) ? texts : [texts]).map((t) => String(t ?? "").slice(0, 8000)).filter(Boolean);
  if (input.length === 0) return [];

  const vectors = [];
  for (let i = 0; i < input.length; i += spec.batch) {
    const slice = input.slice(i, i + spec.batch);
    const response = await runtime().send(
      new InvokeModelCommand({
        modelId: spec.id,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(spec.body(slice, purpose)),
      }),
      { abortSignal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    const payload = JSON.parse(Buffer.from(response.body).toString("utf8"));
    vectors.push(...spec.parse(payload));
  }
  if (vectors.length !== input.length) {
    throw new Error(`Embedding count mismatch: asked for ${input.length}, got ${vectors.length}`);
  }
  return vectors;
}

export function embeddingDimensions(model = activeEmbeddingModel()) {
  return EMBEDDING_MODELS[model]?.dimensions ?? null;
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
