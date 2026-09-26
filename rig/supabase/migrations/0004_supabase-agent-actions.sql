-- Dispatcher agent, Part 7: reversible write actions.
--
-- ONE TABLE, because undo needs one thing to look up. Every write the agent
-- makes records the complete BEFORE and AFTER state — not a diff — so an undo
-- can restore the previous state without re-deriving it from a changelog, and
-- so a reviewer months later can see exactly what changed without access to
-- whatever the record looks like by then.
--
-- An undo is a NEW row (kind 'undo', undoes_action_id set). The original is
-- never edited or deleted: "what did the agent do, and what did we do about it"
-- must both survive.
--
-- Run in the Supabase SQL editor. Idempotent.

begin;

create table if not exists public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  -- Who, and which turn caused it. The conversation link is what lets a user
  -- say "undo the limitation you added earlier" and have it resolved.
  user_id uuid not null,
  user_email text null,
  conversation_id uuid null,
  message_id uuid null,

  tool_name text not null,
  arguments jsonb not null default '{}',

  -- What was touched.
  target_kind text not null,            -- limitation | important | report | display_settings | operator | aircraft
  target_id text null,
  target_label text null,               -- human-readable, for "undo the EVRA limitation"

  -- COMPLETE states, not diffs. before_state is null for a creation;
  -- after_state is null for a deletion.
  before_state jsonb null,
  after_state jsonb null,

  kind text not null default 'write' check (kind in ('write', 'undo')),
  undoes_action_id uuid null references public.agent_actions(id) on delete set null,
  undone_at timestamptz null,
  undone_by_action_id uuid null references public.agent_actions(id) on delete set null,

  -- Whether this action can still be reversed, and why not when it cannot.
  reversible boolean not null default true,
  irreversible_reason text null,

  success boolean not null default true,
  error text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_actions_user on public.agent_actions (user_id, created_at desc);
create index if not exists idx_agent_actions_conv on public.agent_actions (conversation_id, created_at desc);
create index if not exists idx_agent_actions_target on public.agent_actions (target_kind, target_id);
-- The undo lookup: a user's most recent still-undoable actions.
create index if not exists idx_agent_actions_undoable
  on public.agent_actions (user_id, created_at desc)
  where undone_at is null and kind = 'write' and reversible = true and success = true;

alter table public.agent_actions enable row level security;

commit;
