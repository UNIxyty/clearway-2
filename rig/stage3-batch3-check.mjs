// Portal redesign, stage 3, batch 3 — Agent settings, Agent sites, Inbox, Profile, and the agent panel's recent threads —
// in the browser, on the rig (sign-in ON behind the proxy :3989):
//   node --env-file=.env.rig rig/stage3-batch3-check.mjs → rig/.scratch/shots/s3b3-*.png
// Creates its own help thread and site requests through the real APIs and deletes them at the end. It never sends a
// real email change or password reset (the rig has no mailer): those flows are checked up to the request.
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
const sessions = {};
const cookieName = `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`;
async function session(who) {
  return (sessions[who] ??= await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: `rig-access-${who}@rig.invalid`, password: "rig-access-check-only" }) })).json());
}
const cookieOf = async (who) => `${cookieName}=base64-${Buffer.from(JSON.stringify(await session(who))).toString("base64")}`;
async function as(who, theme = "light") {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  await ctx.addCookies([{ name: cookieName, value: `base64-${Buffer.from(JSON.stringify(await session(who))).toString("base64")}`, url: BASE }]);
  await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch { /* */ } }, theme);
  const page = await ctx.newPage(); page.on("pageerror", (e) => pageErrors.push(`${who}: ${String(e.message).slice(0, 120)}`));
  return { ctx, page };
}
const api = async (who, path, body, method = "POST") => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { cookie: await cookieOf(who), "content-type": "application/json", accept: "application/json", "x-clearway-client": "extension" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const srv = { "content-type": "application/json", apikey: KEY, authorization: `Bearer ${KEY}` };
const rest = (path, init = {}) => fetch(`${SB}/rest/v1/${path}`, { headers: srv, ...init });

// ── Agent settings ───────────────────────────────────────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await as("dev");
  await page.goto(`${BASE}/agent/settings`, { waitUntil: "load" });
  await page.waitForSelector('[role="tablist"][aria-label="Settings"] [role="tab"]', { timeout: 30000 }); await sleep(1500);
  const tabs = (await page.getByRole("tablist", { name: "Settings" }).getByRole("tab").allInnerTexts()).map(norm);
  ok(JSON.stringify(tabs) === JSON.stringify(["Your preferences", "Model tiers ADMIN", "Capabilities ADMIN", "Access & sites ADMIN", "Flight intake ADMIN"]), "five tabs, split by who a setting affects; the organisation's marked ADMIN", tabs.join(" | "));
  ok(/of €[\d.,]+ cap/.test(norm(await page.getByLabel("Usage this month").innerText())), "usage sits in the page header", norm(await page.getByLabel("Usage this month").innerText()));
  const seg = page.getByRole("radiogroup", { name: "Default model" });
  const before = await seg.getByRole("radio", { checked: true }).innerText();
  await seg.getByRole("radio", { name: "Fast · Haiku" }).click(); await sleep(800);
  await page.reload({ waitUntil: "load" }); await page.waitForSelector('[role="radiogroup"][aria-label="Default model"]'); await sleep(800);
  ok(norm(await page.getByRole("radiogroup", { name: "Default model" }).getByRole("radio", { checked: true }).innerText()) === "Fast · Haiku", "your default model saves and comes back after a reload");
  await page.getByRole("radiogroup", { name: "Default model" }).getByRole("radio", { name: before }).click(); await sleep(600);
  await page.getByRole("tab", { name: /Your preferences/ }).focus(); await page.keyboard.press("ArrowDown"); await sleep(400);
  ok(await page.getByRole("tab", { name: /Model tiers/ }).getAttribute("aria-selected") === "true" && /tab=models/.test(page.url()), "arrow keys move between tabs, and the address says which", page.url());
  const router = page.getByRole("textbox", { name: "router model ID" });
  const was = await router.inputValue();
  await router.fill(`${was}-x`); await sleep(200);
  ok(/1 unsaved change/.test(await page.locator('[role="status"]').filter({ hasText: "unsaved" }).innerText()), "an edit raises the save bar with a count");
  await page.screenshot({ path: `${OUT}/s3b3-settings-models.png` });
  await page.getByRole("button", { name: "Discard" }).click(); await sleep(200);
  ok(await router.inputValue() === was && await page.locator('[role="status"]').filter({ hasText: "unsaved" }).count() === 0, "Discard puts it back and the bar goes");
  await page.getByRole("tab", { name: /Capabilities/ }).click(); await sleep(300);
  ok(await page.locator('section[aria-label="Capabilities"] [role="switch"]').count() >= 4 && await page.locator('section[aria-label="Keyboard shortcuts"]').count() === 1, "Capabilities: the switches, and the organisation's keyboard shortcuts");
  await page.getByRole("tab", { name: /Access & sites/ }).click(); await sleep(300);
  ok(await page.locator('[role="table"][aria-label="Who can do what"] [role="row"]').count() >= 2 && await page.getByRole("link", { name: /Manage sites/ }).getAttribute("href") === "/admin/agent-sites", "Access & sites: who can do what, and the sites summary links to Agent sites");
  await page.getByRole("tab", { name: /Flight intake/ }).click(); await sleep(1500);
  ok(await page.locator('section[aria-label="Flight intake"]').count() === 1, "Flight intake: the intake settings");
  await ctx.close();
  for (const theme of ["light", "dark"]) {
    const s = await as("dev", theme);
    await s.page.goto(`${BASE}/agent/settings?tab=caps`, { waitUntil: "load" }); await s.page.waitForSelector('section[aria-label="Capabilities"]', { timeout: 30000 }); await sleep(1000);
    await s.page.screenshot({ path: `${OUT}/s3b3-settings-caps-${theme}.png`, fullPage: true });
    await s.ctx.close();
  }
  const u = await as("user");
  await u.page.goto(`${BASE}/agent/settings`, { waitUntil: "load" }); await sleep(4000);
  const userTabs = (await u.page.getByRole("tab").allInnerTexts()).map(norm);
  ok(!userTabs.some((t) => /Model tiers|Access|Flight intake/.test(t)), "a User sees no organisation tabs they cannot use", userTabs.join(" | ") || "(no tabs)");
  await u.ctx.close();
}

