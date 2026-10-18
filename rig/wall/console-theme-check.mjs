// Wall console, Stage 1 (2026-10-18): the console follows the portal's theme; the wall display does not.
//   A. The theme: light, dark and "match this device" each reach <html data-theme> and the shell's colours; all ten
//      pages render in both, with no page error, and are photographed (rig/.scratch/shots/console-theme-*.png).
//   B. The first second: with the session check held, the top bar, the nav, the page title and the (disabled) main
//      button are on screen at once; the user badge holds its space as a skeleton until the person arrives.
//   C. The 120 / 400 ms rule: data in under 120 ms shows no skeleton; data at 200 ms shows one from ~120 ms that
//      stays until ~520 ms; each region swaps once.
//   D. The boundary: the display at /timeline sets no data-theme and defines no --cw-* token, and with the portal in
//      dark it is pixel-identical to the portal in light (the clock frozen, animations paused). The wall preview on
//      the console's Settings page is pixel-identical in both themes too.
// Needs the auth-on rig wall (:5198, rig/wall/access-check.mjs header) and the built console served against it:
//   (cd opsboard-react && npx vite build && VITE_API_PROXY=http://127.0.0.1:5198 npx vite preview --port 4173 &)
//   node --env-file=.env.rig rig/wall/console-theme-check.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.RIG_CONSOLE_URL || "http://127.0.0.1:4173";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 200)}` : ""}`); if (!c) failures += 1; };
const PAGES = ["flights", "notam-check", "operators", "aircraft", "limitations", "important", "caa", "webhooks", "reports", "settings"];
const TOKENS = { light: { bgPage: "rgb(251, 251, 252)", bgSurface: "rgb(255, 255, 255)" }, dark: { bgPage: "rgb(13, 16, 21)", bgSurface: "rgb(20, 24, 30)" } };

const token = async (email) => (await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password: "rig-access-check-only" }) })).json()).access_token;
const browser = await chromium.launch();
const tok = await token("rig-access-admin@rig.invalid");
async function context({ theme = "light", scheme = "light", width = 1440 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: scheme });
  await ctx.addCookies([{ name: "sb-rig-auth-token", value: encodeURIComponent(JSON.stringify([tok])), url: BASE }]);
  await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch { /* private mode */ } }, theme);
  return ctx;
}
const errorsOf = (page) => { const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 160))); return errs; };
const shellBg = (page) => page.evaluate(() => getComputedStyle(document.querySelector(".cw-console")).backgroundColor);
const htmlTheme = (page) => page.evaluate(() => document.documentElement.getAttribute("data-theme"));

// ── A. the theme, on every page ──
for (const theme of ["light", "dark"]) {
  const ctx = await context({ theme });
  const page = await ctx.newPage(); const errs = errorsOf(page);
  for (const p of PAGES) {
    await page.goto(`${BASE}/console/${p}`, { waitUntil: "load" }); await page.waitForTimeout(2200);
    const [dt, bg, title] = [await htmlTheme(page), await shellBg(page), await page.locator("h2").first().textContent().catch(() => "")];
    ok(dt === theme && bg === TOKENS[theme].bgPage, `${theme} · ${p}: data-theme and the page background follow the choice`, `${dt} · ${bg} · ${title}`);
    await page.screenshot({ path: `${OUT}/console-theme-${p}-${theme}.png` });
  }
  ok(errs.length === 0, `${theme}: no page error on the ten pages`, errs.join(" | "));
  await ctx.close();
}
{ // match this device
  const ctx = await context({ theme: "system", scheme: "dark" }); const page = await ctx.newPage();
  await page.goto(`${BASE}/console/flights`, { waitUntil: "load" }); await page.waitForTimeout(1500);
  ok(await htmlTheme(page) === "dark" && await shellBg(page) === TOKENS.dark.bgPage, "match this device: a dark device gives a dark console");
  await page.emulateMedia({ colorScheme: "light" }); await page.waitForTimeout(300);
  ok(await htmlTheme(page) === "light" && await shellBg(page) === TOKENS.light.bgPage, "…and follows the device when it changes, with no reload");
  await ctx.close();
}

