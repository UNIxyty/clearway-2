-- Airports table security hardening (RLS + grants)
-- Run in Supabase SQL editor after schema migration.

begin;

-- Ensure tables exist before applying security.
do $$
begin
  if to_regclass('public.airports') is null then
    raise exception 'public.airports table not found. Run docs/supabase-airports-migration.sql first.';
  end if;
  if to_regclass('public.deleted_airports') is null then
    raise exception 'public.deleted_airports table not found. Run docs/supabase-airports-migration.sql first.';
  end if;
end $$;

-- Turn on row-level security.
alter table public.airports enable row level security;
alter table public.deleted_airports enable row level security;

-- Remove broad direct table grants from anon/authenticated roles.
revoke all on table public.airports from anon, authenticated;
revoke all on table public.deleted_airports from anon, authenticated;

-- Clean up legacy policies if they exist.
drop policy if exists airports_read_visible_authenticated on public.airports;
drop policy if exists airports_no_write_authenticated on public.airports;
drop policy if exists deleted_airports_no_access_authenticated on public.deleted_airports;

-- Optional direct read policy for authenticated clients (visible airports only).
-- API routes in this project use service-role and are not affected by this.
create policy airports_read_visible_authenticated
  on public.airports
  for select
  to authenticated
  using (visible = true);

-- Explicitly deny direct writes by authenticated users.
create policy airports_no_write_authenticated
  on public.airports
  for all
  to authenticated
  using (false)
  with check (false);

-- Explicitly deny direct access to deleted log table by authenticated users.
create policy deleted_airports_no_access_authenticated
  on public.deleted_airports
  for all
  to authenticated
  using (false)
  with check (false);

commit;

