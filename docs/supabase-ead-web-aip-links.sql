-- EAD country Web AIP links table
-- Run in Supabase SQL editor.

begin;

create table if not exists public.ead_web_aip_links (
  prefix text primary key,
  country_label text not null,
  web_aip_url text not null,
  status text not null default 'unset' check (status in ('unset', 'correct', 'changed')),
  source_type text not null default 'official-country-site',
  fallback_url text not null default 'https://www.ead.eurocontrol.int/cms-eadbasic/opencms/en/login/ead-basic/',
  fallback_note text not null default 'If official source is unavailable, use Eurocontrol EAD Basic.',
  updated_at timestamptz not null default now()
);

create index if not exists idx_ead_web_aip_links_status on public.ead_web_aip_links (status);

commit;
