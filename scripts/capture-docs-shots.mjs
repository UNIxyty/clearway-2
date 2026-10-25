// The docs' screenshots, retaken in one go (docs/how-to-write-docs.md › Screenshots). Rig only: the test copy of the
// portal, the console preview and the sign-in wall — invented data, never production. Every picture is taken at double
// size in BOTH themes: <name>.png (light) and <name>-dark.png (dark), under public/docs-media/screenshots/, and a
// manifest.json beside them says what was taken, at what size, and that no passenger document was on the page.
//
//   node --env-file=.env.rig scripts/capture-docs-shots.mjs            every shot
//   node --env-file=.env.rig scripts/capture-docs-shots.mjs --only dashboard-the-dashboard,admin-users
//
// Pages name their pictures: `[screenshot: <name> | caption]`. Retaking is replacing files here; no page is edited.
// The rule that matters most: NO PASSENGER PERSONAL DATA IN ANY IMAGE. A page is scanned before the shot — an open
// passenger document ([data-pax-doc]) or a revealed field fails the run; the passenger list itself is masked by design
// and its names are the manifest fixtures' invented ones.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only — screenshots are never taken on production."); process.exit(2); }
const PORTAL = "http://127.0.0.1:3989", CONSOLE = "http://127.0.0.1:4173";
const OUT = "public/docs-media/screenshots"; fs.mkdirSync(OUT, { recursive: true });
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const ONLY = arg("only") ? new Set(arg("only").split(",").map((s) => s.trim())) : null;
const PASSWORD = "rig-access-check-only";
const grant = async (email) => (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) })).json();

// One shot per docs page, named <section>-<page> (the folders' names without their numbers), plus a few close-ups.
// { name, at: "portal" | "console", path, width?, waitFor?, settleMs?, actions?, fullPage? }
export const SHOTS = [
  { name: "dashboard-the-dashboard", at: "portal", path: "/dashboard", waitFor: "text=Changelog", settleMs: 3500 },
  { name: "dashboard-on-a-phone", at: "portal", path: "/m/dashboard", width: 390, settleMs: 3000 },
  { name: "aip-and-documents-airport-search", at: "portal", path: "/aip", settleMs: 2500 },
  { name: "aip-and-documents-airport-page", at: "portal", path: "/aip/EVRA", settleMs: 6000 },
  { name: "aip-and-documents-service-status", at: "portal", path: "/aip/service-status", settleMs: 3000 },
  { name: "aip-and-documents-hidden-airports", at: "portal", path: "/admin/airports/deleted", settleMs: 2500 },
  { name: "digital-wall-the-wall", at: "console", path: "/timeline", settleMs: 5000, fullPage: false },
  { name: "digital-wall-flights", at: "console", path: "/console/flights", settleMs: 4000 },
  { name: "digital-wall-notam-check", at: "console", path: "/console/notam-check", settleMs: 3500 },
  { name: "digital-wall-operators", at: "console", path: "/console/operators", settleMs: 3000 },
  { name: "operators-add-button", at: "console", path: "/console/operators", settleMs: 3000, fullPage: false, clip: { x: 980, y: 0, width: 460, height: 160 } },
  { name: "digital-wall-aircraft", at: "console", path: "/console/aircraft", settleMs: 3000 },
  { name: "digital-wall-limitations", at: "console", path: "/console/limitations", settleMs: 3000 },
  { name: "digital-wall-important", at: "console", path: "/console/important", settleMs: 3000 },
  { name: "digital-wall-caa-details", at: "console", path: "/console/caa", settleMs: 3000 },
  { name: "digital-wall-webhooks", at: "console", path: "/console/webhooks", settleMs: 3000 },
  { name: "digital-wall-reports", at: "console", path: "/console/reports", settleMs: 3000 },
  { name: "digital-wall-settings", at: "console", path: "/console/settings", settleMs: 3000 },
  { name: "ops-agent-chat", at: "portal", path: "/agent", settleMs: 3500 },
  { name: "ops-agent-history", at: "portal", path: "/agent/history", settleMs: 3000 },
  { name: "ops-agent-knowledge-base", at: "portal", path: "/agent/knowledge", settleMs: 3000 },
  { name: "ops-agent-flight-intake", at: "portal", path: "/agent/intake", settleMs: 3500 },
  { name: "ops-agent-mailbox", at: "portal", path: "/agent/mailbox", settleMs: 3500 },
  { name: "ops-agent-activity-log", at: "portal", path: "/agent/activity", settleMs: 3000 },
  { name: "ops-agent-settings", at: "portal", path: "/agent/settings", settleMs: 3500 },
  { name: "admin-users", at: "portal", path: "/admin/users", settleMs: 3000 },
  { name: "admin-clients", at: "portal", path: "/admin/clients", settleMs: 3000 },
  { name: "admin-agent-sites", at: "portal", path: "/admin/agent-sites", settleMs: 3000 },
  { name: "admin-permissions", at: "portal", path: "/admin/permissions", waitFor: 'table[aria-label^="Permissions"]', settleMs: 2000 },
  { name: "admin-maintenance", at: "portal", path: "/admin/maintenance", settleMs: 2500 },
  { name: "admin-service-status-editor", at: "portal", path: "/admin/service-status", settleMs: 3000 },
  { name: "developer-inbox", at: "portal", path: "/developer/inbox", settleMs: 3500 },
  { name: "developer-saved-replies", at: "portal", path: "/developer/saved-replies", settleMs: 3000 },
  { name: "developer-agent-access", at: "portal", path: "/developer/agent-access", settleMs: 3000 },
  { name: "account-and-settings-profile", at: "portal", path: "/account/profile", settleMs: 2500 },
  { name: "account-and-settings-settings", at: "portal", path: "/settings", settleMs: 2500 },
  { name: "help-and-support-get-help", at: "portal", path: "/help/new", settleMs: 2500 },
  { name: "help-and-support-your-threads", at: "portal", path: "/help", settleMs: 2500 },
];

