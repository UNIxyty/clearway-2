// Settings › Flight intake › Receiving addresses decides what is read (2026-11-03). It used to decide nothing: any mail
// to any address on a receiving domain was read, while the setting said otherwise. Invented emails through the real
// webhook handler and a private mock Resend; the reader is off, so only the decision is tested.
//   node --env-file=.env.rig rig/intake/receiving-address-check.mjs
import fs from "node:fs"; import path from "node:path"; import { spawn } from "node:child_process"; import { randomUUID } from "node:crypto";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 170)}` : ""}`); if (!c) failures += 1; };
if (!/127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) { console.error("not the rig database"); process.exit(78); }
const scratch = path.resolve("rig/.scratch/receiving-address"); fs.rmSync(scratch, { recursive: true, force: true }); fs.mkdirSync(scratch, { recursive: true });
const PORT = 3000 + Math.floor(Math.random() * 900) + 6000;
const mock = spawn("node", ["rig/intake/mock-resend.mjs"], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 700));
Object.assign(process.env, { RESEND_API_BASE: `http://127.0.0.1:${PORT}`, RESEND_API_KEY: "re_rig_no_network", INTAKE_PIPELINE: "off", INTAKE_ROOT: path.join(scratch, "store") });
const { handleEvent, recipientsOf } = await import("../../agent/lib/intake/resend.mjs");
const { setIntakeSettings, intakeSettings } = await import("../../agent/lib/intake/settings.mjs");
const { rest } = await import("../../agent/lib/knowledge/retrieval.mjs");
const before = (await intakeSettings({ fresh: true })).addresses; const ids = [];
const admin = { userId: "00000000-0000-4000-8000-0000000000aa", email: "rig-admin@rig.invalid" };
async function deliver({ to, extraHeaders = "" }) {
  const id = randomUUID(); ids.push(id);
  const file = path.join(scratch, `${id}.eml`);
  fs.writeFileSync(file, `From: ops@handler.example\r\nTo: ${to}\r\n${extraHeaders}Subject: Handling request (invented)\r\nMIME-Version: 1.0\r\nContent-Type: text/plain\r\n\r\nPlease handle YL-TST at EVRA. Invented message.\r\n`);
  await fetch(`http://127.0.0.1:${PORT}/_rig/register`, { method: "POST", body: JSON.stringify({ id, file }) });
  const r = await handleEvent({ svixId: `msg_${id}`, event: { type: "email.received", created_at: new Date().toISOString(), data: { email_id: id, from: "ops@handler.example", to: [to], subject: "Handling request (invented)" } } });
  const row = (await rest(`intake_messages?provider_message_id=eq.${id}&select=status,status_reason,understood`))?.[0];
  return { r, row };
}
try {
  await setIntakeSettings({ addresses: ["handling@intake.rig.invalid"] }, admin);
  let x = await deliver({ to: "handling@intake.rig.invalid" });
  ok(x.r.outcome === "received" && x.row?.status === "waiting", "to a receiving address: read (waiting for the reader)", `${x.r.outcome} / ${x.row?.status}`);
  x = await deliver({ to: "someone-else@intake.rig.invalid" });
  ok(x.r.outcome === "not_addressed" && x.row?.status === "ignored" && /someone-else@intake\.rig\.invalid/.test(x.row?.understood?.body ?? "") && /handling@intake\.rig\.invalid/.test(x.row?.understood?.body ?? ""), "to another address on the domain: Ignored, saying where it went and what is read", x.row?.understood?.body);
  x = await deliver({ to: "ops-team@handler.example", extraHeaders: "Delivered-To: handling@intake.rig.invalid\r\n" });
  ok(x.row?.status === "waiting", "forwarded or Bcc'd to a receiving address (Delivered-To): read", x.row?.status);
  ok(JSON.stringify(recipientsOf({ to: ["A <a@x.y>"], cc: ["b@x.y"], bcc: ["c@x.y"], received_for: ["d@x.y"] }, Buffer.from("X-Original-To: e@x.y\r\n\r\nbody"), { to_addrs: ["f@x.y"] }).sort()) === JSON.stringify(["a@x.y", "b@x.y", "c@x.y", "d@x.y", "e@x.y", "f@x.y"]), "every recipient counts: to, cc, bcc, received_for, Delivered-To/X-Original-To, the webhook's to");
  let refused = null; try { await setIntakeSettings({ addresses: [] }, admin); } catch (e) { refused = e; }
  ok(/at least one receiving address/i.test(refused?.message ?? ""), "the list cannot be emptied (it would read nothing)", refused?.message);
} finally {
  await setIntakeSettings({ addresses: before }, admin).catch(() => {});
  for (const id of ids) await rest(`intake_messages?provider_message_id=eq.${id}`, { method: "DELETE" }).catch(() => {});
  mock.kill(); fs.rmSync(scratch, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
