-- 2026-10-20: "Read the original email of a request" (intake.requests.email) starts ON for everyone who may review
-- intake (the same roles as intake.requests.work), so an admin can take it away deliberately. Anyone who confirms a
-- flight to Leon must be able to read what the client asked for (docs/mobile-shell.md › The original email).
-- Run once on production's database: psql < this file, or the same three rows from the SQL editor.
insert into public.permission_grants (role, action, allowed, updated_by_email)
select r, 'intake.requests.email', true, 'default (migration 0026)' from (values ('user'), ('admin'), ('developer')) as t(r)
on conflict (role, action) do nothing;
