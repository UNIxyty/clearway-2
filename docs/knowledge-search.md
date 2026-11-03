# Knowledge search (2026-11-03)

**Postgres full-text search, for both tiers.** It replaces the Bedrock embeddings, which failed every search and every
upload from 31 Oct, when the AWS key died. Nobody noticed, because nobody had searched since September.

## What is in the knowledge base

Read from production on 2026-11-03:

- **Verbatim (tier 1):** 13 records. All of them are retired or superseded, so none is live.
- **Reference (tier 2):** 1 indexed document, 38 chunks, about 40,000 characters.
- **Searches:** 118 in the last 90 days. The last was on 24 September.

## Why full-text search, and not the verbatim records in the system prompt

The prompt was considered for the verbatim records. With prompt caching proven on all three models, they would cost
almost nothing per turn, and they could never fail to retrieve. It was not chosen:

1. **There is nothing to put there today.** No verbatim record is live.
2. **Citations.** The API cites a tool's search results beside the claim they support. It cannot cite text in the
   system prompt, so an answer drawn from the prompt could not carry a citation. The dispatcher's approved-clause frame
   is also built from tool results.
3. **Where the line would be.** If citations were not needed, the prompt would be the better shape while the live
   verbatim records fit in roughly 10–20k tokens: about a hundred short records, none scoped to an airport. Past that,
   or with per-airport scoping, retrieval wins. With citations required, retrieval wins at any size.

## How it works

`agent/lib/knowledge/retrieval.mjs`:

- **Matching.** The question's words, minus filler, are joined with OR. They are matched by PostgREST's full-text filter
  (`to_tsvector('english', text) @@ to_tsquery(…)`) on the columns at query time. No schema change is needed, and at
  this size it is instant.
- **Filters.** The same as the old match functions: a record must not be retired or expired, and must be in scope for
  the airport or country if one is asked. A passage's document must be indexed or approved.
- **Ranking.** Ours: the share of the question's words a passage holds, plus a little for how often it holds them.
  A verbatim record needs half the words; a reference passage a third.
- **Rerank.** Tier 2 is reranked by the fast tier. If that fails, the search order stands, and the result's
  `fallbacks` says so.
- **Failures.** A failed search is reported as failed, never as empty.

**Uploads index again.** Indexing waited on embeddings, so it could not index anything after 31 Oct. Now it stores the
chunks, and they are searchable at once. An approved verbatim record is searchable the moment it is approved.

**When it grows:** add a `tsvector` column with a GIN index and a ranking function in a migration (the user runs DDL).
The API stays the same.

**Removed:** `agent/lib/knowledge/embeddings.mjs` (Bedrock Cohere and Titan), the Cohere rerank path, the grounding
guardrail (`grounding.mjs`; citations replace it), and the Bedrock scripts (smoke test, embedding benchmark, guardrail
test, model enablement).

**Proof:** `rig/knowledge-fts-check.mjs`, 10 checks. An upload indexes with no embedding, and the verbatim record is
found word for word. Expired, retired and other-airport records stay out; a reference passage is found with its
document. A question nothing answers comes back empty, and an unreachable database is reported as a failure.
