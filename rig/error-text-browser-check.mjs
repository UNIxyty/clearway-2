// What a person sees when something fails is our own wording: never a setting name, a stack, an upstream body, a
// database or network error, or an internal address (lib/public-error.ts). The rig is a good place to look: it has no
// AIP, GEN, NOTAM or weather sync service, no mail server and no Telegram, so those paths fail here.
// Opens the portal (as a Developer, who sees every page) and the wall console (as an Admin), presses the actions that
// fail on the rig (Re-sync, Get GEN 1.2), and fails on any leak in the page text or in a title tooltip.
// Needs the sign-in rig (proxy :3989) and the console on :4173. rig/check-error-text.mjs checks the source.
//   node --env-file=.env.rig rig/error-text-browser-check.mjs
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3989";
const CONSOLE = process.env.RIG_CONSOLE_URL || "http://127.0.0.1:4173";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) throw new Error("rig only");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORTAL = [
  "/dashboard", "/dashboard/changelog", "/aip", "/aip/EVRA", "/aip/service-status", "/admin/airports/deleted",
  "/admin/users", "/admin/permissions", "/admin/maintenance", "/admin/service-status", "/admin/agent-sites",
  "/developer/inbox", "/developer/agent-access", "/developer/saved-replies", "/help", "/settings", "/account/profile",
  "/agent", "/agent/history", "/agent/activity", "/agent/knowledge", "/agent/settings",
];
const WALL = ["flights", "notam-check", "operators", "aircraft", "limitations", "important", "caa", "webhooks", "reports", "settings"];

const LEAKS = [
  [/\b[A-Z][A-Z0-9]*_[A-Z0-9_]*(URL|KEY|SECRET|TOKEN|PASSWORD|USERNAME|ENC|BASE|TO)\b/, "a setting name"],
  [/\bat [\w$.<>]+ \(?[^\s()]+:\d+:\d+\)?/, "a stack trace"],
  [/<(!DOCTYPE|html|head|body)\b/i, "an HTML page"],
  [/\b(TypeError|SyntaxError|ReferenceError|RangeError|Unexpected token|node:internal|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|fetch failed|Failed to fetch|NetworkError|AbortError)\b/, "an exception"],
  [/\b(schema cache|PGRST\d+|relation "|violates|duplicate key|Supabase (PATCH|GET|POST|request)|PostgREST|JWT expired|GraphQL request failed)\b/i, "a database or upstream error"],
  [/\bhttps?:\/\/(127\.0\.0\.1|localhost|notam-sync|aip-sync|[a-z0-9-]+\.internal)\b/i, "an internal address"],
  [/\b(stderr|stdout|container is running|in Vercel|\.env\b|scripts\/[\w-]+\.(mjs|py))/i, "a setup instruction"],
];
const leaksIn = (text) => LEAKS.filter(([re]) => re.test(text)).map(([re, what]) => `${what}: "${text.slice(Math.max(0, text.search(re) - 50), text.search(re) + 70).replace(/\s+/g, " ")}"`);

let failed = 0, passed = 0;
const ok = (cond, label, detail = "") => { cond ? passed++ : failed++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  · ${detail}` : ""}`); };
const shown = (page) => page.evaluate(() => [document.body.innerText, ...[...document.querySelectorAll("[title]")].map((e) => e.getAttribute("title"))].join("\n"));

const token = async (email) => (await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: "rig-access-check-only" }) })).json());
const browser = await chromium.launch({ args: ["--disable-audio-output"] });
try {
  // Portal, as a Developer.
  const sess = await token("rig-access-dev@rig.invalid");
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  await ctx.addCookies([{ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(sess)).toString("base64")}`, url: BASE }]);
  const page = await ctx.newPage();
  for (const p of PORTAL) {
    await page.goto(`${BASE}${p}`, { waitUntil: "load", timeout: 60000 }).catch(() => {});
    await sleep(4000);
    const bad = leaksIn(await shown(page));
    ok(bad.length === 0, `${p}: no raw error text on screen`, bad.slice(0, 2).join(" | "));
  }
  // The airport page's actions that fail on the rig.
  await page.goto(`${BASE}/aip/EVRA`, { waitUntil: "load" }); await sleep(4000);
  await page.getByRole("button", { name: "Re-sync" }).click().catch(() => {}); await sleep(6000);
  let bad = leaksIn(await shown(page));
  ok(bad.length === 0, "/aip/EVRA after Re-sync fails: no raw error text", bad.slice(0, 2).join(" | "));
  await page.getByText(/^GEN · /).first().click().catch(() => {}); await sleep(2500);
  await page.getByRole("button", { name: /Get GEN 1\.2/ }).click().catch(() => {}); await sleep(6000);
  bad = leaksIn(await shown(page));
  ok(bad.length === 0, "/aip/EVRA after Get GEN 1.2 fails: no raw error text", bad.slice(0, 2).join(" | "));
  await ctx.close();

  // Wall console, as an Admin.
  const wctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await wctx.addCookies([{ name: "sb-rig-auth-token", value: encodeURIComponent(JSON.stringify([(await token("rig-access-admin@rig.invalid")).access_token])), url: CONSOLE }]);
  const wall = await wctx.newPage();
  for (const k of WALL) {
    await wall.goto(`${CONSOLE}/console/${k}`, { waitUntil: "load", timeout: 60000 }).catch(() => {});
    await sleep(3500);
    const b = leaksIn(await shown(wall));
    ok(b.length === 0, `wall console ${k}: no raw error text on screen`, b.slice(0, 2).join(" | "));
  }
  await wctx.close();
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} FAILED` : `\nALL PASSED (${passed})`);
process.exit(failed ? 1 : 0);
