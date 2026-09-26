-- Columns production gained after docs/supabase-user-preferences.sql was written (role flags read by
-- lib/admin-auth.ts and agent/lib/auth.mjs). Idempotent; the seed script adds any further columns from
-- production's schema description.
alter table public.user_preferences add column if not exists is_admin boolean not null default false;
alter table public.user_preferences add column if not exists is_developer boolean not null default false;
alter table public.user_preferences add column if not exists is_approved boolean not null default true;
