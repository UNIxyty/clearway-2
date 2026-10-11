// Nothing covers the sidebar (Part A1): on every page in the nav — read from components/portal/nav.ts, so a page added
// later is checked too — plus the pages that are not in it, the element on top at points across the whole sidebar must be
// part of the sidebar. A floating debug box, banner or badge sitting over it (as "User Bug Reports" did over "Airport
// search") fails the page. Checked as a developer (who sees every group), at full width and on the 64px rail.
//   node --env-file=.env.rig rig/overlay-check.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.RIG_SHELL_URL || "http://127.0.0.1:3989";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL; const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(SB)) { console.error("refusing: not the rig's local Supabase"); process.exit(2); }
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 240)}` : ""}`); if (!c) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const nav = readFileSync("components/portal/nav.ts", "utf8");
const fromNav = [...nav.matchAll(/href: "([^"]+)"(, external: true)?/g)].filter((m) => !m[2] && m[1] !== "/login").map((m) => m[1]);
const PAGES = [...new Set([...fromNav, "/aip/EVRA", "/help", "/help/new", "/dashboard/changelog", "/account/profile", "/settings"])];

const sess = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: "rig-access-dev@rig.invalid", password: "rig-access-check-only" }) })).json();
const browser = await chromium.launch();
for (const [w, label] of [[1440, "full width"], [1024, "rail"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addCookies([{ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(sess)).toString("base64")}`, url: BASE }]);
  const page = await ctx.newPage();
  const covered = [];
  const probe = () => page.evaluate(() => {
    const side = document.querySelector("[data-cw-sidebar]");
    if (!side) return ["no sidebar"];
    const r = side.getBoundingClientRect();
    const out = [];
    for (let y = r.top + 8; y < Math.min(r.bottom, innerHeight) - 4; y += 24) {
      for (const x of [r.left + 12, r.left + r.width / 2, r.right - 12]) {
        const el = document.elementFromPoint(x, y);
        if (el && !side.contains(el)) { const d = el.closest("[class]"); out.push(`${Math.round(x)},${Math.round(y)}: <${el.tagName.toLowerCase()} class="${String(d?.className ?? "").slice(0, 60)}"> “${(el.textContent ?? "").trim().slice(0, 40)}”`); }
      }
    }
    return out;
  });
  // The check must be able to fail: a box like the old "User Bug Reports" one, planted over the sidebar, is found.
  await page.goto(`${BASE}/dashboard`, { waitUntil: "load" }); await sleep(2000);
  await page.evaluate(() => { const d = document.createElement("div"); d.textContent = "User Bug Reports"; d.style.cssText = "position:fixed;top:98px;left:12px;width:200px;height:60px;z-index:2000;background:#fff"; document.body.appendChild(d); });
  ok((await probe()).length > 0, `${label}: the check finds a box planted over the sidebar (so it can fail)`);
  for (const path of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "load" }).catch(() => {});
    await sleep(2500);
    const hits = await probe();
    if (hits.length) covered.push(`${path} — ${hits.slice(0, 2).join(" | ")}`);
  }
  ok(covered.length === 0, `${label}: nothing covers the sidebar on any of ${PAGES.length} pages`, covered.join(" ;; "));
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
