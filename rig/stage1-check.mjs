// Portal redesign, stage 1 (tokens, theme, shell) — in the browser, on the rig. Sign-in ON (portal :3992 behind the
// proxy :3989, agent :5176, wall :5198):
//   RIG_PROXY_PORT=3989 RIG_PORTAL_PORT=3992 RIG_AGENT_PORT=5176 RIG_WALL_PORT=5198 node rig/proxy.mjs
//   node --env-file=.env.rig rig/stage1-check.mjs            → rig/.scratch/shots/stage1-*.png
// Checks:
//   1. No flash of the wrong theme: with every JS chunk held back 3 s, the page that paints is already in the chosen
//      theme (light device + Dark chosen, dark device + Light chosen, Match device both ways), and with JS OFF the
//      device setting decides (the stylesheet's prefers-color-scheme block).
//   2. Switching: the theme menu changes data-theme at once, keeps it in localStorage, saves it to the account; a
//      fresh browser (another device) signed in to the same account adopts it.
//   3. The boot second (§4.1): with the role check held back, the account line is a skeleton (no placeholder role)
//      and the Admin/Developer/Ops Agent slots are skeletons; for a user they then go, for an admin Admin fills its slot.
//   4. Contrast, measured: every visible text element's colour against its painted background, on several pages, in
//      both themes; AA (4.5, or 3 for large text); inactive (disabled) controls exempt.
//   5. The wall display is untouched: with the portal set to Dark on a dark device, it has no data-theme, reads no
//      --cw-* token, and paints exactly the colours it paints with the portal in Light; the console follows the portal.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.RIG_SHELL_URL || "http://127.0.0.1:3989";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL; const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 220)}` : ""}`); if (!c) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DARK_PAGE = "rgb(13, 16, 21)"; const LIGHT_PAGE = "rgb(251, 251, 252)";

const sessions = {};
async function session(who) {
  if (sessions[who]) return sessions[who];
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: `rig-access-${who}@rig.invalid`, password: "rig-access-check-only" }) });
  return (sessions[who] = await r.json());
}
const browser = await chromium.launch();
async function context(who, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", ...opts });
  if (who) { const sess = await session(who); await ctx.addCookies([{ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(sess)).toString("base64")}`, url: BASE }]); }
  return ctx;
}
// The colour actually painted at a point, read from a screenshot (decoded by the browser itself).
async function pixel(page, x, y) {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  const dec = await browser.newPage();
  const rgb = await dec.evaluate(async (b64) => { const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode(); const c = document.createElement("canvas"); c.width = 1; c.height = 1; const g = c.getContext("2d"); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]}, ${d[1]}, ${d[2]})`; }, png.toString("base64"));
  await dec.close();
  return rgb;
}
const rgbOf = (c) => { const n = c.match(/[\d.]+/g).map(Number); return /^color\(srgb/.test(c) ? n.slice(0, 3).map((v) => Math.round(v * 255)) : n.slice(0, 3); };
const near = (a, b, tol = 3) => { const [x, y] = [rgbOf(a), rgbOf(b)]; return x.every((v, i) => Math.abs(v - y[i]) <= tol); };

// ── 1. No flash ────────────────────────────────────────────────────────────────────────────────────────────────────
for (const [device, choice, expect] of [["light", "dark", "dark"], ["dark", "light", "light"], ["dark", null, "dark"], ["light", null, "light"]]) {
  const ctx = await context("admin", { colorScheme: device });
  if (choice) await ctx.addInitScript((c) => { try { localStorage.setItem("cw-theme", c); } catch { /* */ } }, choice);
  let scriptsReleased = false;
  await ctx.route("**/_next/static/chunks/**", async (route) => { await sleep(3000); scriptsReleased = true; await route.continue(); });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "commit" });
  await page.waitForFunction(() => performance.getEntriesByType("paint").length > 0, null, { timeout: 15000 });
  await sleep(250);
  const state = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor }));
  const painted = await pixel(page, 262, 8); // the top bar's page background, left of the breadcrumb
  const early = !scriptsReleased;
  const want = expect === "dark" ? DARK_PAGE : LIGHT_PAGE;
  ok(state.theme === expect && near(state.bg, want) && near(painted, want) && early,
    `first paint, before any app script runs: device ${device}, chosen ${choice ?? "Match this device"} → ${expect}`, `data-theme=${state.theme}, body ${state.bg}, painted ${painted}, app scripts still held back: ${early}`);
  if (device === "light" && choice === "dark") await page.screenshot({ path: `${OUT}/stage1-first-paint-dark.png` });
  await ctx.close();
}
for (const device of ["dark", "light"]) {
  const ctx = await context("admin", { colorScheme: device, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "load" });
  const painted = await pixel(page, 262, 8);
  const want = device === "dark" ? DARK_PAGE : LIGHT_PAGE;
  ok(near(painted, want), `JavaScript off, device ${device}: the page paints ${device}`, `painted ${painted}`);
  await ctx.close();
}