// ── Agent sites ──────────────────────────────────────────────────────────────────────────────────────────────────────
const HOST_A = "s3b3-approve.example", HOST_D = "s3b3-decline.example", HOST_ADD = "s3b3-added.example";
async function cleanSites() {
  for (const h of [HOST_A, HOST_D, HOST_ADD]) await rest(`agent_settings?id=eq.extsite:${h}`, { method: "DELETE" });
  const reqs = await (await rest("agent_settings?id=like.extreq:*&select=id,reason")).json();
  for (const r of reqs) if (/s3b3-/.test(r.reason ?? "")) await rest(`agent_settings?id=eq.${encodeURIComponent(r.id)}`, { method: "DELETE" });
}
await cleanSites();
{
  const a = await api("dev", "/agent/api/extension/sites/request", { host: HOST_A, includeSubdomains: true, reason: "Rig check — handler portal" });
  const d = await api("dev", "/agent/api/extension/sites/request", { host: HOST_D, includeSubdomains: false, reason: "Rig check — not needed" });
  ok(a.body?.ok && d.body?.ok, "two site requests made from the extension API", `${a.status} ${d.status} ${a.body?.message ?? ""}`);
  const { ctx, page } = await as("dev");
  await page.goto(`${BASE}/admin/agent-sites`, { waitUntil: "load" });
  await page.waitForSelector(`text=${HOST_A}`, { timeout: 30000 });
  const scope = page.getByRole("radiogroup", { name: `Scope for ${HOST_A}` });
  ok(await scope.getByRole("radio", { name: "Host and subdomains" }).getAttribute("aria-checked") === "true", "a request starts on the scope that was asked for");
  await page.screenshot({ path: `${OUT}/s3b3-sites-pending.png` });
  await scope.getByRole("radio", { name: "This host only" }).click();
  await page.locator("div", { has: scope }).getByRole("button", { name: "Approve" }).last().click();
  await page.waitForSelector(`table[aria-label="Approved sites"] td:has-text("${HOST_A}")`, { timeout: 20000 }); await sleep(500);
  const approvedRow = norm(await page.locator(`table[aria-label="Approved sites"] tr:has-text("${HOST_A}")`).innerText());
  const logRow = norm(await page.locator(`table[aria-label="Decision log"] tr:has-text("${HOST_A}")`).innerText());
  ok(/This site only/.test(approvedRow) && /APPROVED/.test(logRow) && /scope changed/.test(logRow) && !/\+ subdomains/.test(logRow), "approving with a narrower scope: the site is this host only, and the log says the scope was changed", `${approvedRow} · ${logRow}`);
  const stored = (await (await rest(`agent_settings?id=eq.extsite:${HOST_A}&select=reason`)).json())[0]?.reason ?? "";
  ok(/"includeSubdomains":false/.test(stored), "the agent stored the scope that was chosen");
  await page.locator(`section[aria-label="Waiting for a decision"] div:has(> div > div > span:text-is("${HOST_D}"))`).getByRole("button", { name: "Decline" }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: "Note for the requester" }).fill("Rig check — not needed for ops");
  await page.getByRole("dialog").getByRole("button", { name: "Decline" }).click();
  await page.waitForSelector(`table[aria-label="Decision log"] tr:has-text("${HOST_D}")`, { timeout: 20000 });
  const dRow = norm(await page.locator(`table[aria-label="Decision log"] tr:has-text("${HOST_D}")`).innerText());
  ok(/DECLINED/.test(dRow) && /not needed for ops/.test(dRow) && await page.getByText("No requests waiting.").isVisible(), "declining asks for a note, logs it, and the waiting list empties", dRow);
  await page.getByRole("textbox", { name: "Host to add" }).fill(HOST_ADD);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForSelector(`table[aria-label="Approved sites"] td:has-text("${HOST_ADD}")`, { timeout: 20000 });
  ok(true, "add a site");
  await page.locator(`table[aria-label="Approved sites"] tr:has-text("${HOST_ADD}")`).getByRole("button", { name: "Revoke" }).click();
  ok(/stops reading it at once/.test(await page.getByRole("dialog").innerText()), "revoke asks first and says what happens");
  await page.getByRole("dialog").getByRole("button", { name: "Remove site" }).click();
  await page.waitForFunction((h) => !document.querySelector('table[aria-label="Approved sites"]')?.textContent?.includes(h), HOST_ADD, { timeout: 20000 });
  ok(true, "revoked: the site leaves the list");
  await page.screenshot({ path: `${OUT}/s3b3-sites.png`, fullPage: true });
  await ctx.close();
  const dark = await as("dev", "dark");
  await dark.page.goto(`${BASE}/admin/agent-sites`, { waitUntil: "load" }); await dark.page.waitForSelector('table[aria-label="Decision log"]'); await sleep(800);
  await dark.page.screenshot({ path: `${OUT}/s3b3-sites-dark.png`, fullPage: true }); await dark.ctx.close();
}
await cleanSites();

