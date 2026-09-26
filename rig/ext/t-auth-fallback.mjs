// Fix 2 evidence: cookie path first; then the cookie is made SameSite=Strict (not sent from the extension) and
// the extension must keep working through the token exchanged from a console tab.
import { launch, panelPage, shot, sleep, swEval, proxyLog } from "./harness.mjs";
const SB = "http://127.0.0.1:54321"; const ANON = process.env.RIG_ANON_KEY;
const login = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: "rig-test@rig.invalid", password: "rig-test-password" }) }).then((r) => r.json());
if (!login.access_token) { console.log("login failed", JSON.stringify(login).slice(0, 200)); process.exit(1); }
const cookieValue = "base64-" + Buffer.from(JSON.stringify({ access_token: login.access_token, refresh_token: login.refresh_token, token_type: "bearer", expires_in: login.expires_in, expires_at: login.expires_at, user: login.user })).toString("base64");
const { context, sw, extId } = await launch({ fresh: true, profile: "ext-profile-auth" });
await sleep(800);
await swEval(sw, () => chrome.storage.sync.set({ settings: { pill: true, notifications: true, firstRunDone: true, mic: "allowed" } }));
const setCookie = (sameSite) => context.addCookies([{ name: "sb-127-auth-token", value: cookieValue, url: "http://127.0.0.1:3999", sameSite }]);
await setCookie("Lax");
const panel = await panelPage(context, extId); await sleep(2500);
const st = () => swEval(sw, () => chrome.storage.local.get(["session", "authPath"]));
let s = await st(); console.log("1. cookie path (Lax):", s.session.status, s.session.user?.name, "| authPath:", s.authPath, "| token held:", Boolean(await swEval(sw, () => chrome.storage.session.get("token").then((x) => x.token))));
// Block the cookie for the extension's requests only (rig proxy switch): Chrome sends even a SameSite=Strict
// cookie with an extension's host-permitted requests, so the failure mode is simulated at the proxy.
import("node:fs").then((fs) => fs.writeFileSync(`${process.env.RIG_SCRATCH}/rig-strip-ext-cookie`, "1"));
await sleep(300);
await swEval(sw, () => chrome.storage.local.set({ session: { status: "unknown", checkedAt: 0 } }));
await panel.evaluate(() => { const p = chrome.runtime.connect({ name: "sidepanel" }); p.postMessage({ type: "session.refresh" }); }); await sleep(2500);
s = await st(); console.log("2. cookie stripped, no console tab open:", s.session.status, "| last session request cookie names:", JSON.stringify(proxyLog().filter((l) => l.path === "/agent/api/extension/session").slice(-1)[0]?.cookie ?? null));
await shot(panel, "auth-2-strict-signed-out");
// A console tab is open (the user signed in there): the extension exchanges a token from it.
const consoleTab = await context.newPage(); await consoleTab.goto("http://127.0.0.1:3999/agent", { waitUntil: "load" }); await sleep(1000);
await panel.bringToFront();
await panel.evaluate(() => { const p = chrome.runtime.connect({ name: "sidepanel" }); p.postMessage({ type: "session.refresh" }); }); await sleep(3500);
s = await st(); const tok = await swEval(sw, () => chrome.storage.session.get("token").then((x) => x.token));
console.log("3. token path:", s.session.status, s.session.user?.name, "| authPath:", s.authPath, "| token held (memory-only):", Boolean(tok), tok ? `expires ${tok.expiresAt}` : "", "| alarm:", JSON.stringify(await swEval(sw, () => chrome.alarms.get("token-refresh").then((a) => a?.scheduledTime ? new Date(a.scheduledTime).toISOString() : null))));
console.log("   local storage holds no token:", !JSON.stringify(await swEval(sw, () => chrome.storage.local.get(null))).includes("cwx."));
await shot(panel, "auth-3-token-path");
// Still works: a question through the token path, as the user.
await panel.locator("textarea").fill("Who am I signed in as?"); await panel.keyboard.press("Enter");
await panel.locator("[data-thread] [title='Model that produced this reply']").first().waitFor({ timeout: 120000 }).catch(() => {}); await sleep(500);
const chat = proxyLog().filter((l) => l.path === "/agent/api/chat").slice(-1)[0]; console.log("4. chat with cookie blocked → cookie names on request:", JSON.stringify(chat?.cookie), "| reply:", await panel.evaluate(() => document.body.innerText.match(/(RIG TEST|rig-test)[^\n]{0,80}/)?.[0] ?? "(no rig name in reply)"));
await shot(panel, "auth-4-chat-via-token");
// Refresh: force the alarm now.
const before = tok?.value; await swEval(sw, () => chrome.alarms.create("token-refresh", { when: Date.now() + 100 })); await sleep(3000);
const after = await swEval(sw, () => chrome.storage.session.get("token").then((x) => x.token)); console.log("5. refreshed:", Boolean(after?.value) && after.value !== before, "new expiry", after?.expiresAt);
// Disconnect clears it.
await panel.evaluate(() => { const p = chrome.runtime.connect({ name: "sidepanel" }); p.postMessage({ type: "session.disconnect" }); }); await sleep(1500);
console.log("6. after Disconnect: token held:", Boolean(await swEval(sw, () => chrome.storage.session.get("token").then((x) => x.token))), "| status:", (await st()).session.status);
// The audit log recorded the path changes.
await import("node:fs").then((fs) => fs.rmSync(`${process.env.RIG_SCRATCH}/rig-strip-ext-cookie`, { force: true }));
const rows = await fetch("http://127.0.0.1:54321/rest/v1/agent_audit_log?kind=eq.extension.auth_path&select=created_at,detail&order=created_at.desc&limit=5", { headers: { apikey: process.env.RIG_SERVICE_KEY, authorization: `Bearer ${process.env.RIG_SERVICE_KEY}` } }).then((r) => r.json());
console.log("7. audit extension.auth_path rows:", rows.map((r) => r.detail?.authPath).join(" ← "));
await context.close();
