// The rig's sign-in accounts, made at setup (2026-11-08): rig-access-user (a plain user), -admin, -dev, approved, with
// agent access, password "rig-access-check-only". Until now rig/permissions-check.mjs made them, half-way through a
// full run, so on a fresh database every suite before it that signs in (intake/browser-people) was sent to /login.
// Idempotent; the local database only. rig/up.sh runs it.   node --env-file=.env.rig rig/access-accounts.mjs
import { execFileSync } from "node:child_process";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const sb = (p, init = {}) => fetch(`${SB}${p}`, { ...init, headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json", ...(init.headers ?? {}) } });
const psql = (sql) => execFileSync("docker", ["exec", "-i", "supabase_db_rig", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tAq"], { input: sql }).toString().trim();
const ACCOUNTS = [["rig-access-user@rig.invalid", {}], ["rig-access-admin@rig.invalid", { is_admin: true }], ["rig-access-dev@rig.invalid", { is_developer: true }]];
const password = "rig-access-check-only";
const out = [];
for (const [email, flags] of ACCOUNTS) {
  const made = await (await sb("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password, email_confirm: true, app_metadata: { is_approved: true } }) })).json();
  const id = made.id ?? (await (await sb("/auth/v1/admin/users?per_page=200")).json()).users?.find((u) => u.email === email)?.id;
  if (!id) { console.error(`could not make or find ${email}`); process.exit(1); }
  const p = await sb("/rest/v1/user_preferences?on_conflict=user_id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: id, is_admin: false, is_developer: false, ...flags }) });
  if (!p.ok) { console.error(`preferences for ${email}: ${p.status}`); process.exit(1); }
  psql(`insert into agent_access (user_id, user_email, note) select '${id}', '${email}', 'rig access account' where not exists (select 1 from agent_access where user_id = '${id}' and revoked_at is null);`);
  const s = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
  if (!s.access_token) { console.error(`${email} cannot sign in`); process.exit(1); }
  out.push(email.split("@")[0]);
}
console.log(`rig access accounts ready, each signs in: ${out.join(", ")}`);
