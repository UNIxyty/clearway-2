create extension if not exists pgcrypto;

create table if not exists public.leon_operators (
  id uuid primary key default gen_random_uuid(),
  opr_id text not null unique,
  name text,
  notes text not null default '',
  is_active boolean not null default true,
  last_sync_at timestamptz,
  last_sync_status text not null default 'idle' check (last_sync_status in ('idle', 'success', 'error')),
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leon_aircraft (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.leon_operators(id) on delete cascade,
  registration text not null,
  acft_type_id text,
  acft_type_icao text,
  acft_type_short_name text,
  acft_type_iata text,
  pax_capacity integer,
  raw_payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operator_id, registration)
);

create table if not exists public.leon_flights (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.leon_operators(id) on delete cascade,
  flight_nid text not null,
  flight_no text,
  date_trip text,
  trip_code text,
  departure_icao text,
  arrival_icao text,
  estimated_departure timestamptz,
  estimated_arrival timestamptz,
  actual_departure timestamptz,
  actual_arrival timestamptz,
  delay_minutes integer not null default 0,
  aircraft_registration text,
  status text,
  is_deleted boolean not null default false,
  flight_last_modification_time timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operator_id, flight_nid)
);

create table if not exists public.leon_webhook_events (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid references public.leon_operators(id) on delete set null,
  opr_id text not null,
  event_type text not null,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'processed', 'failed', 'ignored')),
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_leon_operators_active
  on public.leon_operators (is_active, opr_id);

create index if not exists idx_leon_aircraft_operator_registration
  on public.leon_aircraft (operator_id, registration);

create index if not exists idx_leon_aircraft_operator_updated
  on public.leon_aircraft (operator_id, updated_at desc);

create index if not exists idx_leon_flights_operator_start_time
  on public.leon_flights (operator_id, estimated_departure);

create index if not exists idx_leon_flights_operator_updated
  on public.leon_flights (operator_id, updated_at desc);

create index if not exists idx_leon_flights_operator_deleted
  on public.leon_flights (operator_id, is_deleted, estimated_departure);

create index if not exists idx_leon_webhooks_operator_created
  on public.leon_webhook_events (opr_id, created_at desc);