// ── 2. Switching, saving, another device ─────────────────────────────────────────────────────────────────────────────
{
  const ctx = await context("user");
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "load" }); await sleep(2500);
  const saved = page.waitForResponse((r) => r.url().includes("/api/user/preferences") && r.request().method() === "POST");
  await page.getByRole("button", { name: /^Theme:/ }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  const at = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, stored: localStorage.getItem("cw-theme"), bg: getComputedStyle(document.body).backgroundColor }));
  const res = await (await saved).json();
  ok(at.theme === "dark" && at.stored === "dark" && near(at.bg, DARK_PAGE), "theme menu → Dark: applied at once and kept on this device", JSON.stringify(at));
  ok(res.ok === true && res.themeSaved === true && res.preferences?.theme === "dark", "…and saved to the account", JSON.stringify({ ok: res.ok, themeSaved: res.themeSaved, theme: res.preferences?.theme }));
  await page.screenshot({ path: `${OUT}/stage1-switched-dark.png` });
  await ctx.close();
  // Another device: nothing in localStorage, light device. The account's choice is adopted once the identity loads.
  const other = await context("user");
  const p2 = await other.newPage();
  await p2.goto(`${BASE}/dashboard`, { waitUntil: "load" });
  await p2.waitForFunction(() => document.documentElement.dataset.theme === "dark", null, { timeout: 10000 }).catch(() => {});
  const adopted = await p2.evaluate(() => ({ theme: document.documentElement.dataset.theme, stored: localStorage.getItem("cw-theme") }));
  ok(adopted.theme === "dark" && adopted.stored === "dark", "another browser signed in to the same account adopts Dark", JSON.stringify(adopted));
  // Put the account back to Match this device.
  await p2.getByRole("button", { name: /^Theme:/ }).click();
  const back = p2.waitForResponse((r) => r.url().includes("/api/user/preferences") && r.request().method() === "POST");
  await p2.getByRole("menuitemradio", { name: "Match this device" }).click();
  ok((await (await back).json()).preferences?.theme === "system", "…and back to Match this device (account restored)");
  await other.close();
}

