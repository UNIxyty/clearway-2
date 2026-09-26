-- Dispatcher agent, Part 6: per-user memory.
--
-- What the user asked the agent to remember. SCOPED PER USER by default: a
-- dispatcher's note about how they like a brief laid out is theirs, and a note
-- about a station's quirks may be an opinion rather than an approved fact.
-- Sharing is an explicit act, recorded with who shared it.
--
-- A memory is NEVER company-approved knowledge. It carries its own source tier
-- so an answer can show it as "remembered" rather than letting it sit beside a
-- Tier 1 limitation looking equally authoritative.
--
-- Run in the Supabase SQL editor. Idempotent.

begin;

create table if not exists public.agent_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_email text null,
  -- The note, in the user's own words. Stored verbatim: the point of asking an
  -- agent to remember something is that it comes back as you said it.
  content text not null,
  -- What it is about, so recall can be scoped rather than dumping everything.
  relates_to_kind text null check (relates_to_kind in ('airport', 'flight', 'operator', 'country', 'general')),
  relates_to text null,
  tags text[] not null default '{}',
  -- Sharing is deliberate and attributed.
  is_shared boolean not null default false,
  shared_at timestamptz null,
  shared_by uuid null,
  source_conversation_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  forgotten_at timestamptz null
);

create index if not exists idx_agent_mem_user on public.agent_memories (user_id, created_at desc) where forgotten_at is null;
create index if not exists idx_agent_mem_relates on public.agent_memories (relates_to) where forgotten_at is null;
create index if not exists idx_agent_mem_shared on public.agent_memories (is_shared) where forgotten_at is null and is_shared = true;

alter table public.agent_memories enable row level security;

commit;
