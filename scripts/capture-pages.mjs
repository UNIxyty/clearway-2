// Screenshots of portal pages, as they are, for design references ("before" / "after") and the documentation.
// Read-only: every write request to the portal is blocked while capturing (and listed in the report), so visiting a
// page can never change anything. Re-runnable: the same list produces the same folder.
//
//   1. Sign in once (opens a browser window; sign in there as an admin; the session is saved OUTSIDE the repo):
//        node scripts/capture-pages.mjs --login
//   2. Capture (defaults: production, the built-in list below, out/portal-before/ and out/portal-before.zip):
//        node scripts/capture-pages.mjs
//        node scripts/capture-pages.mjs --out out/portal-after            the same shots, another folder
//        node scripts/capture-pages.mjs --only 02,12                       some of them
//        node scripts/capture-pages.mjs --list my-pages.json               another list (same shape as PAGES)
//        node scripts/capture-pages.mjs --base http://127.0.0.1:3989 --session rig-session.json   (the rig)
//   The session file (~/.clearway/portal-capture-session.json by default) is a signed-in session: keep it private, and
//   delete it when done (it is never written into the repo).
//
// Each page: { id, name, path, waitFor?, settleMs?, fullPage?, actions?, holdData? }
//   waitFor  a CSS selector or "text=…" that must appear before the shot
//   actions  [{ agentPanel: true } | { scrollToText: "…" } | { scrollBy: px } | { fill: [selector, value] } | { click: selector }]
//   holdData { match: "substring of the data call's URL", shots: [ms after navigation, …] } — the page mid-load: that call
//            is held back, and a shot is taken at each moment (the call is then released)
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = String(arg("base", "https://clearway.verxyl.com")).replace(/\/+$/, "");
const SESSION = arg("session", path.join(os.homedir(), ".clearway", "portal-capture-session.json"));
const OUT = arg("out", "out/portal-before");
const ONLY = arg("only") ? new Set(arg("only").split(",").map((s) => s.trim())) : null;
const WIDTH = Number(arg("width", 1440));

