begin;

alter table if exists public.airports
  add column if not exists source_type text,
  add column if not exists dynamic_updated boolean not null default false,
  add column if not exists web_aip_url text,
  add column if not exists country_code text,
  add column if not exists ad2_html_url text,
  add column if not exists gen12_label text,
  add column if not exists gen12_href text;

create table if not exists public.asecna_jobs (
  id uuid primary key default gen_random_uuid(),
  icao text not null,
  country_code text null,
  status text not null default 'queued',
  s3_key text null,
  pdf_url text null,
  error text null,
  last_heartbeat timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_asecna_jobs_status_created_at
  on public.asecna_jobs(status, created_at);

update public.airports
set
  source_type = coalesce(source_type, 'ASECNA'),
  dynamic_updated = true
where upper(coalesce(source, '')) like 'ASECNA%'
   or lower(coalesce(source, '')) = 'asecna_dynamic';

commit;
