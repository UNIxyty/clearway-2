// Admin › Clients, the page itself (2026-11-02): the same page padding as every portal page, nothing overlapping at any
// width with the editor open, and every field takes a whole word without losing focus (the editor used to be declared
// inside the page, so each keystroke remounted it and focus fell to <body> after one letter).
//   node --env-file=.env.rig rig/clients-page-check.mjs
// Seeds two invented clients (one waiting, one approved) with the service key, signs in as the rig admin through the
// sign-in proxy (:3989), and removes nothing it did not make.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { settled } from "./lib/settle.mjs";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const B = process.env.RIG_SHELL_URL || "http://127.0.0.1:3989";
const OUT = "rig/.scratch/shots";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 300)}` : ""}`); if (!c) failures += 1; };
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const svc = (path, init = {}) => fetch(`${SB}${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
const PW = JSON.parse(readFileSync("rig/dark-audit.mjs", "utf8").match(/token\?grant_type=password[^\n]*?password: ("[^"]+")/)[1]);
const session = async (email, password = PW) => (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
const cookie = (s) => ({ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`, url: B });

// ── two invented clients: one waiting, one approved ──
async function userFor(email) {
  let r = await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password: `rig-${Math.random().toString(36).slice(2)}-only`, email_confirm: true, app_metadata: { role: "client", client_status: "requested" } }) });
  let u = await r.json();
  if (!r.ok) { const l = await (await svc(`/auth/v1/admin/users?page=1&per_page=500`)).json(); u = (l.users ?? []).find((x) => x.email === email); }
  if (!u?.id) throw new Error(`no auth user for ${email}`);
  return u.id;
}
async function seed(email, person, company, status) {
  await svc(`/rest/v1/clients?email=eq.${encodeURIComponent(email)}`, { method: "DELETE" });
  const row = { user_id: await userFor(email), email, person_name: person, company, kind: "broker", note: status === "requested" ? "Invented for the Clients page check." : "", status,
    scope: status === "approved" ? [{ kind: "operator", value: "cwy-cwy" }, { kind: "registration", value: "LY-TST" }] : [], switches: status === "approved" ? ["flight_board", "weather"] : [],
    passenger_level: "off", consent: false, requested_at: new Date(Date.now() - 3600e3).toISOString(), decided_at: status === "approved" ? new Date().toISOString() : null };
  const r = await svc("/rest/v1/clients", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify(row) });
  const out = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`seed ${email}: ${r.status} ${JSON.stringify(out).slice(0, 200)}`);
  return out[0];
}
const waitingRow = await seed("rig-clients-page-waiting@rig.invalid", "Rig Waiting Person", "Rig Waiting Brokers (invented)", "requested");
const approvedRow = await seed("rig-clients-page-approved@rig.invalid", "Rig Approved Person", "Rig Approved Air (invented)", "approved");

const admin = await session("rig-access-admin@rig.invalid");
const browser = await chromium.launch();

