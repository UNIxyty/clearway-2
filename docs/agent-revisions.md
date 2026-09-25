# Document revisions — knowing when a document is out of date

The rule that governs every decision here: **unknown is not the same as current.** A document with
no revision data says so. It never renders as current, and a blank field is never read as "fine".

## 1. What existed before this job

| Where | What was there | What was lost |
|---|---|---|
| EAD AD 2 download (`scripts/ead-download-aip-pdf.mjs`) | The EAD results table has columns Effective Date · Document Name · eAIP · AIRAC · Document Heading. The script read only the heading and the link. EAD's own filenames carry the effective date (`LZ_AD_2_LZIB_en_2026-01-22.pdf`) | Both the table date and the dated filename were dropped when the file was re-keyed to `aip/ead-pdf/{ICAO}.pdf` |
| EAD GEN 1.2 download (`scripts/ead-download-gen-pdf.mjs`) | Same table; a comment even names the columns | Same |
| National scrapers | Name their downloads `{effectiveDate}_{ICAO}_AD2.pdf` | Dropped at the storage key |
| PDF metadata extractors | Ask the LLM for `publication_date` and `amendment_id` | `amendment_id` discarded; `Publication Date` kept as printed text only, and a page's printed date is not the document's currency (unchanged pages keep old dates) |
| Storage sidecar `aip/ead/{ICAO}.json` | `updatedAt` (sync time) when extraction ran | No revision |
| `airports` table | no document columns at all | — |
| `agent_documents` | `version text`, `effective_date date` (operator-entered at upload); **0 of 18 rows had either** | no validity end, no superseded pointer |
| `agent_tier1_records` | `version`, `effective_date`, `expires_date`, `superseded_by`, `retired_at` | not surfaced anywhere |
| `agent_generated_files` | `sources jsonb` (tool calls, document ids, record ids) + `created_at` | already answers "generated from what, when" |
| AIRAC calendar | none anywhere in portal, agent or wall | — |

The cheapest fix in the job: **keep what EAD already tells us.** Both downloaders now read the
Effective Date and AIRAC columns of the row they download and leave `<file>.meta.json` beside the
download; the sync worker writes a sidecar beside every stored PDF.

## 2. Data model

### AIP copies — `aip/<ns>/<NAME>.meta.json` beside each cached PDF (`lib/aip-revision-meta.mjs`)

```
{ icao, source, effectiveDate, airac, airacFlag, revisionSource: "ead-table" | "filename" | "none",
  sourceFilename, sourceUrl, sha256, bytes, fetchedAt, history: [{ effectiveDate, airac, sha256, fetchedAt }] }
```

`airac` is derived only when the effective date falls exactly on a cycle date (28 days from
2026-01-22 = AIRAC 2601). A non-cycle amendment date is kept as a date, not turned into a cycle.
`history` keeps the earlier copies replaced under the same key, so a citation that named an
earlier revision can still be recognised.

Written by: the sync worker on every store (`saveRevisionMeta` in `scripts/aip-sync-server.mjs`),
and `scripts/tools/backfill-aip-revisions.mjs` for copies already in storage.

### Knowledge base — `agent_documents` (`docs/supabase-agent-revisions.sql`)

Existing: `version`, `effective_date`. Added by the SQL file: `valid_until`, `superseded_by`,
`revision_source`, `revision_checked_at`. The agent feature-detects the new columns
(`hasRevisionColumns`) and runs without them; until the SQL is applied, superseded-by is computed
from siblings (same title + source, later effective date, approved/indexed).

### Generated files

`agent_generated_files.sources` + `created_at` already record what a file was generated from and
when. Nothing added.

## 3. The four states (`lib/airac.ts`, `agent/lib/knowledge/revision.mjs`)

| State | Knowledge base | AIP copy |
|---|---|---|
| **current** | has a version or effective date, effective today, no newer sibling, validity not ended | has an effective date, effective today, **and the copy was fetched during the AIRAC cycle now in force** |
| **future** (not yet effective) | `effective_date` after today | effective date after today (e.g. a scraper download of the next cycle) |
| **superseded** | `superseded_by` set, or a newer approved sibling exists, or `valid_until` has passed | a newer copy replaced this one under the same key (the earlier revision is in `history`) |
| **unknown** | neither version nor effective date | no effective date from the source; **or fetched before the cycle in force began** ("not checked against the source since AIRAC 2609 took effect") |

The last AIP rule is deliberate. A copy fetched last cycle may have been amended since and we have
not looked; calling it current would be exactly the failure this job exists to prevent. The
consequence is that every cached AIP copy goes unknown when a new cycle starts unless it is
re-fetched. There is no scheduled AIP re-check today (syncs are on demand), and EAD blocks
datacenter IPs, so a per-cycle re-check is a decision for the owner, not something this job could
add quietly.

## 4. Where the state shows

- **Tools**: `get_aip_document`, `get_gen_document`, `search_knowledge` (every hit), `get_document`
  return `revision` and a `revisionNote` / `revisionNotes` the model must put next to the claim.
  `search_knowledge` orders current → not yet effective → unknown → superseded, and drops a
  superseded tier-2 document when the current one of the same family is also in the results.
- **System prompt** (`agent/config/system-prompt.md` "Revisions — unknown is not current"): the
  warning goes in the answer next to the claim; unknown is never called current; approved text from a
  superseded source is still quoted word for word but flagged.
- **Answer UI**: every source chip and source row carries the state in words (`RevisionTag`); the
  verbatim frame carries a note under the heading when its source document is not current (the
  frame's own rules are untouched — the text is still the stored text, byte for byte); document
  cards show the revision line.
- **Viewer**: the header chip is always present (grey current, amber superseded, blue not yet
  effective, italic "revision unknown"); banners for superseded (with **Open current** when we hold
  it), not yet effective, and unknown; a **cited-revision mismatch** banner when the answer cited a
  revision other than the copy shown ("The answer cited AIRAC 2608; this copy is AIRAC 2609").
- **Audit**: `citation.check` / `verbatim.check` rows record the copy's revision and the cited
  revision.

## 5. Migration (backfill)

`scripts/tools/backfill-aip-revisions.mjs` — inside the aip-sync container:

```
docker compose exec aip-sync node scripts/tools/backfill-aip-revisions.mjs [--dry-run]
```

For each stored PDF without a sidecar: a dated local download with identical bytes (sha256) gives
the effective date (`revisionSource: "filename"`); otherwise the sidecar records only the file's
mtime as `fetchedAt` (`revisionSource: "none"`) — unknown, stated. Nothing is guessed.

Counts are recorded in `docs/agent-build-status.md` (stage 15) for the production run.

## 6. The two banners (§5 of the job)

- **Nothing to highlight — not a failed check** (grey, `info`): the agent cited the document as a
  whole; there is no sentence to locate; the claim is not in question.
- **Couldn't find cited passage n in this file** (red, `search-x`): the passage is not in the
  document; treat the claim as unverified; logged to the Activity log.
