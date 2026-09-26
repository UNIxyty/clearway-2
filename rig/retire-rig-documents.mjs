// One-off, explicit production WRITE — run by a person, never by the rig or an agent session:
//   RIG_ALLOW_PRODUCTION_WRITE="yes, retire rig documents in production" node rig/retire-rig-documents.mjs .env
// Retires Knowledge-base documents uploaded by rig accounts so the agent can no longer retrieve or quote them.
// Same change the console's Reject makes (status → rejected with a reason) plus retired_at on their approved
// clauses; each one recorded in the append-only audit log. Nothing is deleted; a reviewer can see and undo it.
import fs from "node:fs";
const PHRASE = "yes, retire rig documents in production";
if (process.env.RIG_ALLOW_PRODUCTION_WRITE !== PHRASE) { console.error(`Refusing: set RIG_ALLOW_PRODUCTION_WRITE="${PHRASE}"`); process.exit(2); }
const env = Object.fromEntries(fs.readFileSync(process.argv[2] || ".env", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, ""), KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json", prefer: "return=representation" };
const rest = async (path, init = {}) => { const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } }); const t = await r.text(); if (!r.ok) throw new Error(`${path} → ${r.status} ${t.slice(0, 200)}`); return t ? JSON.parse(t) : null; };
const RIG_IDS = ["00000000-0000-4000-8000-000000000001", "00000000-7e57-4000-8000-000000000000"];
const RIG_EMAILS = ["local@clearway.aero", "rig-test@rig.invalid"];
const now = new Date().toISOString();
const reason = "Rig test document (uploaded by the test rig), retired 2026-09-27 — never operational data";
const docs = await rest(`agent_documents?select=id,title,status,tier&or=(uploaded_by.in.(${RIG_IDS.join(",")}),uploaded_by_email.in.(${RIG_EMAILS.join(",")}))&status=in.(indexed,approved)&limit=200`);
console.log(`retrievable rig documents: ${docs.length}`);
for (const d of docs) {
  await rest(`agent_documents?id=eq.${d.id}`, { method: "PATCH", body: JSON.stringify({ status: "rejected", rejected_reason: reason, updated_at: now }) });
  const t1 = await rest(`agent_tier1_records?document_id=eq.${d.id}&retired_at=is.null`, { method: "PATCH", body: JSON.stringify({ retired_at: now }) });
  await rest("agent_audit_log", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify([{ kind: "knowledge.rejected", user_id: null, user_email: "rig cleanup (person-run script rig/retire-rig-documents.mjs)", tool_name: "knowledge.reject", tool_args: { documentId: d.id, title: d.title, reason }, tool_result: { retiredClauses: Array.isArray(t1) ? t1.length : 0, previousStatus: d.status, previousTier: d.tier }, confirmation_status: "confirmed", success: true, detail: { client: { kind: "rig-cleanup", host: null } } }]) });
  console.log(`retired ${d.status}/${d.tier} · ${d.title} · clauses retired: ${Array.isArray(t1) ? t1.length : 0}`);
}
const left = await rest(`agent_documents?select=id&or=(uploaded_by.in.(${RIG_IDS.join(",")}),uploaded_by_email.in.(${RIG_EMAILS.join(",")}))&status=in.(indexed,approved)&limit=5`);
console.log(`retrievable rig documents left: ${left.length}`);
