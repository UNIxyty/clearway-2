// The intake screen after rig/intake/e2e-people.mjs: passengers in Leon's passenger DATABASE (counts, created/reused),
// the review screen's surname / given-names split (editable, an edit marked), a reused contact's difference as a warning,
// an unknown write in red with the "Send passengers to Leon" action, and no document number anywhere on the page.
// Production build via the proxy.   node --env-file=.env.rig rig/intake/browser-people.mjs  → rig/.scratch/shots/people-*.png
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { maskForReader } from "../../agent/lib/intake/personal.mjs";
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
  // Portal foundations 1.4: passengers' names are masked with the rest until a person shows personal data.
  ok(/Surname/i.test(t) && /Given names/i.test(t) && /•{8} · edited by/.test(t) && !/SAMPLE|EXAMPLE|SPECIMEN/.test(t), "review screen: Surname and Given names masked like the rest; the person's edit still marked, with who", t.split("\n").slice(0, 4).join(" | "));
  ok(!/ALICE|BRUNO|CARLA|SAMPLE DOUBLE/.test(await page.evaluate(() => document.body.innerText)), "no passenger name anywhere on the page before Show personal data");
  ok(await table.getByRole("button", { name: /Correct the surname and given names of passenger 1$/ }).count() === 1, "each passenger's split can be corrected (✎)");
  await table.getByRole("button", { name: /Correct the surname and given names of passenger 1$/ }).click();
  ok(await page.getByRole("button", { name: "Show for 60 s" }).count() >= 1 && await page.getByRole("group", { name: "Name split, passenger 1" }).count() === 0, "…while masked, ✎ asks to show personal data first (no names in an editor)");
  await page.getByRole("button", { name: "Show for 60 s" }).first().click();
  await page.waitForTimeout(800);
  const shown = await table.innerText();
  ok(/SAMPLE DOUBLE · edited by/.test(shown), "after Show personal data: the names, on amber, with the edit marked", shown.split("\n").slice(0, 3).join(" | "));
  await table.getByRole("button", { name: /Correct the surname and given names of passenger 1$/ }).click();
  ok(await page.getByRole("group", { name: "Name split, passenger 1" }).count() === 1, "…and ✎ opens the two fields, surname and given names");
  await page.screenshot({ path: `${OUT}/people-split-editor.png` });
  await page.getByRole("button", { name: "Hide now" }).first().click();
  await page.waitForTimeout(300);
});
await open("RIGPAX20", "unknown", async (page, text) => {
  ok(/Passengers: The service stopped during the write; the result was never recorded/.test(text), "after a restart: the passengers' write is shown as unknown, in red");
  ok(await page.getByRole("button", { name: "Send passengers to Leon" }).count() >= 1, "…with \"Send passengers to Leon\" for a person to decide");
});
await browser.close();

// The email reader (mailbox) masks passengers' names too, until "Show personal data in this message"; crew names stay
// readable (portal foundations 1.4). The rig's requests carry their lists in attachments, so this is checked directly.
{
  const people = [{ list: "pax", name: "ALICE EXAMPLE", passport: "TEST00001" }, { list: "pax", name: "Bruno Sample", split: { surname: "SAMPLE", given: "BRUNO" } }, { list: "crew", name: "CAPT KAPTEINIS" }];
  const text = "Pax: ALICE EXAMPLE, passport TEST00001\nSAMPLE, Bruno\nPassport_EXAMPLE_ALICE.pdf\nCrew: CAPT KAPTEINIS";
  const r = maskForReader(text, people, () => "[M]");
  ok(!/ALICE|EXAMPLE|SAMPLE|Bruno|TEST00001/i.test(r.text) && /KAPTEINIS/.test(r.text), "mailbox reader: passengers' names masked (any case, surname-first, in a file name); crew names readable", r.text.replace(/\n/g, " | "));
}
console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"} · screenshots in ${OUT}/people-*.png`);
process.exit(failures ? 1 : 0);
