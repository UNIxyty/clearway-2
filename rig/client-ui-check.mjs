// The client screens (Stage 5, 2026-10-25): Admin › Clients, the ask-for-access page, the waiting screen and the client
// wall, at 1440 and 390, light and dark, with no horizontal page scroll. Invented names only. On the sign-in rig: a
// client account is made with the service key, left "requested", then approved THROUGH THE ADMIN PAGE (scope by
// registration, a switch toggled, the passenger level set), looked at as the client, changed, and removed by typing the
// company — the row stays, emptied. Screenshots in rig/.scratch/shots/client-*.png.
//   node --env-file=.env.rig rig/client-ui-check.mjs
import { chromium } from "playwright";
import fs from "node:fs";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const B = "http://127.0.0.1:3989", OUT = "rig/.scratch/shots"; fs.mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 170)}` : ""}`); if (!c) failures += 1; };
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const svc = (path, init = {}) => fetch(`${SB}${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
const PASSWORD = "rig-access-check-only";
const grant = async (email) => (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) })).json();
const cookie = (s) => ({ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`, url: B });
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const COMPANY = "Rig Air Services"; // invented
const EMAIL = "rig-client-ui@rig.invalid";

// the requested client
let r = await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Rig Client Person" }, app_metadata: { role: "client", is_approved: false, client_status: "requested" } }) });
let u = await r.json(); if (!r.ok) { const list = await (await svc("/auth/v1/admin/users?page=1&per_page=200")).json(); u = (list.users ?? []).find((x) => x.email === EMAIL); }
const uid = u.id;
await svc(`/auth/v1/admin/users/${uid}`, { method: "PUT", body: JSON.stringify({ app_metadata: { role: "client", is_approved: false, client_status: "requested" } }) });
// A previous run's row cannot be deleted (its decisions reference it — rows are never deleted, on the rig as in production):
// put it back to "requested", emptied, or make it when there is none.
const fresh = { user_id: uid, email: EMAIL, person_name: "Rig Client Person", company: COMPANY, kind: "broker", note: "Two legs for a client of ours next week.", status: "requested", scope: [], switches: [], passenger_level: "off", consent: false, decided_at: null, decided_by: null, decided_by_email: null, decision_note: "" };
const existing = await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=id`)).json();
if (existing[0]) await svc(`/rest/v1/clients?id=eq.${existing[0].id}`, { method: "PATCH", body: JSON.stringify(fresh) });
else await svc("/rest/v1/clients", { method: "POST", body: JSON.stringify(fresh) });

const browser = await chromium.launch();
const admin = await grant("rig-access-admin@rig.invalid");
for (const theme of ["light", "dark"]) {
  for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme });
    await ctx.addCookies([cookie(admin)]); await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
    const page = await ctx.newPage();
    await page.goto(`${B}/admin/clients`, { waitUntil: "load" }); await page.waitForSelector("[data-admin-clients]", { timeout: 20000 }); await page.waitForTimeout(1500);
    // The first pass approves the client through the page; every later pass finds them under Approved.
    const approvedYet = !(theme === "light" && width === 1440);
    ok(approvedYet ? await page.locator(`[data-client-approved]`).count() >= 1 : await page.locator(`[data-client-request]`).count() >= 1, `Clients page ${theme} ${width}: the client is under ${approvedYet ? "Approved" : "Waiting"}`);
    ok(await noOverflow(page), `Clients page ${theme} ${width}: no horizontal page scroll`);
    await page.screenshot({ path: `${OUT}/client-admin-${theme}-${width}.png`, fullPage: true });
    if (theme === "light" && width === 1440) {
      await page.locator("[data-review]").first().click(); await page.waitForSelector("[data-client-editor]", { timeout: 10000 });
      const approve = page.locator("[data-approve]");
      ok(await approve.isDisabled(), "editor: Approve is disabled with no scope");
      await page.getByLabel("Scope kind").getByText("Registration").click().catch(() => {});
      await page.getByLabel("Scope value").fill("LY-TST"); await page.getByLabel("Scope value").press("Enter");
      ok(await page.locator('[data-scope-entry="registration:LY-TST"]').count() === 1, "editor: the registration is in the scope list");
      ok(await page.locator('[data-switch="flight_board"]').isDisabled(), "editor: Flight board is required (cannot be turned off)");
      await page.locator('[data-switch="limitations"]').click();
      await page.locator('[data-level="names"]').click();
      ok(await approve.isEnabled(), "editor: Approve enabled with a scope, the board and a level");
      await page.screenshot({ path: `${OUT}/client-admin-editor.png`, fullPage: true });
      await approve.click(); await page.waitForSelector(`[data-client-approved]`, { timeout: 15000 }); await page.waitForTimeout(800);
      ok(await page.locator("[data-client-approved]").count() >= 1 && await page.locator("[data-client-request]").count() === 0, "approved through the page: moved from Waiting to Approved");
      ok(await page.locator('[data-decision="approved"]').count() >= 1, "the decision log shows APPROVED");
      const row = await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=status,scope,switches,passenger_level`)).json();
      ok(row[0]?.status === "approved" && JSON.stringify(row[0]?.scope) === JSON.stringify([{ kind: "registration", value: "LY-TST" }]) && row[0]?.switches.includes("limitations") && row[0]?.passenger_level === "names", "the row: approved, scope LY-TST, limitations on, names", JSON.stringify(row[0]).slice(0, 150));
      const au = await (await svc(`/auth/v1/admin/users/${uid}`)).json();
      ok(au.app_metadata?.role === "client" && au.app_metadata?.is_approved === true && au.app_metadata?.client_status === "approved", "the account: client, approved, in app_metadata", JSON.stringify(au.app_metadata));
    }
    await ctx.close();
  }
}

