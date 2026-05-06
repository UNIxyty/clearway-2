create extension if not exists pgcrypto;

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_email text,
  airport_icao text not null,
  description text not null,
  status text not null check (status in ('sent', 'read', 'in_work', 'fixed', 'impossible_to_fix')),
  telegram_chat_id text,
  telegram_message_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status_updated_at timestamptz not null default now(),
  status_updated_by text
);

create index if not exists idx_bug_reports_user_created_at
  on public.bug_reports (user_id, created_at desc);

create index if not exists idx_bug_reports_status_created_at
  on public.bug_reports (status, created_at desc);
