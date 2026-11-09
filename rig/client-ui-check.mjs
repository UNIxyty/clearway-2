// The client screens (Stage 5, 2026-10-25): Admin › Clients, the ask-for-access page and the client
// wall, at 1440 and 390, light and dark, with no horizontal page scroll. Invented names only. On the sign-in rig: a
// client account is made with the service key, left "requested", then approved THROUGH THE ADMIN PAGE (scope by
// registration, a switch toggled, the passenger level set), looked at as the client, changed, and removed by typing the
// company — the row stays, emptied. Screenshots in rig/.scratch/shots/client-*.png.
//   node --env-file=.env.rig rig/client-ui-check.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import { settled } from "./lib/settle.mjs";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const B = (process.env.RIG_SIGNIN_BASE || "http://127.0.0.1:3989"), OUT = "rig/.scratch/shots"; fs.mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 170)}` : ""}`); if (!c) failures += 1; };
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const svc = (path, init = {}) => fetch(`${SB}${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PASSWORD = "rig-access-check-only";
const grant = async (email) => (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) })).json();
const cookie = (s) => ({ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`, url: B });
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
// A phone screenshot is the screen as the phone shows it, tab bar at the bottom, and a second one scrolled to the end
// (2026-11-09: a full-page capture drew the sticky tab bar across the middle of the page). A desk one is the window.
const shot = async (page, file, width, { whole = false } = {}) => {
  if (width !== 390) { await page.screenshot({ path: file, fullPage: whole }); return; }
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: file });
  const more = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 40);
  if (more) { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(150); await page.screenshot({ path: file.replace(/\.png$/, "-end.png") }); await page.evaluate(() => window.scrollTo(0, 0)); }
};
const COMPANY = "Rig Air Services"; // invented
const EMAIL = "rig-client-ui@rig.invalid";

