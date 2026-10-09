# Maintenance mode

## What it does

While maintenance is on, the portal shows `/maintenance` to everyone except Clearway admins and developers.

- **Sign-in stays open.** `/login` and `/auth/*` (callbacks, password resets) are reachable during maintenance.
- **Admins and developers** who sign in are sent to **`/admin/maintenance`**, the page that turns it off. The
  maintenance page links there: "Sign in to turn maintenance off".
- **Who may switch it:** a developer turns it on; any admin or developer turns it off.
- **`/api/*`** keeps answering. Each route checks its own access.

Admin and developer are the portal's usual rule (`lib/role-resolve.ts`). Any one of these makes a person an admin or
developer:

- `ADMIN_EMAILS` / `DEVELOPER_EMAILS` in `.env`
- the Supabase metadata role
- `user_preferences.is_admin` / `is_developer`

## Way out from the server

Use this when nobody can reach `/admin/maintenance`, for example because sign-in itself is broken.

**1. Record "off" in the database** (one line, needs only curl and the repo's `.env`):

```sh
cd /root/clearway-2 && sh scripts/maintenance-off.sh
```

This adds a newest row with `enabled = false` to `public.maintenance`. The portal opens on the next page load, and
nothing restarts.

**2. If the database cannot be written**, ignore the flag:

1. Add `MAINTENANCE_FORCE_OFF=true` to `/root/clearway-2/.env`.
2. Recreate the portal: `docker compose up -d portal`. No rebuild is needed.

Remove the line again (and recreate the portal) once the flag in the database is sorted out. While it is set,
maintenance can't be switched on.

## Where it lives

| What | Where |
| --- | --- |
| Gate | `middleware.ts` |
| Public page | `app/maintenance/page.tsx` |
| Admin page | `app/admin/maintenance/page.tsx` |
| API | `app/api/admin/maintenance/route.ts` |
| Table and policies | `docs/supabase-maintenance.sql` |

The table only takes writes through the API, with the service role. The old insert policy let any signed-in user
switch maintenance on or off directly, and has been dropped.
