// The rig's account in the LOCAL auth: id 00000000-7e57-4000-8000-000000000000 (7e57 = TEST),
// rig-test@rig.invalid, password "rig-test-password". Also its user_preferences row (developer) and agent access.
import fs from "node:fs"; import path from "node:path";
const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env.rig"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!/127\.0\.0\.1|localhost/.test(URL_)) { console.error("refusing: not a local Supabase"); process.exit(78); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };
export const RIG_USER = { id: "00000000-7e57-4000-8000-000000000000", email: "rig-test@rig.invalid", password: "rig-test-password", name: "RIG TEST ACCOUNT (not a person)" };
let r = await fetch(`${URL_}/auth/v1/admin/users`, { method: "POST", headers: H, body: JSON.stringify({ id: RIG_USER.id, email: RIG_USER.email, password: RIG_USER.password, email_confirm: true, user_metadata: { full_name: RIG_USER.name }, app_metadata: { role: "developer" } }) });
const body = await r.json().catch(() => ({}));
if (!r.ok && !/already|exists|duplicate/i.test(JSON.stringify(body))) { console.error("auth user:", r.status, JSON.stringify(body).slice(0, 200)); process.exit(1); }
console.log(`auth user ${RIG_USER.email}: ${r.ok ? "created" : "already there"}`);
r = await fetch(`${URL_}/rest/v1/user_preferences?on_conflict=user_id`, { method: "POST", headers: { ...H, prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ user_id: RIG_USER.id, display_name: RIG_USER.name, is_admin: true, is_developer: true, is_approved: true }]) });
console.log(`user_preferences: ${r.status}${r.ok ? "" : " " + (await r.text()).slice(0, 120)}`);
const have = await (await fetch(`${URL_}/rest/v1/agent_access?user_id=eq.${RIG_USER.id}&select=id`, { headers: H })).json();
if (!have.length) { r = await fetch(`${URL_}/rest/v1/agent_access`, { method: "POST", headers: { ...H, prefer: "return=minimal" }, body: JSON.stringify([{ user_id: RIG_USER.id, user_email: RIG_USER.email, granted_by_email: "rig" }]) }); console.log(`agent_access: ${r.status}`); } else console.log("agent_access: already granted");
r = await fetch(`${URL_}/rest/v1/agent_settings?on_conflict=id`, { method: "POST", headers: { ...H, prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: "global", enabled: true, reason: "rig", updated_at: new Date().toISOString() }]) });
console.log(`agent_settings global: ${r.status}`);