// ── padding and overlap, at full width, with the rail, the rail's own band, narrow, and a phone ──
const WIDTHS = [[1440, "full", false], [1250, "full, short", false], [1440, "rail", true], [1100, "rail band", false], [880, "narrow", false], [390, "phone", false]];
for (const [width, label, collapsed] of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
  await ctx.addCookies([cookie(admin)]);
  if (collapsed) await ctx.addInitScript(() => { try { localStorage.setItem("cw-shell-collapsed", "1"); } catch { /* */ } });
  const page = await ctx.newPage();
  await page.goto(`${B}/admin/clients`, { waitUntil: "load" });
  await page.waitForSelector(`[data-client-request="${waitingRow.id}"]`, { timeout: 20000 }).catch(() => {});
  await page.locator(`[data-client-request="${waitingRow.id}"] [data-review]`).click().catch(() => {});
  await page.waitForSelector(`[data-client-editor="${waitingRow.id}"]`, { timeout: 10000 }).catch(() => {});
  await settled(page);
  const m = await page.evaluate(() => {
    const pad = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cw-page-pad"));
    const root = document.querySelector("[data-admin-clients]");
    const main = root?.parentElement?.getBoundingClientRect();
    const card = root?.firstElementChild?.getBoundingClientRect();
    const inset = card && main ? Math.round(card.left - main.left) : null;
    // overlap: visible leaves that carry text, and every control, pairwise (never an element and its own ancestor)
    const leaves = [...root.querySelectorAll("*")].filter((e) => {
      const s = getComputedStyle(e); if (s.visibility === "hidden" || s.display === "none" || +s.opacity === 0) return false;
      const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
      const control = /^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/.test(e.tagName) || e.getAttribute("role") === "switch";
      const text = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      return control || text;
    });
    const label = (e) => `<${e.tagName.toLowerCase()}> "${(e.innerText || e.value || e.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40)}"`;
    const hits = [];
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i], b = leaves[j]; if (a.contains(b) || b.contains(a)) continue;
      const r = a.getBoundingClientRect(), q = b.getBoundingClientRect();
      const w = Math.min(r.right, q.right) - Math.max(r.left, q.left), h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
      if (w > 2 && h > 2) hits.push(`${label(a)} × ${label(b)} (${Math.round(w)}×${Math.round(h)})`);
    }
    // overflow: nothing past the right edge of the page's content unless an ancestor scrolls or clips sideways
    const clips = (e) => { for (let x = e.parentElement; x && x !== root; x = x.parentElement) { const ov = getComputedStyle(x).overflowX; if (ov !== "visible") return true; } return false; };
    const right = root.getBoundingClientRect().right;
    const out = leaves.filter((e) => e.getBoundingClientRect().right > right + 1 && !clips(e)).map(label);
    return { pad, inset, hits: hits.slice(0, 8), nHits: hits.length, out: out.slice(0, 6), pageScroll: document.documentElement.scrollWidth - innerWidth };
  });
  ok(m.inset === m.pad, `${width} ${label}: the page padding is the portal's (--cw-page-pad ${m.pad}px), not its own`, `cards inset ${m.inset}px`);
  ok(m.nHits === 0, `${width} ${label}: nothing overlaps on the page, editor open`, m.hits.join(" | "));
  ok(m.out.length === 0 && m.pageScroll <= 0, `${width} ${label}: nothing runs past the edge, no sideways scroll`, `${m.out.join(" | ")} · page scroll ${m.pageScroll}`);
  await page.screenshot({ path: `${OUT}/clients-${width}-${label.replace(/\s+/g, "-")}.png`, fullPage: true });
  await ctx.close();
}

