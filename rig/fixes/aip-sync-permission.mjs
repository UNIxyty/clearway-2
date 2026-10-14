// GET /api/aip/sync (and the other reads that make a sync service fetch) are held to "portal.aip.fetch" since
// 2026-10-14. Before, any signed-in account could start a sync and no permission was asked (the check only looked at
// writes). Every role has the action by default, so nothing changes until someone switches it off — then it refuses.
//   node --env-file=.env.rig rig/fixes/aip-sync-permission.mjs
import { signedIn, ok, done, sleep, rest } from "./common.mjs";
const ROUTES = ["/api/aip/sync?icao=EVRA", "/api/aip/gen/sync?icao=EVRA", "/api/notams?icao=EVRA&sync=1", "/api/weather?icao=EVRA&sync=1", "/api/aip/ead?icao=EVRA&sync=1"];
const { browser, page } = await signedIn("user");
const status = (u) => page.evaluate(async (u) => { const r = await fetch(u); return { s: r.status, b: (await r.text()).slice(0, 160) }; }, u);
const grant = (allowed) => rest("permission_grants?role=eq.user&action=eq.portal.aip.fetch", { method: "PATCH", body: JSON.stringify({ allowed }) });
try {
  await page.goto("http://127.0.0.1:3989/help", { waitUntil: "load" });
  for (const u of ROUTES) { const r = await status(u); ok(r.s !== 401 && r.s !== 403, `a User may still start ${u.split("?")[0]} (the rig has no sync service, so it says so)`, `${r.s} ${r.b}`); }
  await grant(false); await sleep(11_000); // grants are cached for up to 10 s
  for (const u of ROUTES) { const r = await status(u); ok(r.s === 403 && /portal\.aip\.fetch/.test(r.b), `with Fetch switched off for Users, ${u.split("?")[0]} refuses`, `${r.s} ${r.b}`); }
} finally {
  await grant(true);
  await browser.close();
}
done();
