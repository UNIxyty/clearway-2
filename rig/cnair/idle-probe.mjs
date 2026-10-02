// CNAIR portal: idle-session limit only. Logs in once (no record is opened), closes the browser, then pings the
// session after idle gaps of 2, 5, 10, 20, 40 and 55 minutes with a fresh HTTPS connection each time (no
// keep-alive reuse, 60 s hard timeout). Writes only timestamps and HTTP status. Credentials from .env.
//   node rig/cnair/idle-probe.mjs      → rig/.scratch/cnair/idle-probe.log
import { chromium } from "../../node_modules/playwright/index.mjs";
import https from "node:https"; import fs from "node:fs"; import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split("\n").filter((l) => /^CNAIR_(USER|PASSWORD)=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const USER = env.CNAIR_USER, PASS = env.CNAIR_PASSWORD; if (!USER || !PASS) { console.error("credentials missing"); process.exit(2); }
const logFile = path.join(root, "rig/.scratch/cnair/idle-probe.log"); fs.writeFileSync(logFile, "");
const log = (...a) => { const line = `${new Date().toISOString()} ${a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")}`; fs.appendFileSync(logFile, line + "\n"); console.log(line); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await chromium.launch({ headless: true }); const ctx = await b.newContext(); const page = await ctx.newPage();
let sid = null, ended = false;
page.on("response", (res) => { const m = /\/ua\/(sua|ping)\/([0-9a-f]{32})/.exec(res.url()); if (m) sid = m[2]; });
await page.goto("https://cnair.efficens.es/gas320/ua/r/cnair/flightdispatcher", { waitUntil: "load" }); await pause(1500);
await page.fill("#uusr", USER); await page.fill("#pswd", PASS);
await Promise.all([page.waitForLoadState("load").catch(() => {}), page.click("#subbb")]); await pause(8000);
const txt = await page.evaluate(() => document.body.innerText).catch(() => "");
ended = /No se ha podido iniciar|Session does not exist|application ended/i.test(txt);
log("login:", { programOpened: /Flight List/.test(txt), refused: ended, sessionIdSeen: !!sid });
const cookies = await ctx.cookies(); await b.close();
if (!sid || ended) { log("no usable session; stopping"); process.exit(1); }
const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const ping = () => new Promise((resolve) => {
  const req = https.request({ host: "cnair.efficens.es", path: `/gas320/ua/ping/${sid}?appId=0`, method: "POST", agent: false, headers: { cookie: cookieHeader, "user-agent": "Mozilla/5.0", connection: "close", "content-length": 0 }, timeout: 60000 },
    (res) => { let body = ""; res.on("data", (d) => { body += d; }); res.on("end", () => resolve({ status: res.statusCode, body: body.slice(0, 40), fourjsTimeout: res.headers["x-fourjs-timeout"] ?? null })); });
  req.on("timeout", () => { req.destroy(new Error("timeout 60 s")); }); req.on("error", (e) => resolve({ error: e.message })); req.end();
});
log("probe 0 (immediately):", await ping());
for (const minutes of [2, 5, 10, 20, 40, 55]) {
  await pause(minutes * 60_000);
  const res = await ping(); log(`probe after ${minutes} min idle:`, res);
  if (res.status !== 200) { log(`session gone: survived the previous gap, not ${minutes} min`); break; }
}
log("done");
