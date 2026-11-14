// The client screens (Stage 5, 2026-10-25; Client View v2, 2026-11-10; the v3 look, 2026-11-13): Admin › Clients, the
// ask-for-access page and the client's own world on a DESK — the shell (sidebar 248, header 56), Timeline, Flights, the
// Operators & aircraft panel, the flight panel, Account, Settings, the start page, the status screens, the sidebar's
// "Help & support" row and its collapse to a 72 px rail — at 1280, 1440
// and 1920, light and dark. On every page and panel: no two text boxes overlap (rig/lib/overlap.mjs), every button
// class is one size, a hover shows, the columns line up, the logo is dark on light and white on dark, the page scrolls
// to its end, and there is no horizontal page scroll. A client on a PHONE (390) is sent to the phone app
// (/digital-wall/phone/) from Timeline, Flights, Account and the start page before the desk is drawn; Settings stays
// usable on a phone with a link back; the status screens at 390 are the v3 phone status layout. Invented names only.
// On the sign-in rig: a client account is made with the service key, left "requested", then approved THROUGH THE ADMIN
// PAGE (scope by registration, a switch toggled, the passenger level set), looked at as the client, changed, and removed
// by typing the company — the row stays, emptied. Screenshots in rig/.scratch/shots/client-*.png.
// Timeline, Flights and Settings are drawn INSIDE a frame (iframe[data-client-frame] → /digital-wall/timeline/?in=client,
// the wall app's client surface, same origin): everything in them is read through page.frameLocator.
//   node --env-file=.env.rig rig/client-ui-check.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import { settled } from "./lib/settle.mjs";
import { textOverlaps, clippedText } from "./lib/overlap.mjs";
import { ACTIVE_SWITCHES, RETIRED_SWITCH_KEYS } from "../lib/clients/switches.mjs";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const B = (process.env.RIG_SIGNIN_BASE || "http://127.0.0.1:3989"), OUT = "rig/.scratch/shots"; fs.mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 170)}` : ""}`); if (!c) failures += 1; };
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const svc = (path, init = {}) => fetch(`${SB}${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PASSWORD = "rig-access-check-only";
const grant = async (email) => (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) })).json();
const cookie = (s) => ({ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`, url: B });
const cookieHeader = (s) => `${cookie(s).name}=${cookie(s).value}`;
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
// A phone screenshot is the screen as the phone shows it, and a second one scrolled to the end (2026-11-09: a full-page
// capture drew a sticky bar across the middle of the page). A desk one is the window, or the whole page when asked.
const PHONE = (w) => w < 700;
const shot = async (page, file, width, { whole = false } = {}) => {
  if (!PHONE(width)) { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(120); await page.screenshot({ path: file, fullPage: whole }); return; }   // from the top: the shell stays put while the page scrolls, and a whole-page shot of a scrolled page draws it over the title
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: file });
  const more = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 40);
  if (more) { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(150); await page.screenshot({ path: file.replace(/\.png$/, "-end.png") }); await page.evaluate(() => window.scrollTo(0, 0)); }
};
const viewportOf = (width) => ({ width, height: width === 390 ? 844 : width === 360 ? 780 : 900 });
// the frame: its locators (frameLocator) and its Frame (for evaluate)
const FRAME = "iframe[data-client-frame]";
const frameOf = (page) => page.frameLocator(FRAME);
const frameDoc = (page) => page.frames().find((f) => /\/digital-wall\/timeline(\/|\?|$)/.test(f.url())) ?? null;
const openClient = async (page, path, width) => {
  await page.goto(`${B}${path}`, { waitUntil: "load" });
  await page.waitForSelector("[data-client-shell]", { timeout: 20000 });
  await frameOf(page).locator(`[data-client-surface="${PHONE(width) ? "phone" : "desk"}"]`).waitFor({ timeout: 30000 });
  // the frame has read the fleet once the first lane, or an empty state, is drawn
  await frameOf(page).locator("[data-board] [data-fid], [data-flight-row], [data-empty]").first().waitFor({ timeout: 30000 }).catch(() => {});
  await settled(page);
};
const frameNoOverflow = (page) => frameDoc(page)?.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1) ?? false;
const COMPANY = "Rig Air Services"; // invented
const EMAIL = "rig-client-ui@rig.invalid";
const MENU = ["Timeline", "Flights", "Account", "Settings"];   // the client menu, in the sidebar's order
// ── the v3 look's own checks (2026-11-13) ──
const DESK = [1280, 1440, 1920];
const themed = (t) => { try { localStorage.setItem("cw-theme", t); } catch {} };
const lum = (c) => { const m = String(c).match(/[\d.]+/g) || [0, 0, 0]; return (Number(m[0]) + Number(m[1]) + Number(m[2])) / 3; };
const said = (list) => list.map((o) => `"${o.a}" × "${o.b}" ${o.x}×${o.y}px`).join(" · ");
// every button of one class is one size: the classes whose drawn members differ in height
const unevenButtons = (target, classes) => target.evaluate((list) => list.map((c) => { const hs = [...new Set([...document.querySelectorAll(c)].map((e) => Math.round(e.getBoundingClientRect().height)).filter((h) => h > 0))]; return hs.length > 1 ? `${c} ${hs.join("/")}px` : ""; }).filter(Boolean), classes);
// a hover shows: the background, border, text colour, shadow or underline changes under the pointer
const lookOf = (loc) => loc.evaluate((e) => { const c = getComputedStyle(e); return [c.backgroundColor, c.borderTopColor, c.color, c.boxShadow, c.textDecorationLine].join("|"); });
const hoverShows = async (page, loc) => { await page.mouse.move(1, 1); await page.waitForTimeout(220); const a = await lookOf(loc); await loc.hover({ timeout: 8000 }); await page.waitForTimeout(280); const b = await lookOf(loc); await page.mouse.move(1, 1); return a !== b; };
/** The names, of the pairs [name, locator] that are drawn, whose hover changes nothing. */
const noHover = async (page, pairs) => { const out = []; for (const [name, loc] of pairs) { if (await loc.count() === 0) continue; if (!(await hoverShows(page, loc.first()).catch(() => false))) out.push(name); } return out; };
// the page scrolls: nothing locks the document, and scrolled to the end the last piece (the last match of `sel`) is in view
const scrollsToEnd = (target, sel) => target.evaluate(async (q) => {
  const de = document.documentElement; const free = (e) => !/hidden|clip/.test(getComputedStyle(e).overflowY);
  window.scrollTo(0, de.scrollHeight); await new Promise((r) => setTimeout(r, 200));
  const all = [...document.querySelectorAll(q)]; const last = all[all.length - 1]; const b = last ? last.getBoundingClientRect().bottom : null;
  const out = { free: free(de) && free(document.body), tall: de.scrollHeight > window.innerHeight + 1, y: Math.round(window.scrollY), lastBottom: b === null ? null : Math.round(b), h: window.innerHeight };
  window.scrollTo(0, 0); return out;
}, sel);
const scrolled = (s) => Boolean(s) && s.free && (!s.tall || s.y > 0) && s.lastBottom !== null && s.lastBottom <= s.h + 1;
// the shell on a desk: sidebar 248 with the logo, the four items (each with an icon), the address for questions and
// the person; header 56 with the crumb and the theme button. `here` is the item marked (null on the start page).
const shellChecks = async (page, tag, here, crumb, theme, contact) => {
  const s = await page.evaluate(() => {
    const box = (q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
    const drawn = (q) => { const e = document.querySelector(q); return !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0; };
    const logo = document.querySelector("[data-client-logo] svg");
    return {
      side: box(".clw-side"), head: box(".clw-head"), themeBtn: box("[data-theme-button]"), phoneBar: drawn("[data-phone-bar]"),
      items: [...document.querySelectorAll(".clw-side-nav a")].map((a) => { const i = a.querySelector(".clw-nav-icon"); const c = i ? getComputedStyle(i) : null; return { t: (a.textContent || "").trim(), h: Math.round(a.getBoundingClientRect().height), icon: !!i && i.getBoundingClientRect().width >= 14 && /url\(/.test(`${c.maskImage || ""}${c.webkitMaskImage || ""}`) }; }),
      on: [...document.querySelectorAll(".clw-side-nav a.on")].map((a) => `${(a.textContent || "").trim()}:${a.getAttribute("aria-current")}`),
      crumb: document.querySelector("[data-client-crumb]")?.textContent ?? "", user: document.querySelector("[data-client-user]")?.textContent ?? "",
      logo: logo ? getComputedStyle(logo).color : "", logoH: logo ? Math.round(logo.getBoundingClientRect().height) : 0,
      old: document.querySelectorAll(".clw-bottomnav, .clw-signout").length,
    };
  });
  ok(s.side?.w === 248 && s.side?.x === 0 && s.head?.h === 56 && s.head?.x === 248 && s.head?.y === 0, `${tag}: the sidebar is 248 wide, the header 56 tall beside it`, JSON.stringify({ side: s.side, head: s.head }));
  ok(JSON.stringify(s.items.map((i) => i.t)) === JSON.stringify(MENU) && s.items.every((i) => i.icon) && new Set(s.items.map((i) => i.h)).size === 1, `${tag}: the sidebar is Timeline, Flights, Account, Settings — each with its icon, all one height`, JSON.stringify(s.items));
  ok(here ? s.on.join() === `${here}:page` : s.on.length === 0, `${tag}: ${here ? `${here} is the one item marked` : "no item is marked"}`, s.on.join());
  ok(s.crumb.includes(COMPANY) && s.crumb.includes(crumb), `${tag}: the crumb names the company and the page`, s.crumb);
  ok(/Rig Client Person/.test(s.user) && s.user.includes(`${COMPANY.toUpperCase()} · CLIENT`), `${tag}: the person and the company under the sidebar`, s.user);
  ok(s.logoH >= 20 && (theme === "dark" ? lum(s.logo) > 160 : lum(s.logo) < 100), `${tag}: the logo is ${theme === "dark" ? "white on dark" : "dark on light"}`, `${s.logo} ${s.logoH}px`);
  ok(s.themeBtn?.w === 36 && s.themeBtn?.h === 36 && !s.phoneBar && s.old === 0, `${tag}: the header has the theme button (36 × 36); no phone bar, no tab bar, no Sign out in the header`, JSON.stringify({ themeBtn: s.themeBtn, phoneBar: s.phoneBar, old: s.old }));
  ok((await page.locator(".clw-side-help[data-client-contact] a").getAttribute("href").catch(() => null)) === `mailto:${contact}`, `${tag}: the address for questions under the sidebar is the client contact setting`);
  // "Help & support" (to the Account page's help card) and the collapse button, under the menu
  const h = await page.evaluate(() => {
    const a = document.querySelector(".clw-side-foot [data-help-link]"), i = a?.querySelector(".clw-nav-icon"), c = i ? getComputedStyle(i) : null, b = document.querySelector("[data-client-user] [data-rail-button]"), r = b?.getBoundingClientRect();
    const seen = a ? [...a.querySelectorAll("span")].filter((s) => getComputedStyle(s).display !== "none" && (s.textContent || "").trim()).map((s) => s.textContent.trim()).join("|") : "";
    return { n: document.querySelectorAll("[data-help-link]").length, href: a?.getAttribute("href") ?? "", seen, h: a ? Math.round(a.getBoundingClientRect().height) : 0, itemH: Math.round(document.querySelector(".clw-side-nav a")?.getBoundingClientRect().height ?? -1),
      icon: !!i && i.getBoundingClientRect().width >= 14 && /life-buoy/.test(`${c.maskImage}${c.webkitMaskImage}`), btn: r ? `${Math.round(r.width)}x${Math.round(r.height)}` : "", label: b?.getAttribute("aria-label") ?? "", open: b?.getAttribute("aria-expanded") ?? "", mark: getComputedStyle(document.querySelector("[data-client-mark]") ?? document.body).display };
  });
  ok(h.n === 1 && h.href === "/client/account#help" && h.seen === "Help & support" && h.icon && h.h === h.itemH, `${tag}: "Help & support" is one row under the menu, with its icon, a menu item's height, to the Account page's help card`, JSON.stringify(h));
  ok(h.btn === "32x32" && h.label === "Collapse sidebar" && h.open === "true" && h.mark === "none", `${tag}: the collapse button (32 × 32) sits by the person; the sidebar is open, the mark not drawn`, JSON.stringify(h));
  const flat = await noHover(page, [["a menu item", page.locator(".clw-side-nav a:not(.on)")], ["the theme button", page.locator("[data-theme-button]")], ["Help & support", page.locator("[data-help-link]")], ["the collapse button", page.locator("[data-rail-button]")]]);
  ok(flat.length === 0, `${tag}: the menu items, Help & support, the collapse button and the theme button show a hover`, flat.join(", "));
};
// the sidebar collapsed: a 72 px rail — the mark, each item an icon over a short word with its name as the title
const railState = (page) => page.evaluate(() => {
  const box = (q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const shown = (q) => { const e = document.querySelector(q); return !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0; };
  const b = document.querySelector("[data-rail-button]"); let kept = null; try { kept = localStorage.getItem("cw-client-rail"); } catch {}
  return { cls: document.documentElement.classList.contains("cw-client-rail"), kept, side: box(".clw-side"), head: box(".clw-head"), mark: shown("[data-client-mark]") ? document.querySelector("[data-client-mark]").textContent : "", logo: shown("[data-client-logo]"), who: shown(".clw-side-who"), contact: shown(".clw-side-help"),
    label: b?.getAttribute("aria-label") ?? "", open: b?.getAttribute("aria-expanded") ?? "", btn: box("[data-rail-button]"),
    items: [...document.querySelectorAll(".clw-side-nav a, .clw-side-foot a")].map((a) => { const i = a.querySelector(".clw-nav-icon"), r = a.getBoundingClientRect(), c = i ? getComputedStyle(i) : null; const word = [...a.querySelectorAll("span")].filter((s) => !s.classList.contains("clw-nav-icon") && getComputedStyle(s).display !== "none").map((s) => s.textContent.trim()).join("|");
      return { word, title: a.getAttribute("title") ?? "", h: Math.round(r.height), inside: r.left >= 0 && r.right <= 72, icon: !!i && i.getBoundingClientRect().width >= 14 && /url\(/.test(`${c.maskImage}${c.webkitMaskImage}`), fits: [...a.querySelectorAll("span")].every((s) => s.scrollWidth <= a.clientWidth + 1) }; }) };
});

// the requested client
let r = await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Rig Client Person" }, app_metadata: { role: "client", is_approved: false, client_status: "requested" } }) });
let u = await r.json(); if (!r.ok) { const list = await (await svc("/auth/v1/admin/users?page=1&per_page=200")).json(); u = (list.users ?? []).find((x) => x.email === EMAIL); }
const uid = u.id;
// (the password too: this check changes it on the Account page and puts it back, and a run stopped in between left the
// next run unable to sign in, 2026-11-09; and the view preferences, so the start page and the hide switches begin empty)
await svc(`/auth/v1/admin/users/${uid}`, { method: "PUT", body: JSON.stringify({ password: PASSWORD, user_metadata: { full_name: "Rig Client Person", client_prefs: null }, app_metadata: { role: "client", is_approved: false, client_status: "requested" } }) });
// A previous run's row cannot be deleted (its decisions reference it — rows are never deleted, on the rig as in production):
// put it back to "requested", emptied, or make it when there is none.
const fresh = { user_id: uid, email: EMAIL, person_name: "Rig Client Person", company: COMPANY, kind: "broker", note: "Two legs for a client of ours next week.", status: "requested", scope: [], switches: [], passenger_level: "off", consent: false, decided_at: null, decided_by: null, decided_by_email: null, decision_note: "" };
const existing = await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=id`)).json();
if (existing[0]) await svc(`/rest/v1/clients?id=eq.${existing[0].id}`, { method: "PATCH", body: JSON.stringify(fresh) });
else await svc("/rest/v1/clients", { method: "POST", body: JSON.stringify(fresh) });
const rowId = existing[0]?.id ?? ((await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=id`)).json())[0]?.id);   // this check's own row (other checks leave waiting rows of their own)
// the address clients write to is a setting (app_settings, Admin › Clients): this check sets its own, an invented one
const contact = "rig-client-help@rig.invalid";
await svc("/rest/v1/app_settings?on_conflict=key", { method: "POST", headers: { prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: "clients.support_email", value: { email: contact }, updated_by_email: "rig/client-ui-check" }) });

