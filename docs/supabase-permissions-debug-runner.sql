-- Part B1: the debug runner is a developer tool, reachable by URL only, for the developer role. Its action
-- (portal.debug.run, "Start and stop debug runs") now defaults to developer only; until now Admin held it by default.
-- This turns it off for Admin ONLY where the row is still the seed's default — a decision someone made in
-- Admin → Permissions is left alone — and records the change in the permissions history, like a change in the grid.
-- Safe to run more than once (the second run finds nothing to change).
with changed as (
  update public.permission_grants
     set allowed = false, updated_at = now(), updated_by_email = 'default (seed)'
   where role = 'admin' and action = 'portal.debug.run' and allowed = true and updated_by_email = 'default (seed)'
  returning role, action
)
insert into public.permission_changes (actor_email, role, action, allowed, previous, via)
select 'default (seed)', role, action, false, true, 'Part B1: the debug runner is developer only' from changed;
