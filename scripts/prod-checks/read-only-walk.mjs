// Read-only, as a plain user (scripts/check-accounts.mjs makes the account and removes it). Status codes only.
export const ROLES = ["user"];
export async function check({ base, accounts: [u], ok }) {
  const get = (p, init = {}) => fetch(`${base}${p}`, { redirect: "manual", ...init, headers: { cookie: u.cookie, "content-type": "application/json", ...(init.headers ?? {}) } });
  const res = await (await get("/api/aip/resolve?icao=EVRA")).json().catch(() => ({}));
  if (res.filesPath) ok((await get(res.filesPath)).status === 200, "/files: a listed AIP copy serves to a signed-in user", res.filesPath.replace(/[A-Z0-9]{4}\.pdf$/, "<ICAO>.pdf"));
  else ok(true, "/files: no cached EVRA copy to fetch here (nothing to assert)", "skipped");
  ok((await get("/files/aip/ead-pdf/EVRA.json")).status === 404, "/files: the .json beside an AIP copy is 404");
  ok((await get("/files/notam/check.json")).status === 404, "/files: a storage folder that is not listed is 404");
  ok((await get("/files/help-drafts/00000000-0000-4000-8000-000000000000/question.json")).status === 404, "/files: help drafts are 404 (the leak of 1 Nov)");
  const st = await (await get("/api/admin/status")).json().catch(() => ({}));
  ok(st.role === "user" && st.isAdmin === false, "the status probe names the role: user, not admin", st.role);
  ok([403, 404].includes((await get("/api/admin/users")).status), "Admin › Users refuses a plain user");
  // the read-only rule, in each service a session can reach
  ok((await get("/api/user/preferences", { method: "POST", body: "{}" })).status === 403, "portal: a write from a check account is refused (read-only)");
  ok((await get("/digital-wall/api/important", { method: "POST", body: "{}" })).status === 403, "wall: a write from a check account is refused (read-only)");
  ok([403, 404].includes((await get("/agent/api/feedback", { method: "POST", body: "{}" })).status), "agent: a write from a check account is refused");
  ok((await get("/digital-wall/api/users/me")).status === 200, "wall: a read still works for the check account");
}