const browser = await chromium.launch();
const admin = await grant("rig-access-admin@rig.invalid");
for (const theme of ["light", "dark"]) {
  for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: viewportOf(width), colorScheme: theme });
    await ctx.addCookies([cookie(admin)]); await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
    const page = await ctx.newPage();
    await page.goto(`${B}/admin/clients`, { waitUntil: "load" }); await page.waitForSelector("[data-admin-clients]", { timeout: 20000 }); await settled(page);
    // The first pass approves the client through the page; every later pass finds them under Approved.
    const approvedYet = !(theme === "light" && width === 1440);
    ok(approvedYet ? await page.locator(`[data-client-approved]`).count() >= 1 : await page.locator(`[data-client-request]`).count() >= 1, `Clients page ${theme} ${width}: the client is under ${approvedYet ? "Approved" : "Waiting"}`);
    ok(await noOverflow(page), `Clients page ${theme} ${width}: no horizontal page scroll`);
    await page.screenshot({ path: `${OUT}/client-admin-${theme}-${width}.png`, fullPage: true });
    if (theme === "light" && width === 1440) {
      await page.locator("[data-review]").first().click(); await page.waitForSelector("[data-client-editor]", { timeout: 10000 });
      const approve = page.locator("[data-approve]");
      ok(await approve.isDisabled(), "editor: Approve is disabled with no scope");
      // the scope field suggests real records only (2026-11-02): type, then take the fleet's LY-TST from the suggestions
      const scopeBox = page.getByRole("combobox", { name: "Add to scope" });
      await scopeBox.click(); await page.keyboard.type("LY-TST");
      const opt = page.locator('[data-suggestions] [data-option="registration:LY-TST"]');
      await opt.waitFor({ timeout: 15000 }); await opt.dispatchEvent("mousedown");
      ok(await page.locator('[data-scope-entry="registration:LY-TST"]').count() === 1, "editor: the registration is in the scope list");
      ok(await page.locator('[data-switch="flight_board"]').isDisabled(), "editor: Flight board is required (cannot be turned off)");
      // the retired switches (2026-11-10): Documents and Airport search are not in the editor, and the nine that exist are
      const shown = await page.locator("[data-switch]").evaluateAll((els) => els.map((e) => e.getAttribute("data-switch")));
      ok(RETIRED_SWITCH_KEYS.length === 2 && shown.every((k) => !RETIRED_SWITCH_KEYS.includes(k)) && shown.length === ACTIVE_SWITCHES.length && ACTIVE_SWITCHES.length === 9, "editor: the nine switches that exist, and neither retired one (Documents, Airport search)", shown.join(","));
      await page.locator('[data-switch="limitations"]').click();
      await page.locator('[data-level="names"]').click();
      ok(await approve.isEnabled(), "editor: Approve enabled with a scope, the board and a level");
      await page.screenshot({ path: `${OUT}/client-admin-editor.png`, fullPage: true });
      await approve.click(); await page.waitForSelector(`[data-client-approved]`, { timeout: 15000 }); await settled(page);
      ok(await page.locator(`[data-client-approved="${rowId}"]`).count() === 1 && await page.locator(`[data-client-request="${rowId}"]`).count() === 0, "approved through the page: moved from Waiting to Approved", rowId);
      ok(await page.locator('[data-decision="approved"]').count() >= 1, "the decision log shows APPROVED");
      const row = await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=status,scope,switches,passenger_level`)).json();
      ok(row[0]?.status === "approved" && JSON.stringify(row[0]?.scope) === JSON.stringify([{ kind: "registration", value: "LY-TST" }]) && row[0]?.switches.includes("limitations") && row[0]?.passenger_level === "names", "the row: approved, scope LY-TST, limitations on, names", JSON.stringify(row[0]).slice(0, 150));
      ok(row[0]?.switches.includes("radar") && !row[0]?.switches.some((k) => RETIRED_SWITCH_KEYS.includes(k)), "the row: the radar switch is among the starting ones, and no retired switch is saved", JSON.stringify(row[0]?.switches));
      const au = await (await svc(`/auth/v1/admin/users/${uid}`)).json();
      ok(au.app_metadata?.role === "client" && au.app_metadata?.is_approved === true && au.app_metadata?.client_status === "approved", "the account: client, approved, in app_metadata", JSON.stringify(au.app_metadata));
    }
    await ctx.close();
  }
}

// the client's own screens on a desk, in the v3 look: the shell, Timeline and Flights in the frame, the Operators &
// aircraft panel, the flight panel, Account — at 1280, 1440 and 1920, light and dark
let cs = await grant(EMAIL);
// a flight that flies (a cancelled one carries no weather, NOTAM or passenger section, by design)
const flightNoOf = async (page) => frameOf(page).locator("[data-flight-row]:not(.is-cnl)").first().getAttribute("data-flight-row");
const readPax = (page, sel) => frameDoc(page)?.waitForFunction((q) => { const t = document.querySelector(q)?.textContent || ""; return t.length > 0 && !/Reading the passenger list/.test(t); }, sel, { timeout: 20000 }).catch(() => {});
const FRAME_BUTTONS = [".cwd-btn", ".cwd-cta", ".cwd-mini", ".cwd-foot-btn", ".cwd-now", ".cwd-step", ".cwd-link", ".cwd-icon-btn", ".cwd-clear"];
const FRAME_SKIP = ["[data-now-pin]"];   // the "now" mark is drawn over the lanes by design
// An hour label that has scrolled out of the Board's hour row is cut away by that row (it clips), so it is not on screen
// and cannot cover the "AIRCRAFT" word that stands beside the row: such labels are marked and left out. A row that
// does not clip marks nothing, so a label really drawn over the word is still found.
const markCutHours = (page) => frameDoc(page)?.evaluate(() => {
  for (const row of document.querySelectorAll(".timeline-scroll--header")) {
    const clips = getComputedStyle(row).overflowX !== "visible"; const box = row.getBoundingClientRect();
    for (const t of row.querySelectorAll("[data-hour-ms]")) { const r = (t.querySelector("span") || t).getBoundingClientRect(); t.toggleAttribute("data-rig-cut", clips && (r.left < box.left || r.right > box.right)); }
  }
}).catch(() => {});
// the hour row: a label lies level wherever its column has room for the word (48 px and up), in a size a person can
// read, inside its own column. (Narrower columns keep the Board's upright labels.)
const hourRow = (page) => frameDoc(page).evaluate(() => [...document.querySelectorAll(".cwd-board .timeline-scroll--header [data-hour-ms]")].slice(0, 40).map((t) => {
  const sp = t.querySelector("span"); const tr = getComputedStyle(sp).transform; const r = sp.getBoundingClientRect(), c = t.getBoundingClientRect();
  return { col: Math.round(c.width), level: tr === "none" || /^matrix\(1, 0, 0, 1, /.test(tr), fits: r.left >= c.left - 0.5 && r.right <= c.right + 0.5, font: Math.round(parseFloat(getComputedStyle(sp).fontSize)) };
}));
const hoursFine = (h) => h.length > 0 && h.every((x) => x.col < 48 || (x.level && x.fits && x.font >= 11));
const hoursSaid = (h) => (h[0] ? `${h.length} labels · column ${h[0].col}px · ${h[0].font}px · level ${h.filter((x) => x.level).length} · inside ${h.filter((x) => x.fits).length}` : "no hour row");
const frameOverlaps = async (page, more = []) => { await markCutHours(page); return textOverlaps(frameDoc(page), { ignore: [...FRAME_SKIP, "[data-rig-cut]", ...more] }); };
const panelGeo = (page, sel) => frameDoc(page)?.evaluate((q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { tag: e.tagName, w: Math.round(r.width), top: Math.round(r.top), h: Math.round(r.height), right: Math.round(window.innerWidth - r.right), left: Math.round(r.left), vh: window.innerHeight }; }, sel) ?? null;
for (const theme of ["light", "dark"]) {
  for (const width of DESK) {
    const ctx = await browser.newContext({ viewport: viewportOf(width), colorScheme: theme });
    await ctx.addCookies([cookie(cs)]); await ctx.addInitScript(themed, theme);
    const page = await ctx.newPage(); const tag = `client ${theme} ${width}`; const fr = frameOf(page);
    // ── the shell, and Timeline in the frame ──
    await openClient(page, "/client", width);
    ok(await page.locator("[data-cw-sidebar]").count() === 0 && !(await page.content()).includes("Flight intake"), `${tag} Timeline: no portal shell in the page`);
    ok((await page.locator("[data-client-shell]").getAttribute("data-menu")) === "/client /client/flights /client/account /client/settings", `${tag} Timeline: the menu is Timeline, Flights, Account, Settings and nothing else`, await page.locator("[data-client-shell]").getAttribute("data-menu"));
    await shellChecks(page, `${tag} Timeline`, "Timeline", "Timeline", theme, contact);
    const fb = await page.locator(FRAME).boundingBox(), vh = viewportOf(width).height;
    ok(fb && Math.abs(fb.x - 248) <= 1 && Math.abs(fb.y - 56) <= 1 && Math.abs(fb.x + fb.width - width) <= 1 && Math.abs(fb.y + fb.height - vh) <= 1, `${tag} Timeline: the frame fills the room beside the sidebar and under the header`, fb ? `${Math.round(fb.x)},${Math.round(fb.y)} ${Math.round(fb.width)}×${Math.round(fb.height)}` : "none");
    ok(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1), `${tag} Timeline: the page itself is one screen (the frame scrolls, not the page around it)`);
    const surface = fr.locator("[data-client-surface]");
    ok((await surface.getAttribute("data-client-surface")) === "desk" && (await surface.getAttribute("data-theme")) === theme, `${tag} Timeline: the frame draws the desk surface in the ${theme} theme`, `${await surface.getAttribute("data-client-surface")} ${await surface.getAttribute("data-theme")}`);
    ok(await fr.locator('.cwd[data-client-page="timeline"]').count() === 1 && (await fr.locator(".cwd-title h1").innerText()).trim() === "Timeline", `${tag} Timeline: the frame is on the timeline page, under its title`);
    const pills = await fr.locator("[data-board] [data-fid]").count();
    ok(pills >= 1 && Number(await fr.locator("[data-board]").getAttribute("data-lanes")) >= 1, `${tag} Timeline: the board (the ops timeline) draws their flights in their aircraft's lanes`, `${pills} pills · ${await fr.locator("[data-board]").getAttribute("data-lanes")} lanes`);
    ok(await fr.locator("[data-service-status]").count() === 0, `${tag} Timeline: no service status line (its switch is off)`);
    ok(/LY-TST|1 aircraft/.test(await fr.locator("[data-page-sub]").innerText()) && await fr.locator("[data-operators-button]").count() === 1 && await fr.locator("[data-hidden-chip]").count() === 0, `${tag} Timeline: the subtitle counts their aircraft, Operators & aircraft is there, nothing is marked hidden`, (await fr.locator("[data-page-sub]").innerText()).trim());
    const card = fr.locator('[data-card="timeline"]');
    ok(await card.locator("[data-prev-day]").count() === 1 && await card.locator("[data-next-day]").count() === 1 && await card.locator("[data-zoom-out]").count() === 1 && await card.locator("[data-zoom-in]").count() === 1 && await card.locator("[data-go-now]").count() === 1, `${tag} Timeline: day, zoom and Now controls`);
    const tl = await frameDoc(page).evaluate(() => { const q = (s) => document.querySelector(s); const left = (e) => (e ? Math.round(e.getBoundingClientRect().left) : null);
      return { dayTag: (q("[data-day-tag]")?.textContent || "").trim(), clocks: Boolean(q(".cwd-clocks")), legend: [...document.querySelectorAll("[data-legend] > span")].map((s) => ({ t: (s.textContent || "").trim(), key: (s.querySelector("i")?.getBoundingClientRect().width ?? 0) > 0 })), head: (q("[data-aircraft-head]")?.textContent || "").trim(), headLeft: left(q("[data-aircraft-head]")), boardLeft: left(q("[data-board]")), acW: q("[data-board] .timeline-scroll--header") ? left(q("[data-board] .timeline-scroll--header")) - left(q("[data-board]")) : null }; });
    ok(tl.dayTag.length > 0 && tl.clocks, `${tag} Timeline: the card's head names the day and shows the clocks`, tl.dayTag);
    ok(tl.legend.length >= 3 && tl.legend.every((l) => l.t.length > 0 && l.key), `${tag} Timeline: the legend names each colour, each with its key`, tl.legend.map((l) => l.t).join(", "));
    // (the head is drawn when the aircraft column, whose width is a display setting, has room for the word: 84 px)
    ok(tl.acW !== null && (tl.acW >= 84 ? tl.head === "AIRCRAFT" && Math.abs(tl.headLeft - tl.boardLeft) <= 1 : tl.head === ""), `${tag} Timeline: the AIRCRAFT column head sits over the registrations`, JSON.stringify({ head: tl.head, headLeft: tl.headLeft, boardLeft: tl.boardLeft, acW: tl.acW }));
    // the day steps and Now
    const dayAt = async () => (await fr.locator("[data-day-short]").innerText()).trim();
    const d0 = await dayAt(); await fr.locator("[data-next-day]").click(); await page.waitForTimeout(250); const d1 = await dayAt();
    await fr.locator("[data-go-now]").click(); await page.waitForTimeout(250);
    ok(d1 !== d0 && (await dayAt()) === d0, `${tag} Timeline: the next day is another day, Now comes back`, `${d0} → ${d1} → ${await dayAt()}`);
    await fr.locator("[data-board] [data-fid]").first().waitFor({ timeout: 15000 }).catch(() => {});
    // the zoom steps: the label changes, and each end's button is off when there is no further step
    const zoomAt = async () => (await fr.locator("[data-zoom-label]").innerText()).trim();
    const z0 = await zoomAt(); const seen = new Set([z0]);
    for (let i = 0; i < 4 && await fr.locator("[data-zoom-in]").isEnabled(); i += 1) { await fr.locator("[data-zoom-in]").click(); await page.waitForTimeout(150); seen.add(await zoomAt()); }
    const topEnd = await fr.locator("[data-zoom-in]").isDisabled();
    for (let i = 0; i < 4 && await fr.locator("[data-zoom-out]").isEnabled(); i += 1) { await fr.locator("[data-zoom-out]").click(); await page.waitForTimeout(150); seen.add(await zoomAt()); }
    const lowEnd = await fr.locator("[data-zoom-out]").isDisabled();
    const hoursOut = await hourRow(page);
    for (let i = 0; i < 4 && (await zoomAt()) !== z0; i += 1) { await fr.locator("[data-zoom-in]").click(); await page.waitForTimeout(150); }
    ok(seen.size >= 2 && topEnd && lowEnd && (await zoomAt()) === z0, `${tag} Timeline: zoom changes the label, and is off at each end`, `${[...seen].join(" ")} · ends ${topEnd}/${lowEnd}`);
    const hoursUsual = await hourRow(page);
    ok(hoursFine(hoursUsual) && hoursFine(hoursOut), `${tag} Timeline: the hour labels lie level, readable and inside their columns — at the usual zoom and zoomed all the way out`, `usual: ${hoursSaid(hoursUsual)} · out: ${hoursSaid(hoursOut)}`);
    await fr.locator("[data-board] [data-fid]").first().waitFor({ timeout: 15000 }).catch(() => {});
    const agenda = await fr.locator('[data-card="coming-up"] [data-agenda-row]').count();
    ok(await fr.locator('[data-card="coming-up"]').count() === 0 || agenda >= 1, `${tag} Timeline: Coming up, when drawn, lists at least one flight`, `${agenda} rows`);
    ok(await noOverflow(page) && await frameNoOverflow(page), `${tag} Timeline: no horizontal scroll, on the page or in the frame`);
    await settled(page); await page.waitForTimeout(300);
    let over = [...await textOverlaps(page, { ignore: ["iframe"] }), ...await frameOverlaps(page)];
    ok(over.length === 0, `${tag} Timeline: no two text boxes overlap (shell and frame)`, said(over));
    let cut = await clippedText(frameDoc(page)); ok(cut.length === 0, `${tag} Timeline: no text is cut without an ellipsis`, cut.map((c) => `"${c.t}" +${c.over}px`).join(" · "));
    let uneven = await unevenButtons(frameDoc(page), FRAME_BUTTONS); ok(uneven.length === 0, `${tag} Timeline: every button class is one size`, uneven.join(", "));
    let flat = await noHover(page, [["Operators & aircraft", fr.locator("[data-operators-button]")], ["a day step", fr.locator("[data-prev-day]")], ["Now", fr.locator("[data-go-now]")], ["All flights", fr.locator("[data-all-flights]")], ["a Coming up row", fr.locator("[data-agenda-row]")]]);
    ok(flat.length === 0, `${tag} Timeline: every button shows a hover`, flat.join(", "));
    await shot(page, `${OUT}/client-timeline-${theme}-${width}.png`, width);
    // the page scrolls: on a short window the frame's document reaches its last card
    await page.setViewportSize({ width, height: 560 }); await page.waitForTimeout(400);
    let sc = await scrollsToEnd(frameDoc(page), "section.cwd-card"); ok(scrolled(sc), `${tag} Timeline: on a short window the page scrolls to its last card`, JSON.stringify(sc));
    await page.setViewportSize(viewportOf(width)); await page.waitForTimeout(400);

    // ── Operators & aircraft: a 400 px panel under its button (the walk that saves is further down) ──
    await fr.locator("[data-operators-button]").click(); await fr.locator("[data-operators-panel]").waitFor({ timeout: 10000 }).catch(() => {});
    const og = await panelGeo(page, "[data-operators-panel]");
    ok(Boolean(og) && og.w === 400 && og.left >= 0 && og.right >= 0 && og.top >= 0 && og.top + og.h <= og.vh + 1 && (await fr.locator("[data-operators-button]").getAttribute("aria-expanded")) === "true", `${tag} operators panel: 400 wide, wholly on the screen, its button marked open`, JSON.stringify(og));
    over = await textOverlaps(frameDoc(page), { root: "[data-operators-panel]" }); ok(over.length === 0, `${tag} operators panel: no two text boxes overlap`, said(over));
    uneven = await unevenButtons(frameDoc(page), [...FRAME_BUTTONS, "[data-op-switch]", "[data-reg-switch]"]); ok(uneven.length === 0, `${tag} operators panel: every button class is one size`, uneven.join(", "));
    if (width === 1440) await shot(page, `${OUT}/client-operators-${theme}-${width}.png`, width);
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    ok(await fr.locator("[data-operators-panel]").count() === 0 && (await fr.locator("[data-operators-button]").getAttribute("aria-expanded")) === "false", `${tag} operators panel: Escape closes it`);

    // ── a flight from the timeline: a pill opens the 440 px side panel ──
    const pill = fr.locator("[data-board] [data-fid]").first(); await pill.scrollIntoViewIfNeeded().catch(() => {}); await pill.click({ timeout: 10000 }).catch(() => {});
    await fr.locator("[data-flight-panel]").waitFor({ timeout: 15000 }).catch(() => {});
    const pg = await panelGeo(page, "[data-flight-panel]");
    ok(Boolean(pg) && pg.tag === "ASIDE" && pg.w === 440 && pg.right <= 16 && pg.top === 0 && pg.h === pg.vh, `${tag} Timeline: a pill opens the flight panel — 440 wide, the full height, on the right`, JSON.stringify(pg));
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    if (await fr.locator("[data-flight-panel]").count()) await fr.locator("[data-flight-panel] [data-close-flight]").click();
    ok(await fr.locator("[data-flight-panel]").count() === 0, `${tag} Timeline: the panel closes`);

    // ── Flights: by "All flights" under Coming up (one pass), else by the sidebar — the frame stays, the address follows ──
    if (width === 1440 && await fr.locator("[data-all-flights]").count()) await fr.locator("[data-all-flights]").click(); else await page.locator(".clw-side-nav a", { hasText: "Flights" }).click();
    await page.waitForURL((x) => new URL(x).pathname === "/client/flights", { timeout: 15000 }).catch(() => {});
    await fr.locator('.cwd[data-client-page="flights"]').waitFor({ timeout: 15000 }).catch(() => {});
    ok(new URL(page.url()).pathname === "/client/flights" && await fr.locator('[data-client-page="flights"]').count() === 1 && await page.locator(FRAME).count() === 1, `${tag} Flights: the frame's page and the address switch together`, page.url());
    ok(await page.locator(".clw-side-nav a.on").innerText().then((t) => t.trim() === "Flights", () => false) && /Flights/.test(await page.locator("[data-client-crumb]").innerText()), `${tag} Flights: marked in the sidebar and named in the crumb`);
    await fr.locator("[data-flight-row]").first().waitFor({ timeout: 15000 }).catch(() => {});
    const rows = await fr.locator("[data-flight-row]").count();
    ok(rows >= 1 && await fr.locator("[data-flights-search]").count() === 1 && await fr.locator("[data-day-group]").count() >= 1, `${tag} Flights: the list has their flights by day, and a search field`, `${rows} rows`);
    // the table: the seven columns of the design, and every row's cells under the head's
    const cols = await frameDoc(page).evaluate(() => { const head = document.querySelector("[data-flights-head]"); if (!head) return null; const xs = (e) => [...e.children].map((c) => Math.round(c.getBoundingClientRect().left));
      const hx = xs(head); const rs = [...document.querySelectorAll("[data-flight-row]")].slice(0, 12).map(xs);
      return { names: [...head.children].map((c) => (c.textContent || "").trim()), grid: getComputedStyle(head).gridTemplateColumns, head: hx, rows: rs.length, off: rs.filter((r) => r.length !== hx.length || r.some((x, i) => Math.abs(x - hx[i]) > 1)).length }; });
    ok(Boolean(cols) && cols.names.join("|") === "DEP UTC|ARR UTC|FLIGHT|AIRCRAFT|OPERATOR|ROUTE|STATUS" && /^84px 84px 100px 96px [\d.]+px 150px 160px$/.test(cols.grid), `${tag} Flights: the table's seven columns, on the design's grid`, cols ? `${cols.names.join(" ")} · ${cols.grid}` : "no head");
    ok(Boolean(cols) && cols.rows >= 1 && cols.off === 0, `${tag} Flights: the columns line up — every row's cells start where the head's do`, cols ? `${cols.off} of ${cols.rows} rows off · head at ${cols.head.join(",")}` : "no head");
    const marks = await frameDoc(page).evaluate(() => { const bg = (e) => getComputedStyle(e).backgroundColor; const air = document.querySelector("[data-flight-row].is-air"), plain = document.querySelector("[data-flight-row]:not(.is-air)"); const s = document.querySelector(".cwd-ftime s");
      return { tint: air && plain ? bg(air) !== bg(plain) : null, struck: s ? /line-through/.test(getComputedStyle(s).textDecorationLine) : null }; });
    ok(marks.tint !== false && marks.struck !== false, `${tag} Flights: an airborne row is tinted and a changed time is struck through (when the list has one)`, JSON.stringify(marks));
    const search = fr.locator("[data-flights-search]");
    await search.fill("QQQQZZZZ"); await fr.locator('[data-empty="no-match"]').waitFor({ timeout: 8000 }).catch(() => {});
    ok(await fr.locator('[data-empty="no-match"]').count() === 1 && await fr.locator("[data-flight-row]").count() === 0, `${tag} Flights: a search with no match says so in words`);
    over = await frameOverlaps(page); ok(over.length === 0, `${tag} Flights: nothing overlaps on the no-match screen`, said(over));
    ok(await fr.locator("[data-clear-search]").count() === 1, `${tag} Flights: a typed search has a clear button`);
    await fr.locator("[data-clear-search]").click().catch(() => {}); await fr.locator("[data-flight-row]").first().waitFor({ timeout: 8000 }).catch(() => {});
    ok((await search.inputValue()) === "" && await fr.locator("[data-flight-row]").count() === rows, `${tag} Flights: clearing the search brings every flight back`);
    const fn = await flightNoOf(page);
    await search.fill(String(fn)); await page.waitForTimeout(300);
    ok(await fr.locator(`[data-flight-row="${fn}"]`).count() >= 1 && await fr.locator("[data-flight-row]").count() <= rows, `${tag} Flights: a flight number finds its flight`, fn);
    await search.fill(""); await fr.locator("[data-flight-row]").first().waitFor({ timeout: 8000 }).catch(() => {});
    ok(await noOverflow(page) && await frameNoOverflow(page), `${tag} Flights: no horizontal scroll, on the page or in the frame`);
    await settled(page); await page.waitForTimeout(300);
    over = [...await textOverlaps(page, { ignore: ["iframe"] }), ...await frameOverlaps(page)];
    ok(over.length === 0, `${tag} Flights: no two text boxes overlap (shell and frame)`, said(over));
    cut = await clippedText(frameDoc(page)); ok(cut.length === 0, `${tag} Flights: no text is cut without an ellipsis`, cut.map((c) => `"${c.t}" +${c.over}px`).join(" · "));
    uneven = await unevenButtons(frameDoc(page), FRAME_BUTTONS); ok(uneven.length === 0, `${tag} Flights: every button class is one size`, uneven.join(", "));
    await search.evaluate((e) => e.blur());   // a field that is being typed in shows its focus colour, which wins over the hover
    flat = await noHover(page, [["a flight row", fr.locator("[data-flight-row]:not(.is-air)")], ["Operators & aircraft", fr.locator("[data-operators-button]")], ["the search field", fr.locator(".cwd-search")]]);
    ok(flat.length === 0, `${tag} Flights: the rows, the button and the search field show a hover`, flat.join(", "));
    await shot(page, `${OUT}/client-flights-${theme}-${width}.png`, width);
    await page.setViewportSize({ width, height: 420 }); await page.waitForTimeout(400);
    sc = await scrollsToEnd(frameDoc(page), "[data-flight-row]"); ok(scrolled(sc), `${tag} Flights: on a short window the page scrolls to its last flight`, JSON.stringify(sc));
    await page.setViewportSize(viewportOf(width)); await page.waitForTimeout(400);

    // ── the flight: a row opens the side panel, with the sections their switches and level allow ──
    await fr.locator(`[data-flight-row="${fn}"]`).first().click();
    const opened = fr.locator(`[data-flight-panel="${fn}"]`);
    await opened.waitFor({ timeout: 15000 }).catch(() => {});
    ok(await opened.count() === 1, `${tag} flight ${fn}: a row opens it as a side panel`);
    // the head: the flight, its aircraft, and the aircraft's type when the feed gives one (C56X) — never the flight
    // plan's one-letter "type of flight", which the head once showed in its place
    const headWords = (await opened.locator(".cwd-flight-head").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    ok(/^\S+ LY-TST( · [A-Z][A-Z0-9]{1,3})?$/.test(headWords), `${tag} flight ${fn}: the panel's head names the flight and LY-TST, with an aircraft type or nothing after it (no one-letter code)`, headWords);
    await opened.locator('[data-section="weather"] [data-card="weather"], [data-section="weather"] .cwc-muted').first().waitFor({ timeout: 20000 }).catch(() => {});
    await opened.locator('[data-section="notams"]').first().waitFor({ timeout: 20000 }).catch(() => {}); // drawn once /api/flight-info has answered (the passengers section does not wait for it: counting once that one was there found no NOTAMs yet at 1440 dark, 2026-11-13)
    await opened.locator('[data-section="passengers"]').first().waitFor({ timeout: 20000 }).catch(() => {}); // the last section to draw (2026-11-11: the 1440 desk once counted before it was there)
    ok(await opened.locator('[data-card="times"]').count() === 1 && await opened.locator('[data-section="weather"]').count() === 1 && await opened.locator('[data-section="notams"]').count() === 1 && await opened.locator('[data-section="limitations"][data-card="limitations"]').count() === 1 && await opened.locator('[data-section="passengers"]').count() === 1, `${tag} flight ${fn}: times, weather, NOTAMs, limitations and passengers — their switches and level`, await opened.evaluate((el) => ["[data-card=times]", "[data-section=weather]", "[data-section=notams]", "[data-section=limitations][data-card=limitations]", "[data-section=passengers]"].map((q) => `${q}:${el.querySelectorAll(q).length}`).join(" ") + ` · ${(el.textContent || "").slice(0, 120)}`).catch(() => "no panel"));
    ok(await opened.locator('[data-section="important"]').count() === 0 && await opened.locator('[data-section="caa"]').count() === 0, `${tag} flight ${fn}: no notices and no authority sections — switches off add nothing`);
    await readPax(page, '[data-section="passengers"]');
    const paxText = (await opened.locator('[data-section="passengers"]').innerText().catch(() => "")).replace(/\s+/g, " ");
    ok(!/could not be read|answered \d{3}/.test(paxText), `${tag} flight ${fn}: the passenger list is read (names, or none entered)`, paxText.slice(0, 80));
    ok(await noOverflow(page) && await frameNoOverflow(page), `${tag} flight ${fn}: no horizontal scroll with the flight open`);
    await page.waitForTimeout(300);
    over = await textOverlaps(frameDoc(page), { root: "[data-flight-panel]" }); ok(over.length === 0, `${tag} flight ${fn}: no two text boxes overlap in the panel`, said(over));
    uneven = await unevenButtons(frameDoc(page), FRAME_BUTTONS); ok(uneven.length === 0, `${tag} flight ${fn}: every button class is one size`, uneven.join(", "));
    flat = await noHover(page, [["the close button", fr.locator("[data-flight-panel] [data-close-flight]")]]); ok(flat.length === 0, `${tag} flight ${fn}: the close button shows a hover`);
    const reach = await frameDoc(page).evaluate(() => { const p = document.querySelector("[data-flight-panel]"); const boxes = [p, ...p.querySelectorAll("*")].filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowY)); const s = boxes.find((e) => e.scrollHeight > e.clientHeight + 1); const last = [...p.querySelectorAll("section")].pop(); if (s) s.scrollTop = s.scrollHeight; const b = last ? Math.round(last.getBoundingClientRect().bottom) : null; if (s) s.scrollTop = 0; return { scrollers: boxes.length, lastBottom: b, vh: window.innerHeight }; });
    ok(reach.scrollers >= 1 && reach.lastBottom !== null && reach.lastBottom <= reach.vh + 1, `${tag} flight ${fn}: the panel scrolls to its last section`, JSON.stringify(reach));
    await shot(page, `${OUT}/client-flight-${theme}-${width}.png`, width);
    await fr.locator("[data-close-flight]").click();
    ok(await fr.locator("[data-flight-panel]").count() === 0, `${tag} flight ${fn}: the panel closes`);

    // ── Account, by the sidebar: the person, the choices (start page, appearance, display, password), the grants ──
    await page.locator(".clw-side-nav a", { hasText: "Account" }).click();
    await page.waitForSelector('[data-tab="account"]', { timeout: 15000 }); await settled(page);
    const at = `${tag} account`;
    ok(new URL(page.url()).pathname === "/client/account" && await page.locator(FRAME).count() === 0, `${at}: the sidebar opens it, with no frame on it`, page.url());
    await shellChecks(page, at, "Account", "Account", theme, contact);
    const bg = await page.evaluate(() => { const c = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [255, 255, 255]; return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; });
    ok(theme === "dark" ? bg < 0.25 : bg > 0.75, `${at}: the page is in the ${theme} theme`, bg.toFixed(2));
    ok(await page.locator("[data-cw-sidebar]").count() === 0 && await noOverflow(page), `${at}: no portal shell, no horizontal page scroll`);
    ok((await page.locator("[data-account-email]").innerText()).trim() === EMAIL && (await page.locator('[data-card="you"]').innerText()).includes(COMPANY), `${at}: says who is signed in, and for which company`);
    ok(await page.locator('[data-card="start-page"] [data-start-option="timeline"]').count() === 1 && await page.locator('[data-card="start-page"] [data-start-option="flights"]').count() === 1 && await page.locator('[data-card="appearance"] [data-theme-option]').count() === 3 && await page.locator('[data-card="display"] [data-display-settings]').count() === 1, `${at}: the start page choice, the three appearance options and the way to the display settings`);
    ok(await page.locator('[data-card="password"][data-password-form="closed"] [data-open-password]').count() === 1 && await page.locator('[data-card="password"] input').count() === 0, `${at}: the password row, its form closed`);
    await page.locator('[data-card="grants"] [data-grant], [data-card="grants"] [data-grants-empty], [data-card="grants"] [data-grants-failed]').first().waitFor({ timeout: 15000 }).catch(() => {});
    const grantsText = (await page.locator('[data-card="grants"]').innerText().catch(() => "")).replace(/\s+/g, " ");
    ok(await page.locator('[data-card="grants"] [data-grant]').count() >= 1 && /LY-TST/.test(grantsText) && await page.locator("[data-grants-empty], [data-grants-failed]").count() === 0, `${at}: the grants card lists their operator and LY-TST`, grantsText.slice(0, 100));
    ok((await page.locator('[data-card="help"] [data-client-contact] a').getAttribute("href")) === `mailto:${contact}`, `${at}: the help card carries the address to write to`);
    ok(await page.locator("[data-signout]").isVisible(), `${at}: Sign out is on the page`);
    const wide = await page.locator('[data-tab="account"] *').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).length);
    ok(wide === 0, `${at}: nothing runs past the edge of the screen`, wide);
    over = await textOverlaps(page); ok(over.length === 0, `${at}: no two text boxes overlap`, said(over));
    // the password form open: three fields (current, new, the new one again), Show, Cancel and Save
    await page.locator("[data-open-password]").click(); await page.locator('[data-card="password"][data-password-form="open"]').waitFor({ timeout: 10000 }).catch(() => {});
    ok(await page.locator('input[name="current"]').count() === 1 && await page.locator('input[name="next"]').count() === 1 && await page.locator('input[name="repeat"]').count() === 1 && await page.locator("[data-show-passwords]").count() === 1 && await page.locator("[data-cancel-password]").count() === 1 && await page.locator("[data-change-password]").count() === 1, `${at}: the password form opens with its three fields, Show, Cancel and Save`);
    over = await textOverlaps(page); ok(over.length === 0, `${at}: no two text boxes overlap with the password form open`, said(over));
    uneven = await unevenButtons(page, [".clw-btn", ".clw-seg button", ".clw-input", ".clw-out", ".clw-reg"]); ok(uneven.length === 0, `${at}: every button class, and the fields, are one size`, uneven.join(", "));
    const inputX = await page.locator('[data-card="password"] .clw-input').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    const grantX = await page.locator('[data-card="grants"] [data-grant] > :nth-child(2)').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    ok(new Set(inputX).size <= 2 && new Set(grantX).size <= 1, `${at}: the form's fields sit in two columns, the grants' registrations in one`, `fields at ${inputX.join(",")} · registrations at ${grantX.join(",")}`);
    await page.locator("[data-show-passwords]").click();
    ok((await page.locator('input[name="next"]').getAttribute("type")) === "text", `${at}: Show passwords shows what is typed`);
    await page.locator("[data-show-passwords]").click();
    flat = await noHover(page, [["Save password", page.locator("[data-change-password]")], ["Cancel", page.locator("[data-cancel-password]")], ["a start-page option", page.locator('[data-card="start-page"] [data-start-option]:not(.on)')], ["an appearance option", page.locator('[data-card="appearance"] [data-theme-option]:not(.on)')], ["Open settings", page.locator("[data-display-settings]")], ["a field", page.locator('input[name="next"]')], ["Sign out", page.locator("[data-signout]")]]);
    ok(flat.length === 0, `${at}: every button and field shows a hover`, flat.join(", "));
    await shot(page, `${OUT}/client-account-form-${theme}-${width}.png`, width, { whole: true });
    await page.locator("[data-cancel-password]").click();
    ok(await page.locator('[data-card="password"][data-password-form="closed"]').count() === 1 && await page.locator('[data-card="password"] input').count() === 0 && await page.locator("[data-password-changed]").count() === 0, `${at}: Cancel closes the form and says nothing was changed`);
    await shot(page, `${OUT}/client-account-${theme}-${width}.png`, width, { whole: true });
    // the picture of the whole page makes the window 1 px wide for an instant (the browser's own way of taking it): that
    // is not a phone, and the desk stays where it is (it was sent to the phone app, 2026-11-13; the shell now looks twice)
    await page.waitForTimeout(600);
    ok(new URL(page.url()).pathname === "/client/account" && await page.locator('[data-tab="account"]').count() === 1, `${at}: a window narrow for an instant (a picture of the whole page) is not sent to the phone app`, page.url());
    // one part failing leaves the page working (components/client/PartBoundary.tsx; the test's way in is the wall app's:
    // window.__CW_THROW__ names the part, the "cw-throw-probe" event asks for its next render): the grants card alone is
    // replaced by a short message with Reload, the sidebar, the header and the other cards stay, and Reload brings it back
    if (width === 1440) {
      const reported = page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/digital-wall/api/ui-error", { timeout: 10000 }).then((r) => r.postDataJSON()).catch(() => null);
      await page.evaluate(() => { window.__CW_THROW__ = "client/account/grants"; window.dispatchEvent(new Event("cw-throw-probe")); });
      const failed = page.locator('[data-part-failed="client/account/grants"]');
      await failed.waitFor({ timeout: 10000 }).catch(() => {});
      const failedText = (await failed.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      ok(await failed.count() === 1 && await page.locator('[data-card="grants"]').count() === 0 && /This part failed/i.test(failedText) && !/probe|error|stack/i.test(failedText), `${at}: a part that fails says so in short words, with nothing of the error in them`, failedText);
      ok(await page.locator("[data-part-failed]").count() === 1 && await page.locator('[data-card="you"]').isVisible() && await page.locator('[data-card="choices"]').isVisible() && await page.locator("[data-signout]").isVisible() && await page.locator(".clw-side-nav a").count() === MENU.length && await page.locator("[data-client-crumb]").isVisible(), `${at}: only that part is replaced: the sidebar, the header and the other cards stay`);
      const sentUp = await reported;
      ok(sentUp && sentUp.where === "client/account/grants" && sentUp.path === "/client/account", `${at}: the failure is reported to the server's log, with the part's name and the page`, JSON.stringify(sentUp ?? null).slice(0, 160));
      over = await textOverlaps(page); ok(over.length === 0, `${at}: with a part failed, no two text boxes overlap`, said(over));
      const reloadBtn = page.locator('[data-part-failed] [data-part-reload]');
      const rb = await reloadBtn.boundingBox();
      ok(rb && Math.abs(rb.height - 36) <= 1 && await hoverShows(page, reloadBtn), `${at}: its Reload is the page's button size, with a visible hover`, JSON.stringify(rb));
      await shot(page, `${OUT}/client-account-part-failed-${theme}-${width}.png`, width, { whole: true });
      await reloadBtn.click(); await page.waitForTimeout(300);
      ok(await page.locator("[data-part-failed]").count() === 1 && await page.locator('[data-card="grants"]').count() === 0, `${at}: Reload while it still fails leaves the message, the page still working`);
      await page.evaluate(() => { window.__CW_THROW__ = ""; });
      await reloadBtn.click();
      await page.locator('[data-card="grants"] [data-grant]').first().waitFor({ timeout: 15000 }).catch(() => {});
      ok(await page.locator("[data-part-failed]").count() === 0 && await page.locator('[data-card="grants"] [data-grant]').count() >= 1, `${at}: Reload brings the part back`);
    }
    await page.setViewportSize({ width, height: 520 }); await page.waitForTimeout(300);
    sc = await scrollsToEnd(page, "[data-signout]"); ok(scrolled(sc) && sc.tall, `${at}: on a short window the page scrolls to Sign out`, JSON.stringify(sc));

    // ── "Help & support": on the Account page (the window still short) it scrolls the help card into view; from
    //    another page it opens Account at the card ──
    const helpAt = () => page.evaluate(() => { const r = document.querySelector('[data-card="help"]')?.getBoundingClientRect(); return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight, y: Math.round(window.scrollY), hash: location.hash, path: location.pathname } : null; });
    const helpSeen = (g) => Boolean(g) && g.path === "/client/account" && g.hash === "#help" && g.top >= 55 && g.bottom <= g.vh + 1;
    await page.locator("[data-help-link]").click({ timeout: 8000 }).catch(() => {}); await page.waitForFunction(() => location.hash === "#help", null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(400);
    let hg = await helpAt();
    ok(helpSeen(hg) && hg.y > 0, `${at}: Help & support scrolls the help card into view, clear of the header`, JSON.stringify(hg));
    ok(await page.locator(".clw-side-nav a.on").innerText().then((x) => x.trim() === "Account", () => false), `${at}: Account stays the item marked`);
    await page.setViewportSize(viewportOf(width)); await page.waitForTimeout(200);
    await page.locator(".clw-side-nav a", { hasText: "Timeline" }).click(); await page.waitForURL((x) => new URL(x).pathname === "/client", { timeout: 15000 }).catch(() => {});
    await fr.locator("[data-board]").first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.locator("[data-help-link]").click(); await page.waitForSelector('[data-tab="account"]', { timeout: 15000 }).catch(() => {}); await page.waitForFunction(() => location.hash === "#help", null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(400);
    hg = await helpAt();
    ok(helpSeen(hg), `${at}: from Timeline, Help & support opens Account with the help card in view`, JSON.stringify(hg));

    // ── the sidebar collapsed: a 72 px rail that keeps every item, its icon and its name; kept in this browser ──
    const rt = `${tag} rail`;
    await page.locator("[data-rail-button]").click(); await page.waitForTimeout(250);
    let rs = await railState(page);
    ok(rs.cls && rs.kept === "1" && rs.side?.w === 72 && rs.head?.x === 72 && rs.label === "Expand sidebar" && rs.open === "false" && rs.btn?.w === 32 && rs.btn?.h === 32, `${rt}: the button collapses the sidebar to 72, the header moves beside it, and the button now opens it`, JSON.stringify({ cls: rs.cls, kept: rs.kept, side: rs.side, head: rs.head, label: rs.label, btn: rs.btn }));
    ok(rs.mark === "CW" && !rs.logo && !rs.who && !rs.contact, `${rt}: the mark stands for the logo; the person's name and the address line are put away`, JSON.stringify({ mark: rs.mark, logo: rs.logo, who: rs.who, contact: rs.contact }));
    ok(rs.items.length === MENU.length + 1 && rs.items.every((i) => i.icon && i.inside && i.fits && i.h === 48 && i.word.length > 0) && JSON.stringify(rs.items.map((i) => i.title)) === JSON.stringify([...MENU, "Help & support"]), `${rt}: every item keeps its icon and a short word, all one height, inside the rail, its full name as the title`, JSON.stringify(rs.items));
    over = await textOverlaps(page); ok(over.length === 0 && await noOverflow(page), `${rt}: no two text boxes overlap, no horizontal page scroll`, said(over));
    flat = await noHover(page, [["a rail item", page.locator(".clw-side-nav a:not(.on)")], ["Help", page.locator("[data-help-link]")], ["the open button", page.locator("[data-rail-button]")]]);
    ok(flat.length === 0, `${rt}: the rail's items and its button show a hover`, flat.join(", "));
    if (width !== 1440) await shot(page, `${OUT}/client-rail-account-${theme}-${width}.png`, width);
    // a full load: drawn collapsed from the start (the layout's inline script), and the frame takes the room
    await openClient(page, "/client", width);
    rs = await railState(page);
    const rfb = await page.locator(FRAME).boundingBox();
    ok(rs.cls && rs.side?.w === 72 && rs.label === "Expand sidebar" && rfb && Math.abs(rfb.x - 72) <= 1 && Math.abs(rfb.x + rfb.width - width) <= 1, `${rt}: after a reload the sidebar is still collapsed, and the frame fills the room beside it`, JSON.stringify({ side: rs.side, label: rs.label, frame: rfb ? `${Math.round(rfb.x)}+${Math.round(rfb.width)}` : "" }));
    ok(await fr.locator("[data-board] [data-fid]").count() >= 1 && await noOverflow(page) && await frameNoOverflow(page), `${rt}: the timeline draws in the wider frame, with no horizontal scroll`);
    await settled(page); await page.waitForTimeout(300);
    over = [...await textOverlaps(page, { ignore: ["iframe"] }), ...await frameOverlaps(page)];
    ok(over.length === 0, `${rt}: no two text boxes overlap on Timeline (shell and frame)`, said(over));
    ok(await page.locator(".clw-side-nav a.on").getAttribute("title") === "Timeline", `${rt}: Timeline is the item marked`);
    await shot(page, `${OUT}/client-rail-timeline-${theme}-${width}.png`, width);
    await page.locator("[data-rail-button]").click(); await page.waitForTimeout(250);
    rs = await railState(page);
    ok(!rs.cls && rs.kept === null && rs.side?.w === 248 && rs.head?.x === 248 && rs.label === "Collapse sidebar" && rs.logo && rs.who && rs.mark === "" && rs.items.every((i) => i.title === "" && i.h === 36), `${rt}: the button opens the sidebar again — 248, the logo, the names — and the choice is cleared`, JSON.stringify({ cls: rs.cls, kept: rs.kept, side: rs.side, label: rs.label }));
    await ctx.close();
  }
}

