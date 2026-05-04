create table if not exists public.country_service_statuses (
  country text primary key,
  state text not null check (state in ('not_checked', 'in_work', 'operational', 'issues')),
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists idx_country_service_statuses_updated_at
  on public.country_service_statuses (updated_at desc);
