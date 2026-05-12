-- Add developer role to user_preferences.
-- Run in Supabase SQL editor.

alter table public.user_preferences
  add column if not exists is_developer boolean not null default false;
