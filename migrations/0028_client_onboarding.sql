-- 0028 · Client onboarding: a request is a request (2026-11-02).
-- A client asking for access no longer gets an account. The request is a clients row with no user. Ops approve it,
-- the client gets a single-use link, and the account is created when they set a password with it. Ops are told about
-- new requests by email, to a list kept here, not in one person's inbox.
-- Idempotent. Applies on top of 0027_clients.sql.

-- 1. A row can exist before its account does (requested, approved-not-yet-activated, refused before activation).
alter table public.clients alter column user_id drop not null;

-- 2. The decision log knows two more events: the link sent, and the account made with it.
alter table public.client_decisions drop constraint if exists client_decisions_kind_check;
alter table public.client_decisions add constraint client_decisions_kind_check
  check (kind in ('requested', 'approved', 'changed', 'passengers', 'refused', 'removed', 'link-sent', 'activated'));

-- 3. Set-password links: only the hash is stored. Single use (used_at), expiring (expires_at), and a newer link
--    replaces the older ones (replaced_at), so only the latest one works.
create table if not exists public.client_invites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  token_hash text not null unique,
  sent_to text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  replaced_at timestamptz,
  created_at timestamptz not null default now(),
  created_by_email text
);
create index if not exists client_invites_client_idx on public.client_invites (client_id, created_at desc);
alter table public.client_invites enable row level security;   -- no policies: the service role only

-- 4. Settings the portal keeps in the database (edited on their own page, not deployed): first, who is told about new
--    client requests — key 'clients.notify_to', value {"emails": ["…"]}.
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by_email text
);
alter table public.app_settings enable row level security;     -- no policies: the service role only
