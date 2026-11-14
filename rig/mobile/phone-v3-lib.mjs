// Shared by the two phone app suites (rig/mobile/phone-v3-check.mjs for staff, phone-v3-client-check.mjs for a client):
// opening the app at /digital-wall/phone/, the audit every phone screen must pass, and the source checks.
// The audit looks at ONE layer (the timeline, the open flight, a page, a sheet): the app keeps the screen below
// mounted, so a whole-document walk would compare a page's text with the timeline under it.
import fs from "node:fs";
import path from "node:path";
import { settled } from "../lib/settle.mjs";
import { clippedText } from "../lib/overlap.mjs";

export const APP = "/digital-wall/phone/";
export const OUT = "rig/.scratch/shots"; fs.mkdirSync(OUT, { recursive: true });
export const COMBOS = [["light", 390], ["dark", 360], ["dark", 390], ["light", 360]];
export const heightOf = (width) => (width === 360 ? 780 : 844);

export function makeOk() {
  const state = { failures: 0, n: 0 };
  const ok = (c, what, d = "") => { state.n += 1; console.log(`${c ? "PASS" : "FAIL"}  ${what}${d !== "" && d != null ? `  · ${String(d).slice(0, 260)}` : ""}`); if (!c) state.failures += 1; };
  return { ok, state };
}

/** A phone context: touch, a theme, and the 60 s timers (the feed's poll, the clock) kept so a check can fire them now. */
export async function phoneContext(browser, { theme = "light", width = 390, storage = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: heightOf(width) }, deviceScaleFactor: 2, colorScheme: theme, hasTouch: true, isMobile: true });
  await ctx.addInitScript(({ t, storage }) => {
    try { if (!sessionStorage.getItem("rig-seeded")) { sessionStorage.setItem("rig-seeded", "1"); if (t) localStorage.setItem("cw-theme", t); for (const [k, v] of Object.entries(storage || {})) localStorage.setItem(k, v); } } catch { /* a private window */ }
    const real = window.setInterval; window.__rigPolls = [];
    window.setInterval = (fn, ms, ...a) => { if (ms === 60000 && typeof fn === "function") window.__rigPolls.push(fn); return real(fn, ms, ...a); };
  }, { t: theme, storage });
  return ctx;
}

const DRAWN = "[data-pill], [data-flight-row], [data-empty], [data-feed-failed], [data-onboarding], [data-status-screen], [data-no-session]";
/** Opens an address and waits for the phone app to have drawn its first screen. Errors of the page are collected. */
export async function openApp(ctx, base, pathAndQuery = APP, { wait = DRAWN } = {}) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|boundary probe|The above error occurred|ui-error/.test(m.text())) errors.push(`console: ${m.text().slice(0, 160)}`); });
  await page.goto(`${base}${pathAndQuery}`, { waitUntil: "load" });
  await page.waitForSelector("[data-phone-app]", { timeout: 30000 }).catch(() => {});
  if (wait) await page.waitForSelector(wait, { timeout: 30000 }).catch(() => {});
  await settled(page);
  return { page, errors };
}

/** One tap (a touch, as a finger gives it), then wait for what it should bring. */
export async function tap(page, sel, then = null, { timeout = 15000 } = {}) {
  const loc = typeof sel === "string" ? page.locator(sel).first() : sel;
  await loc.tap({ timeout }).catch(async () => { await loc.click({ timeout: 3000 }).catch(() => {}); });
  if (then) await page.waitForSelector(then, { timeout }).catch(() => {});
  await settled(page, { timeout: 6000 });
}
export const gone = (page, sel, timeout = 8000) => page.waitForSelector(sel, { state: "detached", timeout }).then(() => true).catch(() => false);
export const count = (page, sel) => page.locator(sel).count();
export const firePoll = (page) => page.evaluate(() => { for (const f of window.__rigPolls || []) { try { f(); } catch { /* the page's own */ } } });

/**
 * The audit of one layer. `root` is the layer's selector. Returns nothing: it reports through `ok`.
 *   theme      the app is in the theme asked for, and its background is light or dark to match
 *   overlap    no two texts overlap; no text is cut without an ellipsis; no text reaches past the layer's edges
 *   targets    every control is at least 44 × 44
 *   fields     every input, select and textarea is 16 px or more (no automatic zoom)
 *   scroll     every scroll area reaches its end, and the last control there can be tapped (nothing lies over it)
 */
