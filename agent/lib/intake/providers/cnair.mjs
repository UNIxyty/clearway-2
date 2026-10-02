// CNAIR: does a reference (quote number) resolve to a record in the provider's portal?
//
// One read-only login, the flight LIST only (no record is opened), then the browser is closed. This is the
// first step of the type 1 pipeline, for a message already believed to be a notification; classification never
// comes here. See docs/cnair-portal-investigation.md for what is known about the portal.
//
// OFF BY DEFAULT. It runs only when INTAKE_CNAIR_LOOKUP=on and CNAIR_USER / CNAIR_PASSWORD are set. Otherwise
// it answers "not configured" and the request waits for a person. Credentials are never logged or returned.
//
// Structure is checked before anything is read: a reader that silently reads the wrong column is worse than one
// that stops. An unexpected screen → "unavailable", never "not found".
import { readFileSync, existsSync } from "node:fs";

const START = "https://cnair.efficens.es/gas320/ua/r/cnair/flightdispatcher";
const EXPECT = { program: "ProgramacionCnair", window: "cn_clearway", table: "scr_vuelos", columns: ["id_vuelo2", "fecpres2", "fecha2", "id_avion2", "id_tvuelo2"] };
const isLocalDb = () => /127\.0\.0\.1|localhost/.test(String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""));
/** Rig only: a JSON file standing in for the portal ({ "<ref>": { foundAfter: n, row: {...} } }). Ignored unless the database is local. */
const fixturePath = () => (isLocalDb() ? String(process.env.INTAKE_PROVIDER_FIXTURE ?? "").trim() : "");

export function lookupState() {
  if (fixturePath()) return { on: true, how: "fixture" };
  if (String(process.env.INTAKE_CNAIR_LOOKUP ?? "").trim().toLowerCase() !== "on") return { on: false, why: "Looking up references in the CNAIR portal is switched off on this server (INTAKE_CNAIR_LOOKUP)." };
  if (!process.env.CNAIR_USER || !process.env.CNAIR_PASSWORD) return { on: false, why: "The CNAIR portal credentials are not set on this server." };
  return { on: true, how: "portal" };
}

