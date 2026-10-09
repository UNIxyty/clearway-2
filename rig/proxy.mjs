// Rig proxy on :3999 — one origin for the portal (3998), the agent (5175) and the sandbox wall API (5199).
// Extension test switches: a file `rig-401` next to this script makes every /agent/api request answer 401
// (simulates a signed-out console); every request to /agent/api/extension/session and /agent/api/chat is
// logged (method, path, origin, whether a Cookie header arrived, x-clearway-* headers) to rig-proxy3.log.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname); // rig/
// Ports are overridable so a second proxy can front the sign-in-ON services (RIG_PROXY_PORT=3989 RIG_PORTAL_PORT=3992 …).
const port = (name, dflt) => Number(process.env[name] || dflt);
const T = { portal: { host: "127.0.0.1", port: port("RIG_PORTAL_PORT", 3998) }, agent: { host: "127.0.0.1", port: port("RIG_AGENT_PORT", 5175) }, wall: { host: "127.0.0.1", port: port("RIG_WALL_PORT", 5199) } };
const LOG = path.join(process.env.RIG_SCRATCH || here, "rig-proxy.log");
function route(url) {
  if (url.startsWith("/agent/api")) return [T.agent, url.slice("/agent".length)];
  if (url.startsWith("/digital-wall/api")) return [T.wall, url.slice("/digital-wall".length)];
  return [T.portal, url];
}
http.createServer((req, res) => {
  const [target, p] = route(req.url);
  if (req.url.startsWith("/agent/api")) {
    // A file `rig-strip-ext-cookie` drops the Cookie header from the EXTENSION's requests only (identified by
    // its x-clearway-client header) — the cookie-not-sent failure mode the token path exists for. A console
    // page's own requests (no such header, or "extension-exchange") keep their cookies.
    if (fs.existsSync(path.join(process.env.RIG_SCRATCH || here, "rig-strip-ext-cookie")) && req.headers["x-clearway-client"] === "extension") delete req.headers.cookie;
    const line = JSON.stringify({ at: new Date().toISOString(), method: req.method, path: req.url, origin: req.headers.origin ?? null, cookie: req.headers.cookie ? req.headers.cookie.split(";").map((c) => c.trim().split("=")[0]) : null, client: req.headers["x-clearway-client"] ?? null, pageHost: req.headers["x-clearway-page-host"] ?? null, length: req.headers["content-length"] ?? null });
    fs.appendFileSync(LOG, line + "\n");
    if (fs.existsSync(path.join(process.env.RIG_SCRATCH || here, "rig-401"))) { res.writeHead(401, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false, error: "unauthorized", message: "Sign in through the Clearway portal first." })); return; }
  }
  const up = http.request({ ...target, path: p, method: req.method, headers: { ...req.headers, host: `${target.host}:${target.port}` } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(up);
}).listen(port("RIG_PROXY_PORT", 3999), () => console.log(`rig proxy on :${port("RIG_PROXY_PORT", 3999)}`));
