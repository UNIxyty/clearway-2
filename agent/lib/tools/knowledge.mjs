// Knowledge tools.
//
// Note what is NOT here: limitations, IMPORTANT entries and CAA records. Those
// are structured records with match rules, and Part 2's tools query them
// directly, so the agent's answer is exactly what the wall shows. Indexing them
// into the vector store as well would create a second copy that drifts from the
// first — and the drift would be invisible until it mattered.

import { defineTool, S } from "./framework.mjs";
import { searchKnowledge, logRetrieval, rest } from "../knowledge/retrieval.mjs";
import { checkGrounding, groundingConfigured } from "../knowledge/grounding.mjs";
import { NotFound, ServiceUnavailable } from "./errors.mjs";

const SOURCE_SCHEMA = {
  type: "object",
  properties: {
    source: { type: ["string", "null"] },
    documentId: { type: ["string", "null"] },
    recordId: { type: ["string", "null"] },
    reference: { type: ["string", "null"] },
    title: { type: ["string", "null"] },
    version: { type: ["string", "null"] },
    effectiveDate: { type: ["string", "null"] },
    retrievalType: { type: "string" },
    tier: { type: "string" },
    text: { type: "string" },
    verbatim: { type: "boolean" },
    page: { type: ["integer", "null"] },
    heading: { type: ["string", "null"] },
    approvedBy: { type: ["string", "null"] },
    approvedAt: { type: ["string", "null"] },
    score: { type: ["number", "null"] },
    rerankScore: { type: ["number", "null"] },
  },
};

defineTool({
  name: "search_knowledge",
  description:
    "Search Clearway's own documents: approved operational rules (quoted exactly) and reference material such as SOPs, handling procedures and manuals. Use for 'what is our procedure for…', 'what does the manual say about…', or any question about a company rule. Approved rules come back word for word and must be quoted, not paraphrased. Does NOT cover limitations, IMPORTANT bulletins or CAA contacts — use list_limitations, list_important and list_caa for those.",
  permission: "user",
  sourceTier: "company",
  sourceLabel: (input, result) => {
    const first = (result.verbatim?.[0] ?? result.reference?.[0]) ?? null;
    return first?.title ? `Company · ${first.title}` : `Company · knowledge base · "${String(input.query).slice(0, 40)}"`;
  },
  timeoutMs: 45_000,
  maxResultBytes: 256 * 1024,
  input: {
    type: "object",
    required: ["query"],
    additionalProperties: false,
    properties: {
      query: { type: "string", minLength: 3, maxLength: 400, description: "The question, in the user's own words." },
      icao: { ...S.icao, description: "Narrow to documents scoped to this airport." },
      country: { type: "string", maxLength: 60 },
      tier: { type: "string", enum: ["both", "tier1", "tier2"], default: "both" },
      limit: S.limit(12, 6),
    },
  },
  output: {
    type: "object",
    required: ["query", "verbatim", "reference", "verified"],
    properties: {
      query: { type: "string" },
      // Approved operational text. QUOTE THIS — do not restate it.
      verbatim: { type: "array", items: SOURCE_SCHEMA },
      // Reference material. May be synthesised across, always with a citation.
      reference: { type: "array", items: SOURCE_SCHEMA },
      verified: { type: "boolean", description: "False when nothing sufficiently relevant was found." },
      note: { type: ["string", "null"] },
      embeddingModel: { type: ["string", "null"] },
      rerankMethod: { type: ["string", "null"] },
    },
  },
  async handler({ query, icao, country, tier, limit }, { user, conversationId }) {
    let result;
    try {
      result = await searchKnowledge(query, { icao: icao ? icao.toUpperCase() : null, country, limit, tier });
    } catch (error) {
      throw ServiceUnavailable(`The knowledge base could not be searched: ${error.message}`);
    }

    // A failed search is not the same fact as an empty one, and telling the
    // model "nothing matched" when retrieval broke invites it to answer from
    // its own knowledge — the precise thing this tier exists to prevent.
    if ((result.failures ?? []).length > 0 && result.tier1.length + result.tier2.length === 0) {
      throw ServiceUnavailable(`The knowledge base could not be searched: ${result.failures.join("; ")}`);
    }

    const found = result.tier1.length + result.tier2.length;
    if (found === 0) {
      // An explicit "nothing found" so the model says so rather than filling
      // the gap from its own background knowledge.
      await logRetrieval({ conversationId, userId: user.userId, query, result, grounding: null });
      return {
        query,
        verbatim: [],
        reference: [],
        verified: false,
        note: "Nothing in the knowledge base matched this question. Say that it could not be verified — do not answer from general knowledge.",
        embeddingModel: result.embeddingModel,
        rerankMethod: result.rerankMethod,
      };
    }

    await logRetrieval({ conversationId, userId: user.userId, query, result, grounding: null });
    return {
      query,
      verbatim: result.tier1,
      reference: result.tier2,
      verified: true,
      note: result.tier1.length > 0
        ? "The verbatim records are approved operational text. They are shown to the dispatcher word for word — explain around them, never in place of them."
        : groundingConfigured() ? null : "Grounding verification is not configured, so this answer is unverified.",
      embeddingModel: result.embeddingModel,
      rerankMethod: result.rerankMethod,
    };
  },
});

defineTool({
  name: "get_document",
  description:
    "Retrieve one of Clearway's own uploaded documents by name or id — the original file, with its metadata and a link to open it. Use when someone asks for 'the manual', 'the SOP', or a document by name.",
  permission: "user",
  sourceTier: "company",
  sourceLabel: (input, result) => `Company · ${result.document?.title ?? input.name ?? input.documentId}`,
  input: {
    type: "object",
    additionalProperties: false,
    properties: {
      documentId: { type: "string", maxLength: 64 },
      name: { type: "string", maxLength: 200, description: "Title or filename; partial match is fine." },
    },
  },
  output: {
    type: "object",
    required: ["document"],
    properties: {
      document: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          filename: { type: "string" },
          source: { type: ["string", "null"] },
          version: { type: ["string", "null"] },
          effectiveDate: { type: ["string", "null"] },
          tier: { type: ["string", "null"] },
          bytes: { type: ["integer", "null"] },
          downloadPath: { type: "string" },
        },
      },
    },
  },
  async handler({ documentId, name }, _ctx) {
    if (!documentId && !name) throw NotFound("Give a document id or a name.");
    const filter = documentId
      ? `id=eq.${encodeURIComponent(documentId)}`
      : `or=(title.ilike.*${encodeURIComponent(name)}*,filename.ilike.*${encodeURIComponent(name)}*)`;
    const rows = await rest(`agent_documents?${filter}&status=in.(approved,indexed)&select=*&limit=1`);
    const doc = rows?.[0];
    if (!doc) throw NotFound(`No document matching ${documentId ?? name}.`);
    return {
      document: {
        id: doc.id,
        title: doc.title,
        filename: doc.filename,
        source: doc.source ?? null,
        version: doc.version ?? null,
        effectiveDate: doc.effective_date ?? null,
        tier: doc.tier ?? null,
        bytes: doc.bytes ?? null,
        // Served by the agent service, which re-checks the caller's access.
        downloadPath: `/agent/api/knowledge/documents/${doc.id}/file`,
      },
    };
  },
});
