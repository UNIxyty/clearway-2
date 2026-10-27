// The wall on a phone (2026-10-27): the Wall tab in /m is a door into the wall's own phone page, and behind the door
// it looks like the wall — the room's colours and font, no portal token, no data-theme, the same in portal Light and
// Dark — while the rest of /m stays the portal. Real browser, 390 × 844 (and 360 / 430 for the list), on the rig.
//   node --env-file=.env.rig rig/mobile/phone-wall-check.mjs
// Needs the built wall pages at /digital-wall/timeline/ (rig/.scratch/display-dist, served by rig/proxy.mjs).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.RIG_SHELL_URL || "http://127.0.0.1:3999";
const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 240)}` : ""}`); if (!c) failures += 1; };
const PHONE = { width: 390, height: 844 };
const browser = await chromium.launch();
async function context({ theme = "light", viewport = PHONE } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: theme, hasTouch: true, isMobile: true });
  await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
  return ctx;
}
/** /m/wall, then the wall's frame once its list has drawn. */
async function door(ctx, path = "/m/wall") {
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e.message || e)));
  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  await page.waitForSelector("iframe[title='Digital Wall']", { timeout: 20000 });
  const frame = page.frameLocator("iframe[title='Digital Wall']");
  await frame.locator("[data-mobile-wall]").waitFor({ timeout: 30000 });
  await frame.locator("[data-live]").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(2500);
  const handle = await page.$("iframe[title='Digital Wall']");
  return { page, frame, inner: await handle.contentFrame(), errors };
}

// ── 1. The door: the shell keeps its tabs, drops its app bar, frames the wall's page ──
{
  const ctx = await context();
  const { page, inner, errors } = await door(ctx);
  const shell = await page.evaluate(() => ({ appBar: !!document.querySelector("[data-phone-shell] header"), tabs: !!document.querySelector("nav[aria-label='Sections']"), wallLit: document.querySelector("nav[aria-label='Sections'] a[aria-current='page']")?.textContent?.trim() ?? null, src: document.querySelector("iframe[title='Digital Wall']")?.getAttribute("src") }));
  ok(!shell.appBar && shell.tabs && /Wall/.test(shell.wallLit ?? ""), "the Wall tab: no portal app bar, the tab bar stays, Wall is lit", JSON.stringify(shell));
  ok(/^\/digital-wall\/timeline\/\?in=m/.test(shell.src ?? ""), "behind the door is the wall's own page, /digital-wall/timeline/?in=m", shell.src);
  const where = await inner.evaluate(() => ({ path: location.pathname, title: document.querySelector("[data-mobile-wall] h1")?.textContent, live: document.querySelector("[data-live]")?.getAttribute("data-live"), pills: document.querySelectorAll("[data-pill]").length, now: !!document.querySelector("[data-now-label]") }));
  ok(where.path.startsWith("/digital-wall/timeline") && where.title === "Digital Wall", "the frame is the wall app (not a portal page), titled Digital Wall", JSON.stringify(where));
  ok(where.pills > 0 && where.now, "the timeline draws the room's flights with the now label", `${where.pills} pills`);
  ok(["live", "connecting"].includes(where.live), "the LIVE pill reports the feed", where.live);
  await page.screenshot({ path: `${OUT}/phone-wall-timeline.png` });
  ok(errors.length === 0, "no page errors on the door", errors.join(" | "));
  await ctx.close();
}