// ── 3. The boot second ──────────────────────────────────────────────────────────────────────────────────────────────
for (const who of ["user", "admin"]) {
  const ctx = await context(who);
  let release; const held = new Promise((r) => { release = r; });
  await ctx.route(/\/api\/(admin\/status|assistant\/availability)/, async (route) => { await held; await route.continue(); });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "load" }); await sleep(1500);
  const boot = await page.evaluate(() => {
    const side = document.querySelector("[data-cw-sidebar]");
    const text = side?.innerText ?? "";
    return { text, skeletons: side?.querySelectorAll(".cw-shimmer").length ?? 0, admin: [...(side?.querySelectorAll("nav button") ?? [])].some((b) => b.textContent.trim() === "Admin") };
  });
  if (who === "user") await page.screenshot({ path: `${OUT}/stage1-boot.png` });
  ok(!/OPERATIONS|Signed in|\bUSER\b|\bADMIN\b|DEVELOPER/.test(boot.text) && boot.skeletons >= 3 && !boot.admin,
    `${who}, role not known yet: no placeholder role, skeleton slots for the role-gated groups and the account line`, `${boot.skeletons} skeletons; account line text: ${JSON.stringify(boot.text.split("\n").slice(-2))}`);
  release();
  // Both answers are now free to arrive; the shell drops its skeletons when both have (the rig under a full suite can take
  // more than a fixed pause). Wait for that, up to 10 s; the assertion below still says what was found.
  await page.waitForFunction(() => document.querySelector("[data-cw-sidebar]")?.querySelectorAll(".cw-shimmer").length === 0, null, { timeout: 10000 }).catch(() => {});
  await sleep(300);
  const after = await page.evaluate(() => {
    const side = document.querySelector("[data-cw-sidebar]");
    const rows = [...side.querySelectorAll("nav > div, nav > button")].map((el) => ({ text: el.textContent.trim().split("\n")[0], top: Math.round(el.getBoundingClientRect().top), h: Math.round(el.getBoundingClientRect().height) }));
    let gaps = 0; for (let i = 1; i < rows.length; i++) if (rows[i].top - (rows[i - 1].top + rows[i - 1].h) > 6) gaps += 1;
    return { skeletons: side.querySelectorAll(".cw-shimmer").length, admin: [...side.querySelectorAll("nav button")].some((b) => b.textContent.trim() === "Admin"), role: side.innerText.match(/\b(USER|ADMIN|DEVELOPER)\b/)?.[0] ?? null, gaps };
  });
  ok(after.skeletons === 0 && after.admin === (who === "admin") && after.role === who.toUpperCase() && after.gaps === 0,
    `${who}, role known: ${who === "admin" ? "Admin fills its slot" : "no Admin, and no gap where it would be"}; the account line says ${who.toUpperCase()}`, JSON.stringify(after));
  await ctx.close();
}

// ── 4. Contrast, measured on the rendered pages ─────────────────────────────────────────────────────────────────────
// Every main portal page: admin pages as the admin, developer and agent pages as the developer; plus the agent panel.
const PAGES = [
  ["admin", "/dashboard"], ["admin", "/aip"], ["admin", "/aip/EVRA"], ["admin", "/aip/service-status"], ["admin", "/admin/airports/deleted"],
  ["admin", "/admin/users"], ["admin", "/admin/permissions"], ["admin", "/admin/maintenance"], ["admin", "/admin/agent-sites"], 
  ["admin", "/admin/service-status"], ["dev", "/admin/debug"], ["admin", "/account/profile"],
  ["admin", "/help"], ["admin", "/help/new"], ["dev", "/developer/inbox"], ["dev", "/developer/saved-replies"], ["dev", "/developer/agent-access"],
  ["dev", "/agent"], ["dev", "/agent/history"], ["dev", "/agent/knowledge"], ["dev", "/agent/intake"], ["dev", "/agent/mailbox"], ["dev", "/agent/activity"],
  ["dev", "/agent/settings"], ["dev", "/dashboard#panel"],
];
const contrastReport = [];
for (const theme of ["light", "dark"]) for (const who of ["admin", "dev"]) {
  const ctx = await context(who);
  await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch { /* */ } }, theme);
  const page = await ctx.newPage();
  for (const [as, path] of PAGES) {
    if (as !== who) continue;
    await page.goto(`${BASE}${path.replace("#panel", "")}`, { waitUntil: "load" }); await sleep(2500);
    if (path.endsWith("#panel")) { await page.evaluate(() => window.dispatchEvent(new Event("cw-agent-open"))); await page.waitForSelector("[data-cw-agent-panel]", { timeout: 15000 }).catch(() => {}); await sleep(2000); }
    await page.screenshot({ path: `${OUT}/stage1-${theme}-${path.replace(/\W+/g, "_")}.png` });
    const bad = await page.evaluate(() => {
      const parse = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const n = m.map(Number); if (/^color\(srgb/.test(c)) return [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1]; return n; };
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const bgOf = (el) => { const layers = []; for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.backgroundImage !== "none" && !/gradient\(.*var|url/.test(s.backgroundImage)) return null; const c = parse(s.backgroundColor); if (c && (c[3] ?? 1) > 0) { layers.push(c); if ((c[3] ?? 1) >= 1) break; } } let base = [255, 255, 255]; if (layers.length && (layers[layers.length - 1][3] ?? 1) >= 1) base = layers.pop().slice(0, 3); for (const l of layers.reverse()) { const a = l[3]; base = base.map((v, i) => l[i] * a + v * (1 - a)); } return base; };
      const out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement; if (!el || seen.has(el) || !n.textContent.trim()) continue; seen.add(el);
        const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
        const s = getComputedStyle(el); if (s.visibility === "hidden" || Number(s.opacity) < 0.95) continue;
        if (el.closest("[disabled],[aria-disabled=true],.cw-shimmer,[aria-hidden=true]")) continue;
        const fg = parse(s.color); if (!fg) continue; const bg = bgOf(el); if (!bg) continue;
        // Fully transparent text is not seen: the PDF viewer's selectable text layer over the drawn page.
        if ((fg[3] ?? 1) === 0) continue;
        const a = fg[3] ?? 1; const fgc = fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
        const size = parseFloat(s.fontSize), bold = Number(s.fontWeight) >= 700; const min = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
        const r2 = ratio(fgc, bg); if (r2 < min) out.push({ text: n.textContent.trim().slice(0, 40), ratio: Math.round(r2 * 100) / 100, min, color: s.color, bg: `rgb(${bg.map(Math.round).join(", ")})` });
      }
      return out;
    });
    contrastReport.push({ theme, path, bad });
  }
  await ctx.close();
}
const totalBad = contrastReport.reduce((n, r) => n + r.bad.length, 0);
for (const r of contrastReport) if (r.bad.length) console.log(`      ${r.theme} ${r.path}: ${r.bad.length} below AA — ${r.bad.slice(0, 4).map((b) => `"${b.text}" ${b.ratio} (${b.color} on ${b.bg})`).join("; ")}`);
ok(totalBad === 0, `contrast measured on ${PAGES.length} views × 2 themes: every visible text at AA`, `${totalBad} below`);

