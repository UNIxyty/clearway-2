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
  and each reveal is still logged.
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
   The only deliberate differences are the two reads above, and calculating Pick'em playoff points, which now follows
   the same admin rule as its sibling actions; it used to read only the `is_admin` flag.

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
