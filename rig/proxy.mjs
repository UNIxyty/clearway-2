// Rig proxy on :3999 — one origin for the portal (3998), the agent (5175) and the sandbox wall API (5199).
// Extension test switches: a file `rig-401` next to this script makes every /agent/api request answer 401
// (simulates a signed-out console); every request to /agent/api/extension/session and /agent/api/chat is
// logged (method, path, origin, whether a Cookie header arrived, x-clearway-* headers) to rig-proxy3.log.
// WebSockets under /__elevenlabs/ go to the rig's ElevenLabs stand-in (rig/voice/mock-elevenlabs.mjs, :3986): the live
// transcript is reached at the console's own origin, which the extension's content policy already allows.
import http from "node:http";
import net from "node:net";
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
// The wall's own pages (2026-10-27), as production's gateway serves them: /digital-wall/timeline/ is the display app
// built with VITE_BASE_PATH=/digital-wall/timeline/ and VITE_API_BASE_URL=/digital-wall (rig/run-all-suites.sh builds it
// into rig/.scratch/display-dist). The phone shell's Wall tab frames it, so the rig needs it on this one origin.
const DISPLAY_DIST = process.env.RIG_DISPLAY_DIST || path.join(here, ".scratch", "display-dist");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon" };
function serveDisplay(req, res) {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/digital-wall\/timeline\/?/, "");
  let file = path.normalize(path.join(DISPLAY_DIST, rel));
  if (!file.startsWith(DISPLAY_DIST)) { res.writeHead(403); res.end(); return; }
  if (!rel || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DISPLAY_DIST, "index.html"); // SPA fallback
  if (!fs.existsSync(file)) { res.writeHead(404, { "content-type": "text/plain" }); res.end("display not built (rig/.scratch/display-dist)"); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}
const server = http.createServer((req, res) => {
  if (req.url.startsWith("/digital-wall/timeline")) { serveDisplay(req, res); return; }
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
  const up = http.request({ ...target, path: p, method: req.method, headers: { ...req.headers, host: `${target.host}:${target.port}` } }, (r) => {
    // As in production (where the portal's redirects reach the browser as relative paths): a Location pointing back at
    // the upstream's own address becomes a path, so the browser stays on this proxy, with its cookies.
    const loc = r.headers.location;
    if (typeof loc === "string") { const m = loc.match(/^https?:\/\/(?:localhost|127\.0\.0\.1):\d+(\/.*)?$/); if (m) r.headers.location = m[1] || "/"; }
    res.writeHead(r.statusCode, r.headers); r.pipe(res);
  });
  up.on("error", (e) => { if (!res.headersSent) res.writeHead(502); res.end(String(e)); });
  // The browser going away must reach the upstream (2026-10-20): a page's SSE (/api/help/stream) otherwise stays open on
  // the portal for ever — thousands after a full run — and the portal slows until pages hang on "load".
  res.on("close", () => { if (!up.destroyed) up.destroy(); });
  req.pipe(up);
});
server.on("upgrade", (req, socket, head) => {
  if (!req.url.startsWith("/__elevenlabs/")) { socket.destroy(); return; }
  const up = net.connect(port("RIG_ELEVENLABS_PORT", 3986), "127.0.0.1", () => {
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`);
    if (head?.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on("error", () => socket.destroy()); socket.on("error", () => up.destroy());
});
server.listen(port("RIG_PROXY_PORT", 3999), () => console.log(`rig proxy on :${port("RIG_PROXY_PORT", 3999)}`));