// ── B. the first second ──
{
  const ctx = await context({ theme: "light" }); const page = await ctx.newPage();
  await page.route("**/api/user", async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
  await page.goto(`${BASE}/console/operators`, { waitUntil: "commit" });
  await page.waitForSelector(".cw-console", { timeout: 5000 }); await page.waitForTimeout(250);
  const navCount = await page.locator(".cw-rail button:has-text('Flights'), .cw-rail button:has-text('Settings')").count();
  const title = await page.locator("h2").first().textContent().catch(() => "");
  const mainDisabled = await page.getByRole("button", { name: "Add operator" }).first().isDisabled().catch(() => null);
  const badgeSkel = await page.evaluate(() => Boolean(document.querySelector(".cw-rail .cw-skel, .cw-rail .cw-skel-still")));
  const bootSkel = await page.locator("[data-boot='true']").count();
  ok(navCount === 2 && title === "Operators" && mainDisabled === true && badgeSkel && bootSkel === 1, "first second: top bar, nav, page title and a disabled main button are on screen; the user badge holds its space", `nav ${navCount} · title ${title} · button disabled ${mainDisabled} · badge skeleton ${badgeSkel} · boot ${bootSkel}`);
  await page.screenshot({ path: `${OUT}/console-theme-boot.png` });
  // rule 02: role slots hold their space, so the nav never shifts when the person arrives
  const tops = () => page.evaluate(() => ({ settings: Math.round(document.querySelector(".cw-rail button[title='Settings']")?.getBoundingClientRect().top ?? -1), card: Math.round(document.querySelector("[data-wall-display-card]")?.getBoundingClientRect().top ?? -1), collapse: Math.round(document.querySelector(".cw-rail button[title='Collapse sidebar']")?.getBoundingClientRect().top ?? -1) }));
  const atBoot = await tops();
  await page.waitForTimeout(2200);
  ok(await page.locator(".cw-rail").getByText("rig-access-admin").count() === 1 && (await page.locator("[data-boot='true']").count()) === 0, "…then the person arrives and the page takes over");
  const after = await tops();
  ok(JSON.stringify(atBoot) === JSON.stringify(after), "…and nothing in the nav moved (the badge held its space)", `boot ${JSON.stringify(atBoot)} · after ${JSON.stringify(after)}`);
  await ctx.close();
}

// ── C. 120 / 400 ms ──
async function sampleSkeleton(page, until, step = 20) {
  // page-level skeletons only (not the boot one): when they are on screen, in ms since navigation
  const t0 = Date.now(); const seen = [];
  while (Date.now() - t0 < until) {
    const on = await page.evaluate(() => Array.from(document.querySelectorAll("[role='status'][aria-busy='true']")).some((el) => !el.closest("[data-boot='true']")));
    seen.push([Date.now() - t0, on]);
    await page.waitForTimeout(step);
  }
  return seen;
}
for (const [delay, want] of [[0, "none"], [200, "hold"]]) {
  const ctx = await context({ theme: "light" }); const page = await ctx.newPage();
  await page.route("**/api/operators**", async (route) => { if (delay) await new Promise((r) => setTimeout(r, delay)); await route.continue(); });
  await page.goto(`${BASE}/console/operators`, { waitUntil: "commit" });
  await page.waitForFunction(() => !document.querySelector("[data-boot='true']") && document.querySelector(".cw-console"), null, { timeout: 8000 });
  const seen = await sampleSkeleton(page, 900);
  const onAt = seen.filter(([, on]) => on).map(([ms]) => ms);
  const first = onAt[0] ?? null, last = onAt.length ? onAt[onAt.length - 1] : null;
  if (want === "none") ok(onAt.length === 0, "data in under 120 ms: no skeleton flashes", `seen at ${onAt.join(",") || "never"}`);
  else ok(first !== null && first >= 60 && first <= 260 && last >= 420 && last <= 760, "data at 200 ms: the skeleton shows from ~120 ms and holds until ~520 ms, then swaps once", `first ${first} · last ${last} ms`);
  await ctx.close();
}

// ── D. the boundary ──
async function displayShot(theme) {
  const ctx = await context({ theme }); const page = await ctx.newPage();
  await page.clock.install({ time: new Date("2026-10-18T14:00:00Z") });
  await page.goto(`${BASE}/timeline`, { waitUntil: "load" }); await page.waitForTimeout(3500);
  await page.evaluate(() => document.getAnimations().forEach((a) => { a.pause(); try { a.currentTime = 0; } catch { /* finished */ } }));
  const facts = await page.evaluate(() => ({ dt: document.documentElement.getAttribute("data-theme"), cw: getComputedStyle(document.documentElement).getPropertyValue("--cw-bg-page"), style: document.documentElement.style.colorScheme }));
  const png = await page.screenshot({ path: `${OUT}/console-theme-display-${theme}.png` });
  await ctx.close();
  return { facts, png };
}
const dl = await displayShot("light"), dd = await displayShot("dark");
ok(dl.facts.dt === null && dd.facts.dt === null && dl.facts.cw === "" && dd.facts.cw === "" && !dd.facts.style, "the display sets no data-theme and defines no --cw-* token, in either portal theme", JSON.stringify(dd.facts));
ok(dl.png.equals(dd.png), "the display is pixel-identical with the portal in light and in dark", `${dl.png.length} vs ${dd.png.length} bytes`);
async function previewShot(theme) {
  const ctx = await context({ theme }); const page = await ctx.newPage();
  await page.goto(`${BASE}/console/settings`, { waitUntil: "load" }); await page.waitForTimeout(2500);
  const el = page.locator("[data-wall-display='true']").first();
  // the inside of the frame: its rounded corners show the page behind, which does change with the theme
  const box = await el.boundingBox();
  const png = await page.screenshot({ path: `${OUT}/console-theme-preview-${theme}.png`, clip: { x: box.x + 14, y: box.y + 14, width: box.width - 28, height: box.height - 28 } });
  const around = await shellBg(page);
  await ctx.close();
  return { png, around };
}
const pl = await previewShot("light"), pd = await previewShot("dark");
ok(pl.around !== pd.around && pl.png.equals(pd.png), "Settings: the wall preview inside the dashed line is pixel-identical in both themes while the page around it changes", `page ${pl.around} / ${pd.around} · ${pl.png.length} vs ${pd.png.length} bytes`);

await browser.close();
console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"} · screenshots in ${OUT}/console-theme-*.png`);
process.exit(failures ? 1 : 0);