export const PAGES = [
  { id: "01", name: "dashboard", path: "/dashboard", waitFor: "text=Changelog", settleMs: 4000 },
  { id: "02", name: "permissions", path: "/admin/permissions", waitFor: 'table[aria-label^="Permissions"]', settleMs: 1500 },
  { id: "02b", name: "permissions-scrolled", path: "/admin/permissions", waitFor: 'table[aria-label^="Permissions"]', fullPage: false, actions: [{ scrollToText: "Operators" }, { scrollBy: -60 }] },
  { id: "03", name: "admin-users", path: "/admin/users", settleMs: 3000 },
  { id: "04", name: "admin-maintenance", path: "/admin/maintenance", waitFor: "text=Maintenance Control", settleMs: 2000 },
  { id: "05", name: "developer-inbox", path: "/developer/inbox", settleMs: 4000 },
  { id: "06", name: "agent-settings", path: "/agent/settings", settleMs: 4000 },
  { id: "07", name: "agent-sites", path: "/admin/agent-sites", settleMs: 3000 },
  { id: "08", name: "account-profile", path: "/account/profile", settleMs: 2500 },
  { id: "09", name: "service-status", path: "/aip/service-status", settleMs: 3500 },
  { id: "10", name: "airport-ad2", path: "/aip/EVRA", waitFor: "text=PDF Viewer", settleMs: 12000 },
  { id: "11", name: "agent-panel-open", path: "/dashboard", waitFor: "text=Changelog", fullPage: false, actions: [{ agentPanel: true }], settleMs: 2500 },
  { id: "12", name: "airport-mid-load", path: "/aip/EVRA", fullPage: false, holdData: { match: "/api/aip/", shots: [300, 1200, 3000] } },
  // Empty states.
  { id: "13", name: "empty-hidden-airports", path: "/admin/airports/deleted", settleMs: 2500 },
  { id: "14", name: "empty-permissions-filter", path: "/admin/permissions", waitFor: 'table[aria-label^="Permissions"]', fullPage: false, actions: [{ fill: ['input[aria-label="Find an action"]', "zzzz"] }] },
  { id: "15", name: "empty-history-search", path: "/agent/history", settleMs: 2500, fullPage: false, actions: [{ fill: ['input[name="history-search"], input[placeholder*="Search"]', "zzzz no such thread"] }] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// For review before anything is shared: document numbers and dates of birth (names cannot be found by a pattern —
// the pages on the list show none, and every image is looked at before zipping).
const PII = [/\b[A-Z]{1,3}\d{6,9}\b/g, /\b(?:DOB|D\.O\.B\.?|date of birth|born)\b[^\n]{0,30}/gi, /\bpassport\s*(?:no\.?|number)?\s*[:#]?\s*(?=[A-Z0-9]*\d)[A-Z0-9]{6,}/gi];

async function login() {
  fs.mkdirSync(path.dirname(SESSION), { recursive: true, mode: 0o700 });
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login?next=%2Fdashboard`);
  console.log(`Sign in in the browser window (${BASE}). Waiting up to 10 minutes…`);
  await page.waitForURL((u) => !/\/(login|signup|auth)(\/|$|\?)/.test(new URL(u).pathname), { timeout: 600_000 });
  await page.waitForTimeout(2000);
  await ctx.storageState({ path: SESSION });
  fs.chmodSync(SESSION, 0o600);
  await browser.close();
  console.log(`Signed in; session saved to ${SESSION} (private; delete it when done).`);
}

async function capture() {
  if (!fs.existsSync(SESSION)) { console.error(`No session at ${SESSION}. Run with --login first.`); process.exit(2); }
  let pages = PAGES;
  if (arg("list")) pages = JSON.parse(fs.readFileSync(arg("list"), "utf8"));
  if (ONLY) pages = pages.filter((p) => ONLY.has(p.id));
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report = [];
  for (const spec of pages) {
    const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 900 }, storageState: SESSION, colorScheme: "light" });
    const page = await ctx.newPage();
    const blocked = [];
    const origin = new URL(BASE).origin;
    // Read-only: nothing that writes reaches the portal (or the agent and wall behind it).
    await ctx.route("**/*", async (route) => {
      const req = route.request();
      if (req.url().startsWith(origin) && !["GET", "HEAD", "OPTIONS"].includes(req.method())) {
        blocked.push(`${req.method()} ${new URL(req.url()).pathname}`);
        return route.abort();
      }
      if (spec.holdData && req.url().includes(spec.holdData.match) && !page.__released) {
        await new Promise((r) => (page.__waiters ??= []).push(r));
      }
      return route.continue();
    });
    const files = [];
    try {
      if (spec.holdData) {
        const t0 = Date.now();
        void page.goto(`${BASE}${spec.path}`, { waitUntil: "commit" }).catch(() => {});
        for (const [i, at] of spec.holdData.shots.entries()) {
          await sleep(Math.max(0, at - (Date.now() - t0)));
          const f = `${spec.id}-${spec.name}-${String.fromCharCode(97 + i)}-${at}ms.png`;
          await page.screenshot({ path: path.join(OUT, f), fullPage: false });
          files.push(f);
        }
        page.__released = true; for (const r of page.__waiters ?? []) r();
      } else {
        await page.goto(`${BASE}${spec.path}`, { waitUntil: "load", timeout: 60_000 });
        if (/\/login(\/|$|\?)/.test(new URL(page.url()).pathname)) throw new Error("not signed in (the session expired?) — run --login again");
        if (spec.waitFor) await page.waitForSelector(spec.waitFor, { timeout: 45_000 }).catch(() => { report.push({ id: spec.id, note: `did not see ${spec.waitFor}` }); });
        await sleep(spec.settleMs ?? 1500);
        for (const a of spec.actions ?? []) {
          if (a.agentPanel) { await page.evaluate(() => window.dispatchEvent(new Event("cw-agent-open"))); await page.waitForSelector("[data-cw-agent-panel]", { timeout: 15_000 }).catch(() => report.push({ id: spec.id, note: "the agent panel did not open (no agent access?)" })); await sleep(1500); }
          if (a.scrollToText) { await page.getByText(a.scrollToText, { exact: true }).first().scrollIntoViewIfNeeded().catch(() => {}); await page.evaluate(() => window.scrollBy(0, 0)); await sleep(400); }
          if (a.scrollBy) { await page.evaluate((y) => window.scrollBy(0, y), a.scrollBy); await sleep(300); }
          if (a.fill) { const el = page.locator(a.fill[0]).first(); if (await el.count()) { await el.fill(a.fill[1]); await sleep(1200); } else report.push({ id: spec.id, note: `no field ${a.fill[0]}` }); }
          if (a.click) { await page.locator(a.click).first().click().catch(() => report.push({ id: spec.id, note: `could not click ${a.click}` })); await sleep(1200); }
        }
        const f = `${spec.id}-${spec.name}.png`;
        await page.screenshot({ path: path.join(OUT, f), fullPage: spec.fullPage !== false });
        files.push(f);
      }
      const text = await page.evaluate(() => document.body.innerText).catch(() => "");
      const flags = PII.flatMap((re) => text.match(re) ?? []);
      report.push({ id: spec.id, name: spec.name, path: spec.path, url: page.url().replace(BASE, ""), files, blockedWrites: blocked, piiFlags: [...new Set(flags)].slice(0, 10) });
      console.log(`${spec.id} ${spec.name}: ${files.join(", ")}${blocked.length ? ` · blocked ${blocked.length} write(s)` : ""}${flags.length ? ` · REVIEW: ${flags.length} pattern hit(s)` : ""}`);
    } catch (error) {
      report.push({ id: spec.id, name: spec.name, error: String(error?.message || error) });
      console.log(`${spec.id} ${spec.name}: FAILED — ${error?.message || error}`);
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "capture-report.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), width: WIDTH, pages: report }, null, 2));
  if (!process.argv.includes("--no-zip")) {
    const zip = `${OUT.replace(/\/+$/, "")}.zip`;
    fs.rmSync(zip, { force: true });
    execFileSync("zip", ["-qr", path.basename(zip), path.basename(OUT)], { cwd: path.dirname(path.resolve(OUT)) });
    console.log(`\n${OUT}/ and ${zip}`);
  }
}

if (process.argv.includes("--login")) await login(); else await capture();
