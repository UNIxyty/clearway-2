// The cancellation on screen, after rig/intake/e2e-cancel.mjs: the intake page's Cancellation panel (an open question
// with its two answers; a partial failure in red; a departed leg) and the one-tap answer page for "Cancel in Leon?".
// Production build via the proxy.   node --env-file=.env.rig rig/intake/browser-cancel.mjs  → rig/.scratch/shots/cancel-*.png
import { chromium } from "playwright";
import { createHmac, randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const BASE = process.env.RIG_URL || "http://127.0.0.1:3999", AGENT = "http://127.0.0.1:5175";
const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 200)}` : ""}`); if (!c) failures += 1; };
const db = async (p) => (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function deliver(file) {
  const id = randomUUID(); await fetch(`${process.env.RESEND_API_BASE}/_rig/register`, { method: "POST", body: JSON.stringify({ id, file: path.resolve(file) }) });
  const body = JSON.stringify({ type: "email.received", created_at: new Date().toISOString(), data: { email_id: id, to: ["handling@intake.rig.invalid"], from: "x", subject: "x" } });
  const sid = `msg_${randomUUID()}`, ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from(process.env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64")).update(`${sid}.${ts}.${body}`).digest("base64");
  await fetch(`${AGENT}/api/intake/resend-webhook`, { method: "POST", headers: { "content-type": "application/json", "svix-id": sid, "svix-timestamp": ts, "svix-signature": `v1,${sig}` }, body });
  for (let i = 0; i < 60; i += 1) { const m = (await db(`intake_messages?select=id,status,request_id&provider_message_id=eq.${id}`))[0]; if (m && m.status !== "waiting") return m; await sleep(1500); }
  throw new Error("still waiting");
}
// The provider sends its cancellation of 2612398's sister flight again: a fresh question to look at (2614050 was
// already cancelled in Leon by hand in the e2e; 2613417 was declined at the gate — use a new copy of B's: 2613613).
const ref = "2613613", route = "LEBL-EGJJ-LEBL";
const f = path.resolve(`rig/.scratch/cancel/browser-cancel-${Date.now()}.eml`);
writeFileSync(f, ["From: EC-ZZZ <ec-zzz@provider.example>", "To: handling@intake.rig.invalid", `Subject: Cancelado: ${route}`, `Message-ID: <cnl-b-${Date.now()}@provider.example>`, "Date: Tue, 06 Oct 2026 09:00:00 +0000", "MIME-Version: 1.0", 'Content-Type: multipart/alternative; boundary="b"', "", "--b", "Content-Type: text/plain; charset=utf-8", "", "La siguiente reunión ha sido cancelada:", "", "--b", 'Content-Type: text/calendar; charset="utf-8"; method=CANCEL', "", "BEGIN:VCALENDAR", "METHOD:CANCEL", "VERSION:2.0", "BEGIN:VEVENT", `UID:RIG-UID-${ref}`, "SEQUENCE:3", "STATUS:CANCELLED", `SUMMARY:${route}`, `DESCRIPTION:#Pax: 2/2\\n#1º: XXA\\n#2º: XXB\\n#TCP:\\n#Ref: ${ref}\\n#Otros:\\n#DATE: 05/10/26\\n#ETD: 17:00:00-LEBL 17:30:00-GMMN\\n`, "END:VEVENT", "END:VCALENDAR", "--b--", ""].join("\r\n"));
const m = await deliver(f);
const reqs = Object.fromEntries((await db("intake_requests?select=id,reference,status_reason&request_type=eq.scheduled")).map((r) => [r.reference, r]));
const browser = await chromium.launch();
const shot = async (id, file, checks) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
  await page.goto(`${BASE}/agent/intake?r=${id}`, { waitUntil: "load" });
  await page.waitForSelector('section[aria-label="Cancellation from the provider"]', { timeout: 30000 }); await page.waitForTimeout(800);
  const panel = page.locator('section[aria-label="Cancellation from the provider"]');
  await panel.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/cancel-${file}.png` });
  const text = await page.locator("body").innerText();
  await checks(text, panel);
  ok(!errors.length, `${file}: no page errors`, errors.join(" | "));
  await ctx.close();
};
await shot(m.request_id, "open-question", async (text, panel) => {
  ok(/The provider cancelled this flight\. Cancel it in Leon\?/.test(text), "open question: the banner asks \"Cancel it in Leon?\" (not \"Loaded\")");
  ok(await panel.getByRole("button", { name: "Cancel in Leon" }).count() === 1 && await panel.getByRole("button", { name: "Keep the flights" }).count() === 1, "…the panel offers both answers");
  ok(/not removed/.test(await panel.innerText()), "…and says Leon keeps a cancelled flight (not removed)");
});
await shot(reqs["2612472"].id, "departed", async (text, panel) => ok(/Already departed: the agent does not cancel a departed flight/.test(await panel.innerText()), "departed leg flagged in the panel"));
await shot(reqs["2612398"].id, "cancelled", async (text, panel) => ok(/Cancelled in Leon: Leon keeps it as cancelled, not removed/.test(await panel.innerText()) && /Cancelled in Leon \(kept as cancelled, not removed\)/.test(text), "approved and done: each leg \"cancelled in Leon … not removed\""));
// The answer page for the open question (a peek: the link alone answers nothing).
const e = (await db(`intake_messages?select=delivery_detail&request_id=eq.${m.request_id}&direction=eq.outbound&sent_kind=eq.${encodeURIComponent("E1 · Cancel in Leon?")}&order=received_at.desc&limit=1`))[0];
const yes = /Yes, cancel in Leon: (\S+)/.exec(e?.delivery_detail?.text ?? "")?.[1];
{ const ctx = await browser.newContext({ viewport: { width: 520, height: 900 } }); const page = await ctx.newPage();
  await page.goto(`${BASE}/intake/answer?t=${encodeURIComponent(new URL(yes).searchParams.get("t"))}`, { waitUntil: "load" });
  await page.waitForSelector('[data-testid="answer-button"]', { timeout: 20000 }); await page.screenshot({ path: `${OUT}/cancel-answer-page.png` });
  const t = await page.locator("body").innerText();
  ok(/Cancel this flight in Leon\?/.test(t) && /they are not removed/.test(t) && /Yes, cancel in Leon/.test(t), "the answer page shows the cancel question, \"not removed\", one button; opening it answered nothing");
  const r = (await db(`intake_requests?select=review&id=eq.${m.request_id}`))[0];
  ok(!r.review.cancellation.approval.answer, "…the question is still open after the page was opened");
  await ctx.close(); }
await browser.close();
console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"} · screenshots in ${OUT}/cancel-*.png`);
process.exit(failures ? 1 : 0);
