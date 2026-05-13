-- Add is_approved column to user_preferences for the account approval flow.
-- Existing rows get is_approved = true (already active users are grandfathered in).
-- New rows default to false (pending approval).
-- Run once in Supabase SQL Editor.

alter table public.user_preferences
  add column if not exists is_approved boolean not null default true;

alter table public.user_preferences
  alter column is_approved set default false;
