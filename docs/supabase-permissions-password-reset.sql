-- Portal redesign, stage 3: the new action "Send someone a password reset email" (portal.users.password-reset),
-- on for Admin and Developer, off for User — the same defaults as the rest of Users & access. Without these rows the
-- action is off for everyone (a new action fails closed) until someone grants it in Admin → Permissions.
-- Safe to re-run: it never overwrites a decision already made in the grid. (The same rows are in the full seed in
-- docs/supabase-permissions.sql.)
insert into public.permission_grants (role, action, allowed, updated_by_email) select r, a, al, 'default (seed)' from (values
  ('user', 'portal.users.password-reset', false),
  ('admin', 'portal.users.password-reset', true),
  ('developer', 'portal.users.password-reset', true)
) as v(r, a, al)
on conflict (role, action) do nothing;
