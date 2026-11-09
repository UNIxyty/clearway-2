// Role permissions in the browser (docs/permissions.md), after rig/permissions-check.mjs (same services, same accounts):
// the Permissions screen as an admin (grid, drift, the hard-to-undo confirmation, the history), and the wall console as
// an ops user who holds only "delete aircraft" (that button live, the rest of the page still locked). Needs the console
// served against the auth-on wall:  (cd opsboard-react && npx vite build && VITE_API_PROXY=http://127.0.0.1:5198 npx vite preview --port 4173 &)
//   node --env-file=.env.rig rig/permissions-browser.mjs  → rig/.scratch/shots/perm-*.png
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { settled, until } from "./lib/settle.mjs";
const PORTAL = "http://127.0.0.1:3992"; const CONSOLE = "http://127.0.0.1:4173";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL; const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 160)}` : ""}`); if (!c) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const session = async (email) => (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: "rig-access-check-only" }) })).json();
const browser = await chromium.launch();
async function page(email, base) {
  const s = await session(email);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const ref = new URL(SB).hostname.split(".")[0];
  await ctx.addCookies([{ name: `sb-${ref}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`, url: base }]);
  if (base === CONSOLE) await ctx.addCookies([{ name: "sb-rig-auth-token", value: encodeURIComponent(JSON.stringify([s.access_token])), url: base }]);
  return ctx.newPage();
}

