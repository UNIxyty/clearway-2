-- Teardown: remove corporate auth + device_profile_preferences so you can recreate from scratch.
-- Run in Supabase SQL Editor (as postgres / service role).
--
-- Order: children first (foreign keys → device_profiles / corporate_accounts).

-- 1) Device prefs (references device_profiles)
drop trigger if exists device_profile_preferences_updated_at on public.device_profile_preferences;
drop table if exists public.device_profile_preferences cascade;

-- 2) Sessions (references device_profiles)
drop table if exists public.user_sessions cascade;

-- 3) Profiles (references corporate_accounts)
drop table if exists public.device_profiles cascade;

-- 4) Accounts
drop table if exists public.corporate_accounts cascade;

-- 5) Trigger function (only used by device_profile_preferences)
drop function if exists public.update_device_profile_preferences_updated_at() cascade;

-- ─── Recreate from scratch (run these scripts in order) ─────────────────────
-- 1. docs/corporate-auth-schema.sql
-- 2. docs/supabase-device-profile-preferences.sql