// the requested client
let r = await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Rig Client Person" }, app_metadata: { role: "client", is_approved: false, client_status: "requested" } }) });
let u = await r.json(); if (!r.ok) { const list = await (await svc("/auth/v1/admin/users?page=1&per_page=200")).json(); u = (list.users ?? []).find((x) => x.email === EMAIL); }
const uid = u.id;
// (the password too: this check changes it on the Account page and puts it back, and a run stopped in between left the
// next run unable to sign in, 2026-11-09)
await svc(`/auth/v1/admin/users/${uid}`, { method: "PUT", body: JSON.stringify({ password: PASSWORD, app_metadata: { role: "client", is_approved: false, client_status: "requested" } }) });
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
    await page.goto(`${B}/admin/clients`, { waitUntil: "load" }); await page.waitForSelector("[data-admin-clients]", { timeout: 20000 }); await settled(page);
    // The first pass approves the client through the page; every later pass finds them under Approved.
    const approvedYet = !(theme === "light" && width === 1440);
    ok(approvedYet ? await page.locator(`[data-client-approved]`).count() >= 1 : await page.locator(`[data-client-request]`).count() >= 1, `Clients page ${theme} ${width}: the client is under ${approvedYet ? "Approved" : "Waiting"}`);
    ok(await noOverflow(page), `Clients page ${theme} ${width}: no horizontal page scroll`);
    await page.screenshot({ path: `${OUT}/client-admin-${theme}-${width}.png`, fullPage: true });
    if (theme === "light" && width === 1440) {
      await page.locator("[data-review]").first().click(); await page.waitForSelector("[data-client-editor]", { timeout: 10000 });
      const approve = page.locator("[data-approve]");
      ok(await approve.isDisabled(), "editor: Approve is disabled with no scope");
      // the scope field suggests real records only (2026-11-02): type, then take the fleet's LY-TST from the suggestions
      const scopeBox = page.getByRole("combobox", { name: "Add to scope" });
      await scopeBox.click(); await page.keyboard.type("LY-TST");
      const opt = page.locator('[data-suggestions] [data-option="registration:LY-TST"]');
      await opt.waitFor({ timeout: 15000 }); await opt.dispatchEvent("mousedown");
      ok(await page.locator('[data-scope-entry="registration:LY-TST"]').count() === 1, "editor: the registration is in the scope list");
      ok(await page.locator('[data-switch="flight_board"]').isDisabled(), "editor: Flight board is required (cannot be turned off)");
      await page.locator('[data-switch="limitations"]').click();
      await page.locator('[data-level="names"]').click();
      ok(await approve.isEnabled(), "editor: Approve enabled with a scope, the board and a level");
      await page.screenshot({ path: `${OUT}/client-admin-editor.png`, fullPage: true });
      await approve.click(); await page.waitForSelector(`[data-client-approved]`, { timeout: 15000 }); await settled(page);
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
    await page.goto(`${B}/client`, { waitUntil: "load" }); await page.waitForSelector("[data-client-wall]", { timeout: 20000 }); await settled(page);
    const n = await page.locator("[data-flight]").count();
    ok(n >= 1, `client wall ${theme} ${width}: the board lists their flights`, `${n} rows`);
    ok(await page.locator("[data-cw-sidebar]").count() === 0 && !(await page.content()).includes("Flight intake"), `client wall ${theme} ${width}: no portal shell in the page`);
    ok(await noOverflow(page), `client wall ${theme} ${width}: no horizontal page scroll`);
    if (width === 390) ok(await page.locator("[data-detail]").isHidden(), "client wall 390: the board comes first, the flight is not shown yet");
    await shot(page, `${OUT}/client-wall-board-${theme}-${width}.png`, width);
    await page.locator("[data-flight]").first().click(); await settled(page);
    ok(await page.locator("[data-detail]").isVisible(), `client wall ${theme} ${width}: a flight opens`);
    ok(await page.locator('[data-card="weather"]').count() === 1 && await page.locator('[data-card="notams"]').count() === 1 && await page.locator('[data-card="passengers"]').count() === 1, `client wall ${theme} ${width}: weather, NOTAMs and passengers (names) cards — their switches`);
    ok(await page.locator('[data-card="documents"]').count() === 0 && await page.locator(".clw-topnav").count() === 0 && JSON.stringify((await page.locator(".clw-bottomnav a").allInnerTexts()).map((x) => x.trim())) === JSON.stringify(["Flights", "Account"]), `client wall ${theme} ${width}: no documents card, no area tabs but Flights and Account — switches off add nothing`);
    ok(await noOverflow(page), `client wall ${theme} ${width}: no horizontal scroll with a flight open`);
    await shot(page, `${OUT}/client-wall-flight-${theme}-${width}.png`, width);
    if (width === 390) { await page.locator(".clw-back").click(); await settled(page); ok(await page.locator("[data-board]").isVisible(), "client wall 390: ← All flights returns to the board"); }
    await ctx.close();
  }
}