export async function auditLayer(ok, page, tag, root, { theme, ignore = [], small = [], shot = null } = {}) {
  const r = await page.evaluate(({ root, small }) => {
    const base = document.querySelector(root);
    if (!base) return { missing: true };
    const app = document.querySelector("[data-phone-app]");
    const col = (document.querySelector("[data-phone-column]") || app).getBoundingClientRect();
    const seen = (el) => { const cs = getComputedStyle(el); const b = el.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0; };
    const name = (el) => `${el.tagName.toLowerCase()}[${(el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 26)}]`;
    const sideScroll = (el) => { for (let p = el.parentElement; p && p !== base.parentElement; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll") return true; } return false; };
    // text past the edge
    const past = [];
    for (const el of base.querySelectorAll("*")) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1) || !seen(el)) continue;
      const b = el.getBoundingClientRect();
      if ((b.right > col.right + 1 || b.left < col.left - 1) && !sideScroll(el)) past.push(`${name(el)} ${Math.round(b.left)}..${Math.round(b.right)}`);
    }
    // controls
    const CONTROLS = "a[href], button, input, textarea, select, [role=button], [role=switch], [role=tab], [role=radio], [role=checkbox]";
    const smallOnes = [], fields = [];
    const skip = small.length ? [...base.querySelectorAll(small.join(","))] : [];
    for (const el of base.querySelectorAll(CONTROLS)) {
      if (el.closest("[aria-hidden='true'], [hidden]") || !seen(el) || skip.some((s) => s === el || s.contains(el))) continue;
      let b = el.getBoundingClientRect();
      if (/^(input|textarea|select)$/i.test(el.tagName)) {
        const px = parseFloat(getComputedStyle(el).fontSize); if (!(px >= 16)) fields.push(`${name(el)} ${px}px`);
        const wrap = el.closest("label") || el.parentElement; const wb = wrap.getBoundingClientRect(); if (wb.height > b.height) b = wb;
      }
      const af = getComputedStyle(el, "::after");
      if (af.content && af.content !== "none" && af.position === "absolute" && getComputedStyle(el).position !== "static") {
        const px = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
        b = { width: b.width - Math.min(px(af.left), 0) - Math.min(px(af.right), 0), height: b.height - Math.min(px(af.top), 0) - Math.min(px(af.bottom), 0) };
      }
      if (b.height < 43.5 || b.width < 43.5) smallOnes.push(`${name(el)} ${Math.round(b.width)}×${Math.round(b.height)}`);
    }
    // scroll areas: reach the end; the last controls there are on top
    const stuck = [], under = [];
    const top = (el) => { const b = el.getBoundingClientRect(); const x = Math.min(Math.max(b.left + b.width / 2, 1), window.innerWidth - 1), y = b.top + b.height / 2; const hit = document.elementFromPoint(x, y); return !hit || el === hit || el.contains(hit) || hit.contains(el) ? null : hit; };
    const areas = [...base.querySelectorAll(".cw3-scroll")].filter(seen);
    for (const a of areas) {
      const cs = getComputedStyle(a);
      if (!/auto|scroll/.test(cs.overflowY)) { stuck.push(`${name(a)} overflow-y ${cs.overflowY}`); continue; }
      const was = a.scrollTop; a.scrollTop = a.scrollHeight;
      const tall = a.scrollHeight > a.clientHeight + 1;
      if (tall && a.scrollTop <= 0) stuck.push(`${name(a)} does not move`);
      const ab = a.getBoundingClientRect();
      const inside = [...a.querySelectorAll(CONTROLS)].filter((el) => seen(el) && !el.closest("[aria-hidden='true']") && a.contains(el));
      for (const el of inside.slice(-3)) {
        const b = el.getBoundingClientRect();
        if (b.bottom > ab.bottom + 1) { if (!el.closest(".cw3-scroll .cw3-scroll")) under.push(`${name(el)} ends ${Math.round(b.bottom - ab.bottom)}px below its scroll area`); continue; }
        if (b.top < ab.top) continue;
        const hit = top(el); if (hit) under.push(`${name(el)} is under ${name(hit)}`);
      }
      a.scrollTop = was;
    }
    // controls outside any scroll area (bars, heads, feet) must be on top too
    for (const el of base.querySelectorAll(CONTROLS)) {
      if (el.closest(".cw3-scroll") || el.closest("[aria-hidden='true'], [hidden]") || !seen(el) || el.hasAttribute("data-scrim") || el.hasAttribute("data-flight-strip")) continue;
      const hit = top(el); if (hit && !hit.closest("[data-scrim]")) under.push(`${name(el)} is under ${name(hit)}`);
    }
    const lum = (c) => { const m = String(c).match(/[\d.]+/g) || [0, 0, 0]; return (Number(m[0]) + Number(m[1]) + Number(m[2])) / 3; };
    const holder = base.closest("[data-cw3]") || app;
    const bgEl = [base, ...(() => { const up = []; for (let p = base.parentElement; p; p = p.parentElement) up.push(p); return up; })()].find((el) => { const c = getComputedStyle(el).backgroundColor; const m = String(c).match(/[\d.]+/g) || []; return c && c !== "transparent" && (m.length < 4 || Number(m[3]) >= 0.99); });
    return { past: past.slice(0, 6), small: smallOnes.slice(0, 6), fields, stuck, under: under.slice(0, 6), cw3: holder?.getAttribute("data-cw3") ?? null, bg: bgEl ? lum(getComputedStyle(bgEl).backgroundColor) : null, sw: document.documentElement.scrollWidth, w: window.innerWidth, areas: areas.length };
  }, { root, small });
  if (r.missing) { ok(false, `${tag}: the layer ${root} is drawn`); return; }
  const o = await seenOverlaps(page, { root, ignore: ["[data-scrim]", "[data-now]", ...ignore] });
  const cut = await clippedText(page, { root });
  if (theme) ok(r.cw3 === theme && (theme === "dark" ? r.bg < 90 : r.bg > 170), `${tag}: drawn in ${theme}`, `data-cw3=${r.cw3} · background ${Math.round(r.bg)}`);
  ok(o.length === 0, `${tag}: no two texts overlap`, o.map((x) => `"${x.a}" × "${x.b}" ${x.x}×${x.y}px`).join(" · "));
  ok(cut.length === 0 && r.past.length === 0 && r.sw <= r.w, `${tag}: no text is cut off or past the edge, no sideways page scroll`, [...cut.map((x) => `cut "${x.t}" by ${x.over}px`), ...r.past, r.sw > r.w ? `page ${r.sw}/${r.w}` : ""].filter(Boolean).join(" · "));
  ok(r.small.length === 0, `${tag}: every control is at least 44 × 44`, r.small.join(" · "));
  ok(r.fields.length === 0, `${tag}: every field is 16 px or more`, r.fields.join(" · "));
  ok(r.stuck.length === 0 && r.under.length === 0, `${tag}: it scrolls to its end and nothing lies over a control (${r.areas} scroll area${r.areas === 1 ? "" : "s"})`, [...r.stuck, ...r.under].join(" · "));
  if (shot) await page.screenshot({ path: `${OUT}/${shot}.png` });
}

