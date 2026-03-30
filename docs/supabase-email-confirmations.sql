-- Email confirmation and recovery token tracking for app-managed auth flows.
-- Run once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.email_confirmations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  purpose text not null check (purpose in ('signup', 'password_reset')),
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists email_confirmations_email_purpose_idx
  on public.email_confirmations (email, purpose);

create index if not exists email_confirmations_expires_idx
  on public.email_confirmations (expires_at);

-- Service-role only access from API routes.
alter table public.email_confirmations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'email_confirmations'
      and policyname = 'deny_all_email_confirmations'
  ) then
    create policy deny_all_email_confirmations
      on public.email_confirmations
      for all
      using (false)
      with check (false);
  end if;
end $$;