// the client's reference areas, switched on for this part (2026-11-07): /client/documents and /client/airports are
// behind the client's own switches, so the dark audit (which walks pages as staff, who get 404 there) cannot see them
{
  const before = (await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=switches`)).json())[0]?.switches ?? [];
  const on = [...new Set([...before, "documents", "airport_search"])];
  await svc(`/rest/v1/clients?user_id=eq.${uid}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ switches: on }) });
  await sleep(1500);   // the portal's and the wall's permission caches (PERMISSIONS_TTL_MS=1000 on the rig)
  try {
    // Flights with all three areas on: the menu a small portal has, on the desk and on the phone (2026-11-09)
    for (const theme of ["light", "dark"]) for (const width of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme });
      await ctx.addCookies([cookie(cs)]); await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
      const page = await ctx.newPage(); await page.goto(`${B}/client`, { waitUntil: "load" }); await page.waitForSelector("[data-client-wall]", { timeout: 20000 }); await settled(page);
      const nav = width === 390 ? ".clw-bottomnav" : ".clw-topnav";
      const items = await page.locator(`${nav} a`).allInnerTexts();
      ok(JSON.stringify(items.map((x) => x.trim())) === JSON.stringify(width === 390 ? ["Flights", "Airports", "Documents", "Account"] : ["Flights", "Airports", "Documents"]), `client flights ${theme} ${width}: the menu is Flights, Airports, Documents${width === 390 ? ", and Account as the last tab" : ""}`, items.join(" | "));
      if (width === 390) ok(await page.evaluate(() => { const n = document.querySelector(".clw-bottomnav"); return !!n && !n.nextElementSibling; }), `client flights ${theme} 390: the tab bar is the last thing on the screen`);
      ok(await noOverflow(page), `client flights ${theme} ${width}: no horizontal page scroll`);
      await shot(page, `${OUT}/client-flights-3areas-${theme}-${width}.png`, width);
      await ctx.close();
    }
    for (const theme of ["light", "dark"]) for (const width of [1440, 390]) for (const area of ["documents", "airports"]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme });
      await ctx.addCookies([cookie(cs)]); await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
      const page = await ctx.newPage();
      const res = await page.goto(`${B}/client/${area}`, { waitUntil: "load" }); await settled(page);
      const bg = await page.evaluate(() => { const c = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [255, 255, 255]; return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; });
      ok(res?.status() === 200 && !/could not be found|404/i.test(await page.locator("h1").first().innerText().catch(() => "")), `client ${area} ${theme} ${width}: the page opens for the client`, res?.status());
      ok(theme === "dark" ? bg < 0.25 : bg > 0.75, `client ${area} ${theme} ${width}: the page is in the ${theme} theme`, bg.toFixed(2));
      ok(await page.locator("[data-cw-sidebar]").count() === 0, `client ${area} ${theme} ${width}: no portal shell`);
      ok(await noOverflow(page), `client ${area} ${theme} ${width}: no horizontal page scroll`);
      // a finished small product, not an empty big one (2026-11-09): the page starts at the top, says what it is for,
      // and draws no empty box (the title once stretched and pushed everything to the bottom of the screen)
      const top = await page.locator(`[data-tab="${area}"] .clw-h`).boundingBox();
      ok(top && top.y < 160, `client ${area} ${theme} ${width}: the page starts at the top`, top ? Math.round(top.y) : "no title");
      ok(await page.locator(".clw-results:visible").evaluateAll((els) => els.every((e) => e.children.length > 0)), `client ${area} ${theme} ${width}: no empty box drawn`);
      if (area === "airports") {
        ok(await page.locator("[data-my-airports] .clw-pick").count() >= 1, `client airports ${theme} ${width}: the airports on their flights are one tap away`);
        await page.locator('[aria-label="Search airports"]').fill("QQQQZZZZ"); await page.locator("[data-no-match]").waitFor({ timeout: 8000 }).catch(() => {});
        ok(/No airport matches/.test(await page.locator("[data-no-match]").innerText().catch(() => "")), `client airports ${theme} ${width}: a search with no match says so in words`);
        await page.locator('[aria-label="Search airports"]').fill("");
      }
      await shot(page, `${OUT}/client-${area}-${theme}-${width}.png`, width);
      await ctx.close();
    }
  } finally {
    await svc(`/rest/v1/clients?user_id=eq.${uid}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ switches: before }) });
  }
}

// the client's Account page (2026-11-09): who they are, a password change, the address to write to, signing out. On a
// phone it is the last tab, used with one thumb: every control 44px or more, nothing wider than the screen.
{
  const MOCK = "http://127.0.0.1:3996";   // the rig's mock mail service (as rig/client-onboarding-check.mjs)
  // the address clients write to is a setting (app_settings, Admin › Clients): this check sets its own, an invented one
  const contact = "rig-client-help@rig.invalid";
  await svc("/rest/v1/app_settings?on_conflict=key", { method: "POST", headers: { prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: "clients.support_email", value: { email: contact }, updated_by_email: "rig/client-ui-check" }) });
  for (const theme of ["light", "dark"]) for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme, hasTouch: width === 390 });
    await ctx.addCookies([cookie(cs)]); await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
    const page = await ctx.newPage();
    // reached the way a person does: the avatar on a desk, the last tab on a phone
    await page.goto(`${B}/client`, { waitUntil: "load" }); await page.waitForSelector("[data-client-wall]", { timeout: 20000 }); await settled(page);
    if (width === 390) await page.locator(".clw-bottomnav a").last().click(); else await page.locator("[data-account-link]").click();
    await page.waitForSelector('[data-tab="account"]', { timeout: 15000 }); await settled(page);
    const tag = `client account ${theme} ${width}`;
    ok(new URL(page.url()).pathname === "/client/account", `${tag}: ${width === 390 ? "the last tab" : "the avatar"} opens it`, page.url());
    const bg = await page.evaluate(() => { const c = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [255, 255, 255]; return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; });
    ok(theme === "dark" ? bg < 0.25 : bg > 0.75, `${tag}: the page is in the ${theme} theme`, bg.toFixed(2));
    ok(await page.locator("[data-cw-sidebar]").count() === 0 && await noOverflow(page), `${tag}: no portal shell, no horizontal page scroll`);
    ok((await page.locator("[data-account-email]").innerText()).trim() === EMAIL && (await page.locator('[data-card="you"]').innerText()).includes(COMPANY), `${tag}: says who is signed in, and for which company`);
    ok(contact ? (await page.locator("[data-client-contact] a").getAttribute("href")) === `mailto:${contact}` : await page.locator("[data-client-contact]").count() === 0, `${tag}: the address to write to is the client contact setting`, contact || "(empty)");
    const small = await page.locator('[data-tab="account"] button, [data-tab="account"] input').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 43.5).map((e) => `${e.tagName.toLowerCase()} ${Math.round(e.getBoundingClientRect().height)}px`));
    ok(small.length === 0, `${tag}: every button and field is at least 44px tall`, small.join(", "));
    const wide = await page.locator('[data-tab="account"] *').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).length);
    ok(wide === 0, `${tag}: nothing runs past the edge of the screen`, wide);
    if (width === 390) {
      ok(await page.locator(".clw-bottomnav a.on").innerText().then((t) => t.trim() === "Account", () => false), `${tag}: the Account tab is marked as the current one`);
      ok(await page.locator(".clw-head .clw-signout").isHidden() && await page.locator("[data-signout]").isVisible(), `${tag}: Sign out is on this page (the header keeps the room for the company's name)`);
      ok(await page.evaluate(() => { const n = document.querySelector(".clw-bottomnav"); return !!n && !n.nextElementSibling; }), `${tag}: the tab bar is the last thing on the screen`);
    } else ok(await page.locator(".clw-head .clw-signout").isVisible(), `${tag}: Sign out is in the header too`);
    await shot(page, `${OUT}/client-account-${theme}-${width}.png`, width);
    await ctx.close();
  }
  // the password change, on the phone: refused in words, changed only with the current password, said only once done
  const NEW = "rig-access-check-only-changed-1";
  const sentBefore = MOCK ? (await (await fetch(`${MOCK}/_rig/sent`)).json()).length : 0;
  const other = await grant(EMAIL);   // a second device, signed in before the change
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }); await ctx.addCookies([cookie(cs)]);
  const page = await ctx.newPage(); let dialogs = 0; page.on("dialog", async (d) => { dialogs += 1; await d.dismiss(); });
  try {
  await page.goto(`${B}/client/account`, { waitUntil: "load" }); await page.waitForSelector('[data-tab="account"]', { timeout: 15000 }); await settled(page);
  const cur = page.locator('input[name="current"]'), nxt = page.locator('input[name="next"]'), go = page.locator("[data-change-password]");
  await go.click();
  ok(/Enter your current password/.test(await page.locator("[data-password-error]").innerText().catch(() => "")), "client account: an empty form is refused in words");
  await cur.fill(PASSWORD); await nxt.fill("short"); await go.click();
  ok(/at least 10 characters/.test(await page.locator("[data-password-error]").innerText().catch(() => "")), "client account: a short new password is refused");
  await cur.fill("rig-access-check-only-wrong"); await nxt.fill(NEW); await go.click(); await page.locator("[data-password-error]").waitFor({ timeout: 15000 }).catch(() => {});
  ok(/isn't your current password/.test(await page.locator("[data-password-error]").innerText().catch(() => "")) && await page.locator("[data-password-changed]").count() === 0, "client account: a wrong current password is refused by the server, and nothing says changed");
  ok((await grant(EMAIL)).access_token, "…and the password is still the old one");
  await cur.fill(PASSWORD); await nxt.fill(NEW); await go.click(); await page.locator("[data-password-changed]").waitFor({ timeout: 20000 }).catch(() => {});
  const said = await page.locator("[data-password-changed]").innerText().catch(() => "");
  ok(/Password changed\./.test(said) && /other devices are signed out/.test(said), "client account: the right current password changes it, and the page says so once the server has", said.slice(0, 120));
  ok(await cur.inputValue() === "" && await nxt.inputValue() === "", "…the fields are emptied");
  const withOld = await grant(EMAIL);
  const withNew = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: NEW }) })).json();
  ok(!withOld.access_token && Boolean(withNew.access_token), "…the old password no longer signs in; the new one does");
  const refreshed = await (await fetch(`${SB}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ refresh_token: other.refresh_token }) })).json();
  ok(!refreshed.access_token, "…the second device's session is ended (it cannot refresh)", refreshed.error_code ?? refreshed.msg ?? "");
  await page.reload({ waitUntil: "load" }); await page.waitForSelector('[data-tab="account"]', { timeout: 15000 }).catch(() => {});
  ok(new URL(page.url()).pathname === "/client/account", "…and this device stays signed in", page.url());
  if (MOCK) {
    let note = null; for (let i = 0; i < 40 && !note; i += 1) { note = (await (await fetch(`${MOCK}/_rig/sent`)).json()).slice(sentBefore).find((e) => [].concat(e.to).includes(EMAIL) && /password was changed/i.test(e.subject)); if (!note) await sleep(250); }
    ok(Boolean(note) && /^Clearway </.test(String(note?.from)) && /A note went to/.test(said), "…the client is told by email, from the brand's sender", note ? `${note.from} · ${note.subject}` : "none");
  }
  // signing out from the page, then the old password back for the rest of this check
  await page.locator("[data-signout]").click(); await page.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {});
  ok(new URL(page.url()).pathname === "/login", "client account: Sign out goes to the sign-in page", page.url());
  const after = await page.goto(`${B}/client/account`, { waitUntil: "load" });
  ok(new URL(page.url()).pathname === "/login" && after?.status() === 200, "…and the account page then asks for a sign-in");
  // the sign-in page itself, typed as a person does, with the new password: Flights is where a client lands
  await page.goto(`${B}/login`, { waitUntil: "load" }); await settled(page);
  await page.locator('input[type="email"]').first().fill(EMAIL); await page.locator('input[type="password"]').first().fill(NEW); await page.keyboard.press("Enter");
  await page.waitForURL((u) => new URL(u).pathname.startsWith("/client"), { timeout: 20000 }).catch(() => {});
  await page.waitForSelector("[data-client-wall]", { timeout: 20000 }).catch(() => {});
  ok(new URL(page.url()).pathname === "/client" && await page.locator("[data-client-wall]").count() === 1, "client sign-in: the sign-in page, with the new password, lands on Flights", page.url());
  ok(dialogs === 0, "client account: no browser dialog at any point", dialogs);
  } catch (e) { ok(false, "client account: the password walk ran to its end", String(e?.message ?? e).split("\n")[0]); }
  finally { await ctx.close().catch(() => {}); await svc(`/auth/v1/admin/users/${uid}`, { method: "PUT", body: JSON.stringify({ password: PASSWORD }) }); }   // the rig password back, whatever happened
  cs = await grant(EMAIL);
  ok(Boolean(cs.access_token), "(the rig password is back for the rest of this check)");
}

// ask for access: the public page renders at both sizes
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
  await page.goto(`${B}/request-access`, { waitUntil: "load" }); await page.waitForSelector("[data-request-access]", { timeout: 20000 });
  ok(await page.getByLabel("Company *").count() === 1 && await page.locator("[data-you-are]").count() === 2 && await page.locator("[data-note]").count() === 1, "ask for access: name, company (required), email, You are, note — no password, no trip or registration field");
  ok(!(await page.content()).includes("trip number") && await page.getByText("Send request").count() === 1, "ask for access: the button says Send request");
  ok(await noOverflow(page), "ask for access 390: no horizontal scroll");
  await page.screenshot({ path: `${OUT}/client-request-390.png`, fullPage: true });
  await ctx.close();
  const l = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const lp = await l.newPage();
  await lp.goto(`${B}/login`, { waitUntil: "load" }); await settled(lp);
  ok(await lp.locator("[data-client-ask]").count() === 1 && await lp.getByText("Ask for access").count() >= 1, "sign-in: the operators-and-brokers block with Ask for access");
  await lp.screenshot({ path: `${OUT}/client-signin-1440.png` });
  await l.close();
}

// change, then remove through the page: the row stays, emptied
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addCookies([cookie(admin)]); const page = await ctx.newPage();
  await page.goto(`${B}/admin/clients`, { waitUntil: "load" }); await page.waitForSelector("[data-client-approved]", { timeout: 20000 }); await settled(page);
  await page.locator("[data-change]").first().click(); await page.waitForSelector("[data-client-editor]", { timeout: 10000 });
  await page.locator('[data-switch="weather"]').click(); await page.locator("[data-approve]").click(); await settled(page);
  const changed = await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=switches`)).json();
  ok(!changed[0]?.switches.includes("weather"), "Change: a switch turned off is saved", JSON.stringify(changed[0]?.switches));
  ok(await page.locator('[data-decision="changed"]').count() >= 1, "the decision log shows CHANGED");
  await page.locator("[data-change]").first().click(); await page.waitForSelector("[data-client-editor]", { timeout: 10000 });
  await page.getByRole("button", { name: "Remove access" }).first().click(); await settled(page);
  ok(await page.locator("[data-remove-confirm]").isDisabled(), "Remove: confirm is disabled until the company is typed");
  await page.getByLabel("Company name to confirm").fill(COMPANY);
  ok(await page.locator("[data-remove-confirm]").isEnabled(), "Remove: typing the company enables it");
  await page.screenshot({ path: `${OUT}/client-admin-remove.png` });
  await page.locator("[data-remove-confirm]").click(); await settled(page);
  const gone = await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=status,scope,switches`)).json();
  ok(gone[0]?.status === "removed" && gone[0]?.scope.length === 0 && gone[0]?.switches.length === 0, "Removed: the row stays, emptied", JSON.stringify(gone[0]));
  const au = await (await svc(`/auth/v1/admin/users/${uid}`)).json();
  ok(au.app_metadata?.is_approved === false && au.app_metadata?.client_status === "removed", "Removed: the account is not approved, status removed", JSON.stringify(au.app_metadata));
  cs = await grant(EMAIL);
  const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await c2.addCookies([cookie(cs)]); const p2 = await c2.newPage();
  const resp = await p2.goto(`${B}/`, { waitUntil: "load" });
  ok(p2.url().includes("/client/removed") && resp && resp.status() === 200, "the removed client lands on the removed page", p2.url());
  // the client's layout reads their standing on the server (2026-11-04), so the page streams in after a blank skeleton: wait for it
  await p2.waitForSelector("[data-client-hold]", { timeout: 15000 }).catch(() => {});
  ok(await p2.locator("[data-client-hold]").count() === 1 && await p2.locator("[data-cw-sidebar]").count() === 0 && await p2.locator("[data-client-shell]").count() === 0, "the removed page: shell-less (no portal shell, no client shell, no menu), with Sign out");
  await p2.screenshot({ path: `${OUT}/client-removed-1440.png` });
  await c2.close(); await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
