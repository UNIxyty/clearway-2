# Pick'em: retired and archived

The World Cup 2026 Pick'em game was removed from the portal in portal foundations 4.1.

## Status

- **Paths:** every `/pickem` and `/playoffs` path (pages and APIs) answers **410 Gone**, before any sign-in check
  (`middleware.ts`).
- **Tunnel:** after `scripts/pickem-retire.sh` has run on the server, the tunnel has no `/pickem` route, so those paths
  reach the portal and get that 410.

## What was removed

| Where | What |
| --- | --- |
| Portal pages | `app/pickem/`, `app/playoffs/`, `app/admin/playoffs/`, `app/admin/email-tools/` (the World Cup email console, mislabelled "Admin → Email tools") |
| Portal APIs | `app/api/pickem/`, `app/api/playoffs/`, `app/api/admin/pickem/`, `app/api/admin/playoffs/`, `app/api/admin/email-tools/` (and `/broadcast`), `app/api/admin/console/`, `app/api/admin/dev-mode/` (Pick'em's test switches) |
| Code | `components/pickem/`, `components/playoffs/`, the Pick'em admin console in `components/admin/` (all but `EmailLogs.tsx`, which the portal's Email logs page uses), `lib/pickem-*.ts`, `lib/playoffs/`, the playoff hooks in `lib/hooks/`, `server/emails/` (the World Cup email templates and senders), `scripts/send-broadcast.ts`, `scripts/verify-playoff-scoring.ts`, `scripts/check-playoff-points-sync.ts` |
| Nav | The Pick'em section, including its "Email console" entry. Nothing in Admin points at it. |
| Permissions | The actions `portal.pickem.play`, `portal.pickem.admin`, `portal.email.tools`, `portal.email.broadcast`, `portal.devmode`, and their grant rows (`docs/supabase-permissions.sql`, "Retired actions"). Their history in `permission_changes` stays. |
| Server | The `pickem` service in `docker-compose.yml`. On the server, `scripts/pickem-retire.sh` stops the container, archives it and removes the tunnel routes. |
| Temporary accounts | They existed for Pick'em guests. They now land on "Access restricted", which says the area was retired. |

## What stays

- **The Supabase tables** (`pickem_*`, `playoff_*`, `tournament_state`): not dropped. `scripts/pickem-retire.sh` also
  exports a copy as JSON.
- **`migrations/`**: the schema history.
- **`/api/unsubscribe`**: unsubscribe links in emails already sent keep working.
- **`public/wc2026-logo.png`**: images in emails already sent keep loading.
- **Old Pick'em email types** in `email_logs`: the Email logs page still labels them.

## The archive on the server

`/root/archive/pickem-<date>/`, written by `scripts/pickem-retire.sh`:

- `clearway-pickem-image.tar.gz`: the container image as it ran. The image also stays on the host as
  `clearway-pickem:archived-<date>`.
- `tables/*.json`: every Pick'em table, as on that day.
- `cloudflared-config.yml.bak`: the tunnel config before its `/pickem` routes were removed.
- `README.md`: the same pointers.

## Bringing it back

1. Restore the paths above from commit `7ade3f5`, the last one with Pick'em in the repo:
   `git checkout 7ade3f5 -- app/pickem app/playoffs …`
2. Restore the `pickem` service in `docker-compose.yml` from that commit.
3. Remove the 410 for `/pickem` and `/playoffs` in `middleware.ts`.
4. Put the actions back in `lib/permissions/catalogue.mjs`, with their endpoints.
5. Restore the two tunnel routes from `cloudflared-config.yml.bak`.

Alternatively, `docker load < clearway-pickem-image.tar.gz` runs the old image as it was. That image predates the
security and permission work, so it is not safe to expose as it is.
