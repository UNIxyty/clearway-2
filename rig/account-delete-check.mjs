// Removing an account removes everything it could do (2026-11-07, migrations/0029_account_deleted.sql): a live agent
// grant outlived its account on production, because no delete path touched agent_access. The trigger on auth.users
// runs inside the delete itself, whatever deletes it (the Admin API here, as the Telegram bot and the dashboard do).
//   node --env-file=.env.rig rig/account-delete-check.mjs
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d !== "" ? `  · ${String(d).slice(0, 200)}` : ""}`); if (!c) failures += 1; };
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY, H = { apikey: K, authorization: `Bearer ${K}`, "content-type": "application/json" };
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const db = async (p, init = {}) => { const r = await fetch(`${SB}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } }); return r.status === 204 || r.status === 201 ? null : r.json().catch(() => null); };
const make = async (email, app_metadata) => {
  for (const u of ((await (await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=1000`, { headers: H })).json()).users ?? []).filter((x) => x.email === email)) { await db(`clients?user_id=eq.${u.id}`, { method: "DELETE" }); await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: H }); }
  return (await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: H, body: JSON.stringify({ email, password: "rig-access-check-only-account-delete", email_confirm: true, app_metadata }) })).json();
};
const notifyBefore = (await db("app_settings?key=eq.clients.notify_to&select=value"))?.[0]?.value ?? null;
try {
  // an ordinary account with a live grant, on the ops notify list
  const u = await make("rig-delete-me@rig.invalid", { is_approved: true });
  await db("agent_access", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([{ user_id: u.id, user_email: u.email, granted_by_email: "rig-account-delete-check" }]) });
  const list = [...new Set([...(notifyBefore?.emails ?? []), "rig-delete-me@rig.invalid"])];
  await db("app_settings?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ key: "clients.notify_to", value: { ...(notifyBefore ?? {}), emails: list } }]) });
  const del = await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: H });
  const grants = await db(`agent_access?user_id=eq.${u.id}&select=revoked_at,revoked_by_email`);
  ok(del.ok && grants?.length === 1 && grants[0].revoked_at && grants[0].revoked_by_email === "account deleted", "deleting an account revokes its live agent grant in the same delete (the row stays as history)", `${del.status} · ${JSON.stringify(grants)}`);
  const after = (await db("app_settings?key=eq.clients.notify_to&select=value"))?.[0]?.value?.emails ?? [];
  ok(!after.includes("rig-delete-me@rig.invalid"), "…and takes its address off the ops notify list", `${after.length} address(es) left`);
  // a client account cannot be deleted while its clients row stands: the delete fails, loudly, and nothing changes
  const c = await make("rig-delete-client@rig.invalid", { role: "client", is_approved: true, client_status: "approved" });
  await db("clients", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([{ user_id: c.id, email: c.email, person_name: "Rig Delete Client", company: "Rig Delete (invented)", kind: "operator", status: "approved", scope: [], switches: ["flight_board"], passenger_level: "off" }]) });
  await db("agent_access", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([{ user_id: c.id, user_email: c.email, granted_by_email: "rig-account-delete-check" }]) });
  const cdel = await fetch(`${SB}/auth/v1/admin/users/${c.id}`, { method: "DELETE", headers: H });
  const still = (await fetch(`${SB}/auth/v1/admin/users/${c.id}`, { headers: H })).status;
  const cg = await db(`agent_access?user_id=eq.${c.id}&select=revoked_at`);
  ok(!cdel.ok && still === 200 && cg?.[0] && !cg[0].revoked_at, "a delete that cannot finish fails loudly and changes nothing: the client account, its row and its grant all stand", `${cdel.status} · account ${still} · grant ${cg?.[0]?.revoked_at ? "revoked" : "live"}`);
  await db(`clients?user_id=eq.${c.id}`, { method: "DELETE" }); await db(`agent_access?user_id=eq.${c.id}`, { method: "DELETE" });
  await fetch(`${SB}/auth/v1/admin/users/${c.id}`, { method: "DELETE", headers: H });
  await db(`agent_access?user_id=eq.${u.id}`, { method: "DELETE" });
  // nothing live outlives its account on the rig
  const users = new Set(((await (await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=1000`, { headers: H })).json()).users ?? []).map((x) => x.id));
  const orphans = ((await db("agent_access?revoked_at=is.null&select=user_id")) ?? []).filter((g) => !users.has(g.user_id));
  ok(orphans.length === 0, "no live agent grant on the rig belongs to an account that no longer exists", orphans.length);
} finally {
  if (notifyBefore) await db("app_settings?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ key: "clients.notify_to", value: notifyBefore }]) });
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
