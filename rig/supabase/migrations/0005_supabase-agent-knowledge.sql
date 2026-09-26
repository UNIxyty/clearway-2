-- Dispatcher agent, Part 4: the two-tier knowledge base.
--
-- TIER 1 — verbatim / authoritative. Operational rules that must be quoted
--   exactly. Stored as STRUCTURED RECORDS, returned word for word. Nothing
--   enters this tier without a person approving it: ingest proposes, a human
--   confirms, and the table records who and when.
--
-- TIER 2 — semantic / reference. SOPs, handling procedures, manuals. Chunked
--   and embedded; the agent may synthesise across them, always citing the
--   source document.
--
-- What is NOT here, deliberately: limitations, IMPORTANT entries and CAA
-- records. Those are already structured records with match rules, queried
-- directly by Part 2's tools, so the agent's answer is exactly what the wall
-- shows. Re-indexing them here would create a second, drifting copy.
--
-- Run in the Supabase SQL editor. Idempotent.

begin;

-- pgvector. Supabase ships it; this enables it in the extensions schema.
create extension if not exists vector with schema extensions;

-- ── Documents: the original file, always retained and retrievable by name ──
create table if not exists public.agent_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  filename text not null,
  mime text null,
  bytes bigint null,
  -- Key under STORAGE_ROOT (/mnt/hdd-storage), never the root volume.
  storage_key text not null,
  sha256 text null,
  -- Operator-supplied metadata
  source text null,                     -- e.g. "airBaltic OM-A"
  version text null,
  effective_date date null,
  country text null,
  icao text null,
  tags text[] null default '{}',
  -- Lifecycle
  tier text null check (tier in ('tier1', 'tier2')),
  proposed_tier text null check (proposed_tier in ('tier1', 'tier2')),
  proposed_reason text null,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'classified', 'awaiting_approval', 'approved', 'rejected', 'indexed', 'failed')),
  uploaded_by uuid null,
  uploaded_by_email text null,
  approved_by uuid null,
  approved_by_email text null,
  approved_at timestamptz null,
  rejected_reason text null,
  error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_docs_status on public.agent_documents (status, created_at desc);
create index if not exists idx_agent_docs_tier on public.agent_documents (tier);
create unique index if not exists idx_agent_docs_storage on public.agent_documents (storage_key);

-- ── Tier 2: chunks + embeddings ───────────────────────────────────────────
-- 1536 dims matches Cohere Embed v4 as configured (and Titan Text Embeddings
-- V2 at its 1024 setting would need its own column — see the status file for
-- which was chosen and why).
create table if not exists public.agent_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.agent_documents(id) on delete cascade,
  ordinal integer not null,
  text text not null,
  -- Where in the original this came from, so a citation can point at a page.
  page integer null,
  heading text null,
  embedding extensions.vector(1536) null,
  embedding_model text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_chunks_doc on public.agent_chunks (document_id, ordinal);
-- Cosine distance, matching the retrieval query.
create index if not exists idx_agent_chunks_embedding
  on public.agent_chunks using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100);

-- ── Tier 1: approved verbatim records ─────────────────────────────────────
-- One row per operative rule. `text` is the authority's wording and is never
-- rewritten; edits create a new version rather than mutating the record.
create table if not exists public.agent_tier1_records (
  id uuid primary key default gen_random_uuid(),
  document_id uuid null references public.agent_documents(id) on delete set null,
  reference text not null,              -- e.g. "LIM-0412 §3.3"
  title text not null,
  text text not null,                   -- VERBATIM. Never paraphrased.
  source_document text not null,
  version text null,
  effective_date date null,
  expires_date date null,
  country text null,
  icao text null,
  tags text[] null default '{}',
  -- A person approved this. Not nullable once active: nothing reaches the
  -- verbatim tier without a named human behind it.
  approved_by uuid not null,
  approved_by_email text not null,
  approved_at timestamptz not null default now(),
  superseded_by uuid null references public.agent_tier1_records(id) on delete set null,
  retired_at timestamptz null,
  embedding extensions.vector(1536) null,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_tier1_active on public.agent_tier1_records (retired_at, effective_date desc);
create index if not exists idx_agent_tier1_icao on public.agent_tier1_records (icao) where retired_at is null;
create index if not exists idx_agent_tier1_country on public.agent_tier1_records (country) where retired_at is null;
create index if not exists idx_agent_tier1_embedding
  on public.agent_tier1_records using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 50);