// ── Genero protocol → tree (the same reading rig/cnair/capture.mjs does; memory only) ───────────────────────
function tokenize(s) { const t = []; let i = 0; while (i < s.length) { const c = s[i]; if (c === "{" || c === "}") { t.push(c); i += 1; } else if (c === '"') { let j = i + 1, v = ""; while (j < s.length && s[j] !== '"') { if (s[j] === "\\" && j + 1 < s.length) { v += s[j + 1]; j += 2; } else { v += s[j]; j += 1; } } t.push({ s: v }); i = j + 1; } else if (/\s/.test(c)) i += 1; else { let j = i; while (j < s.length && !/[\s{}"]/.test(s[j])) j += 1; t.push({ w: s.slice(i, j) }); i = j; } } return t; }
function parse(tokens) { let i = 0; const list = () => { const out = []; while (i < tokens.length && tokens[i] !== "}") { const k = tokens[i]; if (k === "{") { i += 1; out.push(list()); i += 1; } else { out.push(k.s ?? k.w); i += 1; } } return out; }; return list(); }
const attrsOf = (l) => Object.fromEntries((Array.isArray(l) ? l : []).filter(Array.isArray).map((p) => [p[0], p[1]]));
export function applyProtocol(nodes, body) {
  const add = (parent, type, id, attrs, children) => { nodes.set(id, { id, type, attrs: attrsOf(attrs), parent, children: [] }); const p = nodes.get(parent); if (p) p.children.push(id); for (const c of Array.isArray(children) ? children : []) if (Array.isArray(c)) add(id, c[0], c[1], c[2], c[3]); };
  const top = parse(tokenize(body));
  for (let i = 0; i < top.length; i += 1) { if (top[i] !== "om") continue; const cmds = top[i + 2]; if (!Array.isArray(cmds)) continue; for (const c of cmds) { if (!Array.isArray(c)) continue; if (c[0] === "an") add(c[1], c[2], c[3], c[4], c[5]); else if (c[0] === "un") { const n = nodes.get(c[1]); if (n) Object.assign(n.attrs, attrsOf(c[2])); } } }
}
/** The flight list from the tree, after checking the screen is the one this reader was written for. Throws with the reason. */
export function readFlightList(nodes) {
  const all = [...nodes.values()];
  const ui = all.find((n) => n.type === "UserInterface"); if (ui?.attrs.name !== EXPECT.program) throw new Error(`the program is "${ui?.attrs.name ?? "unknown"}", not ${EXPECT.program}`);
  if (!all.some((n) => n.type === "Window" && n.attrs.name === EXPECT.window)) throw new Error(`the window ${EXPECT.window} is not there`);
  const table = all.find((n) => n.type === "Table" && n.attrs.name === EXPECT.table); if (!table) throw new Error(`the table ${EXPECT.table} is not there`);
  const cols = table.children.map((c) => nodes.get(c)).filter((c) => c?.type === "TableColumn");
  const names = cols.map((c) => c.attrs.colName);
  if (names.join() !== EXPECT.columns.join()) throw new Error(`the list's columns are [${names.join(", ")}], not [${EXPECT.columns.join(", ")}]`);
  const values = (c) => { const vl = c.children.map((x) => nodes.get(x)).find((x) => x?.type === "ValueList"); return (vl ? vl.children.map((x) => nodes.get(x)) : []).map((v) => String(v?.attrs.value ?? "")); };
  const by = Object.fromEntries(cols.map((c) => [c.attrs.colName, values(c)]));
  const size = Number(table.attrs.size ?? 0);
  const rows = Array.from({ length: Math.min(size, by.id_vuelo2.length) }, (_, i) => ({ quote: by.id_vuelo2[i], quoteDate: by.fecpres2[i], flightDate: by.fecha2[i], aircraft: by.id_avion2[i], typeCode: by.id_tvuelo2[i] }));
  for (const r of rows) if (!/^\d{6,8}$/.test(r.quote) || !/^\d{2}\/\d{2}\/\d{4}$/.test(r.flightDate)) throw new Error("a list row is not in the expected format (quote number / date)");
  return rows;
}

/**
 * → { state: "found", row } | { state: "not_found", listed } | { state: "unavailable", why }.
 * "not_found" is a real answer (a record can appear days after its quote date); "unavailable" means nothing was learned.
 */
export async function resolveReference(reference, { attempt = 1 } = {}) {
  const st = lookupState(); if (!st.on) return { state: "unavailable", why: st.why, notConfigured: true };
  if (st.how === "fixture") {
    const p = fixturePath(); if (!existsSync(p)) return { state: "unavailable", why: "The rig's provider fixture file is missing." };
    const f = JSON.parse(readFileSync(p, "utf8"))[String(reference)];
    if (f?.unavailable) return { state: "unavailable", why: f.unavailable };
    if (!f || attempt < (f.foundAfter ?? 1)) return { state: "not_found", listed: 0 };
    return { state: "found", row: f.row };
  }
  let browser = null;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext({ locale: "en-GB" })).newPage();
    const nodes = new Map(); let pending = Promise.resolve();
    page.on("response", (res) => { if (/\/ua\/sua\//.test(res.url())) pending = pending.then(async () => { try { applyProtocol(nodes, await res.text()); } catch { /* no body */ } }); });
    await page.goto(START, { waitUntil: "load", timeout: 30000 });
    await page.fill("#uusr", process.env.CNAIR_USER); await page.fill("#pswd", process.env.CNAIR_PASSWORD);
    await Promise.all([page.waitForLoadState("load").catch(() => {}), page.click("#subbb")]);
    await page.waitForTimeout(8000); await pending;
    const screen = await page.evaluate(() => document.body.innerText).catch(() => "");
    if (/No se ha podido iniciar/i.test(screen)) return { state: "unavailable", why: "The portal accepted the login but refused to start the session." };
    if (!nodes.size) return { state: "unavailable", why: "The portal did not open after login (wrong credentials, or the page changed)." };
    let rows; try { rows = readFlightList(nodes); } catch (e) { return { state: "unavailable", why: `The portal's screen is not what this reader expects: ${e.message}. Nothing was read.` }; }
    const row = rows.find((r) => r.quote === String(reference));
    return row ? { state: "found", row } : { state: "not_found", listed: rows.length };
  } catch (e) {
    return { state: "unavailable", why: `The portal could not be reached: ${String(e.message).split("\n")[0].slice(0, 140)}` };
  } finally { await browser?.close().catch(() => {}); }
}