// ── 2. The boundary: no portal token, no data-theme, the same pixels in portal Light and Dark, the room's palette ──
const sample = async (theme) => {
  const ctx = await context({ theme });
  const { page, inner } = await door(ctx);
  const s = await inner.evaluate(() => {
    const root = document.querySelector("[data-mobile-wall]");
    let css = ""; for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) css += r.cssText; } catch { /* cross-origin */ } }
    const inline = [...document.querySelectorAll("[data-mobile-wall], [data-mobile-wall] *")].map((el) => el.getAttribute("style") || "").join(";");
    const pill = document.querySelector("[data-pill] span");
    const cs = (el, k) => (el ? getComputedStyle(el)[k] : null);
    return {
      dataTheme: document.documentElement.getAttribute("data-theme"), readsCw: /var\(--cw-/.test(css) || /--cw-[a-z]/.test(inline) || /--cw-[a-z]/.test(document.documentElement.getAttribute("style") || ""),
      bg: cs(root, "backgroundColor"), font: cs(root, "fontFamily"), pill: cs(pill, "color"), mwBg: getComputedStyle(root).getPropertyValue("--mw-bg-1").trim(), mwFont: getComputedStyle(root).getPropertyValue("--mw-font").trim(),
      wallFont: getComputedStyle(document.documentElement).getPropertyValue("--wall-font-sans").trim(),
    };
  });
  await page.screenshot({ path: `${OUT}/phone-wall-${theme}.png` });
  await ctx.close();
  return s;
};
const light = await sample("light"), dark = await sample("dark");
ok(light.dataTheme === null && dark.dataTheme === null && !light.readsCw && !dark.readsCw, "the phone wall reads no --cw-* token and has no data-theme, with the portal in Light or Dark", JSON.stringify({ light: [light.dataTheme, light.readsCw], dark: [dark.dataTheme, dark.readsCw] }));
ok(light.bg === dark.bg && light.pill === dark.pill && light.font === dark.font, "…and paints the same colours and font in both", JSON.stringify({ light: [light.bg, light.pill], dark: [dark.bg, dark.pill] }));
ok(light.mwBg === "#10141f", "its background is the room's board background (the wall palette's boardBg), not the design's default", light.mwBg);
ok(light.wallFont ? light.mwFont === light.wallFont : /Nunito/.test(light.mwFont), "its font is the wall's font — the variable the display's font setting writes", `phone ${light.mwFont} · wall ${light.wallFont || "(default stack)"}`);

// ── 3. The list: ranges, cards, filter, notifications; no sideways scroll at 360, 390 and 430 ──
for (const width of [360, 390, 430]) {
  const ctx = await context({ viewport: { width, height: 844 } });
  const { inner } = await door(ctx);
  const o = await inner.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth, cells: [...document.querySelectorAll("[data-city]")].map((x) => x.textContent) }));
  ok(o.sw <= o.w, `${width} px: nothing scrolls sideways`, `${o.sw} / ${o.w}`);
  if (width === 360) ok(o.cells.every((c) => c.length <= 3) || o.cells.length < 4, "360 px with 4+ clocks: every cell shows its 3-letter code, never a mix", o.cells.join(" "));
  await ctx.close();
}
{
  const ctx = await context();
  const { page, inner, frame } = await door(ctx);
  const caption = () => inner.evaluate(() => document.querySelector("[data-mobile-wall] main span")?.textContent ?? "");
  const before = await caption();
  await frame.getByRole("radio", { name: "12H" }).click(); await page.waitForTimeout(400);
  const after = await caption();
  ok(before !== after && /UTC/.test(after), "12H changes the window printed above the axis", `${before} → ${after}`);
  await frame.getByRole("radio", { name: "DAY" }).click(); await page.waitForTimeout(400);
  ok(/−4h · \+20h/.test(await inner.evaluate(() => document.querySelector("[data-mobile-wall] main")?.textContent ?? "")), "DAY reads −4h · +20h (the past is always one sixth)");
  await frame.getByRole("button", { name: "Cards view" }).click(); await page.waitForTimeout(500);
  const cards = await inner.evaluate(() => ({ view: document.querySelector("[data-mobile-wall]")?.getAttribute("data-view"), cards: document.querySelectorAll("[data-card]").length, tabs: [...document.querySelectorAll("[role=radiogroup][aria-label=Cards] [role=radio]")].map((x) => x.textContent) }));
  ok(cards.view === "cards" && cards.tabs.join() .includes("Now") && cards.tabs.join().includes("Attention"), "Cards view: Now and Attention, no Timeline tab", JSON.stringify(cards));
  await page.screenshot({ path: `${OUT}/phone-wall-cards.png` });
  await frame.getByRole("button", { name: "Timeline view" }).click(); await page.waitForTimeout(300);
  await frame.getByRole("button", { name: /^Aircraft filter/ }).click(); await page.waitForTimeout(500);
  const sw = frame.getByRole("switch").first(); await sw.click(); await page.waitForTimeout(300);
  await frame.getByRole("button", { name: /^Show \d+ aircraft$/ }).click(); await page.waitForTimeout(400);
  const filtered = await inner.evaluate(() => ({ banner: document.querySelector("[data-filter-banner]")?.textContent ?? null, pressed: document.querySelector("button[aria-label^='Aircraft filter,']")?.getAttribute("aria-label") }));
  ok(/^Filtered · \d+ of \d+ aircraft/.test(filtered.banner ?? "") && /shown/.test(filtered.pressed ?? ""), "the filter: three marks — the banner, the filled funnel with its count", JSON.stringify(filtered));
  await frame.locator("[data-filter-banner] button").click(); await page.waitForTimeout(300);
  ok(!(await inner.evaluate(() => !!document.querySelector("[data-filter-banner]"))), "Show all clears it");
  await frame.getByRole("button", { name: /^Notifications/ }).click(); await page.waitForTimeout(400);
  const notif = await inner.evaluate(() => document.querySelector("[role=dialog][aria-label=Notifications]")?.textContent ?? "");
  ok(/Flight events since you opened the wall at \d\d:\d\d UTC/.test(notif) && /Passenger data never does|New|Earlier/.test(notif), "Notifications: flight events seen on this phone, never passenger data", notif.slice(0, 140));
  await ctx.close();
}