-- ── Retrieval audit: enough to reconstruct which sources supported an answer ──
create table if not exists public.agent_retrievals (
  id bigint generated by default as identity primary key,
  conversation_id uuid null,
  message_id uuid null,
  user_id uuid null,
  query text not null,
  tier text null,
  -- The standard retrieval source objects returned, in rank order, with scores
  -- before and after reranking.
  sources jsonb not null default '[]',
  embedding_model text null,
  rerank_model text null,
  grounding jsonb null,                 -- the guardrail verdict, when one ran
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_retrievals_conv on public.agent_retrievals (conversation_id, created_at desc);

-- ── Similarity search functions (RPC — PostgREST cannot express <=>) ──────
--
-- Drop the earlier 4-argument signatures FIRST. `create or replace function`
-- only replaces a function with the SAME signature — adding `min_similarity`
-- created an OVERLOAD instead, and PostgREST then refuses the call outright
-- (PGRST203, "could not choose the best candidate function"). Retrieval
-- returned nothing at all, which read like an empty corpus rather than a
-- broken migration.
drop function if exists public.agent_match_chunks(extensions.vector, integer, text, text);
drop function if exists public.agent_match_tier1(extensions.vector, integer, text, text);
-- NOTE (revised): chunks are NOT gated on the document's `tier`. A document can
-- legitimately yield both — approved Tier 1 records AND Tier 2 reference
-- chunks — and the first version excluded a document's chunks the moment any
-- Tier 1 record was approved from it, silently emptying half the corpus.
-- A row in agent_chunks IS tier 2, by definition.
--
-- `min_similarity` exists because a vector search always returns its nearest
-- neighbours, however poor. Without a floor, an unrelated question surfaces the
-- least-unrelated passage, and the agent presents it as a source.
create or replace function public.agent_match_chunks(
  query_embedding extensions.vector(1536),
  match_count integer default 20,
  filter_icao text default null,
  filter_country text default null,
  min_similarity double precision default 0.25
)
returns table (
  chunk_id uuid, document_id uuid, ordinal integer, text text, page integer, heading text,
  title text, source text, version text, effective_date date, similarity double precision
)
language sql stable as $$
  select c.id, c.document_id, c.ordinal, c.text, c.page, c.heading,
         d.title, d.source, d.version, d.effective_date,
         1 - (c.embedding <=> query_embedding) as similarity
    from public.agent_chunks c
    join public.agent_documents d on d.id = c.document_id
   where c.embedding is not null
     and d.status in ('indexed', 'approved')
     and (filter_icao is null or d.icao is null or d.icao = filter_icao)
     and (filter_country is null or d.country is null or d.country = filter_country)
     and (1 - (c.embedding <=> query_embedding)) >= min_similarity
   order by c.embedding <=> query_embedding
   limit match_count;
$$;

-- `min_similarity` is higher here than for tier 2 ON PURPOSE. A weak tier-2 hit
-- is a slightly off-topic paragraph; a weak tier-1 hit is an unrelated
-- operational RULE presented as authoritative, which is the single most
-- dangerous thing this system can do.
create or replace function public.agent_match_tier1(
  query_embedding extensions.vector(1536),
  match_count integer default 10,
  filter_icao text default null,
  filter_country text default null,
  min_similarity double precision default 0.40
)
returns table (
  record_id uuid, reference text, title text, text text, source_document text,
  version text, effective_date date, approved_by_email text, approved_at timestamptz,
  similarity double precision
)
language sql stable as $$
  select r.id, r.reference, r.title, r.text, r.source_document,
         r.version, r.effective_date, r.approved_by_email, r.approved_at,
         1 - (r.embedding <=> query_embedding) as similarity
    from public.agent_tier1_records r
   where r.embedding is not null
     and r.retired_at is null
     and (r.expires_date is null or r.expires_date >= current_date)
     and (filter_icao is null or r.icao is null or r.icao = filter_icao)
     and (filter_country is null or r.country is null or r.country = filter_country)
     and (1 - (r.embedding <=> query_embedding)) >= min_similarity
   order by r.embedding <=> query_embedding
   limit match_count;
$$;

-- RLS on, no permissive policies — service-role behind an authenticated API.
alter table public.agent_documents enable row level security;
alter table public.agent_chunks enable row level security;
alter table public.agent_tier1_records enable row level security;
alter table public.agent_retrievals enable row level security;

commit;
