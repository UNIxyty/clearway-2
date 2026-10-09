// Portal foundations 1.1, the console side: an ordinary signed-in user sees the admin pages view-only (a note at the
// top, change controls disabled) and the big screen / wall-wide settings locked; an admin sees none of that.
// Needs the auth-on rig wall (rig/wall/access-check.mjs header; run that first — it makes the two accounts) and the
// built console served against it:
//   (cd opsboard-react && npx vite build && VITE_API_PROXY=http://127.0.0.1:5198 npx vite preview --port 4173 &)
//   node --env-file=.env.rig rig/wall/browser-access.mjs  → rig/.scratch/shots/access-*.png
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.RIG_CONSOLE_URL || "http://127.0.0.1:4173";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 160)}` : ""}`); if (!c) failures += 1; };

const token = async (email) => (await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password: "rig-access-check-only" }) })).json()).access_token;
const browser = await chromium.launch();
async function as(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([{ name: "sb-rig-auth-token", value: encodeURIComponent(JSON.stringify([await token(email)])), url: BASE }]);
  return ctx.newPage();
}
const disabledNamed = (page, re) => page.getByRole("button", { name: re }).first().isDisabled();

const user = await as("rig-access-user@rig.invalid");
await user.goto(`${BASE}/console/operators`, { waitUntil: "load" });
await user.waitForTimeout(2500);
ok(await user.getByText("View only.").count() >= 1, "Operators (ordinary user): the view-only note is shown");
ok(await disabledNamed(user, /Add operator/i), "…Add operator is disabled");
ok(!(await disabledNamed(user, /Force sync/i)), "…Force sync (a read) still works");
await user.screenshot({ path: `${OUT}/access-operators-user.png` });

await user.goto(`${BASE}/console/settings`, { waitUntil: "load" });
await user.waitForTimeout(2500);
await user.getByText("Main wall (ops room)").click();
await user.waitForTimeout(2500);
ok(await user.getByText(/The big screen's settings are an admin's to change/).count() === 1, "Settings → Main wall (ordinary user): locked, with the reason");
ok(await user.locator("fieldset[disabled] input").count() > 0, "…its sliders and inputs are disabled");
await user.screenshot({ path: `${OUT}/access-settings-bigscreen-user.png` });
await user.getByText("rig-access-user@rig.invalid", { exact: true }).click();
await user.waitForTimeout(2500);
ok(await user.locator("fieldset[disabled]").count() === 0, "Settings → My view (ordinary user): editable");
await user.getByRole("button", { name: "Wall content" }).click();
await user.waitForTimeout(600);
ok(await user.getByText("These settings apply to every wall; only an admin can change them.").count() === 1, "Settings → Wall content (ordinary user): locked, with the reason");
await user.screenshot({ path: `${OUT}/access-settings-wall-user.png` });

const admin = await as("rig-access-admin@rig.invalid");
await admin.goto(`${BASE}/console/operators`, { waitUntil: "load" });
await admin.waitForTimeout(2500);
ok(await admin.getByText("View only.").count() === 0 && !(await disabledNamed(admin, /Add operator/i)), "Operators (admin): no note, Add operator enabled");
await admin.goto(`${BASE}/console/settings`, { waitUntil: "load" });
await admin.waitForTimeout(2500);
await admin.getByText("Main wall (ops room)").click();
await admin.waitForTimeout(600);
ok(await admin.locator("fieldset[disabled]").count() === 0, "Settings → Main wall (admin): editable");
await admin.screenshot({ path: `${OUT}/access-settings-bigscreen-admin.png` });

await browser.close();
console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"} · screenshots in ${OUT}/access-*.png`);
process.exit(failures ? 1 : 0);
