-- Dispatcher agent, Part 3: server-side conversation history.
--
-- The design is explicit that history must NOT live in browser state: a
-- dispatcher who reloads, moves to another machine, or expands the panel to a
-- full page must find the same thread. It is also what makes the audit trail
-- and the conversation the user sees the same story.
--
-- Run in the Supabase SQL editor. Idempotent.

begin;

create table if not exists public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_email text null,
  title text null,                      -- derived from the first message
  context jsonb null,                   -- the page/record chip at the time it started
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  archived_at timestamptz null
);

create index if not exists idx_agent_conv_user on public.agent_conversations (user_id, last_message_at desc);

create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  -- Plain text of the turn. For an assistant turn this is what it said, with
  -- no markup, so a reader of the raw row still gets the answer.
  content text not null default '',
  -- Structured extras the panel renders: source attributions, verbatim
  -- records quoted, tool activity, and rich cards. Derived by the BACKEND from
  -- the tools that actually ran — never from the model's own claims.
  blocks jsonb null,
  sources jsonb null,
  tool_activity jsonb null,
  model_id text null,
  model_tier text null,
  input_tokens integer null,
  output_tokens integer null,
  error text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_msg_conv on public.agent_messages (conversation_id, created_at);

-- Keep the parent's ordering column true without the service having to
-- remember to update it on every insert.
create or replace function public.agent_touch_conversation() returns trigger as $$
begin
  update public.agent_conversations
     set last_message_at = new.created_at, updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists agent_messages_touch on public.agent_messages;
create trigger agent_messages_touch after insert on public.agent_messages
  for each row execute function public.agent_touch_conversation();

-- RLS on with no permissive policies, as with the other agent tables: reachable
-- only through the service-role key behind an authenticated API.
alter table public.agent_conversations enable row level security;
alter table public.agent_messages enable row level security;

commit;
