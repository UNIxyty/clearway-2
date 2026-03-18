-- Add notification preference columns to user_preferences
-- Run in Supabase SQL editor.

alter table public.user_preferences
  add column if not exists notify_enabled boolean not null default false,
  add column if not exists notify_search_start boolean not null default true,
  add column if not exists notify_search_end boolean not null default true,
  add column if not exists notify_notam boolean not null default true,
  add column if not exists notify_aip boolean not null default true,
  add column if not exists notify_gen boolean not null default true;
