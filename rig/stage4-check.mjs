// Portal redesign, stage 4 — Settings (Appearance, Customisation, Preferences), pinned tabs and the Settings nav item —
// in the browser, on the rig (sign-in ON behind the proxy :3989):   node --env-file=.env.rig rig/stage4-check.mjs
// → rig/.scratch/shots/s4-*.png. Puts the admin's settings back as it found them.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.RIG_SHELL_URL || "http://127.0.0.1:3989";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL; const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(SB)) { console.error("refusing: not the rig's local Supabase"); process.exit(2); }
const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 220)}` : ""}`); if (!c) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const browser = await chromium.launch();
const pageErrors = [];
const cookieName = `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`;
const sess = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: "rig-access-admin@rig.invalid", password: "rig-access-check-only" }) })).json();
const userId = sess.user.id;
const srv = { "content-type": "application/json", apikey: KEY, authorization: `Bearer ${KEY}` };
const COLS = "theme,table_density,motion,start_page,pinned_tabs,dashboard_layout";
const prefs = async () => (await (await fetch(`${SB}/rest/v1/user_preferences?select=${COLS}&user_id=eq.${userId}`, { headers: srv })).json())[0] ?? {};
const putPrefs = (v) => fetch(`${SB}/rest/v1/user_preferences?user_id=eq.${userId}`, { method: "PATCH", headers: srv, body: JSON.stringify(v) });
const before = await prefs();
await putPrefs({ table_density: null, motion: null, start_page: null, pinned_tabs: null, dashboard_layout: null });
async function open(theme = "light", width = 1440) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
  await ctx.addCookies([{ name: cookieName, value: `base64-${Buffer.from(JSON.stringify(sess)).toString("base64")}`, url: BASE }]);
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("s4-init")) { sessionStorage.setItem("s4-init", "1"); for (const k of ["cw-density", "cw-motion", "cw-pins", "cw-dashboard-layout"]) localStorage.removeItem(k); } } catch { /* */ } });
  const page = await ctx.newPage(); page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 120)));
  return { ctx, page };
}
const html = (page, attr) => page.evaluate((a) => document.documentElement.getAttribute(a), attr);

