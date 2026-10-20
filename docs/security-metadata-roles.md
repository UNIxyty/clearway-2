# Roles and approval came from metadata the person could edit (found and fixed 2026-10-20)

## The finding
Supabase lets any signed-in person update their own `user_metadata` (`auth.updateUser({ data })`, or `PUT
/auth/v1/user` with their access token). The portal (`lib/role-resolve.ts`), the agent (`agent/lib/auth.mjs`) and the
wall (`digital-wall/lib/roles.mjs`) all read the person's role from `app_metadata` **or `user_metadata`** — `role`,
`roles`, `is_admin`, `is_developer` — and the portal's middleware read the approval flag `is_approved` from
`user_metadata` too. So a plain user could write `role: "developer"` into their own metadata and become a developer
everywhere; an account pending approval could write `is_approved: true` and walk in; a temporary account could remove
its own restriction.

Proven on the sign-in-on rig before the fix: the plain rig user wrote `{ role: "developer", is_admin: true }`,
refreshed its session, and `/api/admin/status` answered admin and developer; the developer inbox opened. Found while
reading for client access (Stage 5), where a stranger would have had an account — but it was live for every account
before that.

## The fix
- **Reads:** a role or the approval flag comes from **`app_metadata` only** (written only with the service key),
  `DEVELOPER_EMAILS`, or `user_preferences` (`is_admin`, `is_developer` — written only by the admin API). `user_metadata`
  is never consulted for authorization; it keeps the display name and nothing else that matters.
  Changed: `lib/role-resolve.ts` › `roleFromSupabaseUser`, `middleware.ts` › `isTemporaryUser` and the pending check,
  `app/pending-approval/page.tsx`, `agent/lib/auth.mjs` › `roleFromMetadata` and the token's `role`,
  `digital-wall/lib/roles.mjs` › `roleFromClaims`.
- **Writes:** the sign-up confirmation, Admin › Users (approve) and the Telegram admin bot's make-admin / temporary /
  approve now write `app_metadata`.
- **Check:** `rig/self-promotion-check.mjs` — as the plain rig user, write every role claim into `user_metadata`, refresh,
  and the portal, the agent and the wall all still answer user (admin status false, developer inbox 403, agent admin
  read 403, wall admin write 403); with `app_metadata.is_approved = false` set by the service key the portal sends them
  to `/pending-approval` even while their own metadata says approved. In the runner.
- **Build check:** `checkMetadataReads` in `lib/permissions/check.mjs` fails the portal's build (`--code` in the
  Dockerfile) and the agent's and the wall's start if any line of the three services mentions `user_metadata` or
  `userMetadata` without a `metadata-ok: <reason>` on it. The portal scans its whole tree (middleware, lib, app,
  components); the agent and the wall scan their own files at start. On 2026-10-20 it covers 14 lines: 10 in the
  portal, 3 in the agent, 1 in the wall — every one a display name, a type or the rig's stub, none a decision.

## Deploy order (the migration first)
1. **Run `scripts/metadata-to-app.mjs` once against production** (`node --env-file=.env scripts/metadata-to-app.mjs`
   on the server, `--dry-run` first). It must not bless a forgery, so it copies only what an independent record
   confirms: the temporary restriction where `user_preferences` shows the account approved, not admin, not developer
   (the bot wrote both), and `is_approved` where `user_preferences` holds the same value. Roles are never copied —
   the new code takes them from `user_preferences` and `DEVELOPER_EMAILS`. Anything else is reported by account id
   and copied nowhere (exit 3). Prints counts, never a person. Running it before the deploy is harmless: the old code
   reads both. Production, 2026-10-20, before the run: 36 of 43 accounts carried a key, every one matching its record.
2. Deploy `portal`, `agent-service`, `digital-wall-backend`.
3. Nothing to tell ops: nobody's access changes, except for whoever had promoted themselves.

## Related
The permissions grid (docs/permissions.md) decides what each *role* may do; this is about who *holds* a role.
Client access (Stage 5) adds a `client` role on the same rule: `app_metadata` set by the service key when ops approve.
