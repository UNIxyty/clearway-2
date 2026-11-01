// The mailbox never fetches an address a stranger put in an email at our own services (2026-11-02). An email whose image
// points at a loopback listener (standing in for the portal, the wall gateway, the agent — everything that trusts
// loopback) and at the portal's own rig port:
//   · opened as normal: remote images are held back, no proxy link is in the page, the listener sees nothing;
//   · "show images": the proxy refuses the loopback address (checked after DNS, no redirects); the listener sees nothing;
//   · the refusal is logged (mailbox.image_refused), the email's own cid: image still shows.
// Rig only, against the rig's own services. Invented message; removed at the end.
//   node --env-file=.env.rig rig/mail-image-check.mjs
import http from "node:http";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
if (!process.env.INTAKE_ROOT) { console.error("CANNOT TELL: INTAKE_ROOT is not set"); process.exit(2); }
const ROOT = path.resolve(process.env.INTAKE_ROOT), PROXY = process.env.RIG_SHELL_URL || "http://127.0.0.1:3989";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 300)}` : ""}`); if (!c) failures += 1; };
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const psql = (sql) => execFileSync("docker", ["exec", "-i", "supabase_db_rig", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tAq"], { input: sql }).toString().trim();
const run = Date.now().toString(36);

// a listener on loopback that counts every request: the stand-in for any service that trusts loopback
let hits = 0; const listener = http.createServer((req, res) => { hits += 1; res.writeHead(200, { "content-type": "image/png" }); res.end(Buffer.from("89504e470d0a1a0a", "hex")); });
await new Promise((r) => listener.listen(0, "127.0.0.1", r));
const PORT = listener.address().port;
const PROBE = `http://127.0.0.1:${PORT}/probe-${run}.png`, PORTAL = `http://127.0.0.1:3992/api/health?probe=${run}`;

const password = `rig-mi-${run}-only`, email = `rig-mi-admin-${run}@rig.invalid`;
const made = await (await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: H, body: JSON.stringify({ email, password, email_confirm: true, app_metadata: { is_approved: true } }) })).json();
await fetch(`${SB}/rest/v1/user_preferences?on_conflict=user_id`, { method: "POST", headers: { ...H, prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: made.id, is_admin: true, is_developer: false }) });
psql(`insert into agent_access (user_id, user_email, note) values ('${made.id}', '${email}', 'rig mail-image check');`);
const s = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
const cookie = `sb-${new URL(SB).hostname.split(".")[0]}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;
const get = (p) => fetch(`${PROXY}${p}`, { headers: { cookie } }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

// an HTML email from a stranger: two remote images aimed inward, one cid: image of its own
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");
const eml = [`From: Stranger <stranger@rig.invalid>`, `To: handling@intake.rig.invalid`, `Subject: Rig mail-image ${run}`, `MIME-Version: 1.0`, `Content-Type: multipart/related; boundary="b${run}"`, ``,
  `--b${run}`, `Content-Type: text/html; charset=utf-8`, ``, `<p>Hello</p><img src="${PROBE}"><img src="${PORTAL}"><img src="cid:logo${run}">`, ``,
  `--b${run}`, `Content-Type: image/png`, `Content-Transfer-Encoding: base64`, `Content-ID: <logo${run}>`, ``, png.toString("base64"), `--b${run}--`, ``].join("\r\n");
const emlKey = `raw/2026/11/02/rig-mi-${run}.eml`;
mkdirSync(path.join(ROOT, path.dirname(emlKey)), { recursive: true, mode: 0o700 }); writeFileSync(path.join(ROOT, emlKey), eml, { mode: 0o600 });
const msgId = psql(`insert into intake_messages (provider_message_id, direction, received_at, subject, raw_key, fetch_status, from_addr) values ('rig-mi-${run}', 'inbound', now(), 'Rig mail-image (invented)', '${emlKey}', 'stored', 'stranger@rig.invalid') returning id`);

try {
  const held = await get(`/agent/api/mailbox/messages/${msgId}/body`);
  const html = String(held.json?.body?.html ?? "");
  ok(held.status === 200 && held.json?.body?.remoteImages?.length === 2, "opened as normal: the two remote images are listed as held back", `${held.status} · ${held.json?.body?.remoteImages?.length ?? 0} held`);
  // the placeholder may NAME the host as text ("Image blocked · from 127.0.0.1:…"); no src or href may point at it
  const links = [...html.matchAll(/(?:src|href|srcset)\s*=\s*"([^"]*)"/gi)].map((x) => x[1]);
  ok(!links.some((l) => l.includes("127.0.0.1") || l.includes("/image?u=") || l.includes(String(PORT))), "…and no src or href in the page points at them, ours or theirs", links.join(" | ").slice(0, 200));
  ok(/\/cid\//.test(html), "…while the email's own cid: image is in the page");
  await new Promise((r) => setTimeout(r, 500));
  ok(hits === 0, "nothing was fetched from loopback when the mail was opened", `${hits} hit(s)`);
  for (const [u, what] of [[PROBE, "a loopback listener"], [PORTAL, "the portal's own port"], [`http://localhost:${PORT}/x.png`, "localhost (refused after DNS)"], [`http://[::1]:${PORT}/x.png`, "IPv6 loopback"]]) {
    // the proxy only serves URLs that are in the message; the first two are, the others must be refused before that too
    const r = await get(`/agent/api/mailbox/messages/${msgId}/image?u=${encodeURIComponent(u)}`);
    ok(r.status === 404, `"show images" refuses ${what}`, r.status);
  }
  await new Promise((r) => setTimeout(r, 500));
  ok(hits === 0, "nothing was fetched from loopback when images were asked for", `${hits} hit(s)`);
  const logged = Number(psql(`select count(*) from agent_audit_log where kind = 'mailbox.image_refused' and detail->>'messageId' = '${msgId}' and detail->>'reason' = 'address'`));
  ok(logged >= 2, "each refusal is logged with its reason (address)", logged);
  const cid = await fetch(`${PROXY}/agent/api/mailbox/messages/${msgId}/cid/${encodeURIComponent(`logo${run}`)}`, { headers: { cookie } });
  ok(cid.status === 200 && (cid.headers.get("content-type") ?? "").startsWith("image/"), "the email's own cid: image still shows", cid.status);
} finally {
  listener.close();
  psql(`delete from intake_messages where id = '${msgId}'`);
  rmSync(path.join(ROOT, emlKey), { force: true });
  psql(`delete from agent_access where user_id = '${made.id}'`);
  await fetch(`${SB}/rest/v1/user_preferences?user_id=eq.${made.id}`, { method: "DELETE", headers: H });
  await fetch(`${SB}/auth/v1/admin/users/${made.id}`, { method: "DELETE", headers: H });
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
