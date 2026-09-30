// Browser flows on the rig (fresh DB + fresh mock Leon): conflict choice, reveal, confirm dialog + double click,
// partial success banner, timezone choice. node --env-file=.env.rig rig/intake/browser-flows.mjs
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
if (!/127\.0\.0\.1/.test(process.env.NEXT_PUBLIC_SUPABASE_URL) || !/127\.0\.0\.1/.test(process.env.LEON_API_BASE)) process.exit(78);
const BASE = "http://127.0.0.1:3999", AGENT = "http://127.0.0.1:5175", OUT = "rig/.scratch/shots", SCR = "rig/.scratch";
let failures = 0; const ok = (c, w, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${w}${d ? `  · ${d}` : ""}`); if (!c) failures += 1; };
const db = async (p) => (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } })).json();
const creates = () => (existsSync(`${SCR}/leon-mock-log.jsonl`) ? readFileSync(`${SCR}/leon-mock-log.jsonl`, "utf8").split("\n").filter((l) => /createTrip|flightCreate/.test(l)).length : 0);
const faults = (f) => writeFileSync(`${SCR}/leon-mock-faults.json`, JSON.stringify(f));
async function deliver(file) {
  const id = randomUUID(); await fetch(`${process.env.RESEND_API_BASE}/_rig/register`, { method: "POST", body: JSON.stringify({ id, file: path.resolve(file) }) });
  const body = JSON.stringify({ type: "email.received", created_at: new Date().toISOString(), data: { email_id: id, to: ["handling@intake.rig.invalid"], from: "x", subject: "x" } });
  const sid = `msg_${randomUUID()}`, ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from(process.env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64")).update(`${sid}.${ts}.${body}`).digest("base64");
  await fetch(`${AGENT}/api/intake/resend-webhook`, { method: "POST", headers: { "content-type": "application/json", "svix-id": sid, "svix-timestamp": ts, "svix-signature": `v1,${sig}` }, body });
  for (;;) { const m = (await db(`intake_messages?select=status,request_id&provider_message_id=eq.${id}`))[0]; if (m && m.status !== "waiting") return m.request_id; await new Promise((r) => setTimeout(r, 3000)); }
}
execSync(`docker exec supabase_db_rig psql -U postgres -d postgres -qc "truncate public.intake_messages, public.intake_events cascade;"`);
rmSync(`${SCR}/leon-mock-log.jsonl`, { force: true }); faults({});
execSync(`kill $(lsof -tiTCP:3995 -sTCP:LISTEN) || true; cd rig/intake && (env -i PATH="$PATH" HOME="$HOME" PORT=3995 RIG_SCRATCH="${path.resolve(SCR)}" nohup node mock-leon.mjs > ../.scratch/mock-leon.out 2>&1 &)`, { shell: "/bin/bash" });
await new Promise((r) => setTimeout(r, 1500));
const yu = await deliver("rig/fixtures/intake/yulsa-cimog1-plus364.eml");
const amq = await deliver("rig/fixtures/intake/amq5v-lybe-plus364.eml");
const noTzFile = `${SCR}/amq8t-notz.eml`; const notz = existsSync(noTzFile) ? await deliver(noTzFile) : null;

const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } }); const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 120))); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 120)); });
const go = async (id) => { await page.goto(`${BASE}/agent/intake?r=${id}`, { waitUntil: "load" }); await page.waitForTimeout(3000); };

// 1. YU-LSA: conflict → choose the email's value; reveal; confirm dialog; double click.
await go(yu);
await page.getByRole("tab").filter({ hasText: "LEG 2" }).first().click(); await page.waitForTimeout(600);
const useEmail = page.getByRole("button", { name: /Use the email/i }).first();
ok(await useEmail.count() > 0, "conflict row offers 'Use the email's value'");
await page.screenshot({ path: `${OUT}/flow-1-conflict.png`, fullPage: true });
for (let i = 0; i < 4 && (await page.getByRole("button", { name: /Use the email/i }).count()) > 0; i += 1) { await page.getByRole("button", { name: /Use the email/i }).first().click(); await page.waitForTimeout(2000); }
ok((await page.getByText(/Chose the email body/).count()) > 0, "conflict resolved, row marked EDITED with who");
await page.getByRole("tab").filter({ hasText: "LEG 1" }).first().click(); await page.waitForTimeout(600);
await page.getByRole("button", { name: /Show personal data/i }).first().click(); await page.waitForTimeout(300);
await page.getByRole("button", { name: /Show for 60 s/i }).first().click(); await page.waitForTimeout(1500);
const shown = await page.evaluate(() => /XX000000\d/.test(document.body.innerText));
ok(shown, "reveal shows the values (after the logged warning)");
await page.screenshot({ path: `${OUT}/flow-2-revealed.png`, fullPage: true });
await page.getByRole("button", { name: /Hide now/i }).first().click(); await page.waitForTimeout(500);
ok(!(await page.evaluate(() => /XX000000\d/.test(document.body.innerText))), "Hide now masks them again");
const audits = await db("agent_audit_log?select=kind&kind=eq.intake.personal_revealed"); ok(audits.length >= 1, "reveal is in the audit log", `${audits.length} row(s)`);
const openBtn = page.getByRole("button", { name: /Review and create in Leon|Review and send to Leon/i }).first();
ok(await openBtn.isEnabled(), "confirm bar enabled once nothing blocks");
await openBtn.click(); await page.waitForSelector('[role="dialog"]'); await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/flow-3-dialog.png` });
ok((await page.getByText(/Expires in \d:\d\d/).count()) > 0, "dialog shows the expiry countdown");
ok(!(await page.evaluate(() => /XX000000\d|01 Jan 1980/.test(document.querySelector('[role="dialog"]').innerText))), "no personal data in the confirmation dialog");
const before = creates();
const create = page.locator('[role="dialog"]').getByRole("button", { name: /^(Create in Leon|Send to Leon)$/ });
faults({ hangFlightNo: ["YULSA"], hangMs: 6000 }); // Leon answers slowly, so the waiting state is visible
const t0 = Date.now();
await create.dblclick().catch(() => {}); await create.click({ timeout: 500 }).catch(() => {});
await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 5000 }).catch(() => {});
ok((await page.locator('[role="dialog"]').count()) === 0 && Date.now() - t0 < 5000, "dialog closes at once after confirm (no overlay while Leon works)", `${Date.now() - t0} ms`);
await page.waitForTimeout(800);
ok((await page.locator('span.ag-spin[aria-label="Working"]').count()) > 0, "spinner next to the request while it is sent");
ok((await page.getByText(/Sending to Leon\. No leg is shown as created/).count()) > 0, "banner says it is sending, nothing shown as created yet");
await page.screenshot({ path: `${OUT}/flow-4-sending.png`, fullPage: false });
await page.getByRole("button", { name: /^Mailbox/ }).first().click().catch(() => page.goto(`${BASE}/agent/mailbox`));
await page.waitForTimeout(1500);
ok(/\/agent\/mailbox/.test(page.url()), "the rest of the portal is usable meanwhile (went to the Mailbox)");
for (let i = 0; i < 40 && creates() - before < 2; i += 1) await page.waitForTimeout(500);
faults({});
for (let i = 0; i < 60; i += 1) { const st = (await db(`intake_requests?select=status&id=eq.${yu}`))[0]?.status; if (st && st !== "in_progress") break; await page.waitForTimeout(500); }
await go(yu); await page.screenshot({ path: `${OUT}/flow-5-loaded.png`, fullPage: true });
ok(creates() - before === 2, "double/triple click → exactly one Leon create per leg", `${creates() - before} creates`);
ok((await page.getByText(/Loaded\. Both legs are in Leon/).count()) > 0, "banner: Loaded. Both legs are in Leon…");

