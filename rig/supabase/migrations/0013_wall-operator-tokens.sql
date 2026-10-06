alter table if exists public.leon_operators
  add column if not exists refresh_token text;

create table if not exists public.leon_aircraft_visibility (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid references public.leon_operators(id) on delete cascade,
  opr_id text not null,
  registration text not null,
  is_hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (opr_id, registration)
);

create index if not exists idx_leon_aircraft_visibility_hidden
  on public.leon_aircraft_visibility (opr_id, registration, is_hidden);