// ── Inbox ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const created = await api("user", "/api/help/threads", { type: "bug", title: "Rig s3b3 — console blank in the ops room", blocks: [{ type: "paragraph", text: "The console shows a blank page since this morning." }], context: { page: "/aip/EVRA" } });
const threadId = created.body?.thread?.id ?? created.body?.id;
ok(Boolean(threadId), "a help thread filed as a User", `${created.status} ${JSON.stringify(created.body ?? {}).slice(0, 120)}`);
{
  const { ctx, page } = await as("dev");
  await page.goto(`${BASE}/developer/inbox`, { waitUntil: "load" });
  await page.waitForSelector('[role="group"][aria-label="Waiting on you"]', { timeout: 30000 });
  const waiting = norm(await page.getByRole("group", { name: "Waiting on you" }).innerText());
  ok(/WAITING ON YOU \d+/.test(waiting) && /Rig s3b3/.test(waiting), "a new report is grouped under Waiting on you", waiting.slice(0, 120));
  await page.getByRole("group", { name: "Waiting on you" }).getByRole("button", { name: /Rig s3b3/ }).click();
  await page.waitForSelector("h2:has-text('Rig s3b3')", { timeout: 20000 });
  const head = norm(await page.locator("h2:has-text('Rig s3b3')").locator("xpath=../..").innerText());
  ok(/BUG/.test(head) && /from \/aip\/EVRA/.test(head) && /Status: /.test(head), "the thread shows its type, status and the page it was sent from", head.slice(0, 160));
  await page.getByRole("textbox", { name: /^Reply to/ }).fill("Thanks — looking at it now.");
  await page.getByRole("button", { name: /^Send/ }).click();
  await page.waitForSelector("text=Thanks — looking at it now.", { timeout: 20000 }); await sleep(800);
  ok(await page.getByText("Thanks — looking at it now.").isVisible(), "the reply composer sends, and the reply shows in the thread");
  await page.screenshot({ path: `${OUT}/s3b3-inbox.png` });
  await page.getByRole("button", { name: /^Mark done/ }).click(); await sleep(1500);
  ok(/Rig s3b3/.test(norm(await page.getByRole("group", { name: "Done" }).innerText().catch(() => ""))), "Mark done moves it to Done");
  await page.getByRole("radiogroup", { name: "Show" }).getByRole("radio", { name: /Unread/ }).click(); await sleep(300);
  ok(!(await page.getByRole("button", { name: /Rig s3b3/ }).count()), "Unread hides what has been read");
  await ctx.close();
  const dark = await as("dev", "dark");
  await dark.page.goto(`${BASE}/developer/inbox`, { waitUntil: "load" }); await dark.page.waitForSelector('[role="group"]', { timeout: 30000 });
  await dark.page.getByRole("button", { name: /Rig s3b3/ }).first().click(); await sleep(1500);
  await dark.page.screenshot({ path: `${OUT}/s3b3-inbox-dark.png` }); await dark.ctx.close();
}
// ── A chat whose Telegram alert cannot go (the rig has no Telegram): the thread says so at once, in red; a nudge that
// does not go says NOT sent (2026-10-26). Nobody is told "notified" when nobody was.
const chat = await api("user", "/api/help/threads", { type: "chat", title: "Rig s3b3 — chat now", blocks: [{ type: "paragraph", text: "Is anyone there? The wall is blank." }], context: { page: "/digital-wall" } });
const chatThread = chat.body?.thread ?? chat.body; const chatId = chatThread?.id;
ok(Boolean(chatId) && chatThread?.presence === "not_notified" && chatThread?.context?.alert?.state === "failed" && /Telegram is not set up on this server/.test(chatThread?.context?.alert?.reason ?? ""), "a chat thread on a server without Telegram: presence stays not notified and the thread records that the alert did NOT go, with the reason", `${chat.status} ${JSON.stringify(chatThread?.context?.alert ?? null)}`);
if (chatId) {
  const nudge = await api("user", `/api/help/threads/${chatId}/presence`, { action: "nudge" });
  const ev = (await (await rest(`help_events?thread_id=eq.${chatId}&kind=eq.nudged&order=created_at.desc&limit=1`)).json().catch(() => []))?.[0];
  ok(nudge.status === 200 && ev?.kind === "nudged" && /^failed: Telegram is not set up/.test(ev?.payload?.note ?? ""), "Nudge again on that server: the event says the nudge did NOT go, with the reason", JSON.stringify(ev?.payload ?? null));
  const { ctx, page } = await as("user");
  await page.goto(`${BASE}/help/${chatThread.reference}`, { waitUntil: "load" }); await page.waitForSelector('[role="alert"]', { timeout: 30000 }); await sleep(600);
  const strip = norm(await page.locator('[role="alert"]').first().innerText());
  ok(/The nudge was NOT sent|The Telegram alert was NOT sent/.test(strip) && /Nobody has been pinged/.test(strip) && /Telegram is not set up on this server/.test(strip), "the thread page says in red that nobody has been pinged, with the reason and what to do", strip.slice(0, 200));
  const events = norm(await page.locator("body").innerText());
  ok(/Nudge NOT sent/.test(events) && !/Nudge sent to Telegram/.test(events), "…and the event line reads Nudge NOT sent, never Nudge sent", events.match(/Nudge[^.]{0,80}/)?.[0]);
  await page.screenshot({ path: `${OUT}/s3b3-alert-failed.png` });
  await ctx.close();
  for (const t of ["help_events", "help_messages", "help_attachments"]) await rest(`${t}?thread_id=eq.${chatId}`, { method: "DELETE" });
  await rest(`help_threads?id=eq.${chatId}`, { method: "DELETE" });
}
if (threadId) for (const t of ["help_events", "help_messages", "help_attachments"]) await rest(`${t}?thread_id=eq.${threadId}`, { method: "DELETE" });
if (threadId) await rest(`help_threads?id=eq.${threadId}`, { method: "DELETE" });