// the client's own screens
let cs = await grant(EMAIL);
for (const theme of ["light", "dark"]) {
  for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme });
    await ctx.addCookies([cookie(cs)]); await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
    const page = await ctx.newPage();
    await page.goto(`${B}/client`, { waitUntil: "load" }); await page.waitForSelector("[data-client-wall]", { timeout: 20000 }); await page.waitForTimeout(2500);
    const n = await page.locator("[data-flight]").count();
    ok(n >= 1, `client wall ${theme} ${width}: the board lists their flights`, `${n} rows`);
    ok(await page.locator("[data-cw-sidebar]").count() === 0 && !(await page.content()).includes("Flight intake"), `client wall ${theme} ${width}: no portal shell in the page`);
    ok(await noOverflow(page), `client wall ${theme} ${width}: no horizontal page scroll`);
    if (width === 390) ok(await page.locator("[data-detail]").isHidden(), "client wall 390: the board comes first, the flight is not shown yet");
    await page.screenshot({ path: `${OUT}/client-wall-board-${theme}-${width}.png`, fullPage: width === 390 });
    await page.locator("[data-flight]").first().click(); await page.waitForTimeout(2500);
    ok(await page.locator("[data-detail]").isVisible(), `client wall ${theme} ${width}: a flight opens`);
    ok(await page.locator('[data-card="weather"]').count() === 1 && await page.locator('[data-card="notams"]').count() === 1 && await page.locator('[data-card="passengers"]').count() === 1, `client wall ${theme} ${width}: weather, NOTAMs and passengers (names) cards — their switches`);
    ok(await page.locator('[data-card="documents"]').count() === 0 && await page.locator(".clw-bottomnav").count() === 0 && await page.locator(".clw-topnav").count() === 0, `client wall ${theme} ${width}: no documents card, no area tabs — switches off add nothing`);
    ok(await noOverflow(page), `client wall ${theme} ${width}: no horizontal scroll with a flight open`);
    await page.screenshot({ path: `${OUT}/client-wall-flight-${theme}-${width}.png`, fullPage: width === 390 });
    if (width === 390) { await page.locator(".clw-back").click(); await page.waitForTimeout(300); ok(await page.locator("[data-board]").isVisible(), "client wall 390: ← All flights returns to the board"); }
    await ctx.close();
  }
}

