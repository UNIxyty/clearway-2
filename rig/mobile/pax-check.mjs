// The passenger viewer (mobile Stage 4, 2026-10-20) — the rules that are not negotiable, each proven, on the phone
// page and on the wall console's Flights panel (one implementation, two places):
//   1. Masked by default: the LIST RESPONSE BODY and the PAGE SOURCE before any reveal contain no document field and
//      none of the fake passport numbers or dates of birth the rig's Leon holds — absent, not hidden.
//   2. One at a time: opening a second passenger closes the first; the phone's document covers the list.
//   3. Reveal is logged: an intake.personal_revealed row with the flight and the row — never a value; the burst row
//      only when more than three different flights are revealed in ten minutes; the 40-per-10-minutes stop answers 429.
//   4. Fetched on reveal: the document fields appear in the page only after the reveal call; a 403 shows nothing.
//   5. Nothing in a URL: the page's URL and the reveal URL carry ids only.
//   6. Copy all details is a reveal: it calls the endpoint again, so it is logged again.
//   Plus: the watermark carries the viewer's name and the UTC time; the view closes after 30 s; leaving the
//   foreground hides names and closes the document; a role without the permission gets no Hold / Show.
// Needs the rig (rig/start.sh; rig/manifest/start.sh for the agent's Leon with fake passengers; the console built).
//   node --env-file=.env.rig rig/mobile/pax-check.mjs
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { BASE, PHONE, audit, context, makeOk, overflow, targets } from "./lib.mjs";

const { ok, state } = makeOk();
const A = `${BASE}/agent/api`;
const psql = (sql) => execFileSync("docker", ["exec", "supabase_db_rig", "psql", "-U", "postgres", "-tAc", sql], { encoding: "utf8" }).trim();
const DOC_KEYS = /dateOfBirth|placeOfBirth|documentNumber|documentExpiry|documentCountry|passport|expiresDate/i;
const DOC_VALUES = /TEST\d{5}|\b19[6-9]\d-\d\d-\d\d\b|\d\d-[A-Z][a-z]{2}-19[6-9]\d/; // the rig's fake passports and births

// ── the flights the rig's Leon holds (fake people) ──
const search = await (await fetch(`${A}/tools/invoke`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "search_manifest_flights", input: { from: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10), to: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) } /* the picker's own window; at most 62 days */ }) })).json();
const flights = (search.result?.flights ?? search.flights ?? []).filter((f) => !f.flight?.isCnl);
const withPax = flights.find((f) => f.key === "cwy-cwy:880001") ?? flights[0];
if (!withPax) { console.error("the rig's Leon lists no flights: run rig/manifest/start.sh"); process.exit(2); }
const FID = withPax.key;
const idOf = (fid) => encodeURIComponent(fid);
// The audit log is append-only, so a run cannot forget its reveals: if a run in the last ten minutes used the window
// up, wait for the oldest reveals to fall out of it (the stop is 40 per person per 10 minutes; this run makes ~25).
{
  const inWindow = () => Number(psql("select count(*) from agent_audit_log where kind='intake.personal_revealed' and created_at > now() - interval '10 minutes'"));
  let n = inWindow();
  if (n > 12) { const oldest = psql("select to_char(min(created_at) + interval '10 minutes 5 seconds', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') from agent_audit_log where kind='intake.personal_revealed' and created_at > now() - interval '10 minutes'"); console.log(`wait  ${n} reveals in this person's window from an earlier run; the stop would fire early. Waiting until ${oldest}.`); while (inWindow() > 12) await new Promise((r) => setTimeout(r, 15_000)); }
}

// ── 1. the list response: names only ──
const listRes = await fetch(`${A}/flights/${idOf(FID)}/passengers`); const listText = await listRes.text(); const list = JSON.parse(listText);
ok(listRes.ok && list.ok && list.passengers.length > 0, `list: ${FID} has passengers`, `${list.count} · keys ${Object.keys(list.passengers[0] ?? {}).join(",")}`);
ok(!DOC_KEYS.test(listText), "list response: no document field at all (not masked — absent)", Object.keys(list.passengers[0] ?? {}).join(","));
ok(!DOC_VALUES.test(listText), "list response: none of the rig's fake passport numbers or dates of birth");
ok(list.seconds === 30, "the view's lifetime is 30 s, the same number as intake", String(list.seconds));
const first = list.passengers[0];

