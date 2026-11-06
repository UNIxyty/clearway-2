-- 0029 (2026-11-07): removing an account removes everything it could do, in the same transaction.
--
-- Found 2026-11-06: a live agent grant (agent_access) whose account no longer existed. agent_access.user_id has no
-- link to auth.users, and no delete path touched it: the Telegram debug bot's delete, the invite clean-up, the check
-- accounts, the Supabase dashboard by hand. One dead row is nothing; the path that leaves them behind is the finding.
--
-- A trigger on auth.users, so every path is covered, the dashboard included. It runs inside the delete's own
-- transaction: if any part of it fails, the delete fails and nothing half-finishes.
--   agent_access          live grants are revoked (the row stays, as every revocation does: who had access, and when)
--   clients.notify_to     the address leaves the ops notify list (it would go on receiving access requests)
-- Already safe, unchanged: user_preferences (on delete cascade), clients (on delete restrict: a client account cannot
-- be deleted until its clients row is dealt with — the delete fails loudly), permission_grants (by role, not person).
-- Records (conversations, files, audit) are history, not abilities: they stay.
-- Rig: rig/supabase/migrations/0101_account_deleted.sql (the same); rig/account-delete-check.mjs proves it.

-- the orphans that exist today: revoked, with the reason
update public.agent_access
   set revoked_at = now(), revoked_by_email = 'account deleted (0029: found 2026-11-06)'
 where revoked_at is null and user_id not in (select id from auth.users);

create or replace function public.on_account_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.agent_access
     set revoked_at = now(), revoked_by_email = 'account deleted'
   where user_id = old.id and revoked_at is null;
  if old.email is not null then
    update public.app_settings
       set value = jsonb_set(value, '{emails}', coalesce((
             select jsonb_agg(e) from jsonb_array_elements(value->'emails') e
              where lower(e #>> '{}') <> lower(old.email)), '[]'::jsonb))
     where key = 'clients.notify_to' and jsonb_typeof(value->'emails') = 'array';
  end if;
  return old;
end $$;

drop trigger if exists on_account_deleted on auth.users;
create trigger on_account_deleted after delete on auth.users
  for each row execute function public.on_account_deleted();
