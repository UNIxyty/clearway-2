-- Create user preferences table for AI model settings and profile info
-- Run in Supabase SQL editor.

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  aip_model text not null default 'gpt-4.1-mini',
  gen_model text not null default 'gpt-4.1-mini',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

-- Users can do all operations on their own preferences
create policy "user_preferences_all_own"
on public.user_preferences
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Create function to auto-update updated_at timestamp
create or replace function public.update_user_preferences_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create trigger to auto-update updated_at
create trigger user_preferences_updated_at
  before update on public.user_preferences
  for each row
  execute function public.update_user_preferences_updated_at();

-- Captcha consent preference for scraper/HITL countries.
alter table public.user_preferences
  add column if not exists captcha_consent_dismissed boolean not null default false;