// ask for access + waiting: the public page renders at both sizes; the waiting screen for a requested client
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
  await page.goto(`${B}/request-access`, { waitUntil: "load" }); await page.waitForSelector("[data-request-access]", { timeout: 20000 });
  ok(await page.getByLabel("Company *").count() === 1 && await page.locator("[data-you-are]").count() === 2 && await page.locator("[data-note]").count() === 1, "ask for access: name, company (required), email, You are, note — no password, no trip or registration field");
  ok(!(await page.content()).includes("trip number") && await page.getByText("Send request").count() === 1, "ask for access: the button says Send request");
  ok(await noOverflow(page), "ask for access 390: no horizontal scroll");
  await page.screenshot({ path: `${OUT}/client-request-390.png`, fullPage: true });
  await ctx.close();
  const l = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const lp = await l.newPage();
  await lp.goto(`${B}/login`, { waitUntil: "load" }); await lp.waitForTimeout(800);
  ok(await lp.locator("[data-client-ask]").count() === 1 && await lp.getByText("Ask for access").count() >= 1, "sign-in: the operators-and-brokers block with Ask for access");
  await lp.screenshot({ path: `${OUT}/client-signin-1440.png` });
  await l.close();
}

// change, then remove through the page: the row stays, emptied
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addCookies([cookie(admin)]); const page = await ctx.newPage();
  await page.goto(`${B}/admin/clients`, { waitUntil: "load" }); await page.waitForSelector("[data-client-approved]", { timeout: 20000 }); await page.waitForTimeout(800);
  await page.locator("[data-change]").first().click(); await page.waitForSelector("[data-client-editor]", { timeout: 10000 });
  await page.locator('[data-switch="weather"]').click(); await page.locator("[data-approve]").click(); await page.waitForTimeout(1500);
  const changed = await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=switches`)).json();
  ok(!changed[0]?.switches.includes("weather"), "Change: a switch turned off is saved", JSON.stringify(changed[0]?.switches));
  ok(await page.locator('[data-decision="changed"]').count() >= 1, "the decision log shows CHANGED");
  await page.locator("[data-change]").first().click(); await page.waitForSelector("[data-client-editor]", { timeout: 10000 });
  await page.getByRole("button", { name: "Remove access" }).first().click(); await page.waitForTimeout(500);
  ok(await page.locator("[data-remove-confirm]").isDisabled(), "Remove: confirm is disabled until the company is typed");
  await page.getByLabel("Company name to confirm").fill(COMPANY);
  ok(await page.locator("[data-remove-confirm]").isEnabled(), "Remove: typing the company enables it");
  await page.screenshot({ path: `${OUT}/client-admin-remove.png` });
  await page.locator("[data-remove-confirm]").click(); await page.waitForTimeout(2000);
  const gone = await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=status,scope,switches`)).json();
  ok(gone[0]?.status === "removed" && gone[0]?.scope.length === 0 && gone[0]?.switches.length === 0, "Removed: the row stays, emptied", JSON.stringify(gone[0]));
  const au = await (await svc(`/auth/v1/admin/users/${uid}`)).json();
  ok(au.app_metadata?.is_approved === false && au.app_metadata?.client_status === "removed", "Removed: the account is not approved, status removed", JSON.stringify(au.app_metadata));
  cs = await grant(EMAIL);
  const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await c2.addCookies([cookie(cs)]); const p2 = await c2.newPage();
  const resp = await p2.goto(`${B}/`, { waitUntil: "load" });
  ok(p2.url().includes("/client/removed") && resp && resp.status() === 200, "the removed client lands on the removed page", p2.url());
  ok(await p2.locator("[data-client-hold]").count() === 1 && await p2.locator("[data-cw-sidebar]").count() === 0, "the removed page: shell-less, with Sign out");
  await p2.screenshot({ path: `${OUT}/client-removed-1440.png` });
  await c2.close(); await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
