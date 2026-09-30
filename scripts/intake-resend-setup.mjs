// One-time production setup for intake mail, run ON THE SERVER from the repo root:
//   node --env-file=.env scripts/intake-resend-setup.mjs --endpoint https://clearway.verxyl.com/agent/api/intake/resend-webhook
// 1. Shows which Resend domains can RECEIVE (the agent's addresses must be on one of them).
// 2. Creates the Resend webhook for received mail + delivery events, unless one already points at the endpoint.
// 3. Writes the webhook's signing secret into .env as RESEND_WEBHOOK_SECRET (replacing an old value).
// It never prints the secret or the API key. Restart agent-service afterwards so it reads the new secret.
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
const key = String(process.env.RESEND_API_KEY || "").trim(); if (!key) { console.error("RESEND_API_KEY is not set"); process.exit(2); }
const endpoint = process.argv[process.argv.indexOf("--endpoint") + 1];
if (!/^https:\/\/.+\/agent\/api\/intake\/resend-webhook$/.test(String(endpoint))) { console.error("pass --endpoint https://<host>/agent/api/intake/resend-webhook"); process.exit(2); }
const api = async (p, init = {}) => { const r = await fetch(`https://api.resend.com${p}`, { ...init, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" } }); const j = await r.json().catch(() => null); if (!r.ok) throw new Error(`${init.method ?? "GET"} ${p} → HTTP ${r.status}: ${j?.message ?? ""}`); return j; };
const domains = (await api("/domains")).data ?? [];
for (const d of domains) console.log(`domain ${d.name.padEnd(22)} status ${d.status.padEnd(9)} sending ${d.capabilities?.sending ?? "?"} · receiving ${d.capabilities?.receiving ?? "?"}`);
const addrs = String(process.env.INTAKE_ADDRESSES || "").split(",").map((s) => s.trim()).filter(Boolean);
for (const a of addrs) { const d = domains.find((x) => x.name === a.split("@")[1]); console.log(`address ${a}: ${d ? (d.capabilities?.receiving === "enabled" ? "can receive" : `CANNOT receive (receiving ${d.capabilities?.receiving})`) : "its domain is not in Resend"}`); }
const existing = ((await api("/webhooks")).data ?? []).find((w) => w.endpoint === endpoint);
if (existing) { console.log(`webhook already exists for ${endpoint} (id ${existing.id}); secret not changed`); process.exit(0); }
const events = ["email.received", "email.sent", "email.delivered", "email.delivery_delayed", "email.bounced", "email.complained", "email.failed"];
const created = await api("/webhooks", { method: "POST", body: JSON.stringify({ endpoint, events }) });
if (!created?.signing_secret) { console.error("Resend created the webhook but returned no signing secret; set it by hand from the dashboard."); process.exit(1); }
copyFileSync(".env", `.env.bak-${Date.now()}`);
const lines = readFileSync(".env", "utf8").split("\n").filter((l) => !/^RESEND_WEBHOOK_SECRET=/.test(l));
while (lines.length && lines[lines.length - 1] === "") lines.pop();
lines.push(`RESEND_WEBHOOK_SECRET=${created.signing_secret}`, "");
writeFileSync(".env", lines.join("\n"), { mode: 0o600 });
console.log(`created webhook ${created.id} → ${endpoint} for ${events.join(", ")}; secret written to .env (backup kept). Now: docker compose up -d agent-service`);
