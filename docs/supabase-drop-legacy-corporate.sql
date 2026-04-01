-- Optional cleanup: drop legacy corporate-auth tables no longer used by current app.
-- Run only if you are sure corporate login is fully removed in your deployment.

begin;

drop table if exists public.user_sessions cascade;
drop table if exists public.device_profile_preferences cascade;
drop table if exists public.device_profiles cascade;
drop table if exists public.corporate_accounts cascade;

commit;