// From the defaults, made here (2026-11-09): a shuffled run put temporary-access-check before this, and its grants were
// still there. The rig's own reset, the same one the runner does before the permission suites.
{ const { execFileSync } = await import("node:child_process"); execFileSync("bash", ["rig/permissions-reset.sh"], { stdio: "ignore", timeout: 120000 }); }
const admin = await page("rig-access-admin@rig.invalid", PORTAL);
await admin.goto(`${PORTAL}/admin/permissions`, { waitUntil: "load" });
await admin.waitForSelector('table[aria-label^="Permissions"]', { timeout: 30000 });
// Groups start folded (§3.1): open the three this test works in.
for (const g of ["Permissions", "Operators", "Aircraft"]) await admin.locator(`tbody[aria-label='${g}']`).getByRole("button", { expanded: false }).first().click();
{ // The legend's own words, exactly (2026-11-09): a loose match also found the change log's empty state ("Every role has
  // exactly the defaults it started with"), so this passed only when another suite (permissions-check) had already made
  // a change; a shuffled run with that suite in the other box found it. When it fails, it says what differs.
  const exact = (await admin.getByText("Exactly the defaults", { exact: true }).count()) === 1;
  let why = "";
  if (!exact) {
    const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const rows = await (await fetch(`${SB}/rest/v1/permission_grants?select=role,action,allowed,updated_by_email`, { headers: { apikey: K, authorization: `Bearer ${K}` } })).json();
    const odd = rows.filter((r) => r.updated_by_email !== "default (seed)").map((r) => `${r.role}/${r.action}=${r.allowed} by ${r.updated_by_email}`);
    why = `${await admin.getByText(/changed from the defaults/).first().innerText({ timeout: 2000 }).catch(() => "no count shown")} · ${rows.length} grant rows · not from the seed: ${odd.join("; ") || "none"}`;
  }
  ok(exact, "the screen opens on exactly the defaults", why);
}
ok(await admin.locator('[role="checkbox"][aria-label="Manage permissions (this screen) — Developer"]').isDisabled(), "Developer's Manage permissions is locked on");
ok(await admin.locator('[role="checkbox"][aria-label="Manage permissions (this screen) — Admin"]').isDisabled(), "…and so is your own role's (you cannot take it from yourself)");
const hardRow = admin.locator("tr", { hasText: "Delete an operator" }).first();
ok(/Takes its flights off the wall and stops its Leon sync/.test(await hardRow.innerText()), "a hard-to-undo action says what it does, in its row");
await admin.locator('[role="checkbox"][aria-label="Delete an operator — User"]').click();
await admin.waitForSelector('[role="dialog"]');
ok(/Takes its flights off the wall/.test(await admin.locator('[role="dialog"]').innerText()), "granting it asks first, with that warning");
await admin.screenshot({ path: `${OUT}/perm-hard-confirm.png` });
await admin.getByRole("button", { name: "Cancel" }).click();
await admin.getByRole("button", { name: "Grant everything in Aircraft for User" }).click();
await admin.waitForSelector('[role="dialog"]');
ok(/Delete an aircraft from the wall → User/.test(await admin.locator('[role="dialog"]').innerText()), "a group grant that includes something hard to undo asks first, naming it");
await admin.locator('[role="dialog"]').getByRole("button", { name: "Grant" }).click();
// the signal: both cells of the group are on and the drift count has caught up (the grid updates after the dialog closes)
await admin.waitForFunction(() => ["Delete an aircraft from the wall — User", "Show or hide aircraft on the wall — User"].every((l) => document.querySelector(`[role="checkbox"][aria-label="${l}"]`)?.getAttribute("aria-checked") === "true") && /2 cells changed from the defaults/.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
const a = admin.locator("tbody[aria-label='Aircraft']");
ok(await admin.locator('[role="checkbox"][aria-label="Delete an aircraft from the wall — User"]').isChecked() && await admin.locator('[role="checkbox"][aria-label="Show or hide aircraft on the wall — User"]').isChecked(), "one click grants a whole group (Aircraft → User)");
ok(/2 cells changed from the defaults/.test(await admin.locator("body").innerText()), "the drift count says what changed since the defaults");
await a.screenshot({ path: `${OUT}/perm-group.png` });
await admin.getByRole("button", { name: "Take away everything in Aircraft for User" }).click();
await settled(admin);
await admin.locator('[role="checkbox"][aria-label="Delete an aircraft from the wall — User"]').click();
await admin.locator('[role="dialog"]').getByRole("button", { name: "Grant" }).click(); // hard to undo: confirmed
await settled(admin);
await admin.getByRole("radio", { name: /Differs from default/ }).click();
await settled(admin);
await admin.screenshot({ path: `${OUT}/perm-drift.png`, fullPage: false });
const history = await admin.locator('table[aria-label="Permission history"]').innerText();
ok(/rig-access-admin@rig\.invalid\s+granted\s+Delete an aircraft from the wall\s+to User/.test(history), "the history names who granted what to whom", history.split("\n").slice(0, 3).join(" | "));
await admin.getByRole("radio", { name: /^All/ }).click();
await admin.locator('table[aria-label="Permission history"]').scrollIntoViewIfNeeded();
await admin.screenshot({ path: `${OUT}/perm-history.png` });

// The wall's grants cache (lib/permissions/grants.mjs): 1 s on the rig (PERMISSIONS_TTL_MS), 10 s in production. Polls
// the console until the grant shows (was a fixed 10.5 s, then 3 s).
const ops = await page("rig-access-user@rig.invalid", CONSOLE);
await until(async () => { await ops.goto(`${CONSOLE}/console/aircraft`, { waitUntil: "load" }); await settled(ops); return (await ops.getByText("View only.").count()) === 0; }, { timeout: 20000, every: 300 });
const del = ops.getByRole("button", { name: /Delete aircraft/ }).first();
const hasRows = await del.count();
ok(await ops.getByText("View only.").count() === 0, "Aircraft (ops user with 'delete aircraft'): not view-only");
ok(!hasRows || !(await del.isDisabled()), "…the delete button is live", hasRows ? "" : "no aircraft rows on the rig wall");
ok(await ops.getByRole("button", { name: "Show all" }).isDisabled(), "…showing and hiding stays locked (not granted)");
await ops.screenshot({ path: `${OUT}/perm-console-aircraft.png` });
await ops.goto(`${CONSOLE}/console/operators`, { waitUntil: "load" });
await settled(ops);
ok(await ops.getByText("View only.").count() >= 1 && await ops.getByRole("button", { name: /Add operator/ }).isDisabled(), "Operators stays view-only for them");

// Back to the defaults for the next run.
await admin.locator('[role="checkbox"][aria-label="Delete an aircraft from the wall — User"]').click();
await settled(admin);
await browser.close();
console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"} · screenshots in ${OUT}/perm-*.png`);
process.exit(failures ? 1 : 0);