// a client on a phone (v3, 2026-11-13): the desk pages are a desk's. At 390 px Timeline, Flights, Account and the start
// page open the phone app in their place — in the top window, before any desk screen is drawn, once (no loop). Display
// settings stays, under a bar with a link back to the phone app. (What the phone app then draws is its own check's.)
{
  const PHONE_APP = "/digital-wall/phone/";
  // the phone app writes its own address without the last slash once it has started: the same place
  const atPhone = (x) => new URL(x).pathname.replace(/\/+$/, "") === PHONE_APP.replace(/\/+$/, "");
  // set before anything of the page runs: notes a desk screen drawn (and not held back) on a client address
  const watchDesk = () => {
    try {
      if (window.top !== window || !/^\/client(\/|$)/.test(location.pathname)) return;
      const look = () => { try { const root = document.querySelector(".cl-root"), shell = document.querySelector("[data-client-shell]"); if (root && shell && shell.getBoundingClientRect().height > 0 && getComputedStyle(root).visibility !== "hidden") sessionStorage.setItem("rig-desk-seen", location.pathname); } catch {} };
      new MutationObserver(look).observe(document, { childList: true, subtree: true });
      const tick = () => { look(); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    } catch {}
  };
  const phoneCtx = async () => { const ctx = await browser.newContext({ viewport: viewportOf(390), hasTouch: true, isMobile: true, deviceScaleFactor: 2 }); await ctx.addCookies([cookie(cs)]); return ctx; };
  for (const [from, to] of [["/client", PHONE_APP], ["/client/flights", `${PHONE_APP}?view=flights`], ["/client/account", `${PHONE_APP}#account`], ["/client/start", PHONE_APP]]) {
    const ctx = await phoneCtx(); await ctx.addInitScript(watchDesk);   // a new tab each time: the no-loop guard counts per tab
    const page = await ctx.newPage(); const navs = []; page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs.push(f.url()); });
    // the documents asked for (a page that only rewrites its own address — the portal's router, the phone app dropping the last slash — asks for none)
    const docs = []; page.on("request", (rq) => { try { if (rq.isNavigationRequest() && rq.frame() === page.mainFrame()) docs.push(rq.url()); } catch {} });
    await page.goto(`${B}${from}`, { waitUntil: "commit" }).catch(() => {});
    await page.waitForURL((x) => atPhone(x), { timeout: 20000 }).catch(() => {});
    await page.waitForLoadState("load").catch(() => {}); await page.waitForTimeout(1500);
    const first = navs.map((x) => new URL(x)).find((x) => x.pathname === PHONE_APP);
    ok(Boolean(first) && `${first.pathname}${first.search}${first.hash}` === to, `phone 390 ${from}: a client on a phone is sent to ${to}`, first ? `${first.pathname}${first.search}${first.hash}` : page.url());
    ok(atPhone(page.url()) && docs.filter((x) => new URL(x).pathname.startsWith("/client")).length === 1 && docs.filter(atPhone).length === 1, `phone 390 ${from}: sent once, and it stays there (no loop) — one client page asked for, then the phone app, once`, docs.map((x) => { const p = new URL(x); return `${p.pathname}${p.search}${p.hash}`; }).join(" → "));
    const seen = await page.evaluate(() => { try { return sessionStorage.getItem("rig-desk-seen"); } catch { return "storage refused"; } }).catch(() => "page gone");
    ok(seen === null, `phone 390 ${from}: no desk screen is drawn on the way (the page is held back until the phone app opens)`, seen);
    ok(await page.locator("[data-client-shell]").count() === 0, `phone 390 ${from}: the desk shell is not on the page they land on`);
    await ctx.close();
  }
  // a desk window made narrow goes the same way (the shell watches the width)
  {
    const ctx = await browser.newContext({ viewport: viewportOf(1440) }); await ctx.addCookies([cookie(cs)]); const page = await ctx.newPage();
    await openClient(page, "/client", 1440);
    ok(new URL(page.url()).pathname === "/client", "narrowing: at 1440 the desk Timeline stays where it is", page.url());
    await page.setViewportSize(viewportOf(390));
    await page.waitForURL((x) => atPhone(x), { timeout: 20000 }).catch(() => {});
    ok(atPhone(page.url()), "narrowing: the same window made 390 wide goes to the phone app", page.url());
    await ctx.close();
  }
  // Display settings on a phone: it stays, the frame under a 52 px bar whose link goes back to the phone app
  for (const theme of ["light", "dark"]) {
    const ctx = await phoneCtx(); await ctx.addInitScript(themed, theme); const page = await ctx.newPage(); const tag = `phone 390 ${theme} settings`;
    await page.goto(`${B}/client/settings`, { waitUntil: "load" });
    await page.waitForSelector("[data-client-shell]", { timeout: 20000 }).catch(() => {});
    await frameOf(page).locator("[data-client-settings]").waitFor({ timeout: 30000 }).catch(() => {});
    await settled(page); await page.waitForTimeout(1200);
    ok(new URL(page.url()).pathname === "/client/settings" && await frameOf(page).locator("[data-client-settings]").count() === 1, `${tag}: the page stays (it is not sent to the phone app) and draws the settings`, page.url());
    ok((await frameOf(page).locator("[data-client-surface]").getAttribute("data-client-surface").catch(() => null)) === "phone", `${tag}: the frame draws its phone surface`);
    const g = await page.evaluate(() => { const box = (q) => { const e = document.querySelector(q); if (!e || getComputedStyle(e).display === "none") return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
      const a = document.querySelector("[data-back-to-phone]"); return { bar: box("[data-phone-bar]"), back: box("[data-back-to-phone]"), href: a?.getAttribute("href") ?? "", words: (a?.textContent || "").trim(), side: box(".clw-side"), head: box(".clw-head"), frame: box("iframe[data-client-frame]"), vw: window.innerWidth, vh: window.innerHeight }; });
    ok(Boolean(g.bar) && g.bar.h === 52 && g.bar.y === 0 && g.bar.w === g.vw && g.side === null && g.head === null, `${tag}: a 52 px bar across the top; no sidebar and no desk header`, JSON.stringify({ bar: g.bar, side: g.side, head: g.head }));
    ok(Boolean(g.back) && g.href === PHONE_APP && g.words.length > 0 && g.back.h >= 44 && g.back.w >= 44, `${tag}: the bar's link goes back to the phone app, and is a full touch target`, JSON.stringify({ back: g.back, href: g.href, words: g.words }));
    ok(Boolean(g.frame) && Boolean(g.bar) && Math.abs(g.frame.y - 52) <= 1 && g.frame.w === g.vw && Math.abs(g.frame.y + g.frame.h - g.vh) <= 1, `${tag}: the frame fills the screen under the bar`, JSON.stringify(g.frame));
    ok(await noOverflow(page) && await frameNoOverflow(page), `${tag}: no horizontal scroll, on the page or in the frame`);
    // the zoom check (2026-11-10), kept for the one page a phone still opens here: nothing scales the viewport, and the
    // frame's viewport meta allows pinch (an accessibility rule)
    const z = { page: await page.evaluate(() => [visualViewport.scale, document.documentElement.clientWidth]), frame: await (frameDoc(page)?.evaluate(() => [visualViewport.scale, document.documentElement.clientWidth, document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? ""]) ?? [null, null, ""]) };
    ok(z.page[0] === 1 && z.page[1] === 390 && z.frame[0] === 1 && z.frame[1] === 390 && z.frame[2].length > 0 && !/user-scalable\s*=\s*no/i.test(z.frame[2]) && !/maximum-scale\s*=\s*1(\.0)?\b/i.test(z.frame[2]), `${tag}: the page and the frame are at scale 1 and 390 wide, and the frame's viewport meta does not forbid pinch zoom`, JSON.stringify(z));
    const over = [...await textOverlaps(page, { ignore: ["iframe"] }), ...await frameOverlaps(page, ["[data-view-preview]"])];
    ok(over.length === 0, `${tag}: no two text boxes overlap (bar and frame)`, said(over));
    await shot(page, `${OUT}/client-settings-bar-${theme}-390.png`, 390);
    await page.locator("[data-back-to-phone]").click(); await page.waitForURL((x) => atPhone(x), { timeout: 20000 }).catch(() => {});
    ok(atPhone(page.url()), `${tag}: the link opens the phone app`, page.url());
    await ctx.close();
  }
}

