-- Client access (Stage 5, 2026-10-25): a client is a person outside Clearway who sees only their own flights.
-- public.clients: one row per client account — who, which company, status, SCOPE (which flights exist for them),
-- SWITCHES (what they see of those flights), the passenger level, and who decided. public.client_decisions: the
-- append-only log of every grant, change and removal (who did it, when, what changed). Removing access EMPTIES the row
-- (status removed, scope and switches emptied) — rows are never deleted, so "who had what and when" can always be
-- answered. Identity itself (the client role, the approval flag) lives in auth.users.app_metadata, written only with
-- the service key when ops decide; lib/clients/scope.mjs reads this table on every request.
-- The same statements as rig/supabase/migrations/0027_clients.sql. Run ONCE on production before deploying the Stage 5 code.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  email text not null,
  person_name text not null default '',
  company text not null,
  kind text not null default 'operator' check (kind in ('operator', 'broker')),
  note text not null default '',
  status text not null default 'requested' check (status in ('requested', 'approved', 'refused', 'removed')),
  scope jsonb not null default '[]'::jsonb,          -- [{ "kind": "operator"|"registration"|"trip", "value": "..." }]
  switches jsonb not null default '[]'::jsonb,       -- keys from lib/clients/switches.mjs
  passenger_level text not null default 'off' check (passenger_level in ('off', 'names', 'documents')),
  consent boolean not null default false,            -- documents level: the client is the operator, or written consent is held
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  decided_by_email text,
  decision_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clients_status_idx on public.clients (status);
alter table public.clients enable row level security;
-- No policies: only the service role reads or writes (the services and Admin › Clients), never the browser's anon key.

create table if not exists public.client_decisions (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete restrict,
  kind text not null check (kind in ('requested', 'approved', 'changed', 'passengers', 'refused', 'removed')),
  actor_id uuid,
  actor_email text,
  detail jsonb not null default '{}'::jsonb,         -- what changed: scope and switches before/after, the passenger level
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists client_decisions_client_idx on public.client_decisions (client_id, created_at desc);
alter table public.client_decisions enable row level security;

create or replace function public.client_decisions_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'client_decisions is append-only';
end $$;
drop trigger if exists client_decisions_append_only on public.client_decisions;
create trigger client_decisions_append_only before update or delete on public.client_decisions
  for each row execute function public.client_decisions_append_only();

-- Admin › Clients is one action: who may approve, change and remove clients. Admins and developers by default.
insert into public.permission_grants (role, action, allowed, updated_by_email)
values ('admin', 'clients.manage', true, 'default (migration 0027)'), ('developer', 'clients.manage', true, 'default (migration 0027)'), ('user', 'clients.manage', false, 'default (migration 0027)')
on conflict (role, action) do nothing;
