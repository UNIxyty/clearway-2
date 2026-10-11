-- Part B: the old bug-report endpoint (/api/bug-reports) is removed — no screen and nothing outside the portal called
-- it; bug reports are filed and followed in Help & support (portal.help.*). Its three actions leave the catalogue, so
-- their grant rows go and the Permissions grid holds no switch for them. Their history in permission_changes stays —
-- history is not rewritten. Safe to run more than once. (The same lines are in docs/supabase-permissions.sql.)
delete from public.permission_grants
  where action in ('portal.bugs.file', 'portal.bugs.triage', 'portal.bugs.delete');