/**
 * rig/lib/overlap.mjs › textOverlaps, for a screen made of scroll areas: each text box is first cut to what its
 * scroll areas (and any other clipping parent) let through, so a row scrolled under a foot or out of a sheet is not
 * compared with the foot. Two texts that are both SEEN and still share pixels are a finding, as there.
 */
export async function seenOverlaps(target, { root = "body", ignore = [], minPx = 3 } = {}) {
  return target.evaluate(({ root, ignore, minPx }) => {
    const base = document.querySelector(root) || document.body;
    const skip = ignore.length ? [...base.querySelectorAll(ignore.join(","))] : [];
    const cut = (el) => {
      // where the text is drawn: the box without its padding (a link padded out to 44 px to tap draws no text there)
      const b = el.getBoundingClientRect(); const own = getComputedStyle(el); const pad = (k) => parseFloat(own[k]) || 0;
      let l = b.left + pad("paddingLeft"), t = b.top + pad("paddingTop"), r = b.right - pad("paddingRight"), bt = b.bottom - pad("paddingBottom");
      for (let p = el.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
        const pb = p.getBoundingClientRect();
        if (cs.overflowX !== "visible") { l = Math.max(l, pb.left); r = Math.min(r, pb.right); }
        if (cs.overflowY !== "visible") { t = Math.max(t, pb.top); bt = Math.min(bt, pb.bottom); }
      }
      return { left: l, top: t, right: r, bottom: bt, width: r - l, height: bt - t };
    };
    const els = [...base.querySelectorAll("*")].filter((el) => {
      if (skip.some((s) => s === el || s.contains(el))) return false;
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) return false;
      const cs = getComputedStyle(el);
      return !(cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0);
    }).map((el) => ({ el, r: cut(el), t: (el.textContent || "").trim().slice(0, 40) })).filter((x) => x.r.width > 2 && x.r.height > 2 && x.r.bottom > 0 && x.r.right > 0);
    const out = [];
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (x > minPx && y > minPx) out.push({ a: a.t, b: b.t, x: Math.round(x), y: Math.round(y) });
    }
    return out.slice(0, 12);
  }, { root, ignore, minPx });
}

