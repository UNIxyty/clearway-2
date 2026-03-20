-- Corporate auth tables for shared account + per-device profile.
-- Run this SQL in Supabase SQL editor.
--
-- RLS DESIGN NOTE:
-- These tables are accessed exclusively from the server using the service role key
-- (SUPABASE_SERVICE_ROLE_KEY), which bypasses RLS entirely.
-- The policies below block all access from the anon and authenticated roles so that
-- no browser client can ever read or write credentials, sessions, or profiles directly.

-- ─── corporate_accounts ───────────────────────────────────────────────────────

create table if not exists corporate_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.corporate_accounts enable row level security;

-- Block all direct client access — server uses service role key which bypasses RLS.
create policy "corporate_accounts_no_client_access"
on public.corporate_accounts
for all
to anon, authenticated
using (false)
with check (false);

-- ─── device_profiles ──────────────────────────────────────────────────────────

create table if not exists device_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references corporate_accounts(id) on delete cascade,
  display_name text,
  ip_address text,
  device_name text,
  created_at timestamptz not null default now()
);

alter table public.device_profiles enable row level security;

-- Block all direct client access.
create policy "device_profiles_no_client_access"
on public.device_profiles
for all
to anon, authenticated
using (false)
with check (false);

-- ─── user_sessions ────────────────────────────────────────────────────────────

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  device_profile_id uuid not null references device_profiles(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.user_sessions enable row level security;

-- Block all direct client access.
create policy "user_sessions_no_client_access"
on public.user_sessions
for all
to anon, authenticated
using (false)
with check (false);

-- ─── Seed default admin account ───────────────────────────────────────────────
-- Username: admin  |  Password: admin  (SHA-256 hash)
-- Change the hash after setup: UPDATE corporate_accounts SET password_hash = '...' WHERE username = 'admin';

insert into corporate_accounts (username, password_hash)
values ('admin', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918')
on conflict (username) do nothing;