// 2. SP-OVO: Leon refuses leg 2 → partly loaded banner, chips, pipeline, email.
faults({ refuseFlightNo: ["AMQ5V"], refuseLegOnAdes: ["LFMN"] });
await go(amq);
await page.getByRole("button", { name: /Review and create in Leon/i }).first().click(); await page.waitForSelector('[role="dialog"]'); await page.waitForTimeout(500);
await page.locator('[role="dialog"]').getByRole("button", { name: /^Create in Leon$/ }).click();
await page.waitForTimeout(8000);
await go(amq); await page.screenshot({ path: `${OUT}/flow-7-partial.png`, fullPage: true });
ok((await page.getByText(/Partly loaded\. 1 of 2 legs are in Leon\. Leg 2 is NOT\./).count()) > 0, "banner: Partly loaded. 1 of 2 legs are in Leon. Leg 2 is NOT.");
ok((await page.getByText(/NOT in Leon/).count()) > 0, "NOT in Leon chip / pill shown");
ok((await page.getByText(/Partly failed/i).count()) > 0, "pipeline shows PARTLY FAILED");
const mail = (await db(`intake_messages?select=subject&request_id=eq.${amq}&direction=eq.outbound&order=received_at.desc&limit=1`))[0];
ok(/leg 2 is not/.test(mail?.subject ?? ""), "Needs you email says leg 2 is not in Leon", mail?.subject);
faults({});

// 3. Timezone unknown → choose local.
if (notz) {
  await go(notz); await page.screenshot({ path: `${OUT}/flow-8-tz.png`, fullPage: true });
  ok((await page.getByText(/Which timezone are these times in\?/).count()) > 0, "timezone block shown");
  ok(await page.getByRole("button", { name: /Review and create in Leon/i }).first().isDisabled(), "confirm disabled while timezone unknown");
  await page.getByRole("button", { name: /They are local time/i }).first().click(); await page.waitForTimeout(2000);
  ok((await page.getByText(/Times set as local time/).count()) > 0, "choice recorded: 'Times set as local time … by you'");
  await page.screenshot({ path: `${OUT}/flow-9-tz-set.png`, fullPage: true });
}
ok(errors.length === 0, "console clean through all flows", errors.slice(0, 3).join(" | "));
await browser.close();
console.log(failures ? `${failures} FAILED` : "ALL PASSED"); process.exit(failures ? 1 : 0);
