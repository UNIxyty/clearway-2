-- docs/supabase-email-confirmations.sql, then docs/supabase-fix-email-confirmations-constraint.sql (2026-11-07): production has
-- the table; the Mac rig had it applied by hand, so a rig built from the repository did not.

-- Email confirmation and recovery token tracking for app-managed auth flows.
-- Run once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.email_confirmations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  -- 'signup', 'signup:<userId>' (after invite confirmed), or 'password_reset'
  purpose text not null check (purpose = 'password_reset' or purpose like 'signup%'),
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

-- Fix the email_confirmations purpose CHECK constraint.
-- The original constraint only allowed exact values 'signup' or 'password_reset',
-- but the server updates purpose to 'signup:<userId>' after a successful invite.
-- Run once in Supabase SQL Editor.

alter table public.email_confirmations
  drop constraint if exists email_confirmations_purpose_check;

alter table public.email_confirmations
  add constraint email_confirmations_purpose_check
  check (purpose = 'password_reset' or purpose like 'signup%');
