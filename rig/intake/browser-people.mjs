// The intake screen after rig/intake/e2e-people.mjs: what reached Leon of each leg's passengers and crew, a refused
// passenger write in red, and no person's value on the page. Production build via the proxy.
//   node --env-file=.env.rig rig/intake/browser-people.mjs     screenshots → rig/.scratch/shots/people-*.png
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.RIG_URL || "http://127.0.0.1:3999";
const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
const PERSONAL = /TEST\d{5}|TESTC\d{4}|CREWMAN|CREWLY|CABINSON|STEWARDE|NOTREAL|FAKEWELL|MOCKLEY/;
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${d}` : ""}`); if (!c) failures += 1; };
const db = async (p) => (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } })).json();
const browser = await chromium.launch();

for (const [ref, file, expect] of [["RIGPAX16", "people-loaded", "loaded"], ["RIGPAX17", "people-refused", "refused"]]) {
  const r = (await db(`intake_requests?select=id&reference=eq.${ref}`))[0];
  if (!r) { ok(false, `${ref} exists (run rig/intake/e2e-people.mjs first)`); continue; }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
  await page.goto(`${BASE}/agent/intake?r=${r.id}`, { waitUntil: "load" });
  await page.waitForSelector("text=What was sent to Leon", { timeout: 30000 });
  await page.waitForTimeout(1200);
  const sent = page.locator('section[aria-label="What was sent to Leon"]');
  await sent.scrollIntoViewIfNeeded();
  const text = await sent.innerText();
  await sent.screenshot({ path: `${OUT}/${file}-sent.png` });
  const pipe = page.locator("text=Passengers and crew").first();
  await pipe.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${file}-pipeline.png`, fullPage: false });
  if (expect === "loaded") {
    const banner = await page.locator("body").innerText();
    ok(/Passengers are in Leon's passenger list as text\. Crew are a note in the OPS notes, not assigned in Leon\./.test(banner), `${ref}: the Loaded banner says what reached Leon: passengers as text, crew as a note, not assigned`);
    ok((text.match(/16 passengers written to the flight's passenger list in Leon/g) ?? []).length === 2, `${ref}: each leg says its 16 passengers are in Leon's passenger list`);
    ok((text.match(/4 crew written into the flight's OPS notes with the flight, as the operator's crew\. NOT assigned in Leon/g) ?? []).length === 2, `${ref}: each leg says its crew were recorded as a note, NOT assigned`);
  } else {
    ok((text.match(/Passengers NOT in Leon\. Leon: Passenger list is locked by another user/g) ?? []).length === 2, `${ref}: the refused passenger write is shown per leg, with Leon's reason`);
    const red = await sent.locator('[role="alert"]').count();
    ok(red >= 2, `${ref}: shown as an alert (red)`, `${red} alerts`);
    const banner = await page.locator("body").innerText();
    ok(/passengers NOT in Leon for leg 1, 2/.test(banner), `${ref}: the request's status says so`);
    ok(/Both flights are in Leon\. Passengers of leg 1, 2 are NOT in Leon\./.test(banner) && !/Loaded\. Both legs are in Leon/.test(banner), `${ref}: the banner says the passengers are NOT in Leon (not "Loaded")`);
  }
  // Names are readable in "What the agent read" by design (documents and dates of birth masked there); the Leon
  // outcome carries none, and no document number appears anywhere on the page.
  ok(!PERSONAL.test(text), `${ref}: the Leon outcome shows counts only — no name or document`, (text.match(PERSONAL) ?? [""])[0]);
  const body = await page.evaluate(() => document.body.innerText);
  ok(!/TEST\d{5}|TESTC\d{4}/.test(body), `${ref}: no passport number anywhere on the page`, (body.match(/TEST\d{5}|TESTC\d{4}/) ?? [""])[0]);
  ok(!errors.length, `${ref}: no page errors`, errors.join(" | "));
  await ctx.close();
}
await browser.close();
console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"} · screenshots in ${OUT}/people-*.png`);
process.exit(failures ? 1 : 0);