// ── Profile ──────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await as("user");
  await page.goto(`${BASE}/account/profile`, { waitUntil: "load" });
  await page.waitForSelector('section[aria-label="Account"]', { timeout: 30000 }); await sleep(800);
  const body = norm(await page.locator("main, body").first().innerText());
  const content = norm((await page.locator('section[aria-label="Account"]').innerText()) + (await page.locator('section[aria-label="Sign out"]').innerText()));
  ok(!/statistic|notification/i.test(content) && await page.locator('section a[href="/account/search-stats"], section a[href="/account/notifications"]').count() === 0, "no statistics or notification settings on the profile");
  ok(/Sign-in email/.test(body) && /Password/.test(body) && /User ID/.test(body) && /Role/.test(body), "one account card: name, email, password, role, user ID");
  const name = page.getByRole("textbox", { name: "Display name" });
  const was = await name.inputValue();
  await name.fill(`${was} s3b3`);
  await page.getByRole("button", { name: "Save", exact: true }).click(); await sleep(1000);
  await page.reload({ waitUntil: "load" }); await page.waitForSelector('section[aria-label="Account"]'); await sleep(800);
  ok(await page.getByRole("textbox", { name: "Display name" }).inputValue() === `${was} s3b3`.trim(), "the display name saves");
  await page.getByRole("textbox", { name: "Display name" }).fill(was);
  if (await page.getByRole("button", { name: "Save", exact: true }).count()) { await page.getByRole("button", { name: "Save", exact: true }).click(); await sleep(800); }
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.getByRole("textbox", { name: "New sign-in email" }).fill("not-an-address");
  await page.getByRole("button", { name: "Send confirmation" }).click(); await sleep(300);
  ok(await page.getByText("That doesn't look like an email address.").isVisible(), "change email: a bad address is refused before anything is sent");
  await page.getByRole("textbox", { name: "New sign-in email" }).fill("rig-access-user@rig.invalid");
  await page.getByRole("button", { name: "Send confirmation" }).click(); await sleep(300);
  ok(await page.getByText("That is already your sign-in email.").isVisible(), "…and the same address too");
  await page.screenshot({ path: `${OUT}/s3b3-profile-email.png` });
  await page.getByRole("button", { name: "Cancel" }).first().click();
  await page.getByRole("button", { name: "Change password" }).click();
  await page.getByLabel("Current password").fill("not-the-password");
  await page.getByRole("button", { name: "Check and send the link" }).click(); await sleep(2000);
  ok(await page.getByText("That isn't your current password.").isVisible(), "change password: the current password is checked first");
  await ctx.close();
  for (const theme of ["light", "dark"]) {
    const s = await as("user", theme);
    await s.page.goto(`${BASE}/account/profile`, { waitUntil: "load" }); await s.page.waitForSelector('section[aria-label="Account"]'); await sleep(800);
    await s.page.screenshot({ path: `${OUT}/s3b3-profile-${theme}.png` }); await s.ctx.close();
  }
}

