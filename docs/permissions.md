# Role permissions

An admin or developer decides what each role can do under **Admin → Permissions** (`/admin/permissions`).

## The model

- **Roles are fixed in code:** User, Admin, Developer (`ROLES` in `lib/permissions/catalogue.mjs`). A person's role
  follows the portal's usual rule in `lib/role-resolve.ts`, and these make someone a developer, then an admin:
  - `DEVELOPER_EMAILS` / `ADMIN_EMAILS` in `.env`
  - the role in their Supabase account (`role`, `roles`, `is_admin` / `is_developer`)
  - `user_preferences.is_admin` / `is_developer`
- **Actions are fixed in code:** every write in the portal, the OPS agent, flight intake and the wall console. They
  are grouped the way the grid shows them, listed in `GROUPS` in `lib/permissions/catalogue.mjs`.
- **Grants are data:** `public.permission_grants`, with one row per role × action, allowed or not.
- **Every change is history:** `public.permission_changes` records who, when, which role, which action, and on or
  off. Nobody can edit or delete a row there, not even with the service key.

The catalogue also maps every write endpoint (`ENDPOINTS`) and every agent tool (`AGENT_TOOLS`) to an action. One
file serves all three services. The portal imports it directly, and the agent and wall images copy `lib/permissions/`
into themselves.

## Enforcement

Every service checks on the server. A hidden button is not a permission.

