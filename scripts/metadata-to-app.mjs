// One-off, run ONCE per database BEFORE deploying the 2026-10-20 role fix (docs/security-metadata-roles.md).
//
// The new code reads authorization from app_metadata (service-key writes), user_preferences and DEVELOPER_EMAILS only.
// This copies into app_metadata the two things that used to live ONLY in the person's own user_metadata, and ONLY
// where an independent record says the same — so a value a person may have forged there is never blessed:
//   - the "temporary" restriction (role: temporary / is_temporary), where user_preferences shows the account the
//     Telegram bot grants that way: approved, not admin, not developer. A restriction cannot be a forgery in the
//     person's favour, and the bot wrote both records together;
//   - is_approved, only where user_preferences.is_approved holds the same value (the sign-up flow and Admin › Users
//     write both). An account the person "approved" themselves disagrees with user_preferences and is reported.
// Roles (admin / developer, is_admin / is_developer, roles[]) are NEVER copied: the new code takes them from
// user_preferences and DEVELOPER_EMAILS, which only the admin API and the server's environment write. A role found
// in user_metadata without that backing is reported as a possible forgery and copied nowhere.
// Prints counts and, for anything disagreeing, the account's id — never a name or an email.
//   node --env-file=.env scripts/metadata-to-app.mjs [--dry-run]       # production, from the server's checkout
//   node --env-file=.env.rig scripts/metadata-to-app.mjs [--dry-run]   # the rig
const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !key) { console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed."); process.exit(2); }
const dry = process.argv.includes("--dry-run");
const H = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
const get = async (path) => { const r = await fetch(`${url}${path}`, { headers: H }); if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); };

const prefs = new Map((await get("/rest/v1/user_preferences?select=user_id,is_admin,is_developer,is_approved")).map((p) => [p.user_id, p]));
const devEmails = String(process.env.DEVELOPER_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
let page = 1, seen = 0, copied = 0, temporary = 0, approved = 0; const suspect = [];
for (;;) {
  const { users = [] } = await get(`/auth/v1/admin/users?page=${page}&per_page=200`);
  if (!users.length) break;
  for (const u of users) {
    seen += 1;
    const um = u.user_metadata || {}, am = u.app_metadata || {}, p = prefs.get(u.id) || null;
    const patch = {};
    const metaRole = String(um.role || "").toLowerCase();
    const claimsTemporary = metaRole === "temporary" || um.is_temporary === true || (Array.isArray(um.roles) && um.roles.map(String).some((r) => r.toLowerCase() === "temporary"));
    const prefsPlain = p && p.is_approved === true && !p.is_admin && !p.is_developer;
    if (claimsTemporary && prefsPlain && am.role === undefined && am.is_temporary === undefined) { patch.role = "temporary"; patch.is_temporary = true; temporary += 1; }
    if (um.is_approved !== undefined && am.is_approved === undefined) {
      if (p && p.is_approved === um.is_approved) { patch.is_approved = um.is_approved; approved += 1; }
      else suspect.push({ id: u.id, why: `is_approved ${JSON.stringify(um.is_approved)} in user_metadata, user_preferences says ${JSON.stringify(p?.is_approved)}` });
    }
    const claimsRole = ["admin", "developer"].includes(metaRole) || um.is_admin === true || um.is_developer === true || (Array.isArray(um.roles) && um.roles.map(String).some((r) => ["admin", "developer"].includes(r.toLowerCase())));
    if (claimsRole) {
      const backed = (metaRole === "developer" || um.is_developer === true) ? (p?.is_developer === true || devEmails.includes(String(u.email || "").toLowerCase())) : p?.is_admin === true || p?.is_developer === true;
      if (!backed) suspect.push({ id: u.id, why: `user_metadata claims ${metaRole || (um.is_developer ? "developer" : "admin")}, with no user_preferences or DEVELOPER_EMAILS behind it` });
      // backed or not, a role is never copied: the new code reads user_preferences / DEVELOPER_EMAILS for it
    }
    if (!Object.keys(patch).length) continue;
    copied += 1;
    if (dry) continue;
    const w = await fetch(`${url}/auth/v1/admin/users/${u.id}`, { method: "PUT", headers: H, body: JSON.stringify({ app_metadata: { ...am, ...patch } }) });
    if (!w.ok) { console.error(`account ${seen}: write failed HTTP ${w.status}`); process.exit(1); }
  }
  if (users.length < 200) break;
  page += 1;
}
console.log(`${dry ? "dry run: " : ""}${seen} accounts seen; ${copied} ${dry ? "would get" : "got"} app_metadata written (${temporary} temporary restrictions, ${approved} approval flags agreeing with user_preferences); roles copied: 0 by design.`);
if (suspect.length) { console.log(`${suspect.length} account(s) DISAGREE with their records — copied nowhere; look at each by id:`); for (const s of suspect) console.log(`  ${s.id}: ${s.why}`); process.exit(3); }
else console.log("No account holds a role or an approval in user_metadata without an independent record behind it.");
