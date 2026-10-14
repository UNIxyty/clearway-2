// Portal redesign, stage 3, batch 1 — Permissions, Users, Maintenance — in the browser, on the rig (sign-in ON behind
// the proxy :3989, as stages 1 and 2):   node --env-file=.env.rig rig/stage3-batch1-check.mjs → rig/.scratch/shots/s3b1-*.png
// Leaves the rig as it found it: grants back to what they were, roles back, maintenance off, the test account deleted.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.RIG_SHELL_URL || "http://127.0.0.1:3989";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL; const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(SB)) { console.error("refusing: not the rig's local Supabase"); process.exit(2); }
const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 220)}` : ""}`); if (!c) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const pageErrors = [];
async function as(who) {
  const sess = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: `rig-access-${who}@rig.invalid`, password: "rig-access-check-only" }) })).json();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(sess)).toString("base64")}`, url: BASE }]);
  const page = await ctx.newPage(); page.on("pageerror", (e) => pageErrors.push(`${who}: ${String(e.message).slice(0, 100)}`));
  return { ctx, page };
}
const admin = { "content-type": "application/json", apikey: KEY, authorization: `Bearer ${KEY}` };

// ── Permissions ──────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await as("admin");
  await page.goto(`${BASE}/admin/permissions`, { waitUntil: "load" });
  await page.waitForSelector('table[aria-label="Permissions"]', { timeout: 30000 });
  const folded = await page.locator('table[aria-label="Permissions"] tbody button[aria-expanded="false"]').count();
  const actionRows = await page.locator('table[aria-label="Permissions"] [role="checkbox"]').count();
  ok(folded >= 20 && actionRows === 0, "groups open folded: no action rows, every group a row", `${folded} folded groups, ${actionRows} checkboxes`);
  const users = page.locator("tbody[aria-label='Users & access']");
  const summary = (await users.locator("tr").first().innerText()).replace(/\s+/g, " ");
  ok(/Users & access\s*\d+ actions?/.test(summary) && /(None|All|\d+\/\d+)/.test(summary), "a folded group shows how much of it each role holds", summary);
  await users.getByRole("button", { expanded: false }).first().click();
  ok(await users.getByRole("checkbox").count() >= 3, "opening a group shows its actions");
  await page.getByRole("button", { name: "Expand all" }).click(); await sleep(200);
  const allOpen = await page.locator('table[aria-label="Permissions"] tbody button[aria-expanded="false"]').count();
  await page.getByRole("button", { name: "Collapse all" }).click(); await sleep(200);
  const allShut = await page.locator('table[aria-label="Permissions"] tbody button[aria-expanded="true"]').count();
  ok(allOpen === 0 && allShut === 0, "Expand all / Collapse all");
  // Search keeps its existing behaviour, restyled; a miss says so and offers to clear.
  await page.getByRole("searchbox", { name: "Find an action" }).fill("operator"); await sleep(200);
  const strip = (await page.locator('[role="status"]', { hasText: "Showing" }).first().innerText()).replace(/\s+/g, " ");
  ok(/Showing \d+ of \d+ actions · matching “operator”/.test(strip) && await page.locator('table[aria-label="Permissions"] [role="checkbox"]').count() > 0, "searching opens the matching groups and the strip says what is hidden", strip.replace(/\s+/g, " "));
  await page.getByRole("searchbox", { name: "Find an action" }).fill("zzzz"); await sleep(200);
  ok(await page.getByText("No actions match “zzzz”").isVisible(), "no match: says so, and the change log is not affected");
  await page.locator("button", { hasText: "Clear search" }).click(); await sleep(200);
  // Differs from default: change one cell, see it, put it back.
  const before = await page.getByRole("radio", { name: /Differs from default/ }).innerText();
  await page.locator("tbody[aria-label='Developer tools']").getByRole("button", { expanded: false }).first().click();
  const cell = page.locator(`[role="checkbox"][aria-label="Edit country service statuses — User"]`);
  const label = await cell.getAttribute("aria-label");
  const wasOn = (await cell.getAttribute("aria-checked")) === "true";
  await cell.click(); if (await page.getByRole("dialog").count()) await page.getByRole("dialog").getByRole("button", { name: "Grant" }).click();
  await sleep(1500);
  await page.getByRole("radio", { name: /Differs from default/ }).click(); await sleep(300);
  const changedCell = page.locator(`td:has([role="checkbox"][aria-label="${label}"])`);
  ok(/default (on|off)/.test(await changedCell.innerText()) && await page.locator("tbody[aria-label='Developer tools']").getByText(/1 differ/).isVisible(), "a changed cell is tinted with its default written beneath; its group counts it", `${label}: ${(await changedCell.innerText()).replace(/\s+/g, " ")} · filter was “${before.replace(/\s+/g, " ")}”`);
  await page.screenshot({ path: `${OUT}/s3b1-permissions-differs.png` });
  await page.locator(`[role="checkbox"][aria-label="${label}"]`).click(); if (await page.getByRole("dialog").count()) await page.getByRole("dialog").getByRole("button", { name: "Grant" }).click();
  await sleep(1500);
  ok((await page.locator(`[role="checkbox"][aria-label="${label}"]`).count() === 0 || (await page.locator(`[role="checkbox"][aria-label="${label}"]`).getAttribute("aria-checked")) === String(wasOn)) && await page.getByText("Nothing differs from the defaults").isVisible(), "…put back: nothing differs, and the empty filter says so");
  await page.getByRole("radio", { name: /^All/ }).click();
  // Sticky role header, page scroll.
  await page.getByRole("button", { name: "Expand all" }).click(); await page.mouse.wheel(0, 2500); await sleep(400);
  const head = await page.evaluate(() => Math.round(document.querySelector('table[aria-label="Permissions"] thead').getBoundingClientRect().top));
  ok(head === 56, "the role header sticks under the top bar", `${head}px`);
  const log = page.locator('table[aria-label="Permission history"]');
  ok(/granted|took away/.test(await log.innerText()), "the change log is below the matrix, newest first");
  await page.getByRole("searchbox", { name: "Filter the change log" }).fill("zzzz"); await sleep(200);
  ok(await page.getByText("No changes match “zzzz”").isVisible(), "…and its filter says when nothing matches");
  await ctx.close();
}

// ── Users ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const pendingEmail = `rig-pending-${Date.now()}@rig.invalid`;
const created = await (await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: admin, body: JSON.stringify({ email: pendingEmail, password: "rig-access-check-only", email_confirm: true }) })).json();
await fetch(`${SB}/rest/v1/user_preferences`, { method: "POST", headers: { ...admin, prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: created.id, is_approved: false, display_name: "Rig Pending (not a person)" }) });
try {
  const { ctx, page } = await as("admin");
  await page.goto(`${BASE}/admin/users`, { waitUntil: "load" });
  await page.waitForSelector('table[aria-label="Users"] tbody tr', { timeout: 30000 }); await sleep(800);
  const tabs = (await page.getByRole("tablist", { name: "Show" }).innerText()).replace(/\s+/g, " ");
  ok(/All \d+/.test(tabs) && /Pending 1/.test(tabs), "role tabs with counts", tabs);
  await page.getByRole("tab", { name: /Pending/ }).click(); await sleep(200);
  const pendRows = page.locator('table[aria-label="Users"] tbody tr');
  ok((await pendRows.count()) === 1 && /Waiting for approval/.test(await pendRows.first().innerText()), "Pending tab: the one waiting account");
  ok(await page.locator('[role="status"]', { hasText: /Showing 1 of \d+/ }).isVisible(), "…and the strip says the rest are hidden");
  await page.screenshot({ path: `${OUT}/s3b1-users-pending.png` });
  await pendRows.first().getByRole("button", { name: "Approve" }).click();
  await page.waitForSelector('[role="status"]:has-text("is approved")', { timeout: 8000 }).catch(() => {});
  ok(await page.locator('[role="status"]', { hasText: "is approved" }).count() > 0, "Approve sits inline on a pending row and says it worked");
  await page.getByRole("tab", { name: /^All/ }).click(); await sleep(200);
  await page.getByRole("searchbox").first().fill("zzzz"); await sleep(200);
  ok(await page.getByText("No users match “zzzz”").isVisible(), "no match: says so, offers to clear");
  await page.getByRole("button", { name: "Clear search and filters" }).or(page.getByRole("button", { name: "Clear filters" })).first().click(); await sleep(200);
  // Row menu: make admin → toast with Undo → undone.
  const row = page.locator('table[aria-label="Users"] tbody tr', { hasText: "rig-access-user@rig.invalid" });
  await row.getByRole("button", { name: "Row actions" }).click();
  const items = (await page.getByRole("menu", { name: "Row actions" }).innerText()).replace(/\s+/g, " ");
  ok(/Make admin/.test(items) && /Send password reset/.test(items) && /Copy user ID/.test(items) && !/Make developer/.test(items), "row menu: make admin, password reset, copy id — and no Make developer for an admin", items);
  await page.getByRole("menuitem", { name: "Make admin" }).click();
  await page.waitForSelector('[role="status"]:has-text("is now an Admin")', { timeout: 8000 });
  ok(/ADMIN/.test(await row.innerText()), "Make admin: the row says ADMIN and a toast offers Undo");
  await page.locator('[role="status"]', { hasText: "is now an Admin" }).getByRole("button", { name: "Undo" }).click();
  await page.waitForSelector('[role="status"]:has-text("is no longer an Admin")', { timeout: 8000 }).catch(() => {});
  ok(/USER/.test(await row.innerText()), "…Undo puts it back");
  const self = page.locator('table[aria-label="Users"] tbody tr', { hasText: "· you" });
  await self.getByRole("button", { name: "Row actions" }).click();
  const selfItems = (await page.getByRole("menu", { name: "Row actions" }).innerText()).replace(/\s+/g, " ");
  ok(!/Make|Remove/.test(selfItems), "your own row offers no role change", selfItems);
  await page.keyboard.press("Escape");
  // Password reset: on the rig GoTrue has no mail server, so the real request shows its error honestly…
  await row.getByRole("button", { name: "Row actions" }).click(); await page.getByRole("menuitem", { name: "Send password reset" }).click();
  await page.waitForSelector('[role="alert"]:has-text("reset email")', { timeout: 10000 }).catch(() => {});
  ok(/Error sending recovery email/.test(await page.locator('[role="alert"]', { hasText: "reset email" }).first().innerText().catch(() => "")), "password reset reaches the auth server (the rig has no mailer: its error is shown, with Retry)");
  // …and with the server answering yes, the bulk bar sends to everyone selected.
  await page.route("**/api/admin/users/password-reset", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, sentTo: "x@rig.invalid" }) }));
  // By email, not position: the rig's second developer (rig/.scratch/make-dev2.mjs) moves the rows, and a developer's
  // row is skipped for an admin.
  for (const who of ["rig-access-admin@rig.invalid", "rig-access-user@rig.invalid"])
    await page.locator('table[aria-label="Users"] tbody tr', { hasText: who }).locator('[role="checkbox"]').click();
  const bar = page.getByRole("toolbar", { name: /2 selected/ });
  ok(await bar.isVisible(), "selecting rows replaces the toolbar with the bulk bar");
  await bar.getByRole("button", { name: "Send password reset" }).click();
  await page.waitForSelector('[role="status"]:has-text("Password reset sent to 2 people")', { timeout: 8000 }).catch(() => {});
  ok(await page.locator('[role="status"]', { hasText: "Password reset sent to 2 people" }).count() > 0, "…bulk password reset: one toast for the lot");
  ok(await page.evaluate(() => { let e = document.querySelector('table[aria-label="Users"]'); for (; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight) return false; } return true; }), "the table scrolls with the page (no box)");
  await ctx.close();
  // A user does not reach the page at all; the API says what an admin may do.
  const u = await as("user");
  await u.page.goto(`${BASE}/admin/users`, { waitUntil: "load" });
  await sleep(1500);
  ok(await u.page.getByText("Users is for Admins").isVisible() && await u.page.locator('table[aria-label="Users"]').count() === 0, "an ops user who opens the URL is told it is for Admins (the API refuses them: 403)");
  await u.ctx.close();
} finally {
  await fetch(`${SB}/auth/v1/admin/users/${created.id}`, { method: "DELETE", headers: admin });
}

// ── Maintenance ──────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await as("dev");
  // Error state first: the switch stays locked while the state is unknown.
  await page.route("**/api/admin/maintenance", (r) => (r.request().method() === "GET" ? r.fulfill({ status: 504, body: "{}" }) : r.continue()));
  await page.goto(`${BASE}/admin/maintenance`, { waitUntil: "load" }); await sleep(1500);
  ok(await page.getByText("Can't tell whether the portal is on or off").isVisible() && !(await page.getByRole("button", { name: /Turn the portal/ }).count()), "can't load the state: says so, no switch, Try again");
  await page.unroute("**/api/admin/maintenance");
  await page.getByRole("button", { name: "Try again" }).click(); await sleep(1500);
  ok(await page.getByText("The portal is live").isVisible(), "…Try again: the portal is live");
  ok(await page.getByText("When you turn it off").isVisible() && await page.getByText(/next page load/).first().isVisible(), "what turning it off does is listed before the button");
  await page.getByLabel("Message").fill("Rig check — back soon."); await page.getByLabel("Expected back").fill("10 minutes");
  ok(/Rig check — back soon\./.test(await page.getByLabel("Preview of the maintenance page").innerText()), "the preview shows the message as people will see it");
  await page.getByRole("button", { name: "Turn the portal off…" }).click();
  const dlg = page.getByRole("dialog", { name: /Turn the portal off for everyone/ });
  const go = dlg.getByRole("button", { name: "Turn off now" });
  ok(await go.isDisabled(), "the confirm asks for OFF: Turn off now is locked until it is typed");
  await dlg.getByRole("textbox").fill("of"); ok(await go.isDisabled(), "…“of” is not enough");
  await dlg.getByRole("textbox").fill("OFF"); ok(await go.isEnabled(), "…“OFF” unlocks it");
  await page.screenshot({ path: `${OUT}/s3b1-maintenance-confirm.png` });
  await go.click();
  // (the toast says the same words: wait for the card itself)
  await page.locator('section[aria-label="Current state"]', { hasText: "The portal is off for everyone" }).waitFor({ timeout: 10000 }).catch(() => {});
  try {
    const red = await page.locator('section[aria-label="Current state"] > div').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    ok(/The portal is off for everyone/.test(await page.locator('section[aria-label="Current state"]').innerText()) && /Since .*· turned off by rig-access-dev@rig\.invalid/.test(await page.locator('section[aria-label="Current state"]').innerText()), "off: the card turns red, says since when and who", (await page.locator('section[aria-label="Current state"]').innerText()).replace(/\s+/g, " "));
    ok(red === "rgb(253, 236, 236)", "…the red is the danger tint", red);
    await page.screenshot({ path: `${OUT}/s3b1-maintenance-off.png` });
    const u = await as("user");
    await u.page.goto(`${BASE}/dashboard`, { waitUntil: "load" });
    ok(/\/maintenance$/.test(new URL(u.page.url()).pathname), "…and an ops user's next page load is the maintenance page", u.page.url());
    await u.ctx.close();
  } finally {
    if (await page.getByRole("button", { name: "Turn the portal back on" }).count()) await page.getByRole("button", { name: "Turn the portal back on" }).click();
    else await page.request.post(`${BASE}/api/admin/maintenance`, { data: { enabled: false } });
    await page.locator('section[aria-label="Current state"]', { hasText: "The portal is live" }).waitFor({ timeout: 10000 }).catch(() => {});
  }
  ok(/The portal is live/.test(await page.locator('section[aria-label="Current state"]').innerText()), "turned back on: live again");
  await page.getByRole("button", { name: "Clear PDF cache…" }).click();
  ok(await page.getByRole("dialog", { name: "Clear the PDF cache?" }).isVisible(), "Clear PDF cache asks first (a modal, not the browser's confirm())");
  await page.getByRole("button", { name: "Cancel" }).click();
  await ctx.close();
  const a = await as("admin");
  await a.page.goto(`${BASE}/admin/maintenance`, { waitUntil: "load" }); await sleep(1500);
  ok(!(await a.page.getByRole("button", { name: "Turn the portal off…" }).count()) && await a.page.getByText(/needs “Turn maintenance on”/).isVisible(), "an admin without “Turn maintenance on” is told so — no dead button");
  await a.ctx.close();
}

ok(pageErrors.length === 0, "no page error on any of the three pages", pageErrors.slice(0, 3).join(" | "));
await browser.close();
console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"} · ${OUT}/s3b1-*.png`);
process.exit(failures ? 1 : 0);
