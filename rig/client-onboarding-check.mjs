// Client onboarding and our own emails (2026-11-02), end to end on the rig, every email captured by the mock Resend
// (:3996) and read back from Mailbox › Sent (intake_messages):
//   ask for access (no account) → ops on the notify list get an email → ops approve → the client gets a set-password
//   link → a newer link replaces it → the replaced link says so and offers a new one → the newest link sets the
//   password and makes the account → used again, it says so → an expired link offers a new one, sent only to the
//   address on file. Then the emails Supabase used to send: forgot password, Admin › Users reset, sign-up confirmation,
//   change of sign-in email — each sent by us, each with a row and a status.
//   node --env-file=.env.rig rig/client-onboarding-check.mjs
// Invented people and companies only. Removes what it made and puts the notify list back as it was.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { settled } from "./lib/settle.mjs";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const B = process.env.RIG_SHELL_URL || (process.env.RIG_SIGNIN_BASE || "http://127.0.0.1:3989");
const MOCK = "http://127.0.0.1:3996";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 300)}` : ""}`); if (!c) failures += 1; };
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const svc = (path, init = {}) => fetch(`${SB}${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
const db = async (path) => (await svc(`/rest/v1/${path}`)).json();
const psql = (sql) => execFileSync("docker", ["exec", "-i", "supabase_db_rig", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tAq"], { input: sql }).toString().trim();
const PW = JSON.parse(readFileSync("rig/dark-audit.mjs", "utf8").match(/token\?grant_type=password[^\n]*?password: ("[^"]+")/)[1]);
const session = async (email, password = PW) => (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
const cookie = (s) => ({ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`, url: B });
const cookieHeader = (s) => { const c = cookie(s); return `${c.name}=${c.value}`; };
// each run is its own visitor to the rig proxy (which sets cf-connecting-ip from it, as Cloudflare does): the signed-out
// limiters count per visitor, and a run must not spend the next run's allowance (2026-11-05)
const VISITOR = `10.254.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const api = (path, s, init = {}) => fetch(`${B}${path}`, { ...init, headers: { "content-type": "application/json", "x-rig-visitor": VISITOR, ...(s ? { cookie: cookieHeader(s) } : {}), ...(init.headers ?? {}) } });
const sentList = async () => (await fetch(`${MOCK}/_rig/sent`)).json();
const sentBody = async (id) => (await fetch(`${MOCK}/_rig/sent/${id}`)).json();
/** the sends since `n`, to `to`, whose subject matches; waits a little for the server to finish */
async function newSends(n, to, subject) {
  for (let i = 0; i < 40; i += 1) {
    const got = (await sentList()).slice(n).filter((e) => [].concat(e.to).includes(to) && (!subject || subject.test(e.subject)));
    if (got.length) return got;
    await new Promise((r) => setTimeout(r, 250));
  }
  return [];
}
const linkIn = (html, re) => { const m = String(html ?? "").match(re); return m ? m[0].replaceAll("&amp;", "&") : null; };
const onRig = (url) => { const u = new URL(url); return `${B}${u.pathname}${u.search}`; };
const startedAt = new Date(Date.now() - 1000).toISOString();

const ME = { name: "Rig Onboard Person", company: "Rig Onboard Charter (invented)", email: "rig-onboard@rig.invalid" };
const LATE = { name: "Rig Late Person", company: "Rig Late Aviation (invented)", email: "rig-onboard-late@rig.invalid" };
const OPS = ["rig-ops-one@rig.invalid", "rig-ops-two@rig.invalid"];
async function clean() {
  for (const e of [ME.email, LATE.email, "rig-onboard-refused@rig.invalid", "rig-signup@rig.invalid", "rig-mailchange@rig.invalid", "rig-mailchange-new@rig.invalid", "rig-onboard-ceiling-1@rig.invalid", "rig-onboard-ceiling-2@rig.invalid"]) {
    // the decision log is append-only and keeps its client (on delete restrict). On the rig, for these invented addresses
    // only, the trigger is lifted for the delete (as rig/permissions-check.mjs does for permission_changes)
    const ids = (await db(`clients?select=id&email=eq.${encodeURIComponent(e)}`)).map((c) => c.id);
    if (ids.length) psql(`alter table client_decisions disable trigger client_decisions_append_only; delete from client_decisions where client_id in (${ids.map((i) => `'${i.replace(/[^0-9a-f-]/g, "")}'`).join(",")}); alter table client_decisions enable trigger client_decisions_append_only;`);
    const del = await svc(`/rest/v1/clients?email=eq.${encodeURIComponent(e)}`, { method: "DELETE" });
    if (!del.ok) throw new Error(`could not remove the invented client ${e}: ${del.status}`);
    const l = await (await svc(`/auth/v1/admin/users?page=1&per_page=1000`)).json();
    for (const u of (l.users ?? []).filter((x) => x.email === e)) await svc(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
  }
}
await clean();

const admin = await session("rig-access-admin@rig.invalid");
ok(Boolean(admin.access_token), "the rig admin signs in", admin.error_description ?? "");
const before = await (await api("/api/admin/clients/settings", admin)).json();
ok(before.ok === true && Array.isArray(before.emails), "Admin › Clients reads the notify list", JSON.stringify(before).slice(0, 120));
let r = await api("/api/admin/clients/settings", admin, { method: "PUT", body: JSON.stringify({ emails: [...OPS, "not an address"] }) });
let j = await r.json();
ok(r.status === 400, "the notify list refuses something that is not an address", `${r.status} ${j.error ?? ""}`);
r = await api("/api/admin/clients/settings", admin, { method: "PUT", body: JSON.stringify({ emails: OPS }) });
j = await r.json();
ok(r.ok && JSON.stringify(j.emails) === JSON.stringify(OPS), "the notify list saves two addresses", JSON.stringify(j));
// the address clients write to (2026-11-09): the same settings, saved on its own; shown on a client's Account and holding pages
r = await api("/api/admin/clients/settings", admin, { method: "PUT", body: JSON.stringify({ supportEmail: "not an address" }) });
ok(r.status === 400, "the address clients write to refuses something that is not an address", r.status);
r = await api("/api/admin/clients/settings", admin, { method: "PUT", body: JSON.stringify({ supportEmail: " Rig-Client-Help@rig.invalid " }) });
j = await r.json();
ok(r.ok && j.supportEmail === "rig-client-help@rig.invalid" && JSON.stringify(j.emails) === JSON.stringify(OPS), "the address clients write to saves on its own, and the notify list stays as it was", JSON.stringify(j).slice(0, 160));
j = await (await api("/api/admin/clients/settings", admin)).json();
ok(j.supportEmail === "rig-client-help@rig.invalid", "…and reads back with the notify list");

const browser = await chromium.launch();
try {
  // ── 1. the client asks: name, company, email; no password, no account ──
  let n = (await sentList()).length;
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-rig-visitor": VISITOR } });
    const page = await ctx.newPage();
    await page.goto(`${B}/request-access`, { waitUntil: "load" });
    ok(await page.locator('input[type="password"]').count() === 0, "ask for access: no password field");
    await page.locator("#ra-name").fill(ME.name); await page.locator("#ra-company").fill(ME.company); await page.locator("#ra-email").fill(ME.email);
    await page.getByRole("button", { name: "Send request" }).click();
    await page.locator("[data-request-sent]").waitFor({ timeout: 15000 }).catch(() => {});
    ok(/Your request is with Clearway ops/.test(await page.locator("[data-request-sent]").innerText().catch(() => "")), "ask for access: the page says the request is with ops");
    await ctx.close();
  }
  const row = (await db(`clients?select=id,user_id,status,company&email=eq.${encodeURIComponent(ME.email)}`))[0];
  ok(row?.status === "requested" && row.user_id === null, "the request is a clients row with no account", JSON.stringify(row));
  // asked of the database itself (2026-11-07): page 1 of the account list is not every account
  ok(psql(`select count(*) from auth.users where lower(email) = lower('${ME.email.replace(/'/g, "")}');`) === "0", "no auth account exists for the asker");
  const opsMail = (await newSends(n, OPS[0], /Access request/))[0];
  ok(Boolean(opsMail) && OPS.every((o) => [].concat(opsMail.to).includes(o)), "ops: one email to everyone on the notify list", opsMail ? `${[].concat(opsMail.to).join(", ")} · ${opsMail.subject}` : "none");
  ok(/^Clearway </.test(String(opsMail?.from)), "ops: from the brand's sender name", opsMail?.from);
  const opsHtml = opsMail ? (await sentBody(opsMail.id)).html : "";
  ok(opsHtml.includes(ME.name) && opsHtml.includes(ME.company) && opsHtml.includes(ME.email) && /\/admin\/clients"/.test(opsHtml), "ops: says who, for which company, from which address, and links to Admin › Clients");

  {
    // an email link that needs a session is a broken link (2026-11-05): ops's link, opened in a fresh browser, is the
    // sign-in page that then goes on to Admin › Clients, not a dead end
    const opsLink = linkIn(opsHtml, /https?:\/\/[^"\s<]+\/admin\/clients/);
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    const res = opsLink ? await page.goto(onRig(opsLink), { waitUntil: "load" }) : null;
    const u = new URL(page.url());
    ok(res?.ok() && u.pathname === "/login" && u.searchParams.get("next") === "/admin/clients", "ops's link, opened signed out: the sign-in page, going on to Admin › Clients", `${u.pathname}${u.search}`);
    await ctx.close();
  }

  // ── 2. ops approve with a scope; the link goes out ──
  const page0 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await page0.addCookies([cookie(admin)]);
  const adminPage = await page0.newPage();
  await adminPage.goto(`${B}/admin/clients`, { waitUntil: "load" });
  await adminPage.locator(`[data-client-request="${row.id}"]`).waitFor({ timeout: 20000 }).catch(() => {});
  ok(/asked from the sign-in page · no account yet/.test(await adminPage.locator(`[data-client-request="${row.id}"]`).innerText().catch(() => "")), "Admin › Clients: the waiting row says there is no account yet");
  n = (await sentList()).length;
  r = await api(`/api/admin/clients/${row.id}/approve`, admin, { method: "POST", body: JSON.stringify({ scope: [{ kind: "operator", value: "cwy-cwy" }], switches: ["flight_board"], passengerLevel: "off" }) });
  j = await r.json();
  ok(r.ok && j.linkSent === true && j.email?.ok === true, "approve: saved, and the set-password email was accepted", `${r.status} ${JSON.stringify({ linkSent: j.linkSent, email: j.email?.ok, error: j.error })}`);
  const link1Mail = (await newSends(n, ME.email, /Set your password/))[0];
  const link1 = link1Mail ? linkIn((await sentBody(link1Mail.id)).html, /https?:\/\/[^"\s<]+\/welcome\?token=[\w-]+/) : null;
  ok(Boolean(link1), "the client gets an email with a set-password link", link1Mail?.subject);

  // ── 3. ops send the link again from the row: the first one is replaced ──
  await adminPage.reload({ waitUntil: "load" });
  const approvedRow = adminPage.locator(`[data-client-approved="${row.id}"]`);
  await approvedRow.waitFor({ timeout: 20000 }).catch(() => {});
  ok(/NO PASSWORD SET YET/.test(await approvedRow.innerText().catch(() => "")), "Admin › Clients: the approved row says no password is set yet");
  n = (await sentList()).length;
  await approvedRow.locator("[data-resend-link]").click();
  await adminPage.getByText(`A new link went to ${ME.email}`).waitFor({ timeout: 15000 }).catch(() => {});
  ok(await adminPage.getByText(`A new link went to ${ME.email}`).count() > 0, "Admin › Clients: “Send the link again” says where it went once the mail service took it");
  const link2Mail = (await newSends(n, ME.email, /Set your password/))[0];
  const link2 = link2Mail ? linkIn((await sentBody(link2Mail.id)).html, /https?:\/\/[^"\s<]+\/welcome\?token=[\w-]+/) : null;
  ok(Boolean(link2) && link2 !== link1, "a second, different link went out");
  await page0.close();

  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    // the replaced link
    await page.goto(onRig(link1), { waitUntil: "load" });
    await page.locator('[data-welcome="replaced"]').waitFor({ timeout: 15000 }).catch(() => {});
    ok(await page.locator('[data-welcome="replaced"]').count() === 1, "the first link now says a newer link was sent", await page.locator("[data-welcome]").getAttribute("data-welcome").catch(() => ""));
    ok(!page.url().includes("token="), "the token is taken out of the address bar", page.url());
    await page.locator("[data-new-link]").click();
    await page.getByText(/sent to .* a moment ago|on its way to/).waitFor({ timeout: 10000 }).catch(() => {});
    ok(/a moment ago/.test(await page.locator("[data-welcome-expired]").innerText().catch(() => "")), "asking for a new link right after one went out: “check that inbox first”, nothing sent");
    // the newest link: set the password, the account is made, signed in
    await page.goto(onRig(link2), { waitUntil: "load" });
    await page.locator("[data-welcome-form]").waitFor({ timeout: 15000 }).catch(() => {});
    ok(await page.locator('[data-welcome="valid"]').count() === 1, "the newest link opens the set-password form");
    await page.locator("#w-pw").fill("short"); await page.locator("#w-pw2").fill("short");
    await page.getByRole("button", { name: "Set password and sign in" }).click();
    ok(/at least 10 characters/.test(await page.locator("[data-welcome-form]").innerText()), "a short password is refused on the page");
    const PASS = `rig-onboard-${Math.random().toString(36).slice(2, 10)}`;
    await page.locator("#w-pw").fill(PASS); await page.locator("#w-pw2").fill(PASS);
    await page.getByRole("button", { name: "Set password and sign in" }).click();
    await page.waitForURL(/\/client/, { timeout: 20000 }).catch(() => {});
    await settled(page);
    ok(new URL(page.url()).pathname.startsWith("/client"), "setting the password signs them in to the client wall", page.url());
    const made = (await db(`clients?select=user_id,status&id=eq.${row.id}`))[0];
    const u = made?.user_id ? await (await svc(`/auth/v1/admin/users/${made.user_id}`)).json() : null;
    ok(Boolean(made?.user_id) && u?.app_metadata?.role === "client" && u?.app_metadata?.client_status === "approved" && Boolean(u?.email_confirmed_at), "the account exists now: a confirmed, approved client, linked to the row", JSON.stringify(u?.app_metadata ?? {}));
    const kinds = (await db(`client_decisions?select=kind&client_id=eq.${row.id}&order=created_at.asc`)).map((d) => d.kind);
    ok(["requested", "approved", "link-sent", "activated"].every((k) => kinds.includes(k)), "the decision log has requested, approved, link-sent and activated", kinds.join(" › "));
    // used again
    const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage();
    await p2.goto(onRig(link2), { waitUntil: "load" });
    await p2.locator('[data-welcome="used"]').waitFor({ timeout: 15000 }).catch(() => {});
    ok(await p2.locator('[data-welcome="used"]').count() === 1, "the same link again: “This link was used already”");
    r = await api("/api/client-invite", null, { method: "POST", body: JSON.stringify({ token: new URL(link2).searchParams.get("token"), password: "another-password-1" }) });
    ok(r.status >= 400, "the used link cannot set a password through the API either", r.status);
    await ctx2.close(); await ctx.close();
    globalThis.clientPass = PASS; globalThis.clientUserId = made?.user_id;
  }

  // ── 4. an expired link offers a new one, and the new one goes only to the address on file ──
  {
    r = await api("/api/client-requests", null, { method: "POST", body: JSON.stringify({ ...LATE, kind: "broker" }) });
    const late = (await db(`clients?select=id&email=eq.${encodeURIComponent(LATE.email)}`))[0];
    n = (await sentList()).length;
    r = await api(`/api/admin/clients/${late.id}/approve`, admin, { method: "POST", body: JSON.stringify({ scope: [{ kind: "operator", value: "cwy-cwy" }], switches: ["flight_board"], passengerLevel: "off" }) });
    const lateMail = (await newSends(n, LATE.email, /Set your password/))[0];
    const lateLink = lateMail ? linkIn((await sentBody(lateMail.id)).html, /https?:\/\/[^"\s<]+\/welcome\?token=[\w-]+/) : null;
    ok(Boolean(lateLink), "a second client is approved and gets a link");
    const past = new Date(Date.now() - 73 * 3600e3).toISOString();
    await svc(`/rest/v1/client_invites?client_id=eq.${late.id}`, { method: "PATCH", body: JSON.stringify({ expires_at: new Date(Date.now() - 3600e3).toISOString(), created_at: past }) });
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    await page.goto(onRig(lateLink), { waitUntil: "load" });
    await page.locator('[data-welcome="expired"]').waitFor({ timeout: 15000 }).catch(() => {});
    ok(/This link has expired/.test(await page.locator("[data-welcome]").innerText().catch(() => "")), "an expired link says so (72 hours)");
    n = (await sentList()).length;
    await page.locator("[data-new-link]").click();
    await page.getByText(/on its way to/).waitFor({ timeout: 15000 }).catch(() => {});
    const said = await page.locator("[data-welcome-expired]").innerText().catch(() => "");
    ok(/on its way to r\S*@rig\.invalid/.test(said) && !said.includes(LATE.email), "the page says a new link is on its way, to the address masked", said.replace(/\s+/g, " ").slice(0, 160));
    const fresh = await newSends(n, LATE.email, /Set your password/);
    const anyElse = (await sentList()).slice(n).filter((e) => /Set your password/.test(e.subject) && ![].concat(e.to).includes(LATE.email));
    ok(fresh.length === 1 && anyElse.length === 0, "the new link went to the address on the request, and nowhere else", `${fresh.length} to the client, ${anyElse.length} elsewhere`);
    const freshLink = fresh[0] ? linkIn((await sentBody(fresh[0].id)).html, /https?:\/\/[^"\s<]+\/welcome\?token=[\w-]+/) : null;
    await page.goto(onRig(freshLink), { waitUntil: "load" });
    await page.locator('[data-welcome="valid"]').waitFor({ timeout: 15000 }).catch(() => {});
    ok(await page.locator('[data-welcome="valid"]').count() === 1, "the new link works");
    await ctx.close();
    // a refused request: told by email, no account
    n = (await sentList()).length;
    const refusedReq = await api("/api/client-requests", null, { method: "POST", body: JSON.stringify({ name: "Rig Refused Person", company: "Rig Refused Ltd (invented)", email: "rig-onboard-refused@rig.invalid", kind: "operator" }) });
    const ref = (await db(`clients?select=id&email=eq.rig-onboard-refused%40rig.invalid`))[0];
    r = await api(`/api/admin/clients/${ref?.id}/refuse`, admin, { method: "POST", body: JSON.stringify({ note: "" }) });
    j = await r.json();
let refusal = [];
        ok(refusedReq.ok && r.ok && j.email?.ok === true && (refusal = (await newSends(n, "rig-onboard-refused@rig.invalid", /About your request|access request/i))).length === 1, "refusing a request: they are told by email, and no account was ever made", `${r.status} ${j.error ?? ""}`);
    // the refusal notice's link, opened in a fresh browser with no session: the sign-in page itself
    const refusalLink = refusal[0] ? linkIn((await sentBody(refusal[0].id)).html, /https?:\/\/[^"\s<]+\/login/) : null;
    const rctx = await browser.newContext(); const rpage = await rctx.newPage();
    const rres = refusalLink ? await rpage.goto(onRig(refusalLink), { waitUntil: "load" }) : null;
    ok(rres?.ok() && new URL(rpage.url()).pathname === "/login" && (await rpage.locator("input[type=email]").count()) === 1, "the refusal notice's link, opened signed out: the sign-in page", refusalLink ? new URL(rpage.url()).pathname : "no link in the email");
    await rctx.close();
  }

  // ── 4b. a ceiling on the ops emails themselves (2026-11-05): the notify list is a human inbox. Seeded sends bring the
  // day to one below the ceiling; the next request's email says it is the last; the one after is recorded, not emailed.
  {
    const CAP = Number((readFileSync("lib/clients/onboarding.ts", "utf8").match(/OPS_EMAILS_PER_DAY = (\d+)/) ?? [])[1]);
    const today = Number(psql("select count(*) from intake_messages where direction='outbound' and sent_kind='client-request-ops' and received_at > now() - interval '24 hours';"));
    const seed = Math.max(0, CAP - 1 - today);
    if (seed) psql(`insert into intake_messages (provider, provider_message_id, direction, received_at, status, sent_kind, subject) select 'rig', 'rig-ops-ceiling-' || g, 'outbound', now() - interval '1 minute', 'sent', 'client-request-ops', 'rig seeded (ops ceiling check)' from generate_series(1, ${seed}) g;`);
    const ask = (email) => api("/api/client-requests", null, { method: "POST", body: JSON.stringify({ name: "Rig Ceiling Person", company: "Rig Ceiling Air (invented)", email }) });
    n = (await sentList()).length;
    const r1 = await ask("rig-onboard-ceiling-1@rig.invalid");
    const last = (await newSends(n, OPS[0], /Access request/))[0];
    const lastHtml = last ? (await sentBody(last.id)).html : "";
    ok(r1.ok && Boolean(last) && lastHtml.includes(`the most this list is sent in a day`), `ops ceiling: the ${CAP}th email in 24 hours goes, and says it is the last`, `${CAP} a day; ${today} today before the seed`);
    n = (await sentList()).length;
    const r2 = await ask("rig-onboard-ceiling-2@rig.invalid");
    await new Promise((res) => setTimeout(res, 1500));
    const after = (await sentList()).slice(n).filter((e) => /Access request/.test(e.subject));
    const kept = (await db(`clients?select=status&email=eq.rig-onboard-ceiling-2%40rig.invalid`))[0];
    ok(r2.ok && after.length === 0 && kept?.status === "requested", "ops ceiling: the next request is recorded for Admin › Clients, and nobody is emailed", `${after.length} emails · ${kept?.status}`);
    psql("delete from intake_messages where provider = 'rig' and provider_message_id like 'rig-ops-ceiling-%';");
  }

  // ── 5. the emails Supabase used to send, now ours ──
  {
    n = (await sentList()).length;
    r = await api("/api/auth/password/forgot", null, { method: "POST", body: JSON.stringify({ email: ME.email }) });
    j = await r.json();
    const reset = (await newSends(n, ME.email, /Reset your/))[0];
    const resetLink = reset ? linkIn((await sentBody(reset.id)).html, /https?:\/\/[^"\s<]+\/auth\/reset\?token_hash=[^"\s<]+/) : null;
    ok(j.sent === true && Boolean(resetLink) && /^Clearway </.test(String(reset?.from)), "forgot password: sent by us, from the brand, with a reset link to our page", reset?.from);
    r = await api("/api/auth/password/forgot", null, { method: "POST", body: JSON.stringify({ email: ME.email }) });
    ok(r.status === 429, "forgot password: a second one within a minute waits (Supabase limited these; we do too)", r.status);
    const n2 = (await sentList()).length;
    r = await api("/api/auth/password/forgot", null, { method: "POST", body: JSON.stringify({ email: "rig-nobody-here@rig.invalid" }) });
    j = await r.json();
    await new Promise((res) => setTimeout(res, 1000));
    ok(r.ok && j.message === "If this email exists, a reset link has been sent." && (await sentList()).length === n2, "forgot password, unknown address: the same answer, and nothing is sent");
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    await page.goto(onRig(resetLink), { waitUntil: "load" });
    await page.getByText("Email verified. You can now set a new password.").waitFor({ timeout: 15000 }).catch(() => {});
    ok(await page.getByText("Email verified. You can now set a new password.").count() === 1, "the reset link opens the set-new-password page, verified");
    await ctx.close();

    n = (await sentList()).length;
    r = await api("/api/admin/users/password-reset", admin, { method: "POST", body: JSON.stringify({ userId: globalThis.clientUserId }) });
    j = await r.json();
    ok(r.ok && j.sentTo === ME.email && (await newSends(n, ME.email, /Reset your/)).length === 1, "Admin › Users › Send password reset: sent by us, the same way", `${r.status} ${j.error ?? ""}`);

    n = (await sentList()).length;
    r = await api("/api/auth/email/request-confirmation", null, { method: "POST", body: JSON.stringify({ name: "Rig Signup Person", email: "rig-signup@rig.invalid", next: "/" }) });
    j = await r.json();
    const invite = (await newSends(n, "rig-signup@rig.invalid", /Confirm your email/))[0];
    const inviteLink = invite ? linkIn((await sentBody(invite.id)).html, /https?:\/\/[^"\s<]+\/auth\/callback\?[^"\s<]+/) : null;
    ok(j.sent === true && Boolean(inviteLink), "sign-up confirmation: sent by us, with a link to our callback", invite?.subject);
    const cb = inviteLink ? await fetch(onRig(inviteLink), { redirect: "manual" }) : null;
    ok(cb && cb.status >= 300 && cb.status < 400 && /\/auth\/confirm\?token=/.test(cb.headers.get("location") ?? ""), "the sign-up link verifies and goes on to choose a password", `${cb?.status} → ${cb?.headers.get("location")}`);
    r = await api("/api/auth/email/request-confirmation", null, { method: "POST", body: JSON.stringify({ name: "Rig Client", email: "rig-signup-client@rig.invalid", kind: "client", company: "X" }) });
    ok(r.status === 410, "the old client branch of sign-up is closed (requests go to Ask for access)", r.status);

    // change of sign-in email: one email to each address, and each address's link confirms on its own. The rig's auth
    // confirms on the first link (autoconfirm is on, so GoTrue skips the second confirmation); production asks for both.
    // So each link is tried on its own account: the new address's link is the one a token_hash would have broken.
    for (const which of ["new", "current"]) {
      const old = `rig-mailchange@rig.invalid`, fresh = `rig-mailchange-new@rig.invalid`;
      await clean();
      const mk = await (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: old, password: PW, email_confirm: true, app_metadata: { is_approved: true, role: "user" } }) })).json();
      const who = await session(old);
      n = (await sentList()).length;
      r = await api("/api/account/email-change", who, { method: "POST", body: JSON.stringify({ email: fresh }) });
      j = await r.json();
      const toOld = (await newSends(n, old, /sign-in email/))[0];
      const toNew = (await newSends(n, fresh, /sign-in email/))[0];
      if (which === "new") ok(r.ok && toOld && toNew && /^Clearway </.test(String(toNew.from)), "change of email: one email to each address, sent by us", `${r.status} ${j.error ?? ""}`);
      const mail = which === "new" ? toNew : toOld;
      const link = mail ? linkIn((await sentBody(mail.id)).html, /https?:\/\/[^"\s<]+\/auth\/callback\?[^"\s<]+/) : null;
      const hop = link ? await fetch(onRig(link), { redirect: "manual" }) : null;
      const emailNow = (await (await svc(`/auth/v1/admin/users/${mk.id}`)).json()).email;
      ok(/\/account\/profile\?email-link=1/.test(hop?.headers.get("location") ?? "") && emailNow === fresh, `change of email: the link to the ${which} address confirms and lands on the profile page`, `${hop?.headers.get("location")} · now ${emailNow}`);
      if (which === "new") {
        r = await api("/api/account/email-change", who, { method: "POST", body: JSON.stringify({ email: "rig-mailchange-other@rig.invalid" }) });
        ok(r.status === 429 || r.status === 401, "change of email: asking again within a minute waits", r.status);
      }
      await svc(`/auth/v1/admin/users/${mk.id}`, { method: "DELETE" });
    }
  }

  // ── 6. every one of them is in Mailbox › Sent with a delivery status ──
  {
    const rows = await db(`intake_messages?select=sent_kind,delivery_status,to_addrs,from_addr,sent_html&direction=eq.outbound&received_at=gte.${encodeURIComponent(startedAt)}`);
    const KINDS = ["client-request-ops", "client-invite", "client-refused", "password-reset", "password-reset-admin", "account-invite", "email-change-current", "email-change-new"];
    for (const k of KINDS) {
      const got = rows.filter((x) => x.sent_kind === k);
      ok(got.length > 0 && got.every((x) => x.delivery_status === "sent" && x.sent_html === null && /^Clearway </.test(x.from_addr)), `Mailbox › Sent: ${k} is recorded, status Sent, from the brand, no body kept`, `${got.length} row(s) ${got.map((x) => x.delivery_status).join(",")}`);
    }
  }
} finally {
  await browser.close();
  await api("/api/admin/clients/settings", admin, { method: "PUT", body: JSON.stringify({ emails: before.emails ?? [] }) });
  await clean();
  await svc(`/rest/v1/intake_messages?direction=eq.outbound&received_at=gte.${encodeURIComponent(startedAt)}&to_addrs=ov.{${[ME.email, LATE.email, ...OPS, "rig-signup@rig.invalid", "rig-mailchange@rig.invalid", "rig-mailchange-new@rig.invalid", "rig-onboard-refused@rig.invalid"].join(",")}}`, { method: "DELETE" });
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
