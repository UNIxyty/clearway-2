// Delivers a fixture .eml to the rig's agent the way Resend would: registers it with the mock Resend API,
// then POSTs a Svix-signed `email.received` webhook to the agent (through the rig proxy).
//   node --env-file=.env.rig rig/intake/deliver.mjs <file.eml> [emailId] [--times N]
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(path.resolve("agent/package.json"));
const { simpleParser } = require("mailparser");
const [file, idArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const times = Number((process.argv.find((a) => a.startsWith("--times=")) ?? "--times=1").split("=")[1]);
const emailId = idArg ?? randomUUID();
const p = await simpleParser(readFileSync(file));
await fetch(`${process.env.RESEND_API_BASE}/_rig/register`, { method: "POST", body: JSON.stringify({ id: emailId, file: path.resolve(file) }) });
const event = { type: "email.received", created_at: new Date().toISOString(), data: { email_id: emailId, created_at: new Date().toISOString(), from: p.from?.text, to: String(process.env.INTAKE_ADDRESSES || "handling@intake.rig.invalid").split(",").slice(0, 1), subject: p.subject, message_id: p.messageId } };
const body = JSON.stringify(event); const svixId = `msg_${randomUUID()}`;
for (let i = 0; i < times; i += 1) {
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from(process.env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64")).update(`${svixId}.${ts}.${body}`).digest("base64");
  const r = await fetch(`${process.env.RIG_AGENT_URL || "http://127.0.0.1:5175"}/api/intake/resend-webhook`, { method: "POST", headers: { "content-type": "application/json", "svix-id": svixId, "svix-timestamp": ts, "svix-signature": `v1,${sig}` }, body });
  console.log(`delivery ${i + 1}: HTTP ${r.status} ${await r.text()}`);
}
console.log(`email id ${emailId}`);
