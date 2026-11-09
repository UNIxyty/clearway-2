// The gate walk on production (2026-11-05), as a client and as a role nobody planned for: the same inventory the rig
// walks (gate-inventory.json beside this file, from rig/lib/gate-inventory.mjs; the rig walk fails when it is stale).
// Through the public address, so Cloudflare, the portal's middleware and the wall's and agent's own gates are all in it.
// Read-only: every write from a check account is refused anyway, and every body here is "{}". Status codes only.
// The client is the most a client can be (every switch, the documents level) on a scope that matches nothing.
import { readFileSync } from "node:fs";
import path from "node:path";
// the user is the control: the same addresses answer a plain staff account, so a refusal means something
export const ROLES = ["client", "unknown", "user"];
const INV = JSON.parse(readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "gate-inventory.json"), "utf8"));
export const CLIENT_SWITCHES = INV.clientSwitches;

export async function check({ base, accounts: [client, unknown, user], ok }) {
  const call = (p, method = "GET", who = null) => fetch(`${base}${p}`, { method, redirect: "manual", headers: { ...(who ? { cookie: who.cookie } : {}), "content-type": "application/json" }, body: ["GET", "HEAD"].includes(method) ? undefined : "{}", signal: AbortSignal.timeout(20000) })
    .then(async (r) => { await r.body?.cancel().catch(() => null); return { st: r.status, to: (r.headers.get("location") || "").replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "") }; }, () => ({ st: 0, to: "" }));
  const REFUSED = new Set([401, 403, 404, 405]);
  const REFUSED_TO = /^\/(login|forbidden|access-blocked|pending-approval|client(\/(refused|removed))?)$/;
  const t0 = Date.now();

  // the wall and the agent first: the portal walk signs each session out at its end
  for (const svc of INV.services) {
    for (const [label, who] of [["client", client], ["unknown role", unknown]]) {
      const leaks = [];
      for (const e of svc.walk) {
        if (e.public || (who === client && e.clientMay)) continue;
        const r = await call(`${svc.prefix}${e.path}`, e.method, who);
        if (!REFUSED.has(r.st)) leaks.push(`${e.method} ${e.path} → ${r.st}`);
      }
      ok(leaks.length === 0, `${svc.name}: all ${svc.walk.filter((e) => !e.public && !(who === client && e.clientMay)).length} endpoints refuse the ${label}${who === client ? " outside its allow-list" : ""}`, leaks.slice(0, 10).join(" | "));
    }
  }
  const scanRoute = INV.services.find((s) => s.name === "agent").walk.find((e) => /^\/api\/intake\/attachments\//.test(e.path));
  const emlRoute = INV.services.find((s) => s.name === "agent").walk.find((e) => /^\/api\/mailbox\/messages\/[^/]+\/raw$/.test(e.path));
  const scan = await call(`/agent${scanRoute.path}`, "GET", client), eml = await call(`/agent${emlRoute.path}`, "GET", client);
  ok(scan.st === 404 && eml.st === 404, "agent: a passport scan and a raw email (.eml) answer 404 to the client", `${scan.st} ${eml.st}`);
  const board = await call("/digital-wall/api/timeline/flights?allOperators=true", "GET", client);
  ok(board.st === 200, "wall: the client's own flight board answers (scoped to nothing here)", board.st);

  const control = [];
  for (const p of ["/dashboard", "/api/regions", "/api/user/preferences", "/docs/search-index.json", "/digital-wall/api/users/me", "/agent/api/health"]) control.push(`${p} ${(await call(p, "GET", user)).st}`);
  ok(control.every((x) => / 200$/.test(x)), "control: a plain staff check account reaches the same kind of address (a refusal above means something)", control.join(" | "));

  // the portal: every address, through the middleware, as production runs
  const anon = new Map();
  for (const a of INV.portal) anon.set(`${a.method} ${a.route}`, await call(a.route, a.method));
  for (const [label, who] of [["client", client], ["unknown role", unknown]]) {
    const leaks = []; let reached = 0, same = 0;
    for (const a of INV.portal) {
      const r = await call(a.route, a.method, who);
      // on the list: a read answers 200. A write on the list (the password route) is refused 403 here, because a check
      // account can write nothing; 400 would be the handler's own answer to the empty form
      if (who === client && a.onList) { if (r.st === 200 || (a.method !== "GET" && (r.st === 403 || r.st === 400))) reached += 1; else leaks.push(`${a.method} ${a.route} on the list → ${r.st}`); continue; }
      if (REFUSED.has(r.st) || (r.st >= 300 && r.st < 400 && REFUSED_TO.test(r.to))) continue;
      if (/^\/(login|signup|request-access)$/.test(a.route) && r.st >= 300 && r.st < 400 && r.to === "/") continue;   // signed in → the root, walked itself
      if (who === client && (a.route === "/" || /^\/client\/(refused|removed)$/.test(a.route)) && r.st >= 300 && r.st < 400 && r.to === "/client") continue;
      const x = anon.get(`${a.method} ${a.route}`); if (x && x.st === r.st && x.to === r.to) { same += 1; continue; }
      leaks.push(`${a.kind} ${a.method} ${a.route} → ${r.st}${r.to ? `→${r.to}` : ""}`);
    }
    ok(leaks.length === 0, `portal: all ${INV.portal.length} addresses refuse the ${label}${who === client ? `, except its ${reached} on the allow-list` : ""}; ${same} public ones answer as for a signed-out visitor`, leaks.slice(0, 12).join(" | "));
  }
  console.log(`      ${Math.round((Date.now() - t0) / 1000)} s`);
}