/** The viewport meta of the page: no automatic or blocked zoom. */
export const viewportMeta = (page) => page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute("content") || "");
export const metaIsFine = (m) => /width=device-width/.test(m) && /initial-scale=1(\.0)?(\s*,|$)/.test(m) && !/user-scalable\s*=\s*(no|0)/i.test(m) && !/maximum-scale/i.test(m) && /viewport-fit=cover/.test(m);

// ── the source checks (no browser): tokens, taps, safe areas ──
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const bare = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");   // without comments
export function sourceChecks(ok, repo = ".") {
  const dir = path.join(repo, "opsboard-react/src/phone");
  const files = walk(dir).filter((f) => /\.(jsx?|css)$/.test(f));
  const read = (f) => bare(fs.readFileSync(f, "utf8"));
  const rel = (f) => path.relative(dir, f);
  const foreign = files.filter((f) => rel(f) !== path.join("pages", "console-embed.css")).flatMap((f) => { const m = read(f).match(/--(cw|tl|mw)-[a-z0-9-]+/g); return m ? [`${rel(f)}: ${[...new Set(m)].slice(0, 4).join(" ")}`] : []; });
  ok(files.length >= 10 && foreign.length === 0, `source: nothing under src/phone/ reads a --cw-, --tl- or --mw- token (${files.length} files; pages/console-embed.css is the one exception)`, foreign.join(" · "));
  const css = files.flatMap((f) => [...read(f).matchAll(/import\s+['"]([^'"]+\.css)['"]/g)].map((m) => `${rel(f)} → ${m[1]}`));
  const strange = css.filter((x) => !/tokens\.css|console-embed\.css|maplibre|map\.css/.test(x));
  ok(strange.length === 0, "source: the phone app loads its own token sheet only (no portal, client or timeline sheet)", strange.join(" · ") || css.join(" · "));
  const hold = files.flatMap((f) => { const m = read(f).match(/onMouseEnter|onMouseOver|onMouseLeave|onContextMenu|onTouchStart|onPointerDown|onDoubleClick|long-?press|press and hold/gi); return m ? [`${rel(f)}: ${[...new Set(m)].join(" ")}`] : []; });
  ok(hold.length === 0, "source: nothing in the phone app waits for a hover, a held press, a double tap or a right-click", hold.join(" · "));
  const dialogs = files.flatMap((f) => (/\b(window\.)?(alert|confirm|prompt)\(/.test(read(f)) ? [rel(f)] : []));
  ok(dialogs.length === 0, "source: no browser dialog (alert, confirm, prompt)", dialogs.join(" "));
  const kit = fs.readFileSync(path.join(dir, "kit.jsx"), "utf8");
  ok(/env\(safe-area-inset-top/.test(kit) && /env\(safe-area-inset-bottom/.test(kit), "source: the kit pads the top and bottom safe areas (env(safe-area-inset-*))");
  const users = files.filter((f) => /SAFE_TOP|SAFE_BOTTOM|safe-area-inset/.test(fs.readFileSync(f, "utf8"))).map(rel);
  ok(["kit.jsx", "PhoneApp.jsx", path.join("core", "Timeline.jsx"), path.join("core", "Flight.jsx")].every((f) => users.includes(f)), "source: the header, the bottom bar, the flight, pages and sheets use the safe-area pads", users.join(" "));
  const tokens = fs.readFileSync(path.join(dir, "tokens.css"), "utf8");
  ok(/input[^{]*\{[^}]*font-size:\s*16px/.test(tokens), "source: the token sheet sets every field to 16 px");
  const index = fs.readFileSync(path.join(repo, "opsboard-react/index.html"), "utf8");
  const meta = (index.match(/<meta name="viewport" content="([^"]+)"/) || [])[1] || "";
  ok(metaIsFine(meta), "source: the viewport meta allows zoom (no user-scalable=no, no maximum-scale) and covers the safe areas", meta);
}

// ── the feed under the suite's hand ──
/**
 * Every read of the wall's feed in this context passes through here.
 *   fc.mode    "pass" (the rig's own answer) | "fail" (500) | "empty" (no aircraft)
 *   fc.change  (body) => body: edits the rig's own answer before the page gets it
 *   fc.delay   ms to hold each answer
 */
export async function feedControl(ctx) {
  const fc = { mode: "pass", change: null, delay: 0, reads: 0 };
  await ctx.route(/\/digital-wall\/api\/timeline\/flights/, async (route) => {
    fc.reads += 1;
    if (fc.delay) await new Promise((r) => setTimeout(r, fc.delay));
    if (fc.mode === "fail") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "rig: the wall is down" }) });
    try {
      const res = await route.fetch();
      let body = await res.json();
      if (fc.mode === "empty") body = { ...body, aircraft: [] };
      else if (fc.change) body = fc.change(body) || body;
      return route.fulfill({ response: res, json: body });
    } catch { return route.abort().catch(() => {}); }
  });
  return fc;
}
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
/** Every UTC time in a flight moved by the same amount, so its facts stay in step. */
export function shiftTimes(v, ms) {
  if (typeof v === "string" && ISO.test(v)) return new Date(Date.parse(v) + ms).toISOString();
  if (Array.isArray(v)) return v.map((x) => shiftTimes(x, ms));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "checks" ? x : shiftTimes(x, ms)]));   // who checked and when is the wall's own: not moved
  return v;
}
export const depOf = (f) => { for (const k of ["delayedDepartureUTC", "startTimeUTC", "takeOffUTC"]) { const t = Date.parse(f?.[k] || ""); if (Number.isFinite(t)) return t; } return NaN; };
/** The rig's own flights moved next to now (40 minutes apart from half an hour ago, in their own order), so every one is in the 6H window whenever the suite runs. */
export function steady(body, now) {
  const all = (body.aircraft || []).flatMap((a) => a.flights || []).filter((f) => Number.isFinite(depOf(f))).sort((x, y) => depOf(x) - depOf(y));
  const by = new Map(all.map((f, k) => [f.flightNid, now + (k * 40 - 30) * 60_000 - depOf(f)]));
  return { ...body, aircraft: (body.aircraft || []).map((a) => ({ ...a, flights: (a.flights || []).map((f) => (by.has(f.flightNid) ? shiftTimes(f, by.get(f.flightNid)) : f)) })) };
}
export const LONG_OPERATOR = "Invented Very Long Operator Name Aviation Services International (LNG)";
/**
 * A busy day made from the rig's own flights (invented copies, ids 770000+): six aircraft, 20 more flights 25 minutes
 * apart from one hour ago, two of them at the same time on one aircraft, a long callsign, a long registration and a
 * long operator name. `oprId` of the copies stays the rig's own, so a client's grants still cover them.
 */
