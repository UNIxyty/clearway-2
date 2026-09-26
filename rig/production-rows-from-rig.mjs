// One-off, READ-ONLY report: how many production rows came from rig accounts, in which tables, and whether
// the agent could retrieve any of them as real data. Reads production only when a person types the phrase.
import fs from "node:fs";
const PHRASE = "yes, read production for the rig report";
if (process.env.RIG_ALLOW_PRODUCTION_READ !== PHRASE) { console.error(`Refusing: set RIG_ALLOW_PRODUCTION_READ="${PHRASE}"`); process.exit(2); }
const env = Object.fromEntries(fs.readFileSync(process.argv[2] || ".env", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, ""), KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, prefer: "count=exact" };
async function count(path) { const r = await fetch(`${URL_}/rest/v1/${path}&limit=1`, { headers: H }); const cr = r.headers.get("content-range") || ""; return { status: r.status, count: Number(cr.split("/")[1]) || 0 }; }
async function rows(path) { const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: H }); return r.ok ? r.json() : []; }
const RIG_IDS = ["00000000-0000-4000-8000-000000000001", "00000000-7e57-4000-8000-000000000000"];
const RIG_EMAILS = ["local@clearway.aero", "rig-test@rig.invalid"];
const idIn = `in.(${RIG_IDS.join(",")})`, emailIn = `in.(${RIG_EMAILS.join(",")})`;
const out = {};
out.agent_audit_log = await count(`agent_audit_log?select=id&or=(user_id.${idIn},user_email.${emailIn})`);
out.agent_conversations = await count(`agent_conversations?select=id&user_id=${idIn}`);
const convs = await rows(`agent_conversations?select=id&user_id=${idIn}&limit=1000`);
out.agent_messages = convs.length ? await count(`agent_messages?select=id&conversation_id=in.(${convs.map((c) => c.id).join(",")})`) : { count: 0 };
out.agent_memories = await count(`agent_memories?select=id&user_id=${idIn}`);
out.agent_actions = await count(`agent_actions?select=id&or=(user_id.${idIn},user_email.${emailIn})`);
out.agent_generated_files = await count(`agent_generated_files?select=id&or=(user_id.${idIn},user_email.${emailIn})`);
out.agent_email_log = await count(`agent_email_log?select=id&or=(user_id.${idIn},user_email.${emailIn})`);
out.agent_retrievals = await count(`agent_retrievals?select=id&user_id=${idIn}`);
out.agent_settings = await count(`agent_settings?select=id&or=(id.like.pref:00000000-0000-4000-8000-000000000001:*,id.like.pref:00000000-7e57-4000-8000-000000000000:*,updated_by_email.${emailIn})`);
out.agent_access = await count(`agent_access?select=user_id&user_id=${idIn}`);
const docs = await rows(`agent_documents?select=id,title,status,tier,uploaded_by,uploaded_by_email,created_at&or=(uploaded_by.${idIn},uploaded_by_email.${emailIn})&limit=200`);
out.agent_documents = { count: docs.length, byStatus: docs.reduce((m, d) => ((m[`${d.status}/${d.tier}`] = (m[`${d.status}/${d.tier}`] || 0) + 1), m), {}), titles: docs.map((d) => `${d.status} ${d.tier} · ${d.title}`) };
const docIds = docs.map((d) => d.id);
out.agent_tier1_records = docIds.length ? await count(`agent_tier1_records?select=id&document_id=in.(${docIds.join(",")})`) : { count: 0 };
out.agent_chunks = docIds.length ? await count(`agent_chunks?select=id&document_id=in.(${docIds.join(",")})`) : { count: 0 };
out.user_preferences = await count(`user_preferences?select=user_id&user_id=${idIn}`);
console.log(JSON.stringify(out, null, 1));
