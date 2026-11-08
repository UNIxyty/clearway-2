// Our own dialogs, by keyboard (2026-11-09): the three that replaced a browser confirm() or prompt() — discarding a Help
// draft (the portal's kit), refusing a client's request (the portal's kit, with a note), deleting a wall operator (the
// wall console's own; opened and cancelled only, nothing is deleted). Each: a real dialog (role, name), focus lands
// inside (on Cancel when it destroys), Esc closes, focus returns to what opened it, and Enter does the safe thing.
// rig/check-no-browser-dialogs.mjs keeps the browser's out; this proves ours work. The sign-in-on rig, signed in as
// the rig's admin account (rig/access-accounts.mjs): Admin › Clients needs a real session. Invented data.
//   node --env-file=.env.rig rig/dialogs-check.mjs
import { chromium } from "playwright";
import { settled } from "./lib/settle.mjs";
const B = process.env.RIG_SIGNIN_BASE || "http://127.0.0.1:3989";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const H = { apikey: K, authorization: `Bearer ${K}`, "content-type": "application/json" };
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d !== "" ? `  · ${String(d).slice(0, 200)}` : ""}`); if (!c) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const focusInside = (page) => page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); const a = document.activeElement; return { inside: Boolean(d && a && d.contains(a)), text: (a?.textContent || a?.getAttribute("aria-label") || a?.tagName || "").trim().slice(0, 40), tag: a?.tagName }; });
const focusText = (page) => page.evaluate(() => { const a = document.activeElement; return (a?.textContent || a?.getAttribute("title") || a?.getAttribute("aria-label") || "").trim().slice(0, 40); });

const s = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email: "rig-access-admin@rig.invalid", password: "rig-access-check-only" }) })).json();
if (!s.access_token) { console.error("the rig's admin account cannot sign in (rig/access-accounts.mjs)"); process.exit(2); }
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`, url: B }]);
const page = await ctx.newPage();
const pageErrors = []; page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));
let browserDialogs = 0; page.on("dialog", async (d) => { browserDialogs += 1; await d.dismiss(); });
try {
  // ── 1. Help: discard a draft ──
  await page.goto(`${B}/help/new?type=question`, { waitUntil: "load" }); await settled(page);
  await page.locator("textarea").first().fill("Rig dialog check (invented)");
  const discard = page.getByRole("button", { name: "Discard", exact: true });
  await discard.click(); await sleep(300);
  const d1 = page.getByRole("dialog", { name: "Discard this draft?" });
  ok(await d1.isVisible(), "Help › Discard asks in our own dialog, named for what it does");
  ok(/deleted from this device and from the server/.test(await d1.innerText()) && (await d1.getByRole("button", { name: "Discard draft" }).count()) === 1, "…it says what will happen, and the button says what it does");
  let f = await focusInside(page);
  ok(f.inside && f.text === "Cancel", "…focus lands inside, on Cancel (it destroys, so Enter must not)", f.text);
  await page.keyboard.press("Escape"); await sleep(250);
  ok(!(await d1.isVisible()) && (await focusText(page)) === "Discard", "…Esc closes it and focus returns to Discard", await focusText(page));
  await discard.click(); await sleep(250); await page.keyboard.press("Enter"); await sleep(300);
  ok(!(await d1.isVisible()) && /\/help\/new/.test(page.url()) && (await page.locator("textarea").first().inputValue()).includes("Rig dialog check"), "…Enter on its first focus keeps the draft (Cancel), nothing discarded");
  await discard.click(); await sleep(250); await page.getByRole("button", { name: "Discard draft" }).click();
  await page.waitForURL(/\/help(\?|$)/, { timeout: 10000 }).catch(() => {});
  ok(/\/help(\?|$)/.test(new URL(page.url()).pathname + new URL(page.url()).search) || new URL(page.url()).pathname === "/help", "…Discard draft discards and goes back to Help", new URL(page.url()).pathname);

  // ── 2. Admin › Clients: refuse a request, with a note ──
  const company = `Rig Dialog Air ${Date.now().toString(36)}`;
  const made = await (await fetch(`${SB}/rest/v1/clients`, { method: "POST", headers: { ...H, prefer: "return=representation" }, body: JSON.stringify({ email: `rig-dialog-${Date.now()}@rig.invalid`, person_name: "Rig Dialog Person", company, kind: "operator", note: "Invented, rig dialogs check.", status: "requested", scope: [], switches: [] }) })).json();
  const row = Array.isArray(made) ? made[0] : null;
  ok(Boolean(row?.id), "an invented request is filed", row?.id ? "" : JSON.stringify(made).slice(0, 160));
  await page.goto(`${B}/admin/clients`, { waitUntil: "load" }); await settled(page);
  const line = page.locator(`[data-client-request="${row?.id}"]`);
  const refuse = line.getByRole("button", { name: "Refuse", exact: true }).first();
  await refuse.click(); await sleep(300);
  const d2 = page.getByRole("dialog", { name: `Refuse the request from ${company}?` });
  ok(await d2.isVisible(), "Admin › Clients › Refuse asks in our own dialog, naming the company");
  ok(/gets an email saying the request was refused, with the note below/.test(await d2.innerText()), "…it says what will happen");
  f = await focusInside(page);
  ok(f.inside && f.tag === "TEXTAREA", "…focus lands inside, in the note", f.tag);
  await page.keyboard.press("Escape"); await sleep(250);
  ok(!(await d2.isVisible()) && (await focusText(page)) === "Refuse", "…Esc closes it and focus returns to Refuse", await focusText(page));
  await refuse.click(); await sleep(250);
  await d2.locator("textarea").fill("Invented note from the rig check.");
  await d2.getByRole("button", { name: "Refuse request" }).click(); await sleep(1500);
  const after = (await (await fetch(`${SB}/rest/v1/clients?id=eq.${row?.id}&select=status`, { headers: H })).json())[0];
  ok(!(await d2.isVisible()) && after?.status === "refused", "…Refuse request refuses it, and the dialog closes", after?.status);

  // ── 3. The wall console: delete an operator (opened and cancelled, nothing deleted) ──
  const count = async () => (await (await fetch(`${SB}/rest/v1/leon_operators?select=opr_id`, { headers: H })).json()).length;
  const before = await count();
  // the console as the runner serves it to suites: vite preview on :4173 against the sign-in-on wall (preview 5198)
  const CONSOLE = process.env.RIG_CONSOLE || "http://127.0.0.1:4173";
  await ctx.addCookies([{ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`, url: CONSOLE }, { name: "sb-rig-auth-token", value: encodeURIComponent(JSON.stringify([s.access_token])), url: CONSOLE }]);
  await page.goto(`${CONSOLE}/console/operators`, { waitUntil: "load" }); await settled(page);
  const del = page.getByTitle("Delete operator").first();
  await del.waitFor({ timeout: 15000 }).catch(() => {});
  await del.click(); await sleep(300);
  const d3 = page.getByRole("dialog").filter({ hasText: "Delete operator" });
  ok(await d3.isVisible(), "the wall console's Delete operator asks in its own dialog, named");
  ok(/cannot be undone/.test(await d3.innerText()), "…it says what will happen");
  f = await focusInside(page);
  ok(f.inside && f.text === "Cancel", "…focus lands inside, on Cancel", f.text);
  await page.keyboard.press("Tab"); f = await focusInside(page); await page.keyboard.press("Tab"); const f2 = await focusInside(page);
  ok(f.inside && f2.inside, "…Tab stays inside the dialog", `${f.text} → ${f2.text}`);
  await page.keyboard.press("Escape"); await sleep(250);
  ok(!(await d3.isVisible()), "…Esc closes it");
  ok(/Delete operator/.test(await focusText(page)), "…and focus returns to the delete button", await focusText(page));
  await del.click(); await sleep(250); await page.keyboard.press("Enter"); await sleep(400);
  ok(!(await d3.isVisible()) && (await count()) === before, "…Enter on its first focus cancels: no operator deleted", `${before} → ${await count()}`);

  ok(browserDialogs === 0, "no browser dialog opened at any point", browserDialogs);
  ok(pageErrors.length === 0, "no page errors", pageErrors.slice(0, 2).join(" | "));
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