export function denseFeed(body, now = Date.now()) {
  const src = (body.aircraft || []).flatMap((a) => (a.flights || []).filter((f) => !f.isCnl));
  if (!src.length) return body;
  const first = body.aircraft[0];
  const aircraft = body.aircraft.map((a) => ({ ...a, flights: [...(a.flights || [])] }));
  aircraft.push({ ...first, aircraftNid: 990001, registration: "LY-LONGREG1", flights: [] });
  aircraft.push({ ...first, aircraftNid: 990002, registration: "LY-TSX", operatorName: LONG_OPERATOR, flights: [] });
  for (let k = 0; k < 20; k += 1) {
    const from = src[k % src.length];
    const a = aircraft[k === 2 ? 1 : k % aircraft.length];   // copies 1 and 2 share an aircraft: two at once in a lane
    const f = shiftTimes(from, now + (k * 25 - 60) * 60_000 - depOf(from));
    a.flights.push({ ...f, flightNid: 770000 + k, flightNo: k % 7 === 3 ? `TSTLONG${k}99X` : `TS${700 + k}`, aircraftRegistration: a.registration, oprId: a.oprId, checks: {}, limitationIds: [], limitations: [] });
  }
  return { ...body, aircraft };
}
/** One flight of the feed, edited in place by `fn(flight, aircraft)`. */
export function editFlight(body, flightNid, fn) {
  return { ...body, aircraft: (body.aircraft || []).map((a) => ({ ...a, flights: (a.flights || []).map((f) => (Number(f.flightNid) === Number(flightNid) ? fn({ ...f }, a) || f : f)) })) };
}
/** Invented entries that make all five checks present on a flight (nothing here names a real person or place). */
export const FIVE = {
  wxDep: "IFR",
  limitations: [
    { id: "rig-imp-1", type: "IMP", title: "Invented important note: the handler asks for the crew list two hours before departure, by e-mail only" },
    { id: "rig-ntm-1", type: "NTM", source: "alert", title: "Invented NOTAM alert: runway works at the arrival airport" },
    { id: "rig-caa-1", type: "CAA", title: "Invented CAA entry: a landing permit is needed for this country" },
    { id: "rig-lim-1", type: "LIM", title: "Invented limitation: no landing after dark", description: "An invented limitation for the rig, with a longer text so the sheet has something to wrap: the airport closes at sunset and reopens at sunrise, and the crew must hold the special briefing." },
  ],
};