// ── 3/4. reveal: one passenger's four fields, logged with flight and row only ──
const before = Number(psql("select count(*) from agent_audit_log where kind='intake.personal_revealed'"));
const rev = await (await fetch(`${A}/flights/${idOf(FID)}/passengers/${encodeURIComponent(first.id)}/reveal`, { method: "POST" })).json();
ok(rev.ok && rev.passenger && rev.passenger.documentNumber && rev.passenger.dateOfBirth, "reveal: one passenger's document fields, fetched now", Object.keys(rev.passenger ?? {}).join(","));
ok(!("placeOfBirth" in (rev.passenger ?? {})), "reveal: no place of birth is fetched or carried");
const after = Number(psql("select count(*) from agent_audit_log where kind='intake.personal_revealed'"));
const lastDetail = psql("select detail::text from agent_audit_log where kind='intake.personal_revealed' order by created_at desc limit 1");
ok(after === before + 1, "reveal: one audit row", `${before} → ${after}`);
const fidRe = new RegExp(`"flightId":\\s*"${FID.replace(/[-/\\^$*+?.()|[\]{}]/g, (c) => "\\" + c)}"`);
ok(fidRe.test(lastDetail) && /"row":\s*\d+/.test(lastDetail) && !DOC_VALUES.test(lastDetail) && !/surname|given|EXAMPLE|SAMPLE/i.test(lastDetail), "audit row: the flight and the row, never a value or a name", lastDetail.slice(0, 160));