const browser = await chromium.launch();
const dev = await grant("rig-access-dev@rig.invalid"); // sees every page the docs describe
if (!dev.access_token) { console.error("the rig developer account could not sign in"); process.exit(2); }
const portalCookie = { name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(dev)).toString("base64")}`, url: PORTAL };
const consoleCookie = { name: "sb-rig-auth-token", value: encodeURIComponent(JSON.stringify([dev.access_token])), url: CONSOLE };
const manifest = { takenAt: new Date().toISOString(), from: "the rig (invented data)", scale: 2, themes: ["light", "dark"], shots: [] };
let failures = 0;
for (const shot of SHOTS) {
  if (ONLY && !ONLY.has(shot.name)) continue;
  for (const theme of ["light", "dark"]) {
    const width = shot.width ?? 1440;
    const ctx = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 900 }, deviceScaleFactor: 2, colorScheme: theme });
    await ctx.addCookies([shot.at === "console" ? consoleCookie : portalCookie]);
    await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
    // Read-only: the pictures must never change anything. Every write to the portal or the wall is refused.
    await ctx.route(/.*/, (route) => { const m = route.request().method(); if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS" && /\/api\//.test(route.request().url())) return route.fulfill({ status: 403, body: "capture: writes are blocked" }); return route.continue(); });
    const page = await ctx.newPage();
    const base = shot.at === "console" ? CONSOLE : PORTAL;
    try {
      await page.goto(`${base}${shot.path}`, { waitUntil: "load", timeout: 45000 });
      if (shot.waitFor) await page.waitForSelector(shot.waitFor, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(shot.settleMs ?? 2500);
      for (const a of shot.actions ?? []) { if (a.click) await page.click(a.click).catch(() => {}); if (a.scrollToText) await page.getByText(a.scrollToText).first().scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(600); }
      // the privacy scan: an open passenger document, or a revealed document field, fails the shot
      const leak = await page.evaluate(() => ({ docs: document.querySelectorAll("[data-pax-doc]").length, revealed: document.querySelectorAll("[data-pax-doc] [data-field], [data-pax-revealed]").length, text: /Document number\s*[A-Z0-9 ]{6,}|Date of birth\s*\d{2}/i.test(document.body.innerText) }));
      if (leak.docs || leak.revealed || leak.text) { console.log(`FAIL  ${shot.name} ${theme}: a passenger document is on the page — not captured`); failures += 1; await ctx.close(); continue; }
      const file = path.join(OUT, `${shot.name}${theme === "dark" ? "-dark" : ""}.png`);
      await page.screenshot({ path: file, fullPage: shot.fullPage !== false && !shot.clip, ...(shot.clip ? { clip: shot.clip } : {}) });
      const size = fs.statSync(file).size;
      manifest.shots.push({ name: shot.name, theme, file: path.basename(file), at: shot.at, path: shot.path, viewport: width, scale: 2, bytes: size, scan: "clean" });
      console.log(`PASS  ${shot.name} ${theme} (${Math.round(size / 1024)} KB)`);
    } catch (e) { console.log(`FAIL  ${shot.name} ${theme}: ${e instanceof Error ? e.message.split("\n")[0] : e}`); failures += 1; }
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`${manifest.shots.length} pictures written to ${OUT}; ${failures} failed`);
process.exit(failures ? 1 : 0);
