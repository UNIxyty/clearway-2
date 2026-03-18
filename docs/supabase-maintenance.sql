-- Maintenance mode table
create table if not exists public.maintenance (
  id uuid primary key default gen_random_uuid(),
  enabled boolean not null default false,
  message text,
  eta_text text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- Optional admin flag in user preferences
alter table public.user_preferences
  add column if not exists is_admin boolean not null default false;

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

-- Restrict writes to authenticated users; API route applies additional admin checks.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'maintenance' and policyname = 'maintenance_write_authenticated'
  ) then
    create policy maintenance_write_authenticated
      on public.maintenance
      for insert
      with check (auth.uid() is not null);
  end if;
end $$;