// ── 3. the burst rule: the same person on more than three flights in ten minutes writes ONE extra row ──
const others = flights.filter((f) => f.key !== FID).slice(0, 4);
const burstBefore = Number(psql("select count(*) from agent_audit_log where kind='intake.personal_reveal_burst'"));
let revealedOn = 1;
for (const f of others) {
  const l = await (await fetch(`${A}/flights/${idOf(f.key)}/passengers`)).json();
  if (!l.ok || !l.passengers?.length) continue;
  const r = await (await fetch(`${A}/flights/${idOf(f.key)}/passengers/${encodeURIComponent(l.passengers[0].id)}/reveal`, { method: "POST" })).json();
  if (r.ok) revealedOn += 1;
}
const burstAfter = Number(psql("select count(*) from agent_audit_log where kind='intake.personal_reveal_burst'"));
if (revealedOn > 3) ok(burstAfter === burstBefore + 1, `burst: reveals on ${revealedOn} different flights wrote exactly one intake.personal_reveal_burst row`, `${burstBefore} → ${burstAfter}`);
else console.log(`skip  burst: only ${revealedOn} flights with passengers on the rig`);
const burstDetail = psql("select detail::text from agent_audit_log where kind='intake.personal_reveal_burst' order by created_at desc limit 1");
if (revealedOn > 3) ok(/"flights":\s*\[/.test(burstDetail) && /"count":\s*\d+/.test(burstDetail) && !DOC_VALUES.test(burstDetail), "burst row: names the flights and the count, no values", burstDetail.slice(0, 160));
// a whole flight checked end to end writes nothing extra
const whole = flights.find((f) => f.key === "cwy-cwy:880002") ?? null; // 14 passengers
if (whole) {
  const l = await (await fetch(`${A}/flights/${idOf(whole.key)}/passengers`)).json();
  const b0 = Number(psql("select count(*) from agent_audit_log where kind='intake.personal_reveal_burst'"));
  let n = 0; for (const p of l.passengers ?? []) { const r = await (await fetch(`${A}/flights/${idOf(whole.key)}/passengers/${encodeURIComponent(p.id)}/reveal`, { method: "POST" })).json(); if (r.ok) n += 1; }
  const b1 = Number(psql("select count(*) from agent_audit_log where kind='intake.personal_reveal_burst'"));
  ok(n === (l.passengers ?? []).length && b1 === b0, `a whole flight checked end to end (${n} reveals) writes no burst row`, `${b0} → ${b1}`);
}
// ── the phone page ──
const browser = await chromium.launch();
async function phonePage(theme = "light") {
  const ctx = await context(browser, { theme }); const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/m/flights/${idOf(FID)}/passengers`, { waitUntil: "load" });
  await page.locator("[data-passenger-viewer]").waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => !document.querySelector("[role=status][aria-busy='true']"), null, { timeout: 30_000 });
  return { ctx, page, errors };
}
for (const theme of ["light", "dark"]) {
  const { ctx, page, errors } = await phonePage(theme);
  const html = await page.content();
  ok(!DOC_KEYS.test(html.replace(/documents hidden until opened|document\. It covers|Document details|see their document/gi, "")) && !DOC_VALUES.test(html), `phone · ${theme}: the page source before any reveal has no document field and no document value`);
  ok(!/passengers\?|row=|surname=/.test(page.url()), `phone · ${theme}: nothing of a passenger in the URL`, page.url());
  await audit(ok, "passengers", theme, page, errors);
  await ctx.close();
}
{
  const { ctx, page } = await phonePage("light");
  // 2/4: hold for a second → the document covers the list; the fields are there only now
  const hold = page.getByRole("button", { name: /^Hold to show the document of/ }).first();
  await hold.dispatchEvent("pointerdown"); await page.waitForTimeout(400); await hold.dispatchEvent("pointerup"); await page.waitForTimeout(500);
  ok((await page.getByRole("dialog").count()) === 0, "phone: letting go before one second cancels (nothing shown)");
  await hold.dispatchEvent("pointerdown"); await page.waitForTimeout(1300);
  await page.getByRole("dialog").waitFor({ timeout: 10_000 });
  const dlg = page.getByRole("dialog");
  const text = (await dlg.innerText()).replace(/\s+/g, " ");
  ok(/DOCUMENT NUMBER/.test(text) && /TEST\d{5}/.test(text) && /DATE OF BIRTH/.test(text) && /EXPIRES/.test(text), "phone: after a one-second hold the document covers the list with the four fields", text.slice(0, 160));
  ok(!/PLACE OF BIRTH/.test(text), "phone: no place of birth shown");
  const name = (await page.locator("[data-phone-shell]").first().evaluate(() => "")) ?? "";
  const wm = await dlg.locator("[aria-hidden='true'] span").first().innerText();
  ok(/[A-Z]/.test(wm) && /\d\d:\d\d:\d\dZ/.test(wm), "phone: the watermark carries the viewer's name and the UTC time", wm);
  ok(/Your name and the time are on this view/.test(text), "phone: the fact is said on the screen, once");
  ok(/0:(30|29|28)/.test(text), "phone: the countdown starts at 30 s", text.match(/0:\d\d/)?.[0]);
  const listVisible = await page.locator("[data-passenger-viewer] [role=button], [data-passenger-viewer] button[aria-label^='Hold']").first().isVisible().catch(() => false);
  ok(!listVisible || (await dlg.boundingBox())?.height > 700, "phone: the rest of the list is covered while a document is open");
  // 6: Copy all details is a reveal → another audit row
  const c0 = Number(psql("select count(*) from agent_audit_log where kind='intake.personal_revealed'"));
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await dlg.getByRole("button", { name: /Copy all details/ }).click(); await page.waitForTimeout(1500);
  const c1 = Number(psql("select count(*) from agent_audit_log where kind='intake.personal_revealed'"));
  ok(c1 === c0 + 1, "phone: Copy all details is a reveal — one more audit row", `${c0} → ${c1}`);
  // Hide now
  await dlg.getByRole("button", { name: /Hide now/ }).click(); await page.waitForTimeout(400);
  ok((await page.getByRole("dialog").count()) === 0, "phone: Hide now closes the document");
  ok(!DOC_VALUES.test(await page.content()), "phone: after hiding, no document value is left in the page");
  // the view closes itself after 30 s
  await hold.dispatchEvent("pointerdown"); await page.waitForTimeout(1300); await page.getByRole("dialog").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(31_500);
  ok((await page.getByRole("dialog").count()) === 0, "phone: the document closes itself after 30 s");
  // away: leaving the foreground hides names and closes any open document
  await hold.dispatchEvent("pointerdown"); await page.waitForTimeout(1300); await page.getByRole("dialog").waitFor({ timeout: 10_000 });
  // pagehide is the earliest of the events a phone fires on its way to the switcher; the blur must be in the SAME frame
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  const sameFrame = await page.evaluate(() => ({ attr: document.documentElement.getAttribute("data-pax-away"), blur: getComputedStyle(document.querySelector("[data-pax-list]")).filter, doc: document.querySelector("[data-pax-doc]") ? getComputedStyle(document.querySelector("[data-pax-doc]")).visibility : "gone" }));
  ok(sameFrame.attr === "1" && /blur\(7px\)/.test(sameFrame.blur) && (sameFrame.doc === "hidden" || sameFrame.doc === "gone"), "phone: on pagehide the names are blurred and the document hidden synchronously, before any re-render", JSON.stringify(sameFrame));
  await page.waitForTimeout(400);
  const cover = (await page.locator("[data-passenger-viewer]").innerText()).replace(/\s+/g, " ");
  ok((await page.getByRole("dialog").count()) === 0 && /Hidden while you were away/.test(cover), "phone: leaving the foreground closes the document and covers the names");
  const blur = await page.locator("[data-passenger-viewer] [data-pax-list]").first().evaluate((el) => getComputedStyle(el).filter);
  ok(/blur/.test(blur), "phone: the names are blurred under the cover", blur);
  await page.getByRole("button", { name: "Show names" }).click(); await page.waitForTimeout(300);
  ok(!/Hidden while you were away/.test((await page.locator("[data-passenger-viewer]").innerText())), "phone: Show names lifts the cover");
  await ctx.close();
}
// no permission: a role without intake.people.reveal sees names and no Hold
{
  const ctx = await context(browser); const page = await ctx.newPage();
  await page.route(/\/agent\/api\/flights\/[^/]+\/passengers$/, async (route) => { const r = await route.fetch(); const j = await r.json(); await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...j, canReveal: false }) }); });
  await page.goto(`${BASE}/m/flights/${idOf(FID)}/passengers`, { waitUntil: "load" }); await page.waitForTimeout(2500);
  ok((await page.getByRole("button", { name: /^Hold to show/ }).count()) === 0 && /Your role shows names/.test(await page.locator("[data-passenger-viewer]").innerText()), "phone: without the permission there is no Hold and the strip says why");
  await ctx.close();
}
// a refused reveal shows nothing
{
  const ctx = await context(browser); const page = await ctx.newPage();
  await page.route(/\/reveal$/, (route) => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ ok: false, message: "You don't have permission to do this." }) }));
  await page.goto(`${BASE}/m/flights/${idOf(FID)}/passengers`, { waitUntil: "load" }); await page.waitForTimeout(2500);
  const hold = page.getByRole("button", { name: /^Hold to show the document of/ }).first();
  await hold.dispatchEvent("pointerdown"); await page.waitForTimeout(1600);
  ok((await page.getByRole("dialog").count()) === 0 && !DOC_VALUES.test(await page.content()) && (await page.locator("[role=alert]").count()) > 0, "phone: a refused reveal shows nothing and says so");
  await ctx.close();
}

// ── the console's Flights panel: the same viewer on a desk ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/\/(digital-wall\/(?!api)|assets\/|fonts\/)/, async (route) => { const u = new URL(route.request().url()); const file = u.pathname.startsWith("/digital-wall/") && !/\.[a-z0-9]+$/i.test(u.pathname) ? "opsboard-react/dist/index.html" : `opsboard-react/dist${u.pathname.replace(/^\/digital-wall/, "")}`; try { await route.fulfill({ path: file }); } catch { await route.fulfill({ status: 404, body: "" }); } });
  await ctx.route(/^https?:\/\/[^/]+\/api\//, (route) => route.continue({ url: route.request().url().replace("/api/", "/digital-wall/api/") }));
  // The rig has two mock Leons for one operator (the wall's and the manifest's), so the console's flight is the wall's
  // and its passenger calls are sent to the flight the agent's Leon holds — the same panel, real data.
  const wall = await (await fetch(`${BASE}/digital-wall/api/flights/normalized`)).json();
  const wallKey = wall.flights?.[0]?.key; if (!wallKey) { ok(false, "console: the rig wall has a flight to select"); }
  await ctx.route(/\/agent\/api\/flights\/[^/]+\/passengers/, (route) => route.continue({ url: route.request().url().replace(/\/agent\/api\/flights\/[^/]+\//, `/agent/api/flights/${encodeURIComponent(FID)}/`) }));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/digital-wall/console/flights`, { waitUntil: "load" }); await page.waitForTimeout(3500);
  // select a flight as a person does: the first row's callsign
  const callsigns = (wall.flights ?? []).map((f) => f.flight?.flightNo).filter(Boolean);
  for (const cs of callsigns) { const cell = page.getByText(cs, { exact: true }).first(); if (await cell.count()) { await cell.click(); break; } }
  await page.waitForTimeout(2500);
  const show = page.getByRole("button", { name: "Show names" });
  if (await show.count()) {
    const html0 = await page.content();
    ok(!DOC_VALUES.test(html0), "console: before anything is opened, no document value is in the page");
    await show.click(); await page.waitForFunction(() => !document.querySelector("[role=status][aria-busy='true']"), null, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(500);
    ok(!DOC_KEYS.test((await page.content()).replace(/documents hidden until opened|Documents stay hidden|Document details/g, "")) && !DOC_VALUES.test(await page.content()), "console: the names list carries no document field or value");
    await page.getByRole("button", { name: /^Show the document of/ }).first().click(); await page.waitForTimeout(2500);
    const panel = (await page.locator("[data-passenger-viewer]").innerText()).replace(/\s+/g, " ");
    ok(/DOCUMENT NUMBER/.test(panel) && /TEST\d{5}/.test(panel) && /Your name and the time are on this view/.test(panel), "console: Show opens one passenger's document inline, watermarked, with the fact said");
    const second = page.getByRole("button", { name: /^Show the document of/ }).nth(0);
    ok(await second.isDisabled().catch(() => false), "console: while one is open, the others' Show is held (one at a time)");
    await page.getByRole("button", { name: /^Hide the document of/ }).click(); await page.waitForTimeout(300);
    ok(!DOC_VALUES.test(await page.content()), "console: Hide leaves no document value in the page");
    await page.screenshot({ path: "rig/.scratch/shots/console-passengers.png" });
  } else { const t = (await page.locator("body").innerText()).slice(0, 200).replace(/\s+/g, " "); ok(false, "console: the Flights panel offers Show names for the selected flight", t); }
  await ctx.close();
}

await browser.close();

// ── 3. the stop, last, because the window cannot be reset: 40 in ten minutes → 429, logged once ──
{
  let status = 200, tries = 0;
  while (status !== 429 && tries < 45) { const r = await fetch(`${A}/flights/${idOf(FID)}/passengers/${encodeURIComponent(first.id)}/reveal`, { method: "POST" }); status = r.status; tries += 1; }
  const limited = Number(psql("select count(*) from agent_audit_log where kind='intake.personal_reveal_limited'"));
  ok(status === 429, `the stop: the endpoint answers 429 after 40 reveals in ten minutes (reached after ${tries} more; the window had the run's own reveals)`, String(status));
  ok(limited >= 1, "the stop is logged (intake.personal_reveal_limited)", String(limited));
}


console.log(state.failures ? `${state.failures} FAILED` : "ALL PASS");
process.exit(state.failures ? 1 : 0);
