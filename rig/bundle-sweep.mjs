// The bundle sweep (2026-11-04): what a CLIENT's browser and a SIGNED-OUT visitor's browser download, swept for what must
// not be in it (rig/lib/bundle-sweep.mjs lists the kinds). Counts and kinds per asset, never a value.
//   rig:         node --env-file=.env.rig rig/bundle-sweep.mjs            (starts this build on :3982/:3979, a client account)
//   any portal:  BASE=https://… OPERATORS_FILE=… node rig/bundle-sweep.mjs  (signed-out pages only; read-only GETs)
import fs from "node:fs";
import { spawn } from "node:child_process";
import { sweepAssets, downloadedAssets, permissionNamesFrom, ourRoutesFrom, printSweep, readCatalogue } from "./lib/bundle-sweep.mjs";

const SIGNED_OUT = ["/login", "/request-access", "/welcome", "/forgot-password", "/reset-password"];
const CLIENT = ["/client", "/client/airports", "/client/documents"];
// what a client's own pages legitimately name: their pages, their standing, the wall's scoped reads, the passengers route
const CLIENT_OWN = /^\/(client(\/|$)|api\/client\/me$|digital-wall\/api(\/|$)|agent\/api\/flights(\/|$))/;
const ourRoutes = ourRoutesFrom("app");
const publicHosts = [String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")].filter(Boolean);
const permissionNames = permissionNamesFrom(readCatalogue());
const fetchStatus = async (u) => { try { return (await fetch(u, { method: "GET" })).status; } catch { return 0; } };

export async function sweepClientAndSignedOut({ base, cookie, operators }) {
  const out = {};
  if (cookie) out.client = await sweepAssets(await downloadedAssets({ base, pages: CLIENT, cookie }), { permissionNames, operators, allowedRoutes: CLIENT_OWN, fetchMap: fetchStatus, ourRoutes, publicHosts });
  out.signedOut = await sweepAssets(await downloadedAssets({ base, pages: SIGNED_OUT }), { permissionNames, operators, allowedRoutes: /^\/(api\/(auth|client-requests|client-invite)\b)/, fetchMap: fetchStatus, ourRoutes, publicHosts });
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.BASE) {
    const operators = process.env.OPERATORS_FILE ? JSON.parse(fs.readFileSync(process.env.OPERATORS_FILE, "utf8")) : [];
    const r = await sweepClientAndSignedOut({ base: process.env.BASE.replace(/\/+$/, ""), cookie: null, operators });
    printSweep(`signed out, ${process.env.BASE}`, r.signedOut);
    process.exit(0);
  }
  const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
  const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
  const kids = [];
  const run = (args, env) => { const c = spawn(args[0], args.slice(1), { env, stdio: "ignore" }); kids.push(c); };
  const B = "http://127.0.0.1:3979";
  try {
    fs.rmSync(".next/standalone/.next/static", { recursive: true, force: true }); fs.cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
    fs.rmSync(".next/standalone/public", { recursive: true, force: true }); fs.cpSync("public", ".next/standalone/public", { recursive: true });
    run(["node", "--env-file=.env.rig", ".next/standalone/server.js"], { PATH: process.env.PATH, HOME: process.env.HOME, PORT: "3982", HOSTNAME: "127.0.0.1", DISABLE_AUTH_FOR_TESTING: "false", ADMIN_EMAILS: "", DEVELOPER_EMAILS: "" });
    run(["node", "rig/proxy.mjs"], { ...process.env, RIG_PROXY_PORT: "3979", RIG_PORTAL_PORT: "3982", RIG_AGENT_PORT: "5176", RIG_WALL_PORT: "5198" });
    for (let i = 0; i < 80; i += 1) { try { if ((await fetch(`${B}/login`)).status < 500) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
    const ops = (await (await fetch(`${SB}/rest/v1/leon_operators?select=opr_id,name`, { headers: H })).json()).flatMap((o) => [o.opr_id, o.name]).filter(Boolean);
    const EMAIL = "rig-client-allow@rig.invalid", PASSWORD = "rig-access-check-only-client-allow";
    const list = await (await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=200`, { headers: H })).json();
    const u = (list.users ?? []).find((x) => x.email === EMAIL);
    if (!u) { console.error("run rig/client-allow-check.mjs once first (it makes the client account)"); process.exit(2); }
    await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: "PUT", headers: H, body: JSON.stringify({ password: PASSWORD, app_metadata: { role: "client", is_approved: true, client_status: "approved" } }) });
    await fetch(`${SB}/rest/v1/clients?user_id=eq.${u.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "approved", scope: [{ kind: "operator", value: "cwy-cwy" }], switches: ["flight_board", "weather", "notams", "radar", "airport_search", "documents"], passenger_level: "names" }) });
    const s = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })).json();
    const cookie = `sb-${new URL(SB).hostname.split(".")[0]}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;
    const r = await sweepClientAndSignedOut({ base: B, cookie, operators: ops });
    printSweep("a client (every switch on)", r.client);
    printSweep("signed out", r.signedOut);
    await fetch(`${SB}/rest/v1/clients?user_id=eq.${u.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "removed", scope: [], switches: [], passenger_level: "off" }) });
    await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: "PUT", headers: H, body: JSON.stringify({ app_metadata: { role: "client", is_approved: false, client_status: "removed" } }) });
  } finally { for (const k of kids) k.kill(); }
}
