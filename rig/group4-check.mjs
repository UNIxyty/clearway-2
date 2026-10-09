// Portal foundations, Group 4 (Pick'em retired, dead pages gone, URL-only pages), on the rig:
//   portal with sign-in ON :3992, the rig wall :5199 (started by rig/start.sh, which no longer copies the old site).
//   node --env-file=.env.rig rig/group4-check.mjs
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
const AUTH = "http://127.0.0.1:3992"; const WALL = "http://127.0.0.1:5199";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL; const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 160)}` : ""}`); if (!c) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const session = async (email) => (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: "rig-access-check-only" }) })).json();
const cookieFor = (s) => `sb-${new URL(SB).hostname.split(".")[0]}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;
const admin = await session("rig-access-admin@rig.invalid");

console.log("=== 4.1 Pick'em answers nothing but 'retired' ===");
for (const [m, p] of [["GET", "/pickem"], ["GET", "/pickem/admin"], ["GET", "/pickem/admin/legacy"], ["GET", "/playoffs"], ["GET", "/playoffs/bracket"], ["POST", "/api/pickem/sync"], ["PUT", "/api/pickem/predictions/match"], ["GET", "/api/playoffs/standings"], ["GET", "/pickem/api/health"], ["GET", "/admin/email-tools"], ["POST", "/api/admin/email-tools/broadcast"]]) {
  for (const who of [null, admin]) {
    const r = await fetch(`${AUTH}${p}`, { method: m, redirect: "manual", headers: who ? { cookie: cookieFor(who) } : {} });
    const body = await r.text();
    const expect = p.startsWith("/admin/email-tools") || p.startsWith("/api/admin/email-tools") ? [307, 403, 404] : [410];
    ok(expect.includes(r.status) && (r.status !== 410 || /retired/.test(body)), `${who ? "admin" : "signed out"}: ${m} ${p} → ${r.status}`, body.slice(0, 60));
  }
}
const grid = await (await fetch(`${AUTH}/api/admin/permissions`, { headers: { cookie: cookieFor(admin) } })).json();
const keys = (grid.groups ?? []).flatMap((g) => g.actions.map((a) => a.key));
ok(keys.length > 0 && !keys.some((k) => /pickem|devmode|portal\.email\./.test(k)), `the Permissions grid has no Pick'em, Email tools or dev-mode switches (${keys.length} actions)`);
const rows = execFileSync("docker", ["exec", "supabase_db_rig", "psql", "-U", "postgres", "-tAc", "select count(*) from permission_grants where action like 'portal.pickem%' or action like 'portal.email.%' or action = 'portal.devmode'"]).toString().trim();
ok(rows === "0", "…and no grant rows for them", rows);

const browser = await chromium.launch();
for (const email of ["rig-access-user@rig.invalid", "rig-access-admin@rig.invalid"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.addCookies([{ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(await session(email))).toString("base64")}`, url: AUTH }]);
  const p = await ctx.newPage();
  await p.goto(`${AUTH}/dashboard`, { waitUntil: "load" }); await sleep(2500);
  for (const t of ["Admin", "Reports & Issues"]) await p.getByRole("button", { name: t, exact: true }).first().click().catch(() => {});
  await sleep(500);
  const nav = await p.evaluate(() => [...document.querySelectorAll("button, a")].map((e) => e.textContent.trim()).join(" | "));
  ok(!/Pickem|Pick'em|Email tools|Email console/.test(nav), `${email.split("@")[0]}: no Pickem section, no Email tools / Email console entry — gone, not a dead link`);
  if (email.includes("admin")) {
    await p.goto(`${AUTH}/admin/debug/raw`, { waitUntil: "load" }); await sleep(2000);
    const raw = await p.locator("body").innerText();
    ok(/No run selected/.test(raw) && !/Raw stream/.test(raw), "the raw stream page explains itself without a run; the menu no longer offers an empty one");
    await p.goto(`${AUTH}/agent/doc`, { waitUntil: "load" }); await sleep(2500);
    ok(/could not be opened/.test(await p.locator("body").innerText()), "/agent/doc with nothing to open says so (no endless 'Opening…')");
  }
  await ctx.close();
}
await browser.close();

console.log("\n=== 4.2 The wall runs without the old copied site ===");
const h = await (await fetch(`${WALL}/api/health`)).json();
ok(h.ok === true && h.service === "digital-wall", "the rig wall starts and answers health with no upstream copy (rig/start.sh no longer makes one)");
const out = execFileSync("sh", ["-c", "ls rig/.scratch/wall/upstream 2>/dev/null | wc -l; grep -c 'upstream' rig/.scratch/wall.out || true"]).toString().trim();
ok(/^0\s+0$/.test(out.replace(/\n/g, " ")) || out.startsWith("0"), "…and nothing in its start-up mentions it", out.replace(/\n/g, " "));
for (const p of ["/timeline.html", "/backend-test", "/wall-menu.js"]) {
  const r = await fetch(`${WALL}${p}`);
  ok(r.status === 404, `wall: ${p} → 404`, `${r.status}`);
}
console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"}`);
process.exit(failures ? 1 : 0);