// Operators & aircraft (2026-11-10): a view filter saved on the account. One aircraft switched off is marked hidden,
// is in the client's own preferences, stays hidden after a reload, and Show all clears it — and the preferences.
{
  const prefs = async () => (await (await fetch(`${B}/api/client/prefs`, { headers: { cookie: cookieHeader(cs) } })).json()).prefs ?? {};
  await fetch(`${B}/api/client/prefs`, { method: "PUT", headers: { cookie: cookieHeader(cs), "content-type": "application/json" }, body: JSON.stringify({ hidden: { operators: [], registrations: [] } }) });
  const ctx = await browser.newContext({ viewport: viewportOf(1440) }); await ctx.addCookies([cookie(cs)]);
  const page = await ctx.newPage(); const fr = frameOf(page);
  await openClient(page, "/client", 1440);
  ok(await fr.locator("[data-hidden-chip]").count() === 0, "filter: nothing hidden to begin with");
  await fr.locator("[data-operators-button]").click(); await fr.locator("[data-operators-panel]").waitFor({ timeout: 10000 }).catch(() => {});
  ok(await fr.locator("[data-operators-panel]").count() === 1 && await fr.locator('[data-operators-panel] [data-op-switch="cwy-cwy"]').count() === 1 && await fr.locator('[data-operators-panel] [data-reg-switch="LY-TST"]').count() === 1, "filter: the panel lists their operator and LY-TST as switches");
  ok(await fr.locator('[data-reg-switch="LY-TST"]').getAttribute("aria-checked") === "true" && await fr.locator("[data-operators-panel] [data-show-all]").isDisabled(), "filter: the aircraft is on, Show all has nothing to do");
  await fr.locator('[data-reg-switch="LY-TST"]').click();
  await fr.locator("[data-hidden-chip]").waitFor({ timeout: 10000 }).catch(() => {});
  ok(await fr.locator('[data-reg-switch="LY-TST"]').getAttribute("aria-checked") === "false" && /1 aircraft hidden/.test(await fr.locator("[data-hidden-chip]").innerText().catch(() => "")), "filter: LY-TST switched off — the hidden chip says one aircraft is hidden");
  ok(await fr.locator('[data-operators-panel] [data-filter-save="ok"]').count() === 1 && await fr.locator('[data-operators-panel] [data-filter-save="failed"]').count() === 0 && await fr.locator("[data-operators-panel] [data-show-all]").isEnabled(), "filter: the panel says the choice is remembered, and Show all now has something to do");
  // a click beside the panel closes it (the scrim), the chip stays
  await fr.locator(".cwd-scrim").click({ position: { x: 8, y: 8 } }).catch(() => {}); await page.waitForTimeout(200);
  ok(await fr.locator("[data-operators-panel]").count() === 0 && await fr.locator("[data-hidden-chip]").count() === 1, "filter: a click beside the panel closes it; the hidden mark stays on the page");
  let saved = null; for (let i = 0; i < 40 && !saved; i += 1) { const p = await prefs(); if (p.hidden?.registrations?.includes("LY-TST")) saved = p; else await sleep(250); }
  ok(Boolean(saved) && saved.hidden.operators.length === 0, "filter: the account's preferences hold LY-TST under hidden registrations (and no operator)", JSON.stringify(saved?.hidden));
  await page.reload({ waitUntil: "load" }); await fr.locator('[data-client-surface="desk"]').waitFor({ timeout: 30000 }); await fr.locator("[data-hidden-chip]").waitFor({ timeout: 15000 }).catch(() => {});
  ok(await fr.locator("[data-hidden-chip]").count() === 1 && await fr.locator('[data-empty="all-hidden"]').count() >= 1, "filter: after a reload the aircraft is still hidden (their only one, so the board says every aircraft is hidden)");
  await fr.locator("[data-hidden-chip] [data-show-all]").click(); await fr.locator("[data-board] [data-fid]").first().waitFor({ timeout: 15000 }).catch(() => {});
  ok(await fr.locator("[data-hidden-chip]").count() === 0 && await fr.locator("[data-board] [data-fid]").count() >= 1, "filter: Show all brings the aircraft and its flights back");
  let cleared = null; for (let i = 0; i < 40 && !cleared; i += 1) { const p = await prefs(); if (p.hidden?.registrations?.length === 0) cleared = p; else await sleep(250); }
  ok(Boolean(cleared) && cleared.hidden.operators.length === 0, "filter: the preferences are empty again", JSON.stringify(cleared?.hidden));
  await ctx.close();
}

