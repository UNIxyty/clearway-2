// The paths to the same personal data (2026-11-02). A passenger's passport number can be read as TEXT (reveal), but the
// same number is on the SCAN, on the PASSENGER LIST attachment, and in the ORIGINAL EMAIL (.eml, every attachment). Each
// of these must be exactly as hard to open: the same permission (intake.people.reveal), checked by the same function
// (agent/lib/personal-data-gate.mjs), counted in the same rate-limit bucket, leaving the same audit row with no name and
// no number in it. A new path to a request's personal data belongs in PATHS below, or this check is incomplete.
//   node --env-file=.env.rig rig/personal-data-paths-check.mjs
// Through the sign-in proxy (:3989 → agent :5176). Invented passenger, invented scan; throwaway accounts; all removed.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const ROOT = path.resolve(process.env.INTAKE_ROOT || "");
if (!process.env.INTAKE_ROOT) { console.error("CANNOT TELL: INTAKE_ROOT is not set (.env.rig)"); process.exit(2); }
const PROXY = process.env.RIG_SHELL_URL || "http://127.0.0.1:3989";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 300)}` : ""}`); if (!c) failures += 1; };
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const sb = (p, init = {}) => fetch(`${SB}${p}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
const psql = (sql) => execFileSync("docker", ["exec", "-i", "supabase_db_rig", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tAq"], { input: sql }).toString().trim();
const run = Date.now().toString(36);

// ── two throwaway people on the agent allowlist: one without the reveal permission (User), one with it (Admin) ──
async function account(email, prefs) {
  const password = `rig-pd-${run}-only`;
  const made = await (await sb("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password, email_confirm: true, app_metadata: { is_approved: true } }) })).json();
  if (!made.id) throw new Error(`no account for ${email}`);
  await sb("/rest/v1/user_preferences?on_conflict=user_id", { method: "POST", headers: { prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: made.id, is_admin: false, is_developer: false, ...prefs }) });
  psql(`insert into agent_access (user_id, user_email, note) values ('${made.id}', '${email}', 'rig personal-data paths check');`);
  const s = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
  return { id: made.id, email, cookie: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}` };
}
const user = await account(`rig-pd-user-${run}@rig.invalid`, {});
const admin = await account(`rig-pd-admin-${run}@rig.invalid`, { is_admin: true });

// ── one invented request: a message, its .eml, a passenger, a passport scan and a passenger list ──
const NAME = "RIG INVENTED PASSENGER", DOC = "RIG0000042";
const blob = (buf) => { const h = createHash("sha256").update(buf).digest("hex"); const key = `files/${h.slice(0, 2)}/${h.slice(2, 4)}/${h}`; mkdirSync(path.join(ROOT, path.dirname(key)), { recursive: true, mode: 0o700 }); writeFileSync(path.join(ROOT, key), buf, { mode: 0o600 }); return { key, h, bytes: buf.length }; };
const scan = blob(Buffer.from(`%PDF-1.4 invented passport scan ${NAME} ${DOC} ${run}`));
const list = blob(Buffer.from(`row,name,document\n1,${NAME},${DOC}\n#${run}\n`));
const emlKey = `raw/2026/11/02/rig-pd-${run}.eml`;
mkdirSync(path.join(ROOT, path.dirname(emlKey)), { recursive: true, mode: 0o700 });
writeFileSync(path.join(ROOT, emlKey), `From: Rig Sender <sender@rig.invalid>\r\nTo: handling@intake.rig.invalid\r\nSubject: Rig personal-data paths ${run}\r\nContent-Type: text/plain\r\n\r\nPassenger ${NAME}, passport ${DOC}.\r\n`, { mode: 0o600 });
const msgId = psql(`insert into intake_messages (provider_message_id, direction, received_at, has_personal_data, subject, raw_key, fetch_status) values ('rig-pd-${run}', 'inbound', now(), true, 'Rig personal-data paths (invented)', '${emlKey}', 'stored') returning id`);
const reqId = psql(`insert into intake_requests (message_id, request_type, status, reference, review) values ('${msgId}', 'handling', 'review', 'RIGPD${run.toUpperCase()}', '{"legs":[{"index":0}]}') returning id`);
const exId = psql(`insert into intake_extractions (request_id, version, fields, personal) values ('${reqId}', 1, '{}', '{"people":[{"list":"pax","leg":0,"name":"${NAME}","dob":"1980-01-01","passport":"${DOC}"}]}') returning id`);
psql(`update intake_requests set current_extraction_id = '${exId}' where id = '${reqId}'`);
const scanId = psql(`insert into intake_attachments (message_id, sha256, bytes, sniffed_type, declared_name, storage_key, personal_data) values ('${msgId}', '${scan.h}', ${scan.bytes}, 'application/pdf', 'passport-scan.pdf', '${scan.key}', true) returning id`);
const listId = psql(`insert into intake_attachments (message_id, sha256, bytes, sniffed_type, declared_name, storage_key, personal_data) values ('${msgId}', '${list.h}', ${list.bytes}, 'text/plain', 'pax-list.csv', '${list.key}', true) returning id`);