{
  const { ctx, page } = await open();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "load" }); await sleep(2000);
  const groups = await page.locator("aside nav a, aside nav button").allInnerTexts().catch(() => []);
  // A top-level group that is a page itself (like Dashboard) is a button that navigates; it is the last one.
  const settingsLink = page.locator("aside").getByRole("button", { name: "Settings", exact: true }).last();
  ok(await settingsLink.count() > 0, "Settings is in the sidebar", groups.map(norm).filter(Boolean).slice(-3).join(" | "));
  await settingsLink.click(); await page.waitForURL(/\/settings$/); await page.waitForSelector('[role="radiogroup"][aria-label="Theme"]', { timeout: 30000 }); await sleep(800);
  ok(/Settings/.test(await page.locator("h1").innerText()), "it opens the Settings page");

  // Appearance
  const cards = page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio");
  ok(await cards.count() === 3 && await page.locator('[role="radio"]:has-text("Match this device") [data-theme="light"]').count() === 1 && await page.locator('[role="radio"]:has-text("Match this device") [data-theme="dark"]').count() === 1, "three theme cards; Match this device previews both, in the real tokens");
  ok(/The Digital Wall keeps its own colours and fonts\./.test(await page.locator("#appearance").innerText()) && await page.getByRole("link", { name: "Wall display settings" }).getAttribute("href") === "/digital-wall/console/settings", "it says plainly that the Digital Wall keeps its own colours and fonts");
  await cards.filter({ hasText: "Dark" }).click(); await sleep(1200);
  ok(await html(page, "data-theme") === "dark" && (await prefs()).theme === "dark" && /Saved · \d\d:\d\dZ/.test(norm(await page.locator('[role="status"]').filter({ hasText: "Saved" }).first().innerText())), "choosing Dark applies at once, saves to the account, and says it saved");
  await page.screenshot({ path: `${OUT}/s4-settings-dark.png`, fullPage: true });
  await cards.filter({ hasText: "Light" }).click(); await sleep(1000);
  ok(await html(page, "data-theme") === "light", "and Light back");

  // Pinned tabs
  await page.getByRole("button", { name: "Pin a page or airport" }).click();
  await page.getByRole("searchbox", { name: "Find a page or airport to pin" }).fill("perm"); await sleep(300);
  await page.getByRole("dialog", { name: "Pin a page or airport" }).getByRole("button", { name: /Permissions/ }).click(); await sleep(800);
  await page.getByRole("button", { name: "Pin a page or airport" }).click();
  await page.getByRole("searchbox", { name: "Find a page or airport to pin" }).fill("EVRA"); await sleep(1500);
  await page.getByRole("dialog", { name: "Pin a page or airport" }).getByRole("button", { name: /EVRA/ }).first().click(); await sleep(1000);
  const list = norm(await page.getByRole("list", { name: "Pinned" }).innerText());
  const bar = norm(await page.getByRole("navigation", { name: "Pinned" }).innerText().catch(() => ""));
  ok(/Permissions/.test(list) && /EVRA/.test(list) && /2 of 5/.test(list) && /Permissions/.test(bar) && /EVRA/.test(bar), "pin a page and an airport: listed here and beside search in the top bar", `${list} · bar: ${bar}`);
  await page.getByRole("button", { name: /^Move EVRA/ }).focus(); await page.keyboard.press("ArrowUp"); await sleep(1000);
  const saved = await prefs();
  ok(JSON.stringify((saved.pinned_tabs ?? []).map((p) => p.label)) === JSON.stringify(["EVRA", "Permissions"]), "the arrow keys reorder; the order is saved on the account", JSON.stringify(saved.pinned_tabs));
  await page.screenshot({ path: `${OUT}/s4-pins.png` });
  await page.getByRole("navigation", { name: "Pinned" }).getByRole("link", { name: "EVRA" }).click(); await page.waitForURL(/\/aip\/EVRA$/, { timeout: 20000 });
  ok(await page.getByRole("navigation", { name: "Pinned" }).getByRole("link", { name: "EVRA" }).getAttribute("aria-current") === "page", "a pin opens its page and shows as current");
  await ctx.close();
  const narrow = await open("light", 1100);
  await narrow.page.goto(`${BASE}/dashboard`, { waitUntil: "load" }); await sleep(2500);
  ok(!(await narrow.page.getByRole("navigation", { name: "Pinned" }).isVisible().catch(() => false)), "pins hide below full width (the rail)");
  await narrow.ctx.close();
}
{
  // Another browser: pins, and the rest, follow the account.
  const { ctx, page } = await open();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "load" }); await sleep(3000);
  ok(/EVRA/.test(norm(await page.getByRole("navigation", { name: "Pinned" }).innerText().catch(() => ""))), "pins follow the account to another browser");
  // Dashboard blocks
  await page.goto(`${BASE}/settings#customisation`, { waitUntil: "load" }); await page.waitForSelector("#customisation"); await sleep(800);
  ok(/6 of 6 shown/.test(await page.locator("#customisation").innerText()), "Customisation counts the dashboard's blocks");
  await page.getByRole("link", { name: /Customise dashboard/ }).click(); await page.waitForURL(/\/dashboard\?customise=1/);
  ok(await page.getByRole("button", { name: "Done" }).waitFor({ timeout: 20000 }).then(() => true, () => false), "Customise dashboard opens the dashboard in customise mode");
  // Unpin both
  await page.goto(`${BASE}/settings`, { waitUntil: "load" }); await page.waitForSelector('[aria-label="Pinned"]');
  for (const n of ["EVRA", "Permissions"]) { await page.getByRole("button", { name: `Unpin ${n}` }).click(); await sleep(600); }
  ok(/0 of 5/.test(await page.getByRole("list", { name: "Pinned" }).innerText()) && !(await page.getByRole("navigation", { name: "Pinned" }).count()), "unpin removes them from the bar");

  // Table density
  await page.getByRole("radiogroup", { name: "Table density" }).getByRole("radio", { name: "Compact" }).click(); await sleep(800);
  ok(await html(page, "data-density") === "compact" && (await prefs()).table_density === "compact", "Compact applies and saves");
  await page.goto(`${BASE}/admin/users`, { waitUntil: "load" }); await page.waitForSelector('table[aria-label="Users"] tbody tr td', { timeout: 30000 }); await sleep(500);
  // Users rows hold a name and an email on two lines, so compact stops at what that needs; a one-line row is 32px.
  const h = await page.locator('table[aria-label="Users"] tbody tr').first().evaluate((r) => r.getBoundingClientRect().height);
  const td = await page.locator('table[aria-label="Users"] tbody tr td').nth(1).evaluate((c) => getComputedStyle(c).height);
  ok(h < 45 && td !== "52px", "tables follow it: rows lose their 52px height (Users rows are as tall as their two lines)", `${h}px row`);
  await page.screenshot({ path: `${OUT}/s4-compact-users.png` });
  await page.goto(`${BASE}/settings#preferences`, { waitUntil: "load" }); await page.waitForSelector('[role="radiogroup"][aria-label="Table density"]');
  await page.getByRole("radiogroup", { name: "Table density" }).getByRole("radio", { name: "Comfortable" }).click(); await sleep(800);
  ok(await html(page, "data-density") === null, "Comfortable back");

  // Motion
  await page.getByRole("radiogroup", { name: "Motion" }).getByRole("radio", { name: "Reduce" }).click(); await sleep(800);
  const dur = await page.evaluate(() => getComputedStyle(document.querySelector('[role="radiogroup"][aria-label="Motion"] [role="radio"]')).transitionDuration);
  ok(await html(page, "data-motion") === "reduce" && (await prefs()).motion === "reduce" && /^(1e-0[56]s|0\.00000?1s|0s)$/.test(dur), "Reduce turns transitions off and saves", dur);
  await page.getByRole("radiogroup", { name: "Motion" }).getByRole("radio", { name: "Match device" }).click(); await sleep(800);
  ok(await html(page, "data-motion") === null, "Match device back");

  // Start page
  await page.getByRole("combobox", { name: "Start page" }).click(); await page.getByRole("option", { name: "Service status" }).click(); await sleep(1000);
  ok((await prefs()).start_page === "/aip/service-status", "the start page saves");
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  ok(/\/aip\/service-status$/.test(page.url()), "signing in (/) lands on the chosen start page", page.url());
  await page.goto(`${BASE}/settings#preferences`, { waitUntil: "load" }); await page.waitForSelector('[role="radiogroup"][aria-label="Motion"]'); await sleep(600);
  await page.getByRole("combobox", { name: "Start page" }).click(); await page.getByRole("option", { name: "Dashboard" }).click(); await sleep(1000);

  // A save that fails says so and offers a retry.
  await page.route(/\/api\/user\/preferences$/, (r) => (r.request().method() === "POST" ? r.fulfill({ status: 500, json: { error: "down" } }) : r.continue()));
  await page.getByRole("radiogroup", { name: "Table density" }).getByRole("radio", { name: "Compact" }).click(); await sleep(800);
  ok(await page.getByText("Couldn't save “Table density” to your account.").isVisible() && await page.getByRole("button", { name: "Retry now" }).isVisible(), "a failed save says which setting, that it applies here, and offers Retry now");
  await page.screenshot({ path: `${OUT}/s4-save-failed.png` });
  await page.unroute(/\/api\/user\/preferences$/);
  await page.getByRole("button", { name: "Retry now" }).click(); await sleep(1000);
  ok(!(await page.getByText("Couldn't save").count()) && (await prefs()).table_density === "compact", "Retry now saves it");
  await page.getByRole("radiogroup", { name: "Table density" }).getByRole("radio", { name: "Comfortable" }).click(); await sleep(800);

  // Profile points here
  await page.goto(`${BASE}/account/profile`, { waitUntil: "load" }); await page.waitForSelector('section[aria-label="Account"]', { timeout: 30000 });
  ok(await page.getByRole("link", { name: "Settings", exact: true }).filter({ hasNot: page.locator("aside *") }).last().getAttribute("href") === "/settings", "Profile points to Settings for appearance and the dashboard");
  await ctx.close();
}
for (const theme of ["light", "dark"]) {
  const s = await open(theme);
  await s.page.goto(`${BASE}/settings`, { waitUntil: "load" }); await s.page.waitForSelector('[role="radiogroup"][aria-label="Theme"]'); await sleep(1000);
  await s.page.screenshot({ path: `${OUT}/s4-settings-${theme}.png`, fullPage: true }); await s.ctx.close();
}
await putPrefs({ theme: before.theme ?? null, table_density: before.table_density ?? null, motion: before.motion ?? null, start_page: before.start_page ?? null, pinned_tabs: before.pinned_tabs ?? null, dashboard_layout: before.dashboard_layout ?? null });

ok(pageErrors.length === 0, "no page errors", pageErrors.join(" | "));
await browser.close();
console.log(failures ? `\n${failures} FAILED · ${OUT}/s4-*.png` : `\nALL PASSED · ${OUT}/s4-*.png`);
process.exit(failures ? 1 : 0);