// ── 5. The wall is untouched ─────────────────────────────────────────────────────────────────────────────────────────
{
  const look = async (device, choice) => {
    const ctx = await context("admin", { colorScheme: device });
    await ctx.addInitScript((c) => { try { localStorage.setItem("cw-theme", c); } catch { /* */ } }, choice);
    // The rig proxy forwards only the wall's API; its UI (opsboard-react/dist) is served here on the portal's origin — as
    // in production, so the portal's stored theme is there for the console to read and the display to ignore. The
    // account's saved choice wins over the device's (the portal's rule, and the console's since 2026-10-18), so the
    // account answers with the same choice.
    await ctx.route(/\/api\/user\/preferences/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preferences: { theme: choice } }) }));
    await ctx.route(/\/(digital-wall\/(?!api)|assets\/|fonts\/)/, async (route) => {
      const u = new URL(route.request().url());
      const file = u.pathname.startsWith("/digital-wall/") ? "index.html" : u.pathname.slice(1);
      try { await route.fulfill({ path: `opsboard-react/dist/${file}` }); } catch { await route.fulfill({ status: 404, body: "" }); }
    });
    const page = await ctx.newPage();
    const out = {};
    for (const path of ["/digital-wall/timeline/", "/digital-wall/console/flights"]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "load" }); await sleep(3000);
      out[path] = await page.evaluate(() => {
        const cssText = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join("\n"); } catch { return ""; } }).join("\n");
        const sample = [...document.querySelectorAll("body, body *")].slice(0, 400).map((e) => { const s = getComputedStyle(e); return `${s.color}|${s.backgroundColor}|${s.fontFamily}`; });
        return { dataTheme: document.documentElement.getAttribute("data-theme"), readsCw: /var\(--cw-/.test(cssText) || /--cw-[a-z]/.test(document.documentElement.getAttribute("style") ?? ""), sample: sample.join(";") };
      });
    }
    await ctx.close();
    return out;
  };
  const light = await look("light", "light");
  const dark = await look("dark", "dark");
  // The display is untouched; the console follows the portal (wall console Stage 1, 2026-10-18; rig/wall/console-theme-check.mjs
  // goes deeper).
  for (const path of Object.keys(light)) {
    if (path.includes("/console/")) {
      ok(dark[path].dataTheme === "dark" && dark[path].readsCw && light[path].dataTheme === "light", `wall console ${path}: follows the portal's theme (data-theme set, --cw-* tokens read)`, JSON.stringify({ dark: dark[path].dataTheme, light: light[path].dataTheme, readsCw: dark[path].readsCw }));
      ok(dark[path].sample !== light[path].sample, `wall console ${path}: different colours with the portal in Dark than in Light`);
      continue;
    }
    ok(dark[path].dataTheme === null && !dark[path].readsCw, `wall display ${path}: no data-theme, no --cw-* token read (portal set to Dark on a dark device)`, JSON.stringify({ dataTheme: dark[path].dataTheme, readsCw: dark[path].readsCw }));
    ok(dark[path].sample === light[path].sample, `wall display ${path}: the same colours and fonts with the portal in Dark as in Light`);
  }
}