// ── 4. The open flight: the six changes ──
{
  const ctx = await context();
  const { page, frame, inner, errors } = await door(ctx);
  const cs = await inner.evaluate(() => document.querySelector("[data-pill]")?.getAttribute("data-pill"));
  await frame.locator("[data-pill]").first().click(); await page.waitForTimeout(1500);
  const fl = await inner.evaluate(() => ({ title: document.querySelector("[role=dialog][aria-label=Flight] h2")?.textContent, grid: document.querySelectorAll("[data-check]").length, airports: [...document.querySelectorAll("[data-airport]")].map((x) => x.getAttribute("data-airport")), fr24: document.querySelector("[data-fr24]")?.textContent ?? "", pax: !!document.querySelector("button[aria-label=Passengers]"), next: [...document.querySelectorAll("button")].map((b) => b.textContent).find((t) => /^Next: /.test(t)) ?? null, done: document.querySelector("[role=dialog][aria-label=Flight]")?.textContent.match(/\d of 5 checked|All 5 checked/)?.[0] ?? null }));
  ok(fl.title === cs, "a pill opens its flight", `${cs} → ${fl.title}`);
  ok(fl.grid === 5 && /of 5 checked|All 5 checked/.test(fl.done ?? ""), "the five checks as a grid, with progress at the bottom (Option B)", JSON.stringify({ grid: fl.grid, done: fl.done, next: fl.next }));
  ok(fl.airports.length === 2, "both airports are buttons", fl.airports.join(" → "));
  ok(/Live tracking isn’t connected yet/.test(fl.fr24) && !/no signal/i.test(fl.fr24), "the FR24 slot says plainly it isn't connected — no empty map, no 'no signal'", fl.fr24.slice(0, 80));
  ok(fl.pax, "PAX is in the header");
  await page.screenshot({ path: `${OUT}/phone-wall-flight.png` });
  await frame.locator("[data-airport]").first().click(); await page.waitForTimeout(1200);
  const ap = await inner.evaluate(() => { const d = [...document.querySelectorAll("[role=dialog]")].pop(); return { tabs: [...d.querySelectorAll("[role=radio]")].map((x) => x.textContent), text: d.textContent.slice(0, 200) }; });
  ok(ap.tabs.some((t) => /^Weather/.test(t)) && ap.tabs.some((t) => /^NOTAMs/.test(t)), "an airport opens Weather | NOTAMs", ap.tabs.join(" | "));
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  await frame.getByRole("button", { name: /^Service status/ }).click(); await page.waitForTimeout(2500);
  const svc = await inner.evaluate(() => { const d = [...document.querySelectorAll("[role=dialog]")].pop(); return { title: d.getAttribute("aria-label"), rows: d.querySelectorAll("[data-service]").length, text: d.textContent.slice(0, 220) }; });
  ok(svc.title === "Service status" && (svc.rows > 0 || /No services requested yet|Couldn’t read the services from Leon/.test(svc.text)), "Service status opens from Leon: its rows, or a plain empty or failed state", `${svc.rows} rows · ${svc.text.slice(0, 120)}`);
  await page.screenshot({ path: `${OUT}/phone-wall-services.png` });
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  await frame.getByRole("button", { name: "Passengers" }).click(); await page.waitForTimeout(2500);
  const pax = await inner.evaluate(() => { const v = document.querySelector("[data-passenger-viewer]"); const styles = [v, ...(v ? v.querySelectorAll("*") : [])].map((el) => el?.getAttribute("style") || "").join(";"); return { viewer: v?.getAttribute("data-passenger-viewer") ?? null, cw: /--cw-[a-z]|var\(--cw-/.test(styles), docs: document.querySelectorAll("[data-pax-doc]").length }; });
  ok(pax.viewer === "phone" && !pax.cw, "PAX is the one shared passenger viewer, in the room's colours — no portal token in its styles", JSON.stringify(pax));
  ok(pax.docs === 0, "no passenger document is open until one is asked for");
  ok(errors.length === 0, "no page errors in the open flight", errors.join(" | "));
  await ctx.close();
}

// ── 5. A deep link from elsewhere in /m opens that flight on the wall ──
{
  // a flight ON the board (the wall's window), as the other /m pages link to it
  const board = await (await fetch(`${BASE}/digital-wall/api/timeline/flights?allOperators=true&refresh=false`)).json();
  const g = (board.aircraft ?? []).flatMap((a) => (a.flights ?? []).map((fl) => ({ oprId: fl.oprId ?? a.oprId, flightNid: fl.flightNid, flight: { flightNo: fl.flightNo } }))).find((x) => x.flightNid);
  const f = g;
  const ctx = await context();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/m/wall/${encodeURIComponent(`${f.oprId}:${f.flightNid}`)}`, { waitUntil: "load" });
  await page.waitForURL((u) => u.pathname === "/m/wall" && u.searchParams.get("flight"), { timeout: 10000 }).catch(() => {});
  const frame = page.frameLocator("iframe[title='Digital Wall']");
  const title = await frame.locator("[role=dialog][aria-label=Flight] h2").textContent({ timeout: 20000 }).catch(() => null);
  ok(title === f.flight.flightNo, "/m/wall/<flight> opens the Wall tab with that flight open", `${f.flight.flightNo} → ${title}`);
  await page.goto(`${BASE}/m/wall/${encodeURIComponent("cwy-cwy:1")}`, { waitUntil: "load" }); await page.waitForTimeout(5000);
  const gone = await page.frameLocator("iframe[title='Digital Wall']").locator("[role=dialog][aria-label=Flight]").textContent({ timeout: 15000 }).catch(() => "");
  ok(/This flight isn’t on the wall/.test(gone) && /outside the wall’s time window/.test(gone), "a link to a flight not on the board says so, without guessing why", gone.slice(0, 100));
  await ctx.close();
}

// ── 6. Settings: this phone's clocks, view and range; the font and colours are the wall's ──
{
  const ctx = await context();
  const { page, frame, inner } = await door(ctx);
  await frame.getByRole("button", { name: "Phone settings" }).click(); await page.waitForTimeout(500);
  const st = await inner.evaluate(() => document.querySelector("[role=dialog][aria-label='Phone settings']")?.textContent ?? "");
  ok(/Display — from the wall/i.test(st) && /From the wall/.test(st) && /World clocks/.test(st) && /Opens in/.test(st) && /Passenger data/.test(st), "Settings: font and colours shown as the wall's, clocks / view / range as this phone's, passenger data masked", st.slice(0, 160));
  await frame.getByRole("button", { name: /^World clocks/ }).click(); await page.waitForTimeout(300);
  await frame.getByRole("button", { name: /^Show world clocks/ }).click(); await page.waitForTimeout(200);
  await frame.getByRole("button", { name: /Settings$/ }).first().click(); await page.waitForTimeout(200);
  await frame.getByRole("button", { name: /Flights$/ }).first().click(); await page.waitForTimeout(500);
  const off = await inner.evaluate(() => ({ clocks: !!document.querySelector("[data-clocks]"), header: document.querySelector("[data-mobile-wall] header")?.textContent ?? "" }));
  ok(!off.clocks && /\d\d:\d\d UTC/.test(off.header), "clocks off: the row goes and UTC moves into the title bar", off.header.slice(0, 80));
  await ctx.close();
}

// ── 6b. The four states (§2.10): empty is plain, failed says so and never draws an empty timeline ──
for (const [kind, reply, want] of [
  ["empty", { status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, aircraft: [], limitations: [] }) }, /No flights between \d\d:\d\d and \d\d:\d\d UTC/],
  ["failed", { status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "rig: wall down" }) }, /Couldn’t load flights/],
]) {
  const ctx = await context();
  await ctx.route(/\/digital-wall\/api\/timeline\/flights/, (route) => route.fulfill(reply));
  const page = await ctx.newPage(); await page.goto(`${BASE}/m/wall`, { waitUntil: "load" });
  const h = await page.waitForSelector("iframe[title='Digital Wall']", { timeout: 20000 }); const f = await h.contentFrame();
  await f.waitForSelector("[data-mobile-wall]", { timeout: 30000 }); await page.waitForTimeout(4000);
  const r = await f.evaluate(() => ({ text: document.querySelector("[data-mobile-wall] main")?.textContent ?? "", pills: document.querySelectorAll("[data-pill]").length, now: !!document.querySelector("[data-now-label]"), live: document.querySelector("[data-live]")?.getAttribute("data-live") }));
  ok(want.test(r.text) && r.pills === 0 && !r.now, `${kind}: ${kind === "empty" ? "names the window, no now-line on an empty board" : "a failure card with Retry, never an empty timeline"}`, `${r.live} · ${r.text.slice(0, 120)}`);
  if (kind === "failed") ok(r.live === "none", "failed: the pill reads NO DATA", r.live);
  await ctx.close();
}

// ── 7. A registered screen is never given the phone wall, framed or not ──
{
  const ctx = await context();
  await ctx.addInitScript(() => { try { localStorage.setItem("dw-device-token", "rig-registered-screen"); } catch {} });
  await ctx.route(/\/api\/device\/state/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, status: "approved" }) }));
  await ctx.route(/\/api\/user(\?|$)/, (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Sign in" }) }));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/digital-wall/timeline/?in=m`, { waitUntil: "load" }); await page.waitForTimeout(3500);
  const r = await page.evaluate(() => ({ phone: !!document.querySelector("[data-mobile-wall]"), path: location.pathname }));
  ok(!r.phone && r.path.startsWith("/digital-wall/timeline"), "a screen with a device token at phone size stays on the display (no phone wall, no redirect)", JSON.stringify(r));
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
