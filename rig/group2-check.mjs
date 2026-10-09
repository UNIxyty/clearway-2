// Portal foundations, Group 2 ("things that lie"), in the browser on the rig:
//   portal with sign-in ON  :3992 (as in rig/permissions-check.mjs), the normal rig portal :3998 (auth off),
//   the console served against the rig wall :4173 (cd opsboard-react && VITE_API_PROXY=http://127.0.0.1:5199 npx vite preview --port 4173)
//   node --env-file=.env.rig rig/group2-check.mjs  → rig/.scratch/shots/g2-*.png
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const AUTH = "http://127.0.0.1:3992"; const RIG = "http://127.0.0.1:3998"; const CONSOLE = "http://127.0.0.1:4173";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL; const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 160)}` : ""}`); if (!c) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
async function signedIn(email) {
  const s = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: "rig-access-check-only" }) })).json();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.addCookies([{ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`, url: AUTH }]);
  return { ctx, page: await ctx.newPage(), token: s.access_token };
}

// ── Navigation labels go where they say ──
const user = await signedIn("rig-access-user@rig.invalid");
await user.page.goto(`${AUTH}/dashboard`, { waitUntil: "load" });
await sleep(2500);
const hrefOf = async (p, label) => p.evaluate((l) => [...document.querySelectorAll("a,button")].find((e) => e.textContent.trim() === l)?.getAttribute("href") ?? null, label);
const navTarget = async (p, label, topic) => {
  // Nav items are buttons that push a route: open the topic if the item is folded away, click, read where we land.
  let el = p.getByRole("button", { name: label, exact: true }).first();
  if (!(await el.count()) && topic) { await p.getByRole("button", { name: topic, exact: true }).first().click(); await sleep(400); el = p.getByRole("button", { name: label, exact: true }).first(); }
  if (!(await el.count())) return null;
  const before = p.url(); await el.click(); await sleep(1500);
  const to = new URL(p.url()).pathname + new URL(p.url()).search; await p.goto(before, { waitUntil: "load" }); await sleep(1200);
  return to;
};
const bug = await navTarget(user.page, "Bug reports", "Reports & Issues");
ok(bug?.startsWith("/help"), "Reports & Issues → Bug reports opens Help & support, where reports are filed and followed", bug);
const hidden = await navTarget(user.page, "Hidden airports", "AIP & Documents");
ok(hidden === "/admin/airports/deleted", "AIP & Documents → Hidden airports is there for an ordinary user", hidden);
await user.page.goto(`${AUTH}/admin/airports/deleted`, { waitUntil: "load" });
await sleep(1500);
ok(await user.page.getByText("Airports you hid").count() >= 1 && await user.page.getByText(/your own search and browse lists only/).count() === 1, "the page says it is your own list");
await user.page.screenshot({ path: `${OUT}/g2-hidden-airports.png` });

const admin = await signedIn("rig-access-admin@rig.invalid");
await admin.page.goto(`${AUTH}/dashboard`, { waitUntil: "load" });
await sleep(2500);
await admin.page.getByText("Admin", { exact: true }).first().click().catch(() => {});
await sleep(400);
const adminItems = await admin.page.evaluate(() => document.body.innerText);
ok(!/Email tools/.test(adminItems) && !/Deleted airports/.test(adminItems), "Admin no longer lists Email tools (Pickem's) or Deleted airports (per-user)");
// (The root loading boundary streams every page, so a redirect reaches the browser inside the page: follow it there.)
await admin.page.goto(`${AUTH}/admin`, { waitUntil: "load" });
await admin.page.waitForURL(/\/admin\/users/, { timeout: 15000 }).catch(() => {});
ok(new URL(admin.page.url()).pathname === "/admin/users", "/admin opens the Admin section (Users), not the Pickem console", admin.page.url());

// ── Sign out signs out ──
const cookieHeader = (await user.ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
const so = await fetch(`${AUTH}/auth/sign-out`, { method: "POST", redirect: "manual", headers: { cookie: cookieHeader } });
const cleared = (so.headers.getSetCookie?.() ?? []).filter((c) => /sb-.+-auth-token/.test(c) && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c));
ok(so.status === 303 && new URL(so.headers.get("location"), AUTH).pathname === "/login" && cleared.length >= 1, "POST /auth/sign-out (the console's Sign out) clears the session and lands on sign-in", `${so.status} ${so.headers.get("location")} · ${cleared.length} cookie(s) cleared`);
const after = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: ANON, authorization: `Bearer ${user.token}` } });
ok(after.status === 401 || after.status === 403, "…and the session is ended on the server too", `${after.status}`);
const get = await fetch(`${AUTH}/auth/sign-out`, { redirect: "manual" });
ok(get.status === 405, "a GET (a link, an image) cannot sign anyone out", `${get.status}`);
await user.ctx.close(); await admin.ctx.close();

// ── The console's own menu ──
const con = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
// The rig wall has no live flights: the console is served two synthetic ones (the behaviour under test is the console's).
const t = (h) => new Date(Date.now() + h * 3600_000).toISOString();
const SYN = { aircraft: [{ oprId: "cwy-cwy", registration: "YL-RIG", operatorName: "Clearway (CWY)", flights: [
  { flightNid: 990001, flightNo: "RIG101", startTimeUTC: t(1), endTimeUTC: t(3), adep: { icao: "EVRA" }, ades: { icao: "LGAV" } },
  { flightNid: 990002, flightNo: "RIG202", startTimeUTC: t(5), endTimeUTC: t(7), adep: { icao: "LGAV" }, ades: { icao: "EVRA" } },
] }] };
await con.route("**/api/timeline/flights**", (route) => route.fulfill({ json: SYN }));
const f = { ...SYN.aircraft[0].flights[1], oprId: "cwy-cwy" };
if (f) {
  await con.goto(`${CONSOLE}/console/flights?flight=${encodeURIComponent(`${f.oprId ?? ""}:${f.flightNid}`)}`, { waitUntil: "load" });
  await sleep(3000);
  const text = await con.locator("body").innerText();
  ok(new URL(con.url()).searchParams.get("flight") === `${f.oprId ?? ""}:${f.flightNid}` && (text.match(new RegExp(String(f.flightNo), "g")) ?? []).length >= 2, "Open in Flights (?flight=) opens that flight — tomorrow's, so the list widens to All and shows it too", f.flightNo);
  await con.screenshot({ path: `${OUT}/g2-open-in-flights.png` });
}
await con.locator("button[title]").filter({ hasText: /@|Signed in|RIG/ }).first().click().catch(() => {});
await sleep(500);
const menu = await con.evaluate(() => document.body.innerHTML);
ok(!/'\/stats'|"\/settings\/notifications"/.test(menu), "the console's account menu points at the portal's own pages");

// ── HITL viewer Back ──
const rigCtx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const opener = await rigCtx.newPage();
await opener.goto(`${RIG}/aip`, { waitUntil: "load" });
const [popup] = await Promise.all([rigCtx.waitForEvent("page"), opener.evaluate(() => window.open("/lithuania-hitl-auto-test/viewer", "captcha-test", "popup=yes,width=900,height=700"))]);
await popup.waitForLoadState("load"); await sleep(1500);
ok(await popup.getByRole("button", { name: "Back to the airport" }).count() === 1, "the HITL viewer's Back says where it goes");
await popup.screenshot({ path: `${OUT}/g2-hitl-viewer.png` });
await popup.getByRole("button", { name: "Back to the airport" }).click();
await sleep(800);
ok(popup.isClosed(), "…and closes the popup, back to the airport page (no 404)");
await browser.close();
console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"} · screenshots in ${OUT}/g2-*.png`);
process.exit(failures ? 1 : 0);
