// The intake screen after rig/intake/e2e-people.mjs: passengers in Leon's passenger DATABASE (counts, created/reused),
// the review screen's surname / given-names split (editable, an edit marked), a reused contact's difference as a warning,
// an unknown write in red with the "Send passengers to Leon" action, and no document number anywhere on the page.
// Production build via the proxy.   node --env-file=.env.rig rig/intake/browser-people.mjs  → rig/.scratch/shots/people-*.png
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.RIG_URL || "http://127.0.0.1:3999";
const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 200)}` : ""}`); if (!c) failures += 1; };
const db = async (p) => (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } })).json();
const browser = await chromium.launch();
const DOCS = /TEST\d{5}|TESTC\d{4}/;

async function open(ref, file, checks) {
  const r = (await db(`intake_requests?select=id&reference=eq.${ref}`))[0];
  if (!r) { ok(false, `${ref} exists (run rig/intake/e2e-people.mjs first)`); return; }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
  await page.goto(`${BASE}/agent/intake?r=${r.id}`, { waitUntil: "load" });
  await page.waitForSelector("text=What was sent to Leon", { timeout: 30000 }); await page.waitForTimeout(1500);
  const sent = page.locator('section[aria-label="What was sent to Leon"]');
  await sent.scrollIntoViewIfNeeded(); await sent.screenshot({ path: `${OUT}/people-${file}-sent.png` });
  await checks(page, await sent.innerText());
  const body = await page.evaluate(() => document.body.innerText);
  ok(!DOCS.test(body), `${ref}: no passport number anywhere on the page`, (body.match(DOCS) ?? [""])[0]);
  ok(!errors.length, `${ref}: no page errors`, errors.join(" | "));
  await ctx.close();
}

await open("RIGPAX16", "loaded", async (page, text) => {
  ok((text.match(/16 passengers in the flight's passenger database in Leon \(PAX → DATABASE\)/g) ?? []).length === 2, "each leg: 16 passengers in Leon's passenger database");
  ok(/16 new contacts, 0 existing contacts reused/.test(text) && /0 new contacts, 16 existing contacts reused/.test(text), "leg 1 created 16 contacts, leg 2 reused them (one contact per traveller)");
  ok(/The request's own list is in the OPS notes/.test(text), "says where the request's own list is (OPS notes)");
  const banner = await page.locator("body").innerText();
  ok(/Passengers are in the flight's passenger database \(PAX → DATABASE\)\./.test(banner), "the Loaded banner says the passengers are in the passenger database");
});
await open("RIGPAX19", "split-and-warning", async (page, text) => {
  ok(/Passenger 3: the existing contact in Leon differs from the request in date of birth\. It was reused and not changed/.test(text), "the reused contact's difference is a warning (field name only), and it says the contact was not changed");
  const table = page.locator('[role="table"][aria-label="Passengers, leg 1"]').first();
  await table.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/people-split.png` });
  const t = await table.innerText();
  ok(/Surname/i.test(t) && /Given names/i.test(t) && /SAMPLE DOUBLE · edited by/.test(t), "review screen: Surname and Given names columns; the person's edit shown as edited, with who", t.split("\n").slice(0, 4).join(" | "));
  ok(await table.getByRole("button", { name: /Correct the surname and given names of passenger 1$/ }).count() === 1, "each passenger's split can be corrected (✎)");
  await table.getByRole("button", { name: /Correct the surname and given names of passenger 1$/ }).click();
  ok(await page.getByRole("group", { name: "Name split, passenger 1" }).count() === 1, "…opening the two fields, surname and given names");
  await page.screenshot({ path: `${OUT}/people-split-editor.png` });
});
await open("RIGPAX20", "unknown", async (page, text) => {
  ok(/Passengers: The service stopped during the write; the result was never recorded/.test(text), "after a restart: the passengers' write is shown as unknown, in red");
  ok(await page.getByRole("button", { name: "Send passengers to Leon" }).count() >= 1, "…with \"Send passengers to Leon\" for a person to decide");
});
await browser.close();
console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"} · screenshots in ${OUT}/people-*.png`);
process.exit(failures ? 1 : 0);