// ── stand-ins for the lists the rig has empty (invented data; the real wire is checked without them) ──
const notamText = (id, icao, e) => `${id} NOTAMN\nQ) XXXX/QMRLC/IV/NBO/A/000/999/0000N00000E005\nA) ${icao} B) 2611010600 C) 2612312359\nE) ${e}`;
/**
 * Today's NOTAM check round with two airports: `todo` has flagged NOTAMs and is not checked, `done` is checked.
 * POST …/ack flips the airport, as the wall does, and answers with the whole round. Returns the round (`st`) and
 * the posts seen (`acks`).
 */
export async function notamStandIn(ctx, { todo = "LSGG", done = "EVRA" } = {}) {
  const nowIso = new Date().toISOString();
  const item = (id, icao, e, flagged) => ({ number: id, text: notamText(id, icao, e), inWindow: true, matches: flagged ? [{ group: "Runway" }, { group: "Closure" }] : [] });
  const a1 = [item("A1234/26", todo, "RWY 04/22 CLSD FOR MAINT. INVENTED NOTAM FOR THE RIG WITH A LONG LINE OF TEXT THAT HAS TO WRAP INSIDE THE SHEET AND NOT RUN PAST ITS EDGE.", true), item("A1235/26", todo, "TWY B CLSD BTN TWY C AND TWY D. INVENTED.", true), item("A1236/26", todo, "BIRD ACTIVITY IN THE VICINITY OF THE AIRPORT. INVENTED.", false)];
  const a2 = [item("B0042/26", done, "ILS RWY 18 U/S. INVENTED.", true)];
  const st = { ok: true, day: nowIso.slice(0, 10), ranAt: nowIso, lastRunError: null, done: 1, total: 2, airports: [
    { icao: todo, name: "Invented Airport With A Fairly Long Name International", checked: null, error: null, all: a1, filtered: a1.slice(0, 2), notamsAsOf: nowIso, flights: ["TST102", "TST301"] },
    { icao: done, name: "Invented Field", checked: { at: nowIso, by: "rig-test@rig.invalid" }, error: null, all: a2, filtered: a2, notamsAsOf: nowIso, flights: ["TST102"] },
  ] };
  const acks = [];
  const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await ctx.route(/\/digital-wall\/api\/notam-check\/today/, (route) => json(route, st));
  await ctx.route(/\/digital-wall\/api\/notam-check\/ack/, (route) => {
    let icao = ""; try { icao = JSON.parse(route.request().postData() || "{}").icao || ""; } catch { /* no body */ }
    acks.push(icao);
    const a = st.airports.find((x) => x.icao === icao);
    if (a) a.checked = a.checked ? null : { at: new Date().toISOString(), by: "rig-test@rig.invalid" };
    st.done = st.airports.filter((x) => x.checked).length;
    return json(route, st);
  });
  return { st, acks };
}
/** The Limits and Important lists with a few invented entries (long words, a long title, one switched off). */
export async function listsStandIn(ctx) {
  const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  const limitations = [
    { id: "rig-l1", source: "custom", title: "Invented limitation: no landing after dark", description: "The airport closes at sunset and opens at sunrise. An invented text that is long enough to be cut after three lines in the list and shown whole in the sheet, so both places have something to wrap.", isActive: true, isPermanent: true, matchedFlightCount: 2, match: { airportIcaos: ["LSGG"], flights: [], countries: [] } },
    { id: "rig-l2", source: "custom", title: "Invented limitation with a very long title that has to wrap over two lines on a narrow phone", description: "Short.", isActive: true, endDate: "2026-12-31", matchedFlightCount: 0, match: { airportIcaos: ["EVRA", "EYVI", "EETN", "EFHK", "ESSA"], flights: [], countries: [] } },
    { id: "rig-l3", source: "custom", title: "Invented limitation, switched off", description: "", isActive: false, startDate: "2026-11-01", matchedFlightCount: 0, match: { airportIcaos: [], flights: [], countries: ["XX"] } },
  ];
  const entries = [
    { id: "rig-i1", title: "Invented note: Supercalifragilisticexpialidociouslylongwordwithoutanyspaces to break", body: "The handler asks for the crew list two hours before departure. Invented.", reviewed: false, isActive: true, addedBy: "rig-test@rig.invalid", addedAt: new Date(Date.now() - 3600e3).toISOString(), match: { airportIcaos: ["LSGG"], direction: "arr" } },
    { id: "rig-i2", title: "Invented note, reviewed", body: "Invented.", reviewed: true, isActive: true, addedBy: "rig-test@rig.invalid", addedAt: new Date(Date.now() - 86400e3).toISOString(), confirmedBy: "rig-test@rig.invalid", confirmedAt: new Date(Date.now() - 7200e3).toISOString(), match: { registrations: ["LY-TST"] } },
    { id: "rig-i3", title: "Invented note, switched off", body: "", reviewed: true, isActive: false, addedBy: "rig-test@rig.invalid", addedAt: new Date(Date.now() - 172800e3).toISOString(), match: {} },
  ];
  await ctx.route(/\/digital-wall\/api\/timeline\/limitations\?.*withMatches=true/, (route) => (route.request().method() === "GET" ? json(route, { ok: true, limitations }) : route.fallback()));
  await ctx.route(/\/digital-wall\/api\/important\?/, (route) => (route.request().method() === "GET" ? json(route, { ok: true, entries }) : route.fallback()));
}