// ── Agent panel: recent threads ──────────────────────────────────────────────────────────────────────────────────────
{
  // Two threads of the developer's own, one today and one three days ago (deleted again below).
  const devId = (await session("dev")).user.id;
  const mk = async (title, at) => (await (await rest("agent_conversations", { method: "POST", headers: { ...srv, prefer: "return=representation" }, body: JSON.stringify({ user_id: devId, user_email: "rig-access-dev@rig.invalid", title, last_message_at: at }) })).json())[0]?.id;
  const ids = [await mk("s3b3 · EVRA de-icing", new Date().toISOString()), await mk("s3b3 · fuel at LDZA", new Date(Date.now() - 3 * 86400e3).toISOString())];
  const { ctx, page } = await as("dev");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "load" }); await sleep(2000);
  await page.getByRole("button", { name: /Ops Agent/ }).first().click();
  const shown = await page.getByText("RECENT THREADS").waitFor({ timeout: 25000 }).then(() => true, () => false);
  const block = shown ? norm(await page.getByText("RECENT THREADS").locator("xpath=../..").innerText()) : "";
  ok(shown && /All threads/.test(block) && /s3b3 · EVRA de-icing \d\d:\d\dZ/.test(block) && /s3b3 · fuel at LDZA \d\d \w{3}/.test(block), "the empty panel lists recent threads — today's with a time, older ones with a date — and All threads", block.slice(0, 200));
  await page.screenshot({ path: `${OUT}/s3b3-panel.png` });
  if (shown) { await page.getByRole("button", { name: "All threads" }).click(); await sleep(1000); ok(await page.getByText("History", { exact: true }).first().isVisible(), "All threads opens the history"); }
  await ctx.close();
  for (const id of ids.filter(Boolean)) await rest(`agent_conversations?id=eq.${id}`, { method: "DELETE" });
}

ok(pageErrors.length === 0, "no page errors", pageErrors.join(" | "));
await browser.close();
console.log(failures ? `\n${failures} FAILED · ${OUT}/s3b3-*.png` : `\nALL PASSED · ${OUT}/s3b3-*.png`);
process.exit(failures ? 1 : 0);