// the start page (2026-11-10): the one-time choice after the password. Flights chosen there lands on Flights and makes
// the root open Flights; Account switches it back to Timeline and the root opens Timeline; Decide later saves nothing.
{
  const prefs = async () => (await (await fetch(`${B}/api/client/prefs`, { headers: { cookie: cookieHeader(cs) } })).json()).prefs ?? {};
  const rootGoes = async () => { const res = await fetch(`${B}/`, { headers: { cookie: cookieHeader(cs) }, redirect: "manual" }); return `${res.status} ${new URL(res.headers.get("location") || "/none", B).pathname}`; };
  const ctx = await browser.newContext({ viewport: viewportOf(1440) }); await ctx.addCookies([cookie(cs)]); const page = await ctx.newPage();
  await page.goto(`${B}/client/start`, { waitUntil: "load" }); await page.waitForSelector("[data-client-start]", { timeout: 20000 }); await settled(page);
  ok(await page.locator('[data-start-choice="timeline"]').count() === 1 && await page.locator('[data-start-choice="flights"]').count() === 1 && await page.locator("[data-decide-later]").count() === 1, "start page: Timeline, Flights list and Decide later");
  ok((await page.locator("[data-client-shell]").getAttribute("data-menu")) === "/client /client/flights /client/account /client/settings", "start page: not a menu item (the menu stays the four)");
  await page.screenshot({ path: `${OUT}/client-start-1440.png`, fullPage: true });
  await page.locator('[data-start-choice="flights"]').click();
  await page.waitForURL((x) => new URL(x).pathname === "/client/flights", { timeout: 20000 }).catch(() => {});
  await frameOf(page).locator('[data-client-page="flights"]').waitFor({ timeout: 30000 }).catch(() => {});
  ok(new URL(page.url()).pathname === "/client/flights" && await frameOf(page).locator('[data-client-page="flights"]').count() === 1, "start page: choosing Flights lands on Flights", page.url());
  ok((await prefs()).start === "flights", "start page: the choice is saved on the account");
  ok((await rootGoes()) === "307 /client/flights", "start page: the root now sends them to Flights", await rootGoes());
  // Account: back to Timeline
  await page.goto(`${B}/client/account`, { waitUntil: "load" }); await page.waitForSelector('[data-card="start-page"]', { timeout: 20000 }); await settled(page);
  ok(await page.locator('[data-start-option="flights"]').getAttribute("aria-checked") === "true", "account: the start page card shows Flights as the choice");
  await page.locator('[data-start-option="timeline"]').click(); await page.locator("[data-start-note]").waitFor({ timeout: 15000 }).catch(() => {});
  ok(/Saved\. Timeline opens/.test(await page.locator("[data-start-note]").innerText().catch(() => "")) && await page.locator('[data-start-option="timeline"]').getAttribute("aria-checked") === "true", "account: Timeline chosen, said once saved", (await page.locator("[data-start-note]").innerText().catch(() => "")).trim());
  ok((await prefs()).start === "timeline" && (await rootGoes()) === "307 /client", "account: the root sends them to Timeline again", await rootGoes());
  // Decide later (on a desk: a phone is sent to the phone app and never sees this page): Timeline opens, the saved
  // choice stays as it was
  await page.goto(`${B}/client/start`, { waitUntil: "load" }); await page.waitForSelector("[data-client-start]", { timeout: 20000 }); await settled(page);
  ok(await noOverflow(page), "start page: no horizontal page scroll");
  await page.locator("[data-decide-later]").click(); await page.waitForURL((x) => new URL(x).pathname === "/client", { timeout: 20000 }).catch(() => {});
  ok(new URL(page.url()).pathname === "/client" && (await prefs()).start === "timeline", "start page: Decide later opens Timeline and changes nothing", page.url());
  await ctx.close();
}

