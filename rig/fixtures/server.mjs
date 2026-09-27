import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname);
const pages = {
  "/": "white.html", "/white.html": "white.html", "/dark.html": "dark.html", "/busy.html": "busy.html", "/mail.html": "mail.html", "/blue.html": "blue.html",
  "/aip/ad-2/EVRA": "aip.html", "/rix/de-icing": "white.html", "/guide/cut-off": "dark.html",
};
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  // A real favicon, as every site has one: the tab bar shows it (and it is a third-party image).
  if (u.pathname === "/favicon.ico") { res.writeHead(200, { "content-type": "image/png" }); res.end(fs.readFileSync(path.join(here, "../../extension/public/icons/app-32.png"))); return; }
  const f = pages[u.pathname];
  if (!f) { res.writeHead(404); res.end("no"); return; }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(fs.readFileSync(path.join(here, f)));
}).listen(Number(process.env.PORT || 3997), () => console.log("fixtures on", process.env.PORT || 3997));