/** Weather for both airports of a flight (the rig has none): invented, with a long raw line that has to wrap. The NOTAMs stay the rig's own. */
export async function infoStandIn(ctx) {
  const wx = (cat) => ({ category: cat, observed: new Date(Date.now() - 20 * 60_000).toISOString(), windDegrees: 40, windSpeedKts: 12, windGustKts: 24, visibilityMeters: 4000, ceilingFeet: 700, temperatureC: 3, dewpointC: 1, qnhHpa: 1003,
    rawText: "METAR XXXX 131950Z 04012G24KT 4000 -RADZ BR BKN007 OVC015 03/01 Q1003 TEMPO 2500 RA BKN005 RMK INVENTED FOR THE RIG WITH A LONG TAIL SO THE LINE WRAPS" });
  await ctx.route(/\/digital-wall\/api\/flight-info/, async (route) => {
    try {
      const res = await route.fetch();
      const body = await res.json().catch(() => ({}));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, notams: { dep: null, arr: null }, ...body, weather: { dep: wx("IFR"), arr: wx("MVFR") } }) });
    } catch { return route.abort().catch(() => {}); }
  });
}

/** What a layer says, in one line. */
export const textOf = (page, sel) => page.locator(sel).first().innerText({ timeout: 4000 }).then((t) => t.replace(/\s+/g, " ").trim()).catch(() => "");
/** A box of the first match, or null. */
export const boxOf = (page, sel) => page.locator(sel).first().boundingBox({ timeout: 4000 }).catch(() => null);
/** Runs the named parts of a suite; ONLY=a,b picks some (for debugging). A part that throws fails once and the rest run. */
export function parts(ok) {
  const only = (process.env.ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
  return async (name, fn) => {
    if (only.length && !only.includes(name)) return;
    console.log(`\n── ${name}`);
    try { await fn(); } catch (e) { ok(false, `${name}: ran to its end`, String(e?.message || e).split("\n")[0]); }
  };
}