| Service | Where | What |
| --- | --- | --- |
| Portal | `middleware.ts` | Every write request: unknown endpoint → 403; role lacks the action → 403. |
| Portal | each write handler | `requirePermission("…")` again, plus the precise action where it depends on the request (turning maintenance on vs off, someone else's bug report or help thread, changing a role). |
| Agent | `agent/server.mjs`, before any handler | The same gate; the knowledge-base and intake handlers check finer actions. |
| Agent | tools (`agent/lib/tools/framework.mjs`) | A tool that changes something needs its action, checked before anyone is asked to confirm. A tool that writes through the wall names the wall's action, so the agent and the console agree. |
| Wall | `digital-wall/server.mjs`, before any handler | The same gate; the big screen's profile and the visibility window are checked in the settings handler. |

Reads are not in the grid, with two exceptions that the grid does control:

- **Revealing a passenger's personal data** on an intake request (`intake.people.reveal`). Off for User by default,
  and each reveal is still logged. **One door** (2026-11-02, `agent/lib/personal-data-gate.mjs`). The same data can be
  reached five ways:
  - the text reveal;
  - the request's attachments (a passport scan, a passenger list);
  - the original email's `.eml` download;
  - forwarding that email;
  - the flight passenger reveal.

  Each of them goes through the same function: the same permission, one rate-limit bucket per person (40 in 10
  minutes for staff, 15 for a client, every path counted), and the same reveal row, written before the data is sent.
  The row records who, when and which request, never a name, a document number or a file. Without the permission, a
  screen shows no link to an attachment, and says why. The mailbox's own text reveal keeps its permission
  (`intake.mailbox.reveal`) but counts in the same bucket. `rig/personal-data-paths-check.mjs` lists the paths; a new
  one goes there.
- **Seeing other people's knowledge-base uploads** that are not approved, and who uploaded them
  (`agent.kb.see-others`). Off for User and Admin by default; on for Developer, who approves uploads.

Every service caches grants for 10 seconds, so a change in the grid reaches all of them within that time.

## The rules

1. **Fail closed.** Missing or unreadable grants mean no, and so does an action with no row. The services read the
   grants with the service key; if the table is not there, nothing that writes works.
2. **An unlisted endpoint is refused.** An endpoint or agent tool that is not in the catalogue is refused at
   runtime, and the check fails:
   - `node lib/permissions/check.mjs` runs in the portal image build (`Dockerfile`).
   - The wall and the agent run their part at startup and refuse to start.
   - The check also catches a catalogue entry whose code is gone.
3. **A new action is off.** It has no grant row, so it shows in the grid as "new — off until granted" for everyone.
   To give a new action a default, add a migration that inserts its rows.
4. **Nobody can lock everybody out.**
   - The developer role always holds **Manage permissions**: pinned in code, and refused by the API and by the
     database function.
   - Nobody can take Manage permissions from their own role.
   - At least one role must hold it, checked by the API and again in the database.
5. **No escalation.**
   - Only a holder of Manage permissions can view or change the grid.
   - Making someone an admin or a developer only works for a role that also holds Manage permissions.
   - Nobody can change their own role.
6. **Deploying changes nothing.** The seed (`docs/supabase-permissions.sql`) is generated from the catalogue's
   defaults, and the defaults reproduce exactly what each endpoint allowed before. The check fails if the two drift.
   The only deliberate differences are the two reads above.
7. **No action without something to guard.** Every action must still be named by a live endpoint, an agent tool, or a
   server check that tests it by name; an action pointing at nothing fails the same check. Retiring a feature
   therefore means removing its actions too, and deleting their grant rows in the SQL (history stays). Pick'em's were
   removed this way (`docs/pickem-archive.md`).

8. **An unknown role gets nothing** (2026-11-02). Not User, not guest: nothing. A role is checked by naming the roles
   that pass, never by what it is not. `role !== "none"` meant "staff" in three places (admin pages, the changelog's
   everyone switch, the maintenance gate), so any new role, the client role first, would have been staff there.
   - The role markers the platform writes are `""` (ordinary staff), `user`, `developer`, `admin`, `client` and
     `temporary`. Any other value resolves to `unknown` in all three services (`lib/role-resolve.ts`,
     `digital-wall/lib/roles.mjs`, `agent/lib/auth.mjs`). It holds no action, and the wall and the agent answer it 404.
   - `client` and `unknown` are decided first, before any email list or preference flag, so nothing can make a client
     staff.
   - `roleKey()` maps only named roles. A client or an unknown role is `null`, which holds nothing, pinned or granted.
   - The portal's shell builds its menu from a role the server names (`/api/admin/status` › `role`). A role it cannot
     name, or a failed probe, gets no menu. It used to fall back to the User menu.
   - Same rule as a gate whose input is missing: no answer means no.
   - **Pages too (2026-11-04).** The middleware answers an unknown role 404 on every page and API, signing out aside
     (a page that says so, with a Sign out button). Until then only the APIs refused it, and 93 of the 104 pages
     rendered their frame for it. A browser check the same evening found no row on any of them: every row comes
     through an API, and those already refused. Pages have no gate of their own and get none; the middleware is their
     door, by decision. `rig/client-gate-check.mjs` walks all 239 addresses through it.
9. **Gates live at the endpoint; the middleware is the second layer** (2026-11-02). Every portal route handler calls a
   gate (`lib/permissions/route-gates.mjs` › `GATES`): `staffGate`, `requireAuthenticatedUser`, `currentPerson`,
   `requirePermission`, `requireAdmin`, `requireDeveloper` or `requireClient`. Otherwise its file is on `UNGATED` with
   the reason it needs no check (sign-in flows, signed links, webhooks, the health probe). A handler on neither side
   fails the build (`lib/permissions/check.mjs`).
   - The staff helpers refuse a client or an unknown role with 404, whether or not the middleware ran.
   - A client passes only `requireClient`; today that is `GET /api/client/me`. That set is the client allow-list.
   - Clients get an allow-list, not filtering, because only 19 portal endpoints hold rows that cannot be traced to an
     operator, an aircraft or a trip. Those must be refused, not filtered. The flight and passenger rows are already
     scoped by the wall and the agent. Do not build per-row filtering into portal endpoints for clients: put the
     endpoint on the allow-list, or leave it refused.
   - Cloudflare sends `/digital-wall/*` and `/agent/api/*` straight to the wall and the agent, past the portal's
     middleware. Each of those services enforces clients on its own (`digital-wall/lib/client-scope.mjs`, the agent's
     client branch). The portal middleware protects only the portal.

## Way out from the server

Use this when the screen itself cannot be reached, or the grid has been set up badly. It puts every role back to the
defaults, and every change it makes goes into the history as `server-restore`.

```sh
cd /root/clearway-2 && sh scripts/permissions-restore.sh --dry-run   # list what differs
cd /root/clearway-2 && sh scripts/permissions-restore.sh             # restore
```

It needs only Node on the host, which the server has, and it reads the Supabase URL and service key from the repo's
`.env`, so it works with every container down.

## Adding a write

1. Add the endpoint, or the agent tool, to `lib/permissions/catalogue.mjs`, under an existing action or a new one in
   the right group.
2. In a portal handler, call `requirePermission("the.action")`.
3. Run `node lib/permissions/check.mjs`. If you added an action, also run
   `node lib/permissions/sql.mjs > /tmp/seed.sql` and paste the result between the seed markers in
   `docs/supabase-permissions.sql` and `rig/supabase/migrations/0018_permissions.sql`.
4. A new action starts off for everyone, and an admin grants it in the grid. Only if it must start on (say, it splits
   an existing action) add a migration that inserts its rows.