// the client's Account page (2026-11-09; the v3 form 2026-11-13): the password change, in the form its button opens:
// refused in words, changed only with the current password, said only once done (the form then closes). Then signing out and in again, which lands on Timeline.
{
  const MOCK = "http://127.0.0.1:3996";   // the rig's mock mail service (as rig/client-onboarding-check.mjs)
  const NEW = "rig-access-check-only-changed-1";
  const sentBefore = MOCK ? (await (await fetch(`${MOCK}/_rig/sent`)).json()).length : 0;
  const other = await grant(EMAIL);   // a second device, signed in before the change
  const ctx = await browser.newContext({ viewport: viewportOf(1440) }); await ctx.addCookies([cookie(cs)]);
  const page = await ctx.newPage(); let dialogs = 0; page.on("dialog", async (d) => { dialogs += 1; await d.dismiss(); });
  try {
  await page.goto(`${B}/client/account`, { waitUntil: "load" }); await page.waitForSelector('[data-tab="account"]', { timeout: 15000 }); await settled(page);
  const cur = page.locator('input[name="current"]'), nxt = page.locator('input[name="next"]'), rep = page.locator('input[name="repeat"]'), go = page.locator("[data-change-password]");
  await page.locator("[data-open-password]").click(); await page.locator('[data-card="password"][data-password-form="open"]').waitFor({ timeout: 10000 });
  await go.click();
  ok(/Enter your current password/.test(await page.locator("[data-password-error]").innerText().catch(() => "")), "client account: an empty form is refused in words");
  await cur.fill(PASSWORD); await nxt.fill("short"); await go.click();
  ok(/at least 10 characters/.test(await page.locator("[data-password-error]").innerText().catch(() => "")), "client account: a short new password is refused");
  await nxt.fill(NEW); await rep.fill(`${NEW}-x`); await go.click();
  ok(/not the same/.test(await page.locator("[data-password-error]").innerText().catch(() => "")) && (await grant(EMAIL)).access_token, "client account: a new password typed two ways is refused, and nothing is changed");
  await cur.fill("rig-access-check-only-wrong"); await nxt.fill(NEW); await rep.fill(NEW); await go.click(); await page.locator("[data-password-error]").waitFor({ timeout: 15000 }).catch(() => {});
  ok(/isn't your current password/.test(await page.locator("[data-password-error]").innerText().catch(() => "")) && await page.locator("[data-password-changed]").count() === 0, "client account: a wrong current password is refused by the server, and nothing says changed");
  ok(await page.locator('[data-card="password"][data-password-form="open"]').count() === 1, "…the form stays open with what was typed");
  ok((await grant(EMAIL)).access_token, "…and the password is still the old one");
  await cur.fill(PASSWORD); await nxt.fill(NEW); await rep.fill(NEW); await go.click(); await page.locator("[data-password-changed]").waitFor({ timeout: 20000 }).catch(() => {});
  const said = await page.locator("[data-password-changed]").innerText().catch(() => "");
  ok(/Password changed\./.test(said) && /other devices are signed out/.test(said), "client account: the right current password changes it, and the page says so once the server has", said.slice(0, 120));
  ok(await page.locator('[data-card="password"][data-password-form="closed"]').count() === 1 && await page.locator('[data-card="password"] input').count() === 0 && await page.locator("[data-open-password]").count() === 1, "…the form is closed, nothing typed is left on the page");
  const withOld = await grant(EMAIL);
  const withNew = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: NEW }) })).json();
  ok(!withOld.access_token && Boolean(withNew.access_token), "…the old password no longer signs in; the new one does");
  const refreshed = await (await fetch(`${SB}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ refresh_token: other.refresh_token }) })).json();
  ok(!refreshed.access_token, "…the second device's session is ended (it cannot refresh)", refreshed.error_code ?? refreshed.msg ?? "");
  await page.reload({ waitUntil: "load" }); await page.waitForSelector('[data-tab="account"]', { timeout: 15000 }).catch(() => {});
  ok(new URL(page.url()).pathname === "/client/account", "…and this device stays signed in", page.url());
  if (MOCK) {
    let note = null; for (let i = 0; i < 40 && !note; i += 1) { note = (await (await fetch(`${MOCK}/_rig/sent`)).json()).slice(sentBefore).find((e) => [].concat(e.to).includes(EMAIL) && /password was changed/i.test(e.subject)); if (!note) await sleep(250); }
    ok(Boolean(note) && /^Clearway </.test(String(note?.from)) && /A note went to/.test(said), "…the client is told by email, from the brand's sender", note ? `${note.from} · ${note.subject}` : "none");
  }
  // signing out from the page, then the old password back for the rest of this check
  await page.locator("[data-signout]").click(); await page.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {});
  ok(new URL(page.url()).pathname === "/login", "client account: Sign out goes to the sign-in page", page.url());
  const after = await page.goto(`${B}/client/account`, { waitUntil: "load" });
  ok(new URL(page.url()).pathname === "/login" && after?.status() === 200, "…and the account page then asks for a sign-in");
  // the frame, opened signed out, says so and draws no flights
  await page.goto(`${B}/digital-wall/timeline/?in=client&page=timeline`, { waitUntil: "load" }); await page.waitForSelector("[data-client-signed-out]", { timeout: 20000 }).catch(() => {});
  ok(await page.locator("[data-client-signed-out]").count() === 1 && await page.locator("[data-client-surface]").count() === 0, "the frame's own address, signed out: the signed-out notice, no surface");
  // the sign-in page itself, typed as a person does, with the new password: Timeline is where this client lands (their choice)
  await page.goto(`${B}/login`, { waitUntil: "load" }); await settled(page);
  await page.locator('input[type="email"]').first().fill(EMAIL); await page.locator('input[type="password"]').first().fill(NEW); await page.keyboard.press("Enter");
  await page.waitForURL((x) => new URL(x).pathname.startsWith("/client"), { timeout: 20000 }).catch(() => {});
  await page.waitForSelector("[data-client-shell]", { timeout: 20000 }).catch(() => {});
  await frameOf(page).locator('[data-client-page="timeline"]').waitFor({ timeout: 30000 }).catch(() => {});
  ok(new URL(page.url()).pathname === "/client" && await frameOf(page).locator('[data-client-page="timeline"]').count() === 1, "client sign-in: the sign-in page, with the new password, lands on Timeline", page.url());
  ok(dialogs === 0, "client account: no browser dialog at any point", dialogs);
  } catch (e) { ok(false, "client account: the password walk ran to its end", String(e?.message ?? e).split("\n")[0]); }
  finally { await ctx.close().catch(() => {}); await svc(`/auth/v1/admin/users/${uid}`, { method: "PUT", body: JSON.stringify({ password: PASSWORD }) }); }   // the rig password back, whatever happened
  cs = await grant(EMAIL);
  ok(Boolean(cs.access_token), "(the rig password is back for the rest of this check)");
}

// the retired areas (2026-11-10): /client/airports and /client/documents are not pages of a client's any more, with or
// without the old switches on their row; a 404 in the client's own words
{
  const before = (await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=switches`)).json())[0]?.switches ?? [];
  const get = async (p) => { const res = await fetch(`${B}${p}`, { headers: { cookie: cookieHeader(cs) }, redirect: "manual" }); return { status: res.status, text: await res.text() }; };
  const r1 = await Promise.all(["/client/airports", "/client/documents"].map(get));
  ok(r1.every((x) => x.status === 404 && /data-client-notfound/.test(x.text)), "Airports and Documents: 404 to the client, in their own not-found page", r1.map((x) => x.status).join(" "));
  await svc(`/rest/v1/clients?user_id=eq.${uid}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ switches: [...new Set([...before, ...RETIRED_SWITCH_KEYS])] }) });
  await sleep(11_000);   // the client's scope is cached ten seconds
  try {
    const r2 = await Promise.all(["/client/airports", "/client/documents"].map(get));
    ok(r2.every((x) => x.status === 404), "…and still 404 with the retired switches written on their row (a retired switch grants nothing)", r2.map((x) => x.status).join(" "));
    const me = await (await fetch(`${B}/api/client/me`, { headers: { cookie: cookieHeader(cs) } })).json();
    ok(Array.isArray(me.switches) && !me.switches.some((k) => RETIRED_SWITCH_KEYS.includes(k)), "…and their own standing lists neither retired switch", (me.switches ?? []).join(","));
    const t = await get("/client");
    ok(t.status === 200 && /data-menu="\/client \/client\/flights \/client\/account \/client\/settings"/.test(t.text), "…and the menu stays the four", /data-menu="([^"]*)"/.exec(t.text)?.[1]);
  } finally {
    await svc(`/rest/v1/clients?user_id=eq.${uid}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ switches: before }) });
  }
}

// ask for access: the public page renders at both sizes
{
  const ctx = await browser.newContext({ viewport: viewportOf(390) }); const page = await ctx.newPage();
  await page.goto(`${B}/request-access`, { waitUntil: "load" }); await page.waitForSelector("[data-request-access]", { timeout: 20000 });
  ok(await page.getByLabel("Company *").count() === 1 && await page.locator("[data-you-are]").count() === 2 && await page.locator("[data-note]").count() === 1, "ask for access: name, company (required), email, You are, note — no password, no trip or registration field");
  ok(!(await page.content()).includes("trip number") && await page.getByText("Send request").count() === 1, "ask for access: the button says Send request");
  ok(await noOverflow(page), "ask for access 390: no horizontal scroll");
  await page.screenshot({ path: `${OUT}/client-request-390.png`, fullPage: true });
  await ctx.close();
  const l = await browser.newContext({ viewport: viewportOf(1440) }); const lp = await l.newPage();
  await lp.goto(`${B}/login`, { waitUntil: "load" }); await settled(lp);
  ok(await lp.locator("[data-client-ask]").count() === 1 && await lp.getByText("Ask for access").count() >= 1, "sign-in: the operators-and-brokers block with Ask for access");
  await lp.screenshot({ path: `${OUT}/client-signin-1440.png` });
  await l.close();
}