// ── every field takes a whole word, and focus never leaves it ──
async function typeWord(page, locator, word, what) {
  await locator.click();
  const steps = [];
  for (const ch of word) {
    await page.keyboard.type(ch);
    steps.push(await locator.evaluate((el) => ({ focused: document.activeElement === el, value: el.value })).catch(() => ({ focused: false, value: "(gone)" })));
  }
  const lost = steps.findIndex((s) => !s.focused);
  const value = await locator.inputValue().catch(() => "(gone)");
  ok(lost === -1 && value.endsWith(word), `${what}: "${word}" typed in full, focus never left`, lost === -1 ? `value "${value}"` : `focus lost after letter ${lost + 1}; value "${value}"`);
}
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([cookie(admin)]);
  const page = await ctx.newPage();
  await page.goto(`${B}/admin/clients`, { waitUntil: "load" });
  await page.waitForSelector(`[data-client-request="${waitingRow.id}"] [data-review]`, { timeout: 20000 });
  await page.locator(`[data-client-request="${waitingRow.id}"] [data-review]`).click();
  const editor = page.locator(`[data-client-editor="${waitingRow.id}"]`);
  await editor.waitFor({ timeout: 10000 });
  const fields = editor.locator("input:not([type=checkbox]):not([type=radio]), textarea");
  const n = await fields.count();
  ok(n >= 1, "the editor has text fields to type into", n);
  for (let i = 0; i < n; i += 1) await typeWord(page, fields.nth(i), "KlasJet", `editor field ${i + 1} (${await fields.nth(i).getAttribute("aria-label") ?? "unlabelled"})`);
  // the page's own fields outside the editor (search, settings)
  const pageFields = page.locator("[data-admin-clients] input:not([type=checkbox]):not([type=radio]), [data-admin-clients] textarea").filter({ hasNot: page.locator("[data-client-editor] *") });
  const outside = await page.locator("[data-admin-clients] input:not([type=checkbox]):not([type=radio]):not([data-client-editor] input), [data-admin-clients] textarea:not([data-client-editor] textarea)").count();
  for (let i = 0; i < outside; i += 1) { const f = page.locator("[data-admin-clients] input:not([type=checkbox]):not([type=radio]):not([data-client-editor] input), [data-admin-clients] textarea:not([data-client-editor] textarea)").nth(i); await typeWord(page, f, "KlasJet", `page field ${i + 1} (${await f.getAttribute("aria-label") ?? "unlabelled"})`); await f.fill(""); }
  void pageFields;
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Cancel" }).first().click().catch(() => {});
  // the remove-confirm field in the modal, on the approved client
  await page.locator(`[data-client-approved="${approvedRow.id}"] [data-change]`).click();
  await page.locator(`[data-client-editor="${approvedRow.id}"]`).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Remove access" }).first().click();
  const confirm = page.getByLabel("Company name to confirm");
  await confirm.waitFor({ timeout: 10000 });
  await typeWord(page, confirm, "Rig Approved Air", "remove confirm (in the dialog)");
  await page.getByRole("button", { name: "Keep access" }).click();
  await ctx.close();
}
// ── smart search: real records only, prefix first, keyboard first, says so when nothing matches ──
{
  const { rankSuggestions } = await import("../lib/clients/suggest.mjs");
  const order = rankSuggestions([{ kind: "client", value: "c", label: "Cevennes Air", keys: ["Cevennes Air"] }, { kind: "operator", value: "evr", label: "EVRA Jets", keys: ["evr", "EVRA Jets"] }], "ev").map((i) => i.label);
  ok(order[0] === "EVRA Jets", "ranking: a prefix match comes before a match inside a word (EV → EVRA before Cevennes)", order.join(" › "));
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([cookie(admin)]);
  const page = await ctx.newPage();
  await page.goto(`${B}/admin/clients`, { waitUntil: "load" });
  await page.locator(`[data-client-request="${waitingRow.id}"] [data-review]`).click();
  const ed = page.locator(`[data-client-editor="${waitingRow.id}"]`); await ed.waitFor({ timeout: 10000 });
  const scopeBox = ed.getByRole("combobox", { name: "Add to scope" });
  const firstOption = async () => (await page.locator("[data-suggestions] [role=option]").first().getAttribute("data-option").catch(() => null));
  await scopeBox.click(); await page.keyboard.type("kla");
  await page.locator("[data-suggestions] [role=option]").first().waitFor({ timeout: 10000 }).catch(() => {});
  ok(await firstOption() === "operator:klj", "scope: “kla” suggests the operator KlasJet first (by name; the code is klj)", await firstOption());
  await page.keyboard.press("Enter");
  ok(await ed.locator('[data-scope-entry="operator:klj"]').count() === 1, "scope: ↵ adds it", await ed.locator("[data-scope-entry]").evaluateAll((els) => els.map((e) => e.getAttribute("data-scope-entry")).join(", ")));
  await scopeBox.fill(""); await page.keyboard.type("ly-t");
  await page.locator('[data-suggestions] [data-option^="registration:"]').first().waitFor({ timeout: 10000 }).catch(() => {});
  const regs = await page.locator('[data-suggestions] [data-option^="registration:"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-option")));
  ok(regs.includes("registration:LY-TST"), "scope: “ly-t” suggests the fleet's LY-TST", regs.join(", "));
  const idx = (await page.locator("[data-suggestions] [role=option]").evaluateAll((els) => els.map((e) => e.getAttribute("data-option")))).indexOf("registration:LY-TST");
  for (let i = 0; i < idx; i += 1) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  ok(await ed.locator('[data-scope-entry="registration:LY-TST"]').count() === 1, "scope: ↓ then ↵ takes the highlighted one");
  await scopeBox.fill(""); await page.keyboard.type("11-2026/3");
  await page.locator('[data-suggestions] [data-option^="trip:"]').first().waitFor({ timeout: 10000 }).catch(() => {});
  ok(await page.locator('[data-suggestions] [data-option^="trip:"]').count() >= 1, "scope: a trip number suggests real trips from the wall", await page.locator('[data-suggestions] [data-option^="trip:"]').count());
  await scopeBox.fill(""); await page.keyboard.type("zzqq-none");
  await page.locator("[data-no-match]").waitFor({ timeout: 5000 }).catch(() => {});
  ok(/No operator, aircraft or trip matches “zzqq-none”/.test(await page.locator("[data-no-match]").innerText().catch(() => "")), "scope: nothing matches → it says so (and offers no free-text add)");
  await page.keyboard.press("Escape");
  ok(await page.locator("[data-suggestions]").count() === 0, "scope: Esc closes the suggestions");
  await page.getByRole("button", { name: "Cancel" }).first().click();
  // the page search: a person opens their row; an aircraft filters to who can see it
  const find = page.getByRole("combobox", { name: "Find a client, an operator, an aircraft or a trip" });
  await find.click(); await page.keyboard.type("Rig Approved");
  await page.locator(`[data-suggestions] [data-option="client:${approvedRow.id}"]`).waitFor({ timeout: 10000 }).catch(() => {});
  const ci = (await page.locator("[data-suggestions] [role=option]").evaluateAll((els) => els.map((e) => e.getAttribute("data-option")))).indexOf(`client:${approvedRow.id}`);
  for (let i = 0; i < ci; i += 1) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  ok(await page.locator(`[data-client-editor="${approvedRow.id}"]`).count() === 1, "page search: a person's name opens their client", ci);
  await page.getByRole("button", { name: "Cancel" }).first().click();
  await find.click(); await page.keyboard.type("LY-TST");
  await page.locator('[data-suggestions] [data-option="registration:LY-TST"]').waitFor({ timeout: 10000 }).catch(() => {});
  const ri = (await page.locator("[data-suggestions] [role=option]").evaluateAll((els) => els.map((e) => e.getAttribute("data-option")))).indexOf("registration:LY-TST");
  for (let i = 0; i < ri; i += 1) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const filt = await page.locator("[data-clients-filter]").innerText().catch(() => "");
  ok(/can see LY-TST/.test(filt) && await page.locator(`[data-client-approved="${approvedRow.id}"]`).count() === 1, "page search: an aircraft lists the approved clients who can see it", filt.replace(/\s+/g, " "));
  await ctx.close();
  // the server refuses a scope entry that does not exist, whatever the page sends
  const res = await fetch(`${B}/api/admin/clients/${approvedRow.id}`, { method: "PATCH", headers: { "content-type": "application/json", cookie: `${cookie(admin).name}=${cookie(admin).value}` }, body: JSON.stringify({ scope: [{ kind: "operator", value: "no-such-operator" }, { kind: "operator", value: "cwy-cwy" }], switches: ["flight_board"], passengerLevel: "off" }) });
  const body = await res.json().catch(() => ({}));
  ok(res.status === 400 && /no operator no-such-operator in Leon/i.test(String(body.error)), "server: an operator that does not exist is refused, nothing saved", `${res.status} ${body.error ?? ""}`);
}
await browser.close();

for (const r of [waitingRow, approvedRow]) { await svc(`/rest/v1/clients?id=eq.${r.id}`, { method: "DELETE" }); await svc(`/auth/v1/admin/users/${r.user_id}`, { method: "DELETE" }); }
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
