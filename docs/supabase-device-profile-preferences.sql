-- Corporate device profile preferences (mirrors public.user_preferences columns).
-- Keys by device_profiles.id — NOT auth.users. Server uses SUPABASE_SERVICE_ROLE_KEY only.
-- Run in Supabase SQL editor after corporate_accounts / device_profiles exist
-- (see docs/corporate-auth-schema.sql).

create table if not exists public.device_profile_preferences (
  device_profile_id uuid primary key references public.device_profiles(id) on delete cascade,
  display_name text,
  aip_model text not null default 'gpt-4.1-mini',
  gen_model text not null default 'gpt-4.1-mini',
  notify_enabled boolean not null default false,
  notify_search_start boolean not null default true,
  notify_search_end boolean not null default true,
  notify_notam boolean not null default true,
  notify_aip boolean not null default true,
  notify_gen boolean not null default true,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.device_profile_preferences enable row level security;

-- Block browser/anon JWT access; Next.js API uses service role (bypasses RLS).
create policy "device_profile_preferences_no_client_access"
on public.device_profile_preferences
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.update_device_profile_preferences_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists device_profile_preferences_updated_at on public.device_profile_preferences;
create trigger device_profile_preferences_updated_at
  before update on public.device_profile_preferences
  for each row
  execute function public.update_device_profile_preferences_updated_at();
