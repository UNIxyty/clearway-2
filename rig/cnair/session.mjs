// Read-only investigation of the CNAIR flight-dispatcher portal (Four Js Genero). ONE browser session, paced.
// Credentials come from .env (CNAIR_USER / CNAIR_PASSWORD) and are never printed: every URL, request body and
// response body saved is scrubbed of both, and screenshots mask the username. Output: rig/.scratch/cnair/.
//   node rig/cnair/session.mjs <step-script.mjs>   (the step script receives { page, log, shot, pause, scrub })
import { chromium } from "../../node_modules/playwright/index.mjs";
import fs from "node:fs"; import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split("\n").filter((l) => /^CNAIR_(USER|PASSWORD)=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const USER = env.CNAIR_USER, PASS = env.CNAIR_PASSWORD;
if (!USER || !PASS) { console.error("CNAIR_USER / CNAIR_PASSWORD missing"); process.exit(2); }
const OUT = path.join(root, "rig/.scratch/cnair"); fs.mkdirSync(OUT, { recursive: true });
const variants = (s) => [s, encodeURIComponent(s), Buffer.from(s).toString("base64")].filter((v) => v && v.length >= 3);
const SECRETS = [...variants(PASS).map((v) => [v, "<PASSWORD>"]), ...variants(USER).map((v) => [v, "<USER>"])];
export const scrub = (s) => { let t = String(s ?? ""); for (const [v, r] of SECRETS) t = t.split(v).join(r); return t; };
const netLog = path.join(OUT, "network.jsonl"); fs.writeFileSync(netLog, "");
const b = await chromium.launch({ headless: process.env.CNAIR_HEADLESS === "1" });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36", locale: "en-GB" });
const page = await ctx.newPage();
let seq = 0;
page.on("response", async (res) => {
  const req = res.request(); const url = req.url(); const type = req.resourceType();
  if (["image", "font", "stylesheet"].includes(type)) return;
  let body = ""; try { const ct = res.headers()["content-type"] || ""; if (!/image|font|octet/.test(ct)) body = (await res.text()).slice(0, 20000); } catch { /* redirect / no body */ }
  const rec = { n: ++seq, at: new Date().toISOString(), method: req.method(), type, url: scrub(url), status: res.status(), contentType: res.headers()["content-type"] || null,
    reqHeaders: Object.fromEntries(Object.entries(req.headers()).filter(([k]) => !/cookie|authorization/i.test(k))), setCookieNames: (res.headers()["set-cookie"] || "").split("\n").map((c) => c.split("=")[0]).filter(Boolean),
    post: scrub(req.postData() || "").slice(0, 4000), bytes: body.length, body: scrub(body) };
  fs.appendFileSync(netLog, JSON.stringify(rec) + "\n");
});
const log = (...a) => console.log(...a.map((x) => scrub(typeof x === "string" ? x : JSON.stringify(x))));
const pause = (ms = 2500) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true, mask: [page.getByText(USER, { exact: false })] }).catch(() => {}); };
// Login (the one write this session makes).
await page.goto("https://cnair.efficens.es/gas320/ua/r/cnair/flightdispatcher", { waitUntil: "load" });
await pause(1500);
await page.fill("#uusr", USER); await page.fill("#pswd", PASS);
await Promise.all([page.waitForLoadState("load").catch(() => {}), page.click("#subbb")]);
await pause(6000);
log("after login url:", page.url());
const cookies = await ctx.cookies(); log("cookies:", cookies.map((c) => ({ name: c.name, valueLength: c.value.length, domain: c.domain, path: c.path, expires: c.expires === -1 ? "session" : new Date(c.expires * 1000).toISOString(), httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite })));
await shot("01-after-login");
log("screen text:", (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 400));
const stepFile = process.argv[2];
if (stepFile) { const step = await import(path.resolve(stepFile)); await step.default({ page, ctx, log, shot, pause, scrub, OUT }); }
await b.close();
console.log(`network log: ${seq} responses → rig/.scratch/cnair/network.jsonl`);