// ── Display settings (2026-11-11): the ops look cards on the client's own profile, desk and phone, light and dark.
// On a desk the way in is Account's button; on a phone the page is opened by its address (Account is the phone app's) ──
{
  cs = await grant(EMAIL);
  for (const [theme, width] of [["light", 1440], ["dark", 390]]) {
    const ctx = await browser.newContext({ viewport: viewportOf(width), colorScheme: theme, hasTouch: PHONE(width) });
    await ctx.addCookies([cookie(cs)]); await ctx.addInitScript(themed, theme);
    const page = await ctx.newPage();
    if (PHONE(width)) await page.goto(`${B}/client/settings`, { waitUntil: "load" });
    else {
      await page.goto(`${B}/client/account`, { waitUntil: "load" });
      await page.waitForSelector("[data-display-settings]", { timeout: 20000 }).catch(() => {});   // the account page streams in after the standing is read
      ok(await page.locator("[data-display-settings]").count() === 1, `${theme} ${width}: Account links to the display settings`, page.url());
      await page.locator("[data-display-settings]").click();
    }
    await page.waitForURL(/\/client\/settings/, { timeout: 15000 }).catch(() => {});
    await frameOf(page).locator("[data-client-settings]").waitFor({ timeout: 30000 });
    await frameOf(page).locator("[data-client-settings] .cws-cards > *", { hasText: /Wall font/ }).first().waitFor({ timeout: 30000 }).catch(() => {});   // the last card draws after its own reads
    const cards = await frameOf(page).locator("[data-client-settings] .cws-cards > *").evaluateAll((els) => els.map((el) => (el.querySelector("h2, h3, h4") || el).textContent.trim().slice(0, 40)));
    ok(/Display scale/.test(cards.join("|")) && /Hour spacing/.test(cards.join("|")) && /Vertical sizing/.test(cards.join("|")) && /Horizontal sizing/.test(cards.join("|")) && /Chips/.test(cards.join("|")) && /Colours|Colors/i.test(cards.join("|")) && /font/i.test(cards.join("|")), `${theme} ${width}: the ops look cards are all there (scale, hour spacing, vertical, horizontal, chips, colours, font)`, cards.join(" | ").slice(0, 160));
    ok(await frameOf(page).locator("[data-view-preview]").count() === 1 && await frameOf(page).locator("[data-reset-view]").count() === 1, `${theme} ${width}: a live preview and a Reset to default button`);
    // the preview is the client's own timeline: its hour row and at least one of their flights are inside its box
    const pv = await frameDoc(page)?.evaluate(() => {
      const p = document.querySelector("[data-view-preview]"); if (!p) return null; const box = p.getBoundingClientRect();
      const inBox = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > box.left + 1 && r.left < box.right - 1 && r.bottom > box.top + 1 && r.top < box.bottom - 1; };
      return { hours: [...p.querySelectorAll("[data-hour-ms]")].filter(inBox).length, flights: [...p.querySelectorAll("[data-fid]")].filter(inBox).length, width: Math.round(box.width), height: Math.round(box.height) };
    }).catch(() => null);
    ok(Boolean(pv) && pv.hours >= 2 && pv.flights >= 1, `${theme} ${width}: the preview shows hours and at least one of the client's flights`, JSON.stringify(pv));
    // the page scrolls (2026-11-12: it could not): the last section's reset button comes into view by wheel, and the
    // side list jumps to a section on the desk; on the phone the sections fold and the last one opens
    const fd = frameDoc(page);
    if (PHONE(width)) { await frameOf(page).locator('[data-settings-section="font"] .cws-section-toggle').click(); }
    else { await frameOf(page).locator('[data-jump="font"]').click(); await page.waitForTimeout(700); }
    if (fd) await fd.evaluate(() => { document.querySelector('[data-reset-section="font"]')?.scrollIntoView({ block: "center" }); }); await page.waitForTimeout(400);
    const reach = fd ? await fd.evaluate(() => { const b = document.querySelector('[data-reset-section="font"]'); if (!b) return null; const r = b.getBoundingClientRect(); const p = document.querySelector("[data-view-preview]")?.getBoundingClientRect(); return { inView: r.top >= (p ? p.bottom : 0) && r.bottom <= window.innerHeight, scrollY: window.scrollY, docScrolls: getComputedStyle(document.documentElement).overflowY !== "hidden" }; }) : null;
    ok(Boolean(reach?.inView) && reach.docScrolls && reach.scrollY > 0, `${theme} ${width}: the last section (Font) is reachable by scrolling, and the document itself scrolls`, JSON.stringify(reach));
    ok(new URL(page.url()).pathname === "/client/settings" && (PHONE(width) ? await page.locator("[data-phone-bar]").isVisible() && await page.locator(".clw-side").isHidden() : await page.locator(".clw-side-nav a.on").innerText().then((t) => t.trim() === "Settings", () => false) && /Settings/.test(await page.locator("[data-client-crumb]").innerText())), `${theme} ${width}: ${PHONE(width) ? "under the phone bar, with no sidebar" : "Settings is marked in the sidebar and named in the crumb"}`, page.url());
    ok((PHONE(width) ? await frameOf(page).locator('[data-reset-section="font"]').count() === 1 : await frameOf(page).locator("[data-reset-section]").count() === 7) && await frameOf(page).locator("[data-back-to-timeline]").count() === (PHONE(width) ? 0 : 1), `${theme} ${width}: ${PHONE(width) ? "the open section has its own reset (the bar carries the way back)" : "a reset for each of the seven sections, and a way back to the timeline"}`, await frameOf(page).locator("[data-reset-section]").count());
    const sections = await frameOf(page).locator("[data-settings-section]").evaluateAll((els) => els.map((e) => e.getAttribute("data-settings-section")));
    ok(sections.join(",") === "scale,hour,vertical,horizontal,chips,colours,font", `${theme} ${width}: the ops wall's sections, in its order`, sections.join(","));
    if (!PHONE(width)) { const stuck = fd ? await fd.evaluate(() => { const p = document.querySelector("[data-view-preview]"); const r = p.getBoundingClientRect(); return r.top >= 0 && r.top < 80; }) : false; ok(stuck, `${theme} ${width}: the preview stays in view while scrolled to the last section`); }
    // one section's reset puts only its keys back
    await fetch(`${B}/digital-wall/api/client/view`, { method: "PUT", headers: { cookie: cookieHeader(cs), "content-type": "application/json" }, body: JSON.stringify({ settings: { scale: 1.7, timeZoom: 1.4 } }) });
    await page.reload({ waitUntil: "load" }); await frameOf(page).locator("[data-client-settings]").waitFor({ timeout: 30000 });
    if (PHONE(width)) await frameOf(page).locator('[data-settings-section="hour"] .cws-section-toggle').click();
    await frameOf(page).locator('[data-reset-section="hour"]').click(); await frameOf(page).locator("[data-reset-said]").waitFor({ timeout: 15000 }).catch(() => {});
    const afterSec = await fetch(`${B}/digital-wall/api/client/view`, { headers: { cookie: cookieHeader(cs) } }).then((r) => r.json());
    ok(afterSec.settings?.timeZoom === afterSec.defaults?.timeZoom && afterSec.settings?.scale === 1.7, `${theme} ${width}: Reset this section puts back only that section (hour spacing), the scale stays`, JSON.stringify({ timeZoom: afterSec.settings?.timeZoom, scale: afterSec.settings?.scale }));
    // a change saves on the account: set the scale through the slider's own route and read it back at the wall
    const before = await fetch(`${B}/digital-wall/api/client/view`, { headers: { cookie: cookieHeader(cs) } }).then((r) => r.json());
    const put = await fetch(`${B}/digital-wall/api/client/view`, { method: "PUT", headers: { cookie: cookieHeader(cs), "content-type": "application/json" }, body: JSON.stringify({ settings: { scale: 1.55, upcomingHorizonHours: 99 } }) }).then((r) => r.json());
    const after = await fetch(`${B}/digital-wall/api/client/view`, { headers: { cookie: cookieHeader(cs) } }).then((r) => r.json());
    ok(before.ok && put.ok && after.settings?.scale === 1.55 && after.source === "account", `${theme} ${width}: a saved setting is read back from the client's own profile`, JSON.stringify({ before: before.settings?.scale, after: after.settings?.scale, source: after.source }));
    ok(!("upcomingHorizonHours" in (after.settings ?? {})) && put.settings?.upcomingHorizonHours === undefined, `${theme} ${width}: the visibility window is not a client's to set (ignored)`);
    const theirs = await fetch(`${B}/digital-wall/api/display/settings`, { headers: { cookie: cookieHeader(cs) } });
    ok(theirs.status === 404, `${theme} ${width}: the ops settings route stays 404 to a client`, theirs.status);
    await page.reload({ waitUntil: "load" }); await frameOf(page).locator("[data-client-settings]").waitFor({ timeout: 30000 }); await page.waitForTimeout(600);
    await shot(page, `${OUT}/client-settings-${theme}-${width}.png`, width, { whole: true });
    const reset = await fetch(`${B}/digital-wall/api/client/view`, { method: "DELETE", headers: { cookie: cookieHeader(cs) } }).then((r) => r.json());
    ok(reset.ok && reset.source === "default" && reset.settings?.scale !== 1.55, `${theme} ${width}: Reset puts the ops wall's default back`, JSON.stringify({ scale: reset.settings?.scale, source: reset.source }));
    await ctx.close();
  }
}

// ── The status screens (2026-11-11): one shared screen for not-found, refused, for-admins and the link states. On a
// desk a centred card; on a phone (v3, 2026-11-13) the phone layout: a 52 px logo bar, an icon, a code line, the
// headline, the words, one 48 px button and a footer with the company's name ──
{
  const shots = [];
  for (const [theme, width] of [["light", 1440], ["dark", 1440], ["light", 390], ["dark", 390]]) {
    const ctx = await browser.newContext({ viewport: viewportOf(width), colorScheme: theme, hasTouch: PHONE(width) });
    await ctx.addInitScript(themed, theme);
    const page = await ctx.newPage();
    // `alone`: the screen is the whole page (the staff not-found is drawn inside the staff frame, under its own bar)
    const see = async (path, kind, what, who = null, code = null, alone = true) => {
      if (who) await ctx.addCookies([cookie(who)]);
      await page.goto(`${B}${path}`, { waitUntil: "load" });
      await page.waitForSelector(`[data-status-screen="${kind}"]`, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(200);
      const r = await page.evaluate((k) => {
        const el = document.querySelector(`[data-status-screen="${k}"]`); if (!el) return null;
        const part = (q) => { const e = el.querySelector(q); if (!e) return null; const c = getComputedStyle(e); if (c.display === "none") return null; const b = e.getBoundingClientRect(); return b.height > 0 ? { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), size: parseFloat(c.fontSize), weight: Number(c.fontWeight), text: (e.textContent || "").replace(/\s+/g, " ").trim() } : null; };
        const a = el.querySelector("[data-status-action]"); const logo = el.querySelector("svg[role=img]"); const lc = logo ? getComputedStyle(logo) : null;
        const b = el.getBoundingClientRect(), p = el.parentElement.getBoundingClientRect();
        return { drawn: document.documentElement.getAttribute("data-theme") || "", full: Boolean(el.closest("[data-status-page]")), title: el.querySelector("h1")?.textContent ?? "", action: a?.textContent ?? "", href: a?.getAttribute("href") ?? "", logo: Boolean(logo), logoColor: lc?.color ?? "", logoH: logo ? Math.round(logo.getBoundingClientRect().height) : 0,
          centred: Math.abs((b.left + b.width / 2) - (p.left + p.width / 2)) < 8,   // centred in its container (inside the staff frame, the content area; alone, the page)
          card: { w: Math.round(b.width), radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 }, vw: window.innerWidth, vh: window.innerHeight,
          brand: part("[data-status-brand]"), icon: part("[data-status-icon]"), code: part("[data-status-code]"), words: part("[data-status-words]"), h1: part("h1"), line: part("[data-status-line]"), button: part("[data-status-action]"), foot: part("[data-status-foot]") };
      }, kind);
      ok(Boolean(r) && r.logo && r.title.length > 0 && r.action.length > 0 && r.centred, `${theme} ${width}: ${what} — one status screen, centred, with the logo, a headline and one button`, r ? `${r.title} → ${r.action} ${r.href}` : "no status screen");
      if (r && !(PHONE(width) && r.full)) ok(r.icon === null && r.code === null && r.foot === null && Boolean(r.words) && r.card.radius > 0, `${theme} ${width}: ${what} — the desk card as it was (no phone icon, code line or footer)`, JSON.stringify({ icon: r.icon, code: r.code, foot: r.foot, radius: r.card.radius }));
      if (r && PHONE(width) && r.full) {
        ok(Boolean(r.brand) && Math.abs(r.brand.h - 52) <= 1 && Math.abs(r.logoH - 20) <= 1 && r.card.radius === 0 && (!alone || (r.brand.top <= 1 && r.card.w === r.vw)), `${theme} ${width}: ${what} — the phone layout: a 52 px logo bar${alone ? " across the top" : ""}, the logo 20 px, no card`, JSON.stringify({ brand: r.brand, logoH: r.logoH, card: r.card }));
        ok(Boolean(r.icon) && Boolean(r.code) && r.words === null && (code ? r.code.text === code : r.code.text.length > 0 && r.code.text === r.code.text.toUpperCase()), `${theme} ${width}: ${what} — an icon, then the code line${code ? ` "${code}"` : " in capitals"}`, r.code?.text ?? "no code line");
        ok(Boolean(r.h1) && r.h1.size === 22 && r.h1.weight === 600 && Boolean(r.line) && r.line.size === 16, `${theme} ${width}: ${what} — the headline 22 px semibold, the words 16 px`, JSON.stringify({ h1: r.h1 && [r.h1.size, r.h1.weight], line: r.line?.size }));
        ok(Boolean(r.button) && r.button.h === 48 && r.button.size === 16, `${theme} ${width}: ${what} — the one button is 48 px tall`, JSON.stringify(r.button));
        ok(Boolean(r.foot) && r.foot.text.includes("Clearway Handling & Operations") && (!alone || r.foot.bottom >= r.vh - 2), `${theme} ${width}: ${what} — a footer with the company's name${alone ? ", at the foot of the screen" : ""}`, JSON.stringify(r.foot));
        const order = [r.brand, r.icon, r.code, r.h1, r.line, r.button, r.foot].map((x) => x?.top ?? -1);
        ok(order.every((t, i) => t >= 0 && (i === 0 || t > order[i - 1])), `${theme} ${width}: ${what} — top to bottom: logo bar, icon, code, headline, words, button, footer`, order.join(" "));
        ok(await noOverflow(page), `${theme} ${width}: ${what} — no horizontal page scroll`);
      }
      const over = await textOverlaps(page); ok(over.length === 0, `${theme} ${width} ${kind}: the status screen overlaps nothing`, said(over));
      if (r) shots.push({ kind, logoColor: r.logoColor, theme: r.drawn === "dark" || r.drawn === "light" ? r.drawn : theme, asked: theme });   // a staff page follows the theme saved on the account, whatever this browser asked for
      await page.screenshot({ path: `${OUT}/status-${kind}-${theme}-${width}.png` });
      return r;
    };
    // staff see the portal's not-found and forbidden; a client gets their own not-found for anything outside their world
    const nf = await see("/no-such-page-at-all", "not-found", "a page that does not exist (staff)", admin, "404 · NOT FOUND", false);
    ok(nf?.href === "/", "the not-found button goes to the start (the person's own front door)", nf?.href);
    await see("/forbidden", "forbidden", "a page a role does not cover (staff)", admin, "403 · NO ACCESS");
    await ctx.clearCookies();
    const cnf = await see("/client/airports", "client-not-found", "a client reaching a page outside their account", cs, "404 · NOT FOUND");
    ok(cnf?.href === "/" && /Your flights/.test(cnf?.action ?? ""), "the client's not-found button is Your flights, to their start page", cnf?.action);
    ok(await page.locator("script").count() === 0, `${theme} ${width}: the client's not-found page carries no script`);
    await ctx.clearCookies();
    await see("/welcome?token=not-a-real-token", "link-unknown", "a set-password link nobody knows");
    await ctx.close();
  }
  const dark = shots.filter((x) => x.theme === "dark"), light = shots.filter((x) => x.theme === "light");
  const wrongLogo = [...dark.filter((x) => !(lum(x.logoColor) > 160)), ...light.filter((x) => !(lum(x.logoColor) < 100))];
  ok(dark.length > 0 && light.length > 0 && wrongLogo.length === 0, "the Clearway logo on the status screens is light on every screen drawn dark and dark on every screen drawn light",
    `${dark.length} dark · ${light.length} light · wrong: ${wrongLogo.map((x) => `${x.kind} ${x.theme} ${x.logoColor}`).join(", ") || "none"} · drawn in the account's theme, not the one asked: ${shots.filter((x) => x.asked !== x.theme).map((x) => x.kind).join(", ") || "none"}`);
}

