// Browser: service decisions show on the click; crew/pax can be added and removed by hand.
//   node --env-file=.env.rig rig/intake/browser-edits.mjs [requestId with an editable leg]
// With no id, its own request: the newest YU-LSA CIMOG1 request, delivered here through the mock Resend webhook when the
// rig has none (2026-11-09: until now the runner looked up the one the e2e suites had left behind and passed its id, so
// in a run where they did not come first this had nothing to open).
import { chromium } from "playwright";
import { createHmac, randomUUID } from "node:crypto";
import path from "node:path";
let failures = 0; const ok = (c, w, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${w}${d ? `  · ${d}` : ""}`); if (!c) failures += 1; };
const db = async (p) => (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newestCimog1 = async () => (await db("intake_requests?select=id&reference=eq.CIMOG1&order=created_at.desc&limit=1"))[0]?.id;
let [rid] = process.argv.slice(2);
if (!rid) rid = await newestCimog1();
if (!rid) {
  if (!/^http:\/\/127\.0\.0\.1/.test(process.env.RESEND_API_BASE ?? "")) { console.error("rig only (the mock Resend): run with --env-file=.env.rig"); process.exit(2); }
  const AGENT = process.env.RIG_AGENT_URL || "http://127.0.0.1:5175";
  const id = randomUUID(), file = path.resolve("rig/fixtures/intake/yulsa-cimog1-plus364.eml");
  await fetch(`${process.env.RESEND_API_BASE}/_rig/register`, { method: "POST", body: JSON.stringify({ id, file }) });
  const body = JSON.stringify({ type: "email.received", created_at: new Date().toISOString(), data: { email_id: id, created_at: new Date().toISOString(), from: "dispatch@example.invalid", to: ["handling@intake.rig.invalid"], subject: path.basename(file) } });
  const sid = `msg_${randomUUID()}`, ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from(process.env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64")).update(`${sid}.${ts}.${body}`).digest("base64");
  const r = await fetch(`${AGENT}/api/intake/resend-webhook`, { method: "POST", headers: { "content-type": "application/json", "svix-id": sid, "svix-timestamp": ts, "svix-signature": `v1,${sig}` }, body });
  let m = null;
  for (let i = 0; i < 80 && !(m && m.status !== "waiting"); i += 1) { await sleep(3000); m = (await db(`intake_messages?select=id,status,request_id&provider_message_id=eq.${id}`))[0]; }
  ok(r.status === 200 && Boolean(m?.request_id), "setup: its own CIMOG1 request was delivered and read (the rig had none)", `${r.status} ${m?.status ?? "no message"}`);
  rid = m?.request_id;
  if (!rid) { console.log("1 FAILED"); process.exit(1); }
}
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`http://127.0.0.1:3999/agent/intake?r=${rid}`, { waitUntil: "load" }); await page.waitForTimeout(3500);
// 1. Service decision latency.
const gname = await page.getByRole("radiogroup").first().getAttribute("aria-label");
const target = page.getByRole("radiogroup", { name: gname }).getByRole("radio", { checked: false }).first();
const label = (await target.textContent())?.trim();
await target.click({ trial: true });
const ms = await page.evaluate(async ({ gname, label }) => {
  const g = () => [...document.querySelectorAll('[role="radiogroup"]')].find((x) => x.getAttribute("aria-label") === gname);
  const btn = [...g().querySelectorAll('[role="radio"]')].find((r) => r.textContent.trim() === label);
  const t0 = performance.now(); btn.click();
  for (;;) { const cur = [...g().querySelectorAll('[role="radio"]')].find((r) => r.textContent.trim() === label); if (cur?.getAttribute("aria-checked") === "true") return Math.round(performance.now() - t0); if (performance.now() - t0 > 3000) return 9999; await new Promise((r) => requestAnimationFrame(r)); }
}, { gname, label });
ok(ms < 150, `"${label}" shows as chosen on the click, before the save returns`, `${ms} ms`);
await page.waitForTimeout(1500);
await page.reload({ waitUntil: "load" }); await page.waitForTimeout(3500);
ok((await page.getByRole("radiogroup", { name: gname }).getByRole("radio", { name: label }).getAttribute("aria-checked")) === "true", "the decision was saved (still chosen after reload)");
// 2. Add a crew member by hand.
await page.getByRole("button", { name: "Add crew member" }).first().click();
const form = page.getByRole("group", { name: /Add crew member/ });
await form.getByLabel("Role").fill("PIC"); await form.getByLabel("Name").fill("Test Pilot");
await form.getByLabel(/Date of birth/).fill("01 Jan 1970"); await form.getByLabel("Nationality").fill("Latvia");
await form.getByLabel(/Passport no/).fill("ZZ1234567"); await form.getByLabel(/Expiry/).fill("01 Jan 2031");
await form.getByRole("button", { name: "Add crew member" }).click(); await page.waitForTimeout(2500);
const txt = await page.evaluate(() => document.body.innerText);
ok(txt.includes("Test Pilot"), "the added crew member is listed");
ok(!/ZZ1234567|01 Jan 1970/.test(txt), "their passport number and date of birth are masked on the page");
await page.screenshot({ path: "rig/.scratch/shots/edits-added-crew.png", fullPage: true });
const ex = (await db(`intake_requests?select=current_extraction_id&id=eq.${rid}`))[0];
const people = (await db(`intake_extractions?select=personal&id=eq.${ex.current_extraction_id}`))[0].personal.people;
ok(people.some((p) => p.name === "Test Pilot" && p.added), "stored with the request's personal data, marked as added by hand");
const aud = await db("agent_audit_log?select=detail&kind=eq.intake.person_added&order=created_at.desc&limit=1");
ok(!!aud[0] && !/Test Pilot|ZZ1234567|1970/.test(JSON.stringify(aud[0])), "audit row written, with no values");
await page.reload({ waitUntil: "load" }); await page.waitForTimeout(3500);
ok((await page.getByText("Test Pilot").count()) > 0, "still there after reload");
await page.getByRole("button", { name: /Remove Test Pilot/ }).click(); await page.waitForTimeout(2000);
ok((await page.getByText("Test Pilot").count()) === 0, "removed again");
ok(errors.length === 0, "console clean", errors.slice(0, 2).join(" | "));
await b.close(); console.log(failures ? `${failures} FAILED` : "ALL PASSED"); process.exit(failures ? 1 : 0);
