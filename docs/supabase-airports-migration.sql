-- Airports visibility + soft-delete migration
-- Run manually in Supabase SQL editor.
-- This migration is intentionally idempotent where possible.

begin;

-- 1) Backup current airports table before schema updates.
-- Uses current date suffix to avoid accidental overwrite.
do $$
declare
  backup_name text := 'airports_backup_' || to_char(now(), 'YYYYMMDD');
begin
  if to_regclass('public.airports') is not null and to_regclass('public.' || backup_name) is null then
    execute format('create table public.%I as table public.airports', backup_name);
  end if;
end $$;

-- 2) Ensure airports table exists and has required columns for portal visibility.
create table if not exists public.airports (
  id bigserial primary key,
  country text,
  state text,
  icao text,
  name text,
  lat double precision,
  lon double precision,
  source text,
  visible boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table if exists public.airports
  add column if not exists visible boolean not null default true;

alter table if exists public.airports
  add column if not exists country text,
  add column if not exists state text,
  add column if not exists icao text,
  add column if not exists name text,
  add column if not exists lat double precision,
  add column if not exists lon double precision,
  add column if not exists source text,
  add column if not exists updated_at timestamptz not null default now();

-- 3) Table for recently deleted airports (visibility-only delete).
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

-- 4) Useful indexes.
do $$
begin
  if to_regclass('public.airports') is not null then
    execute 'create index if not exists idx_airports_icao on public.airports (icao)';
    execute 'create index if not exists idx_airports_visible on public.airports (visible)';
    execute 'create index if not exists idx_airports_country_state_visible on public.airports (country, state, visible)';
  end if;
end $$;
create index if not exists idx_deleted_airports_icao_deleted_at on public.deleted_airports (icao, deleted_at desc);

-- 5) Normalize existing rows so portal starts with all rows visible.
do $$
begin
  if to_regclass('public.airports') is not null then
    update public.airports
    set visible = true
    where visible is null;
  end if;
end $$;

commit;