// ── Nothing may overlap (2026-11-12; the v3 pages 2026-11-13): every client desk page at 1280, 1440 and 1920, light
// and dark — Timeline, Flights, Account, Display settings, the start page — with the board full and with every aircraft
// hidden (the empty words in the card). (The panels, the no-match screen, the password form, Display settings on a
// phone and the status screens are checked where they are walked, above.) ──
{
  cs = await grant(EMAIL);
  const PAGES = ["/client", "/client/flights", "/client/account", "/client/settings", "/client/start"];
  const IN_FRAME = ["/client", "/client/flights", "/client/settings"];
  for (const theme of ["light", "dark"]) for (const width of DESK) {
    const ctx = await browser.newContext({ viewport: viewportOf(width), colorScheme: theme });
    await ctx.addCookies([cookie(cs)]); await ctx.addInitScript(themed, theme);
    const page = await ctx.newPage();
    for (const path of PAGES) {
      await page.goto(`${B}${path}`, { waitUntil: "load" });
      await page.waitForSelector("[data-client-shell]", { timeout: 20000 }).catch(() => {});
      if (IN_FRAME.includes(path)) { await frameOf(page).locator("[data-client-surface]").waitFor({ timeout: 30000 }).catch(() => {}); await frameOf(page).locator("[data-board] [data-fid], [data-flight-row], [data-client-settings]").first().waitFor({ timeout: 30000 }).catch(() => {}); }
      else await page.waitForSelector('[data-tab="account"], [data-client-start]', { timeout: 20000 }).catch(() => {});
      if (path === "/client/settings") await frameOf(page).locator("[data-client-settings] .cws-cards > *", { hasText: /Wall font/ }).first().waitFor({ timeout: 30000 }).catch(() => {});
      await settled(page); await page.waitForTimeout(400);
      const shell = await textOverlaps(page, { ignore: ["iframe"] });
      const fd = IN_FRAME.includes(path) ? frameDoc(page) : null; const inner = fd ? await frameOverlaps(page, ["[data-view-preview]"]) : [];   // the sticky preview is an overlay by design
      const clipped = fd ? await clippedText(fd) : [];
      ok((!IN_FRAME.includes(path) || Boolean(fd)) && shell.length === 0 && inner.length === 0, `${theme} ${width} ${path}: no two text boxes overlap (shell and frame)`, said([...shell, ...inner]));
      ok(clipped.length === 0, `${theme} ${width} ${path}: no text is cut without an ellipsis`, clipped.map((c) => `"${c.t}" +${c.over}px`).join(" · "));
      ok(await noOverflow(page) && (!fd || await frameNoOverflow(page)), `${theme} ${width} ${path}: no horizontal scroll`);
      if (path === "/client/settings") {
        const uneven = await unevenButtons(fd, [".cws-side button", "[data-reset-section]", ".cwd-btn"]); ok(uneven.length === 0, `${theme} ${width} ${path}: every button class is one size`, uneven.join(", "));
        const flat = await noHover(page, [["a side-list item", frameOf(page).locator("[data-jump]:not(.is-on)")], ["Reset to default", frameOf(page).locator("[data-reset-view]")], ["a section's reset", frameOf(page).locator("[data-reset-section]")], ["Back to Timeline", frameOf(page).locator("[data-back-to-timeline]")]]);
        ok(flat.length === 0, `${theme} ${width} ${path}: the buttons show a hover`, flat.join(", "));
      }
      if (path === "/client/start") {
        await shellChecks(page, `${theme} ${width} ${path}`, null, "Start page", theme, contact);
        const st = await page.evaluate(() => { const cs = [...document.querySelectorAll("[data-start-choice]")].map((e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) }; }); return { cs, vw: window.innerWidth }; });
        ok(st.cs.length === 2 && st.cs[0].w === st.cs[1].w && (st.cs[0].top !== st.cs[1].top || st.cs[0].h === st.cs[1].h), `${theme} ${width} ${path}: the two choices are one size`, JSON.stringify(st.cs));
        const flat = await noHover(page, [["a choice", page.locator("[data-start-choice]")], ["Decide later", page.locator("[data-decide-later]")]]);
        ok(flat.length === 0, `${theme} ${width} ${path}: the choices and Decide later show a hover`, flat.join(", "));
        await page.setViewportSize({ width, height: 480 }); await page.waitForTimeout(300);
        const sc = await scrollsToEnd(page, "[data-decide-later]"); ok(scrolled(sc) && sc.tall, `${theme} ${width} ${path}: on a short window the page scrolls to Decide later`, JSON.stringify(sc));
        await page.setViewportSize(viewportOf(width)); await page.waitForTimeout(300);
        await shot(page, `${OUT}/client-start-${theme}-${width}.png`, width, { whole: true });
      }
    }
    // the empty board: hide every aircraft, the words sit in the timeline card, the chip says what is hidden
    {
      await page.goto(`${B}/client`, { waitUntil: "load" }); const fr = frameOf(page);
      await fr.locator("[data-board] [data-fid]").first().waitFor({ timeout: 30000 }).catch(() => {});
      await fr.locator("[data-operators-button]").click(); await fr.locator("[data-op-switch]").first().waitFor({ timeout: 10000 }).catch(() => {});
      const ops = await fr.locator("[data-op-switch]").count(); for (let i = 0; i < ops; i++) { const sw = fr.locator("[data-op-switch]").nth(i); if ((await sw.getAttribute("aria-checked")) === "true") await sw.click(); }
      await fr.locator('[data-empty="all-hidden"]').first().waitFor({ timeout: 15000 }).catch(() => {});
      await settled(page); await page.waitForTimeout(300);
      const fd = frameDoc(page);
      const open = fd ? await textOverlaps(fd, { root: "[data-operators-panel]" }) : [];
      ok(Boolean(fd) && open.length === 0, `${theme} ${width}: the panel with every switch off overlaps nothing`, said(open));
      await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(250);
      ok(await fr.locator("[data-operators-panel]").count() === 0, `${theme} ${width}: the panel is closed before the empty board is read`);
      const inner = fd ? await frameOverlaps(page) : [];
      const geo = fd ? await fd.evaluate(() => { const e = document.querySelector('[data-empty="all-hidden"]'); const b = document.querySelector('[data-card="timeline"]'); const chip = document.querySelector("[data-hidden-chip]"); return e && b ? { emptyH: Math.round(e.getBoundingClientRect().height), boardH: Math.round(b.getBoundingClientRect().height), chip: (chip?.textContent || "").replace(/\s+/g, " ").trim(), board: document.querySelectorAll("[data-board]").length, cta: document.querySelectorAll('[data-empty="all-hidden"] [data-show-all]').length } : null; }) : null;
      ok(inner.length === 0, `${theme} ${width}: the empty board (every aircraft hidden) overlaps nothing`, said(inner));
      ok(Boolean(geo) && geo.boardH >= 200 && /hidden/.test(geo.chip) && geo.cta === 1, `${theme} ${width}: the empty board keeps a sensible height, says what is hidden and offers Show all`, JSON.stringify(geo));
      const uneven = fd ? await unevenButtons(fd, FRAME_BUTTONS) : ["no frame"]; ok(uneven.length === 0, `${theme} ${width}: the empty board — every button class is one size`, uneven.join(", "));
      const flat = await noHover(page, [["Show all (the chip)", fr.locator("[data-hidden-chip] [data-show-all]")], ["Show all (the card)", fr.locator('[data-empty="all-hidden"] [data-show-all]')]]);
      ok(flat.length === 0, `${theme} ${width}: the empty board — both Show all buttons show a hover`, flat.join(", "));
      if (width === 1440) await shot(page, `${OUT}/overlap-empty-${theme}-${width}.png`, width);
      await fr.locator('[data-empty="all-hidden"] [data-show-all], [data-hidden-chip] [data-show-all]').first().click().catch(() => {});
      await fr.locator("[data-board] [data-fid]").first().waitFor({ timeout: 15000 }).catch(() => {});
      ok(await fr.locator("[data-hidden-chip]").count() === 0 && await fr.locator("[data-board] [data-fid]").count() >= 1, `${theme} ${width}: Show all brings the board back`);
    }
    await ctx.close();
  }
  // leave the account's filter empty, whatever happened above
  await fetch(`${B}/api/client/prefs`, { method: "PUT", headers: { cookie: cookieHeader(cs), "content-type": "application/json" }, body: JSON.stringify({ hidden: { operators: [], registrations: [] } }) }).catch(() => {});
}

// change, then remove through the page: the row stays, emptied
{
  const ctx = await browser.newContext({ viewport: viewportOf(1440) }); await ctx.addCookies([cookie(admin)]); const page = await ctx.newPage();
  await page.goto(`${B}/admin/clients`, { waitUntil: "load" }); await page.waitForSelector("[data-client-approved]", { timeout: 20000 }); await settled(page);
  await page.locator("[data-change]").first().click(); await page.waitForSelector("[data-client-editor]", { timeout: 10000 });
  await page.locator('[data-switch="weather"]').click(); await page.locator("[data-approve]").click(); await settled(page);
  const changed = await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=switches`)).json();
  ok(!changed[0]?.switches.includes("weather"), "Change: a switch turned off is saved", JSON.stringify(changed[0]?.switches));
  ok(await page.locator('[data-decision="changed"]').count() >= 1, "the decision log shows CHANGED");
  await page.locator("[data-change]").first().click(); await page.waitForSelector("[data-client-editor]", { timeout: 10000 });
  await page.getByRole("button", { name: "Remove access" }).first().click(); await settled(page);
  ok(await page.locator("[data-remove-confirm]").isDisabled(), "Remove: confirm is disabled until the company is typed");
  await page.getByLabel("Company name to confirm").fill(COMPANY);
  ok(await page.locator("[data-remove-confirm]").isEnabled(), "Remove: typing the company enables it");
  await page.screenshot({ path: `${OUT}/client-admin-remove.png` });
  await page.locator("[data-remove-confirm]").click(); await settled(page);
  const gone = await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=status,scope,switches`)).json();
  ok(gone[0]?.status === "removed" && gone[0]?.scope.length === 0 && gone[0]?.switches.length === 0, "Removed: the row stays, emptied", JSON.stringify(gone[0]));
  const au = await (await svc(`/auth/v1/admin/users/${uid}`)).json();
  ok(au.app_metadata?.is_approved === false && au.app_metadata?.client_status === "removed", "Removed: the account is not approved, status removed", JSON.stringify(au.app_metadata));
  cs = await grant(EMAIL);
  const c2 = await browser.newContext({ viewport: viewportOf(1440) }); await c2.addCookies([cookie(cs)]); const p2 = await c2.newPage();
  const resp = await p2.goto(`${B}/`, { waitUntil: "load" });
  ok(p2.url().includes("/client/removed") && resp && resp.status() === 200, "the removed client lands on the removed page", p2.url());
  // the client's layout reads their standing on the server (2026-11-04), so the page streams in after a blank skeleton: wait for it
  await p2.waitForSelector("[data-client-hold]", { timeout: 15000 }).catch(() => {});
  ok(await p2.locator("[data-client-hold]").count() === 1 && await p2.locator("[data-cw-sidebar]").count() === 0 && await p2.locator("[data-client-shell]").count() === 0, "the removed page: shell-less (no portal shell, no client shell, no menu), with Sign out");
  await p2.screenshot({ path: `${OUT}/client-removed-1440.png` });
  const held = (p) => p.evaluate(() => { const drawn = (q) => { const e = document.querySelector(q); return !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0; }; const b = document.querySelector("[data-status-action]")?.getBoundingClientRect();
    return { foot: drawn("[data-status-foot]"), footHref: document.querySelector("[data-status-foot] a")?.getAttribute("href") ?? "", note: drawn("[data-status-note] [data-client-contact]"), noteHref: document.querySelector("[data-status-note] [data-client-contact] a")?.getAttribute("href") ?? "", email: drawn("[data-client-email]"), code: drawn("[data-status-code]"), icon: drawn("[data-status-icon]"), button: b ? Math.round(b.height) : 0 }; });
  await p2.waitForSelector("[data-client-email]", { timeout: 15000 }).catch(() => {});
  const hd = await held(p2);
  ok(hd.note && hd.noteHref === `mailto:${contact}` && !hd.foot && !hd.code && !hd.icon && hd.email, "the removed page on a desk: the card as it was — their own email and the address for questions under the button", JSON.stringify(hd));
  // on a phone the same page is the phone status layout: the address moves to the footer (and is not said twice)
  const c3 = await browser.newContext({ viewport: viewportOf(390), hasTouch: true, isMobile: true }); await c3.addCookies([cookie(cs)]); const p3 = await c3.newPage();
  await p3.goto(`${B}/`, { waitUntil: "load" }); await p3.waitForSelector("[data-client-hold]", { timeout: 15000 }).catch(() => {}); await p3.waitForSelector("[data-client-email]", { timeout: 15000 }).catch(() => {}); await p3.waitForTimeout(1200);
  ok(new URL(p3.url()).pathname === "/client/removed" && await p3.locator("[data-client-shell]").count() === 0, "the removed page on a phone: it stays (a holding page is not sent to the phone app)", p3.url());
  const hp = await held(p3);
  ok(hp.foot && hp.footHref === `mailto:${contact}` && !hp.note && hp.email && hp.code && hp.icon && hp.button === 48, "the removed page on a phone: the phone status layout — icon, code line, a 48 px button, their own email, the address in the footer only", JSON.stringify(hp));
  const ho = await textOverlaps(p3); ok(ho.length === 0 && await noOverflow(p3), "the removed page on a phone: nothing overlaps, no horizontal scroll", said(ho));
  await shot(p3, `${OUT}/client-removed-390.png`, 390);
  await c3.close();
  await c2.close(); await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