// ── 6. The wall on a phone is the wall too (2026-10-27) ─────────────────────────────────────────────────────────────
// The Wall tab in /m frames the wall's own phone page (/digital-wall/timeline/?in=m, served by the rig proxy from a
// production-style build). Same rule as the display: no data-theme, no --cw-* token, the same pixels with the portal in
// Light and Dark. The rest of /m (the shell around it) follows the portal.
{
  const phone = async (device) => {
    const ctx = await context("user", { viewport: { width: 390, height: 844 }, colorScheme: device, isMobile: true, hasTouch: true });
    await ctx.addInitScript((c) => { try { localStorage.setItem("cw-theme", c); } catch { /* */ } }, device);
    await ctx.route(/\/api\/user\/preferences/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preferences: { theme: device } }) }));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/m/wall`, { waitUntil: "load" });
    const handle = await page.waitForSelector("iframe[title='Digital Wall']", { timeout: 20000 }).catch(() => null);
    const frame = handle ? await handle.contentFrame() : null;
    await frame?.waitForSelector("[data-mobile-wall]", { timeout: 30000 }).catch(() => {});
    await sleep(2500);
    const wall = frame ? await frame.evaluate(() => {
      const cssText = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join("\n"); } catch { return ""; } }).join("\n");
      const root = document.querySelector("[data-mobile-wall]");
      const inline = root ? [root, ...root.querySelectorAll("*")].map((e) => e.getAttribute("style") || "").join(";") : "";
      const sample = root ? [root, ...root.querySelectorAll("*")].slice(0, 400).map((e) => { const s = getComputedStyle(e); return `${s.color}|${s.backgroundColor}|${s.fontFamily}`; }) : [];
      return { present: !!root, dataTheme: document.documentElement.getAttribute("data-theme"), readsCw: /var\(--cw-/.test(cssText) || /--cw-[a-z]/.test(inline) || /--cw-[a-z]/.test(document.documentElement.getAttribute("style") ?? ""), sample: sample.join(";") };
    }) : { present: false };
    const shell = await page.evaluate(() => ({ dataTheme: document.documentElement.getAttribute("data-theme"), tabBg: getComputedStyle(document.querySelector("nav[aria-label='Sections']") || document.body).backgroundColor }));
    await page.screenshot({ path: `${OUT}/stage1-phone-wall-${device}.png` });
    await ctx.close();
    return { wall, shell };
  };
  const pl = await phone("light"), pd = await phone("dark");
  ok(pl.wall.present && pd.wall.present, "the phone wall renders behind the Wall tab (signed in, 390 × 844)");
  ok(pd.wall.dataTheme === null && !pd.wall.readsCw && pl.wall.dataTheme === null && !pl.wall.readsCw, "wall on a phone: no data-theme, no --cw-* token read (portal set to Dark on a dark device, and Light)", JSON.stringify({ dark: [pd.wall.dataTheme, pd.wall.readsCw], light: [pl.wall.dataTheme, pl.wall.readsCw] }));
  ok(pd.wall.sample && pd.wall.sample === pl.wall.sample, "wall on a phone: the same colours and fonts with the portal in Dark as in Light");
  ok(pd.shell.dataTheme === "dark" && pl.shell.dataTheme === "light" && pd.shell.tabBg !== pl.shell.tabBg, "…while the /m shell around it follows the portal (its tab bar changes with the theme)", JSON.stringify({ dark: pd.shell, light: pl.shell }));
}

await browser.close();
console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"} · ${OUT}/stage1-*.png`);
process.exit(failures ? 1 : 0);
