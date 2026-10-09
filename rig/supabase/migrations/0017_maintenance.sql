-- docs/supabase-maintenance.sql (the rig had no maintenance table). user_preferences.is_admin already exists here.
-- Maintenance mode table
create table if not exists public.maintenance (
  id uuid primary key default gen_random_uuid(),
  enabled boolean not null default false,
  message text,
  eta_text text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);


-- Enable RLS and public read access for maintenance status
alter table public.maintenance enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'maintenance' and policyname = 'maintenance_read_public'
  ) then
    create policy maintenance_read_public
      on public.maintenance
      for select
      using (true);
  end if;
end $$;

-- Writes go through /api/admin/maintenance only: it checks the role (developer to turn on, admin to turn off) and
-- inserts with the service role. The policy that stood here let ANY signed-in user insert a row straight through
-- Supabase with the public anon key — that is, switch maintenance on or off for everyone. Removed (portal foundations 1.2).
drop policy if exists maintenance_write_authenticated on public.maintenance;
