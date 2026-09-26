-- Document revisions: know when a document is out of date.
-- Run in the Supabase SQL editor (DDL is not possible over REST).
--
-- Adds to agent_documents what agent_tier1_records already has: a validity end,
-- an explicit pointer to the revision that replaced this one, and where the
-- revision data came from. Until this has been run the agent service computes
-- superseded-by from sibling documents (same title + source, later effective
-- date) and reads validity as unknown — never as current.

begin;

alter table public.agent_documents add column if not exists valid_until date null;
alter table public.agent_documents add column if not exists superseded_by uuid null references public.agent_documents(id) on delete set null;
alter table public.agent_documents add column if not exists revision_source text null;   -- 'operator' | 'source' | null (unknown)
alter table public.agent_documents add column if not exists revision_checked_at timestamptz null;

create index if not exists idx_agent_documents_superseded on public.agent_documents (superseded_by) where superseded_by is not null;
create index if not exists idx_agent_documents_effective on public.agent_documents (effective_date desc) where effective_date is not null;

-- Backfill: nothing is guessed. Rows keep whatever version/effective_date the
-- operator entered; rows without either stay revision-unknown. Sibling
-- supersession (same title + source, later effective date) is recorded as an
-- explicit pointer where the data supports it.
update public.agent_documents d
set superseded_by = n.id
from public.agent_documents n
where d.superseded_by is null
  and n.id <> d.id
  and lower(trim(n.title)) = lower(trim(d.title))
  and coalesce(lower(trim(n.source)), '') = coalesce(lower(trim(d.source)), '')
  and n.status in ('approved', 'indexed')
  and d.effective_date is not null and n.effective_date is not null
  and n.effective_date > d.effective_date;

commit;
