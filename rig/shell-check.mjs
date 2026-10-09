// Portal foundations 3.1 — one persistent shell — in the browser on the rig (rig/start.sh; the portal behind the
// proxy :3999). Going between portal pages must keep the sidebar still (the same DOM node, never absent, never a
// skeleton over it), keep Admin and Ops Agent in place, keep the agent panel open, and land a new page at the top.
// Records a video of the walk-through.   node --env-file=.env.rig rig/shell-check.mjs → rig/.scratch/shots/shell-*.{png,webm}
import { chromium } from "playwright";
import { mkdirSync, readdirSync, renameSync } from "node:fs";
// Sign-in ON (portal :3992, agent :5176, wall :5198) behind a second proxy, as a real admin with agent access:
//   RIG_PROXY_PORT=3989 RIG_PORTAL_PORT=3992 RIG_AGENT_PORT=5176 RIG_WALL_PORT=5198 node rig/proxy.mjs
const BASE = process.env.RIG_SHELL_URL || "http://127.0.0.1:3989";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL; const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const OUT = "rig/.scratch/shots"; mkdirSync(`${OUT}/shell-video`, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 160)}` : ""}`); if (!c) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: `${OUT}/shell-video`, size: { width: 1440, height: 900 } } });
const sess = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: "rig-access-admin@rig.invalid", password: "rig-access-check-only" }) })).json();
await ctx.addCookies([{ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(sess)).toString("base64")}`, url: BASE }]);
const page = await ctx.newPage();
await page.goto(`${BASE}/dashboard`, { waitUntil: "load" });
await page.waitForSelector("[data-cw-sidebar]"); await sleep(2500);

// Tag the sidebar and two nav rows, and watch every animation frame for the sidebar ever being absent.
await page.evaluate(() => {
  const w = window;
  w.__sidebar = document.querySelector("[data-cw-sidebar]");
  w.__agentRow = [...document.querySelectorAll("[data-cw-sidebar] button")].find((b) => b.textContent.trim().startsWith("Ops Agent")) ?? null;
  w.__adminRow = [...document.querySelectorAll("[data-cw-sidebar] button")].find((b) => b.textContent.trim() === "Admin") ?? null;
  w.__gone = 0; w.__frames = 0;
  const tick = () => { w.__frames += 1; if (!document.querySelector("[data-cw-sidebar]")) w.__gone += 1; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
const same = () => page.evaluate(() => ({
  sidebar: document.querySelector("[data-cw-sidebar]") === window.__sidebar,
  agent: !window.__agentRow || window.__agentRow.isConnected,
  admin: !window.__adminRow || window.__adminRow.isConnected,
  gone: window.__gone, frames: window.__frames,
}));
const nav = async (label, url, topics = []) => {
  // Open a folded nav section only if the item is not already visible (a click on an open section folds it).
  for (const t of topics) {
    if (await page.locator("[data-cw-sidebar]").getByRole("button", { name: label, exact: true }).count()) break;
    await page.locator("[data-cw-sidebar]").getByRole("button", { name: t, exact: true }).first().click(); await sleep(300);
  }
  await page.locator("[data-cw-sidebar]").getByRole("button", { name: label, exact: true }).first().click();
  await page.waitForURL(url, { timeout: 20000 }); await sleep(1500);
};
const hasAdmin = await page.evaluate(() => Boolean(window.__adminRow)); const hasAgent = await page.evaluate(() => Boolean(window.__agentRow));
ok(hasAdmin && hasAgent, "the rig account sees Admin and Ops Agent in the sidebar");

await page.screenshot({ path: `${OUT}/shell-1-dashboard.png` });
await nav("Airport search", /\/aip$/, ["AIP & Documents"]);
let s = await same();
ok(s.sidebar && s.gone === 0, "Dashboard → Airport search: the same sidebar, never absent for a single frame", `${s.gone} of ${s.frames} frames without it`);
ok(s.admin && s.agent, "…Admin and Ops Agent did not re-appear late: the same rows, still there");

// Scroll down a long page, then move on: the new page starts at the top; Back returns to the long page.
await nav("Permissions", /\/admin\/permissions$/, ["Admin"]);
await page.waitForSelector('table[aria-label^="Permissions"]'); await sleep(800);
await page.mouse.move(900, 600); await page.mouse.wheel(0, 1800); await sleep(800);
const before = await page.evaluate(() => window.scrollY);
ok(before > 1000, "the Permissions grid is long enough to scroll", `${before}px`);
await nav("Dashboard", /\/dashboard$/);
const after = await page.evaluate(() => window.scrollY);
ok(after === 0, "a new page opens at its top", `scrolled ${before}px on Permissions, ${after}px on arrival at Dashboard`);
await page.goBack(); await page.waitForURL(/\/admin\/permissions$/); await sleep(2000);
const back = await page.evaluate(() => window.scrollY);
ok((await same()).sidebar, "Back: still the same sidebar", `scroll after Back: ${back}px (was ${before}px)`);

// The agent panel stays open across pages.
await nav("Airport search", /\/aip$/, ["AIP & Documents"]);
await page.evaluate(() => window.dispatchEvent(new Event("cw-agent-open")));
await page.waitForSelector("[data-cw-agent-panel]"); await sleep(1200);
await page.evaluate(() => { window.__panel = document.querySelector("[data-cw-agent-panel]"); });
await page.screenshot({ path: `${OUT}/shell-2-panel-open-aip.png` });
await nav("Dashboard", /\/dashboard$/);
await nav("Service status", /\/aip\/service-status$/, ["AIP & Documents"]);
const panel = await page.evaluate(() => ({ same: document.querySelector("[data-cw-agent-panel]") === window.__panel, open: Boolean(document.querySelector("[data-cw-agent-panel]")) }));
ok(panel.open && panel.same, "the agent panel stays open, the same panel, across two navigations");
await page.screenshot({ path: `${OUT}/shell-3-panel-still-open.png` });

// A page with its own nav (deep context) and back.
await page.goto(`${BASE}/dashboard`, { waitUntil: "load" }); await sleep(2000);
await page.evaluate(() => { window.__sidebar = document.querySelector("[data-cw-sidebar]"); window.__gone = 0; });
await nav("Debug runner", /\/admin\/debug$/, ["Admin", "Developer"]);
const deep = await page.locator("[data-cw-sidebar]").innerText();
s = await same();
ok(/All services/.test(deep) && s.sidebar && s.gone === 0, "a page with its own nav (Debug runner): the sidebar switches to it in place", deep.split("\n").slice(0, 3).join(" | "));
await page.locator("[data-cw-sidebar]").getByRole("button", { name: "All services" }).click();
await page.waitForURL(/\/$|\/dashboard$/, { timeout: 15000 }); await sleep(1500);
ok(!/All services/.test(await page.locator("[data-cw-sidebar]").innerText()) && (await same()).sidebar, "…and back: the normal nav, the same sidebar");

// Full-screen routes stay bare.
const bare = await ctx.newPage();
await bare.goto(`${BASE}/maintenance`, { waitUntil: "load" }); await sleep(1500);
ok(await bare.locator("[data-cw-sidebar]").count() === 0, "a full-screen route (/maintenance) has no portal frame");
await bare.close();

await ctx.close();
const vid = readdirSync(`${OUT}/shell-video`).filter((f) => f.endsWith(".webm")).map((f) => `${OUT}/shell-video/${f}`);
if (vid[0]) renameSync(vid[0], `${OUT}/shell-walkthrough.webm`);
await browser.close();
console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"} · ${OUT}/shell-*.png, ${OUT}/shell-walkthrough.webm`);
process.exit(failures ? 1 : 0);
