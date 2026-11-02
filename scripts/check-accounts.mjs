// Production check accounts (2026-11-02, the user's conditions, not negotiable):
//   · read-only: they sign in and read. The portal, the wall and the agent refuse every write from an account whose
//     app_metadata has check_account (set only with the service key) — a check cannot write even by mistake;
//   · obviously synthetic, cannot receive mail: check-<role>-<random>@check.invalid (.invalid never resolves);
//   · never above the role under test, and never admin or developer: only "user" is accepted;
//   · deleted at the end of the run; the run FAILS if cleanup fails (a leftover account is the 26-account hole again);
//   · a standing list: `list` shows every check account that exists, at any time;
//   · in the audit trail: check_account.created / check_account.deleted rows (agent_audit_log);
//   · reports carry counts and status codes, never passenger or flight data.
// Runs INSIDE the portal container (its own env); scripts/check-accounts.sh copies it in and runs it from the server:
//   scripts/check-accounts.sh list
//   scripts/check-accounts.sh run <check name in scripts/prod-checks>
import crypto from "node:crypto";
import path from "node:path";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SB || !SVC || !ANON) { console.error("CANNOT TELL: run inside the portal container (no Supabase settings here)"); process.exit(2); }
const BASE = process.env.CHECK_BASE_URL || "https://clearway.verxyl.com";
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const ROLES = new Set(["user"]);   // never admin, never developer
const audit = (kind, email, detail) => fetch(`${SB}/rest/v1/agent_audit_log`, { method: "POST", headers: { ...H, prefer: "return=minimal" }, body: JSON.stringify([{ kind, user_email: email, actor_email: "check-accounts tool", success: true, confirmation_status: "not_required", detail }]) }).then((r) => r.ok);

async function listAll() {
  const out = [];
  for (let page = 1; page < 50; page += 1) {
    const r = await fetch(`${SB}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: H }); const j = await r.json();
    for (const u of j.users ?? []) if (u.app_metadata?.check_account === true) out.push(u);
    if ((j.users ?? []).length < 200) break;
  }
  return out;
}

async function make(role, check) {
  if (!ROLES.has(role)) throw new Error(`refused: a check account is never "${role}" (only: ${[...ROLES].join(", ")})`);
  const email = `check-${role}-${crypto.randomBytes(5).toString("hex")}@check.invalid`, password = crypto.randomBytes(24).toString("base64url");
  const r = await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: H, body: JSON.stringify({ email, password, email_confirm: true, app_metadata: { is_approved: true, check_account: true }, user_metadata: { full_name: "Check account (synthetic)" } }) }); // metadata-ok: a display name for a synthetic account
  const u = await r.json(); if (!u.id) throw new Error(`the check account was not made (${r.status})`);
  await fetch(`${SB}/rest/v1/user_preferences?on_conflict=user_id`, { method: "POST", headers: { ...H, prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: u.id, is_admin: false, is_developer: false, is_approved: true, display_name: "Check account" }) });
  await audit("check_account.created", email, { role, check });
  const s = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
  if (!s.access_token) throw new Error("the check account could not sign in");
  const ref = new URL(SB).hostname.split(".")[0];
  return { id: u.id, email, role, cookie: `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`, bearer: s.access_token };
}

async function remove(acct, check) {
  await fetch(`${SB}/rest/v1/user_preferences?user_id=eq.${acct.id}`, { method: "DELETE", headers: H });
  await fetch(`${SB}/auth/v1/admin/users/${acct.id}`, { method: "DELETE", headers: H });
  const gone = (await fetch(`${SB}/auth/v1/admin/users/${acct.id}`, { headers: H })).status === 404;
  if (gone) await audit("check_account.deleted", acct.email, { role: acct.role, check });
  return gone;
}

const [cmd, name] = process.argv.slice(2);
if (cmd === "list") {
  const all = await listAll();
  console.log(`${all.length} check account(s) exist`);
  for (const u of all) console.log(`  ${u.email} · created ${u.created_at} · role ${u.app_metadata?.check_role ?? "user"}`);
  process.exit(0);
}
if (cmd !== "run" || !/^[a-z0-9-]+$/.test(String(name ?? ""))) { console.error("usage: check-accounts.mjs list | run <check>"); process.exit(2); }
const mod = await import(path.join(path.dirname(new URL(import.meta.url).pathname), "prod-checks", `${name}.mjs`));
const made = []; let failures = 0, cleanupFailed = false;
const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d !== "" ? `  · ${d}` : ""}`); if (!c) failures += 1; };
try {
  for (const role of mod.ROLES ?? ["user"]) made.push(await make(role, name));
  await mod.check({ base: BASE, accounts: made, ok });
} catch (e) { ok(false, "the check ran", e.message); }
finally {
  for (const a of made) { const gone = await remove(a, name).catch(() => false); if (!gone) cleanupFailed = true; console.log(`${gone ? "removed" : "NOT REMOVED"}  check account ${a.email.replace(/^(check-\w+-)\w+/, "$1…")}`); }
  const left = (await listAll()).length;
  console.log(`${left} check account(s) left on production`);
  if (left > 0) cleanupFailed = true;
}
if (cleanupFailed) { console.log("\nCLEANUP FAILED — a check account is left on production: the run fails"); process.exit(1); }
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
