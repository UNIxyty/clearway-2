// A local stand-in for the parts of Resend's API the intake uses, so the rig exercises the real code path
// (webhook → GET /emails/receiving/{id} → download raw → store) without touching Resend.
//   POST /_rig/register { id, file }   registers a fixture .eml under a Resend-style email id
//   GET  /emails/receiving/:id         the received-email object (with a raw.download_url back to this server)
//   GET  /raw/:id                      the raw .eml bytes
//   GET  /domains                      one receiving-enabled domain: intake.rig.invalid
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
const PORT = Number(process.env.PORT || 3996);
const reg = new Map();
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
  if (u.pathname === "/domains") return send(res, 200, { object: "list", data: [{ name: "intake.rig.invalid", status: "verified", capabilities: { sending: "enabled", receiving: "enabled" } }] });
  send(res, 404, { message: "not in the mock" });
}).listen(PORT, "127.0.0.1", () => console.log(`mock resend on :${PORT}`));
