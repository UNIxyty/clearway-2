-- ═══════════════════════════════════════════════════════════════════════════════
-- DESTRUCTIVE RESET: drops listed tables (all rows lost), then recreates them.
-- Run in Supabase SQL Editor (postgres role).
--
-- Affected tables:
--   user_sessions, device_profile_preferences, device_profiles, corporate_accounts,
--   user_preferences
--
-- Notes:
-- - user_preferences is tied to auth.users; recreating it does NOT delete auth users,
--   but every user's saved portal preferences are removed.
-- - After this, re-run docs/corporate-auth-schema.sql seed is included below (admin).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── DROP (children first) ─────────────────────────────────────────────────────

drop trigger if exists device_profile_preferences_updated_at on public.device_profile_preferences;
drop table if exists public.user_sessions cascade;

drop table if exists public.device_profile_preferences cascade;

drop table if exists public.device_profiles cascade;

drop table if exists public.corporate_accounts cascade;

drop trigger if exists user_preferences_updated_at on public.user_preferences;
drop table if exists public.user_preferences cascade;

drop function if exists public.update_device_profile_preferences_updated_at() cascade;

-- ─── CREATE: corporate_accounts ──────────────────────────────────────────────────

create table public.corporate_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  temp_password_hash text,
  requires_credential_setup boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.corporate_accounts enable row level security;

create policy "corporate_accounts_no_client_access"
on public.corporate_accounts
for all
to anon, authenticated
using (false)
with check (false);

-- ─── CREATE: device_profiles ───────────────────────────────────────────────────

create table public.device_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.corporate_accounts(id) on delete cascade,
  display_name text,
  ip_address text,
  device_name text,
  created_at timestamptz not null default now()
);

alter table public.device_profiles enable row level security;

create policy "device_profiles_no_client_access"
on public.device_profiles
for all
to anon, authenticated
using (false)
with check (false);

-- ─── CREATE: user_sessions ─────────────────────────────────────────────────────

create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  device_profile_id uuid not null references public.device_profiles(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.user_sessions enable row level security;

create policy "user_sessions_no_client_access"
on public.user_sessions
for all
to anon, authenticated
using (false)
with check (false);

-- ─── CREATE: device_profile_preferences ───────────────────────────────────────

create table public.device_profile_preferences (
  device_profile_id uuid primary key references public.device_profiles(id) on delete cascade,
  display_name text,
  aip_model text not null default 'gpt-4.1-mini',
  gen_model text not null default 'gpt-4.1-mini',
  notify_enabled boolean not null default false,
  notify_search_start boolean not null default true,
  notify_search_end boolean not null default true,
  notify_notam boolean not null default true,
  notify_aip boolean not null default true,
  notify_gen boolean not null default true,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.device_profile_preferences enable row level security;

create policy "device_profile_preferences_no_client_access"
on public.device_profile_preferences
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.update_device_profile_preferences_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger device_profile_preferences_updated_at
  before update on public.device_profile_preferences
  for each row
  execute function public.update_device_profile_preferences_updated_at();

-- ─── CREATE: user_preferences (Supabase Auth users) ───────────────────────────

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  aip_model text not null default 'gpt-4.1-mini',
  gen_model text not null default 'gpt-4.1-mini',
  notify_enabled boolean not null default false,
  notify_search_start boolean not null default true,
  notify_search_end boolean not null default true,
  notify_notam boolean not null default true,
  notify_aip boolean not null default true,
  notify_gen boolean not null default true,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy "user_preferences_all_own"
on public.user_preferences
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.update_user_preferences_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger user_preferences_updated_at
  before update on public.user_preferences
  for each row
  execute function public.update_user_preferences_updated_at();

-- ─── Optional seed: default corporate admin (temp password flow) ─────────────
-- Username: admin  |  Temporary password: admin  (SHA-256 of "admin")
-- First login forces permanent credential creation.

insert into public.corporate_accounts (username, password_hash, temp_password_hash, requires_credential_setup)
values (
  'admin',
  '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
  '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
  true
);