// the User must be a mailbox reader for the .eml path to be a fair test of the reveal gate (restored at the end)
const settings = async (body) => (await fetch(`${PROXY}/agent/api/intake/settings`, { method: body ? "PUT" : "GET", headers: { cookie: admin.cookie, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })).json();
const before = await settings();
const readersBefore = before?.settings?.mailboxReaders ?? before?.mailboxReaders ?? [];
await settings({ mailboxReaders: [...readersBefore, user.email] });

// ── the paths. Every route that hands out a request's personal data unmasked belongs here. ──
export const PATHS = [
  { name: "text: the passengers' personal fields", method: "POST", url: `/agent/api/intake/requests/${reqId}/people/reveal` },
  { name: "scan: the passport scan attachment", method: "GET", url: `/agent/api/intake/attachments/${scanId}` },
  { name: "list: the passenger-list attachment", method: "GET", url: `/agent/api/intake/attachments/${listId}` },
  { name: "mail: the original email (.eml with every attachment)", method: "GET", url: `/agent/api/mailbox/messages/${msgId}/raw?download=1` },
  { name: "forward: the original email sent out (rig mail is captured, nothing leaves)", method: "POST", url: `/agent/api/mailbox/messages/${msgId}/forward`, body: { to: "rig-pd-forward@rig.invalid" } },
];
const open = (who, p) => fetch(`${PROXY}${p.url}`, { method: p.method, headers: { cookie: who.cookie, "content-type": "application/json" }, redirect: "manual", ...(p.method === "POST" ? { body: JSON.stringify(p.body ?? {}) } : {}) }).then(async (r) => ({ status: r.status, text: await r.text().catch(() => "") }));
const auditRows = (who) => JSON.parse(psql(`select coalesce(json_agg(json_build_object('kind', kind, 'detail', detail)), '[]') from agent_audit_log where actor_id = '${who.id}' and kind in ('intake.personal_revealed', 'mailbox.personal_revealed', 'intake.personal_reveal_limited')`));

try {
  // 1. without the reveal permission: every path refused, nothing of the passenger in the answer
  for (const p of PATHS) {
    const r = await open(user, p);
    ok((r.status === 403 || r.status === 404) && !r.text.includes(DOC) && !r.text.includes(NAME), `no reveal permission → refused: ${p.name}`, `${r.status}${r.text.includes(DOC) ? " · the document number came back" : ""}`);
  }
  // 2. with it: every path opens, and each leaves a reveal row with no name and no number in it
  const n0 = auditRows(admin).length;
  for (const p of PATHS) {
    const r = await open(admin, p);
    ok(r.status === 200, `reveal permission → opens: ${p.name}`, r.status);
  }
  const rows = auditRows(admin);
  ok(rows.length - n0 === PATHS.length, `each opening left one reveal row (${PATHS.length} paths)`, `${rows.length - n0} new rows: ${rows.map((x) => x.kind).join(", ")}`);
  ok(!JSON.stringify(rows).includes(NAME) && !JSON.stringify(rows).includes(DOC) && !JSON.stringify(rows).includes("1980-01-01"), "the rows name who, when and which request — never the passenger, the number or the date of birth");
  ok(rows.every((x) => x.detail?.requestId === reqId || x.detail?.messageId === msgId), "every row names the request or its message", JSON.stringify(rows.map((x) => x.detail?.what ?? null)));
  // 3. one bucket: opening the scan until refused; the refusal comes at the same count whatever the mix of paths
  const LIMIT = Number(process.env.RIG_REVEAL_LIMIT || 40);   // staff: agent/lib/personal-data-gate.mjs REVEAL_LIMIT
  let opened = rows.filter((x) => x.kind !== "intake.personal_reveal_limited").length, refusedAt = null;
  for (let i = 0; i < LIMIT + 2 && refusedAt === null; i += 1) {
    const r = await open(admin, PATHS[1 + (i % 2)]);   // scan and list in turn, after the text and mail above
    if (r.status === 429) refusedAt = opened; else if (r.status === 200) opened += 1; else { ok(false, "an opening failed for another reason", r.status); break; }
  }
  ok(refusedAt === LIMIT, `one bucket: refused after exactly ${LIMIT} openings in 10 minutes, text, mail, scan and list counted together`, `refused after ${refusedAt}`);
  const textNow = await open(admin, PATHS[0]);
  ok(textNow.status === 429, "…and the text path is refused too once the bucket is full", textNow.status);
  ok(auditRows(admin).some((x) => x.kind === "intake.personal_reveal_limited"), "the refusal is logged");
} finally {
  await settings({ mailboxReaders: readersBefore });
  psql(`delete from intake_messages where id = '${msgId}'`);   // the request, the extraction and the attachments go with it
  for (const k of [scan.key, list.key, emlKey]) rmSync(path.join(ROOT, k), { force: true });
  for (const a of [user, admin]) { psql(`delete from agent_access where user_id = '${a.id}'`); await sb(`/rest/v1/user_preferences?user_id=eq.${a.id}`, { method: "DELETE" }); await sb(`/auth/v1/admin/users/${a.id}`, { method: "DELETE" }); }
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
