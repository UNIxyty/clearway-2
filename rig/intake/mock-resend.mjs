// A local stand-in for the parts of Resend's API the intake uses, so the rig exercises the real code path
// (webhook → GET /emails/receiving/{id} → download raw → store) without touching Resend.
//   POST /_rig/register { id, file }   registers a fixture .eml under a Resend-style email id
//   GET  /emails/receiving/:id         the received-email object (with a raw.download_url back to this server)
//   GET  /raw/:id                      the raw .eml bytes
//   GET  /domains                      one receiving-enabled domain: intake.rig.invalid
//   POST /emails                       a SEND (the wall's mailer: reports, AIP/GEN, NOTAM digest): kept in memory, nothing leaves
//   GET  /_rig/sent                    what was "sent": from, to, subject, attachment names and sizes (no bodies)
//   GET  /_rig/sent/:id                one send in full (html, attachments as base64), the last 10 only — the rig's data
//                                      is invented; this lets a check read what a person would receive
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
const PORT = Number(process.env.PORT || 3996);
const reg = new Map();
const sent = [];
const bodies = new Map(); // id → { html, attachments } for the last 10 sends
const send = (res, code, body, type = "application/json") => { res.writeHead(code, { "content-type": type }); res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === "POST" && u.pathname === "/_rig/register") {
    let b = ""; for await (const c of req) b += c; const { id, file } = JSON.parse(b);
    reg.set(id, path.resolve(file)); return send(res, 200, { ok: true });
  }
  let m;
  if ((m = /^\/emails\/receiving\/([\w-]+)$/.exec(u.pathname))) {
    const f = reg.get(m[1]); if (!f) return send(res, 404, { message: "not found" });
    return send(res, 200, { object: "email", id: m[1], message_id: `<${m[1]}@rig>`, cc: [], authentication: { spf: "pass", dkim: "pass", dmarc: "pass" }, raw: { download_url: `http://127.0.0.1:${PORT}/raw/${m[1]}`, expires_at: new Date(Date.now() + 3600e3).toISOString() } });
  }
  if ((m = /^\/raw\/([\w-]+)$/.exec(u.pathname))) { const f = reg.get(m[1]); try { return f ? send(res, 200, readFileSync(f), "message/rfc822") : send(res, 404, "no"); } catch { return send(res, 404, "no such fixture"); } }
  if (req.method === "POST" && u.pathname === "/emails") {
    let b = ""; for await (const c of req) b += c; const e = JSON.parse(b || "{}");
    const id = `rig-sent-${sent.length + 1}`;
    sent.push({ id, at: new Date().toISOString(), from: e.from, to: e.to, subject: e.subject, attachments: (e.attachments ?? []).map((a) => ({ filename: a.filename, bytes: a.content ? Buffer.from(a.content, "base64").length : 0 })) });
    bodies.set(id, { html: e.html ?? null, attachments: (e.attachments ?? []).map((x) => ({ filename: x.filename, content: x.content ?? null })) });
    for (const k of [...bodies.keys()].slice(0, Math.max(0, bodies.size - 10))) bodies.delete(k);
    return send(res, 200, { id });
  }
  if ((m = /^\/_rig\/sent\/([\w-]+)$/.exec(u.pathname))) { const b = bodies.get(m[1]); return b ? send(res, 200, b) : send(res, 404, { message: "not kept" }); }
  if (u.pathname === "/_rig/sent") return send(res, 200, sent);
  if (u.pathname === "/domains") return send(res, 200, { object: "list", data: [{ name: "intake.rig.invalid", status: "verified", capabilities: { sending: "enabled", receiving: "enabled" } }] });
  send(res, 404, { message: "not in the mock" });
}).listen(PORT, "127.0.0.1", () => console.log(`mock resend on :${PORT}`));
