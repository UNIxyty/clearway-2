-- Two production tables the rig lacked, so Admin › Service status editor and Admin › Email logs can be tried there.
-- Copied from migrations/20260505_add_country_service_statuses.sql, 20260507_extend_country_service_statuses_partially_works.sql,
-- 20260616_add_email_infrastructure.sql and 20260619_email_logs_is_test.sql. The rows are invented.
create table if not exists public.country_service_statuses (
  country text primary key,
  state text not null check (state in ('not_checked', 'in_work', 'partially_works', 'operational', 'issues')),
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists idx_country_service_statuses_updated_at on public.country_service_statuses (updated_at desc);
insert into public.country_service_statuses (country, state, note, updated_by) values
  ('Latvia', 'operational', '', 'rig'), ('Lithuania', 'partially_works', '', 'rig'), ('Estonia', 'not_checked', '', 'rig')
on conflict (country) do nothing;

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email_type text not null,
  recipient_email text not null,
  subject text not null,
  status text not null check (status in ('pending', 'sent', 'failed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  is_test boolean not null default false
);
create index if not exists email_logs_created_at_idx on public.email_logs (created_at desc);
alter table public.email_logs enable row level security;
insert into public.email_logs (email_type, recipient_email, subject, status, error_message, sent_at, created_at)
select * from (values
  ('rig_sample', 'alice.example@example.com', 'Invented email for the rig (sent)', 'sent', null, now() - interval '5 days', now() - interval '5 days'),
  ('rig_sample', 'alice.example@example.com', 'Invented email for the rig (failed)', 'failed', 'Invented error: mailbox unavailable', null, now() - interval '5 days')
) v where not exists (select 1 from public.email_logs where email_type = 'rig_sample');

-- Hidden airports (from docs/supabase-airports-migration.sql). The rig has no public.airports table: search uses its
-- built-in list there, so hiding an airport cannot be tried on the rig without adding one by hand.
create table if not exists public.deleted_airports (
  id bigserial primary key,
  airport_id bigint null,
  icao text not null,
  airport_snapshot jsonb not null,
  deleted_by uuid null,
  deleted_reason text null,
  restored_at timestamptz null,
  deleted_at timestamptz not null default now()
);
create index if not exists idx_deleted_airports_user_active_icao on public.deleted_airports (deleted_by, icao) where restored_at is null;
