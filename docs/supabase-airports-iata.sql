-- Agent build, Part 0 / P1: IATA code on airports.
-- Run manually in the Supabase SQL editor, then:
--   node scripts/airports-backfill-ourairports.mjs --apply --iata-only
-- Idempotent.

alter table if exists public.airports
  add column if not exists iata text;

create index if not exists idx_airports_iata on public.airports (upper(iata));
