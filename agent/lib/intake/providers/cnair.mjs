// CNAIR: the provider's flight-dispatcher portal (Four Js Genero), read through its own client protocol.
//
// Built as docs/cnair-portal-investigation.md concluded: drive the Genero protocol, not the DOM; key every read on
// the program's own column names; log in, read in ONE pass, sign out (the idle limit is 2-5 minutes); refuse to
// read a screen that is not the one this reader was written for. No browser: the five HTTP exchanges the Genero
// Browser Client makes are made here directly, which is also what lets the rig replace the portal with a mock that
// speaks the same protocol (rig/intake/mock-cnair.mjs).
//
// Nothing here runs before a person has approved the notification (notification.mjs). A portal outage is an
// ordinary failure: { state: "unavailable" }, recorded, retried on the schedule, a person alerted after the tries.
//
// Credentials come from the environment and are never logged or returned. Personal data on the record (captain,
// first officer, contact names, phones, e-mails, remarks) is never copied out of the protocol tree: the projection
// below carries counts and presence only.
import { createHash } from "node:crypto";

const BASE = () => String(process.env.CNAIR_PORTAL_BASE || "https://cnair.efficens.es").replace(/\/+$/, "");
const START = () => `${BASE()}/gas320/ua/r/cnair/flightdispatcher`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
/** What this reader was written against. A difference means the program changed: refuse, never guess. */
export const EXPECT = {
  program: "ProgramacionCnair", window: "cn_clearway",
  tables: {
    scr_vuelos: ["id_vuelo2", "fecpres2", "fecha2", "id_avion2", "id_tvuelo2"],
    scr_legs: ["print", "fechainiutc", "fechaini", "horiniutc", "horini", "pax", "id_oaci_ori", "oaci_ori", "id_oaci_dest", "oaci_dest", "horas_etv"],
    scr_detov: ["id_leg3", "id_oaci_ori3", "id_oaci_dest3", "fnumber3", "ppr3"],
    scr_pasajeros_leg: ["id_leg32", "tipo32", "genero"],
    scr_oaci: ["id_leg33", "id_oaci33", "proveedor33", "telefo33", "nombre33", "email"],
  },
  listTypes: { id_vuelo2: "INTEGER", fecpres2: "DATE", fecha2: "DATE", id_avion2: "CHAR(10)", id_tvuelo2: "CHAR(5)" },
  fields: ["id_vuelo1", "fecpres1", "id_tvuelo1", "id_avion1", "fecha1", "id_vuelo3", "id_avion3", "avion3", "cap3", "foff", "att", "cabconf", "seats", "stretcher", "notdisp"],
  signOut: "cerrarsesion",
};
const DATE = /^\d{2}\/\d{2}\/\d{4}$/, TIME = /^\s?\d{2}:\d{2}:\d{2}$/, ICAO = /^[A-Z]{4}$/, HOURS = /^\d+,\d{2}$/, QUOTE = /^\d{6,8}$/;

export function lookupState() {
  if (process.env.CNAIR_PORTAL_BASE && /127\.0\.0\.1|localhost/.test(process.env.CNAIR_PORTAL_BASE)) return { on: true, how: "mock" };
  if (String(process.env.INTAKE_CNAIR_LOOKUP ?? "").trim().toLowerCase() !== "on") return { on: false, why: "Looking up references in the CNAIR portal is switched off on this server (INTAKE_CNAIR_LOOKUP)." };
  if (!process.env.CNAIR_USER || !process.env.CNAIR_PASSWORD) return { on: false, why: "The CNAIR portal credentials are not set on this server." };
  return { on: true, how: "portal" };
}

// ── Genero AUI protocol → tree (memory only) ─────────────────────────────────────────────────────────────────
function tokenize(s) { const t = []; let i = 0; while (i < s.length) { const c = s[i]; if (c === "{" || c === "}") { t.push(c); i += 1; } else if (c === '"') { let j = i + 1, v = ""; while (j < s.length && s[j] !== '"') { if (s[j] === "\\" && j + 1 < s.length) { v += s[j + 1]; j += 2; } else { v += s[j]; j += 1; } } t.push({ s: v }); i = j + 1; } else if (/\s/.test(c)) i += 1; else { let j = i; while (j < s.length && !/[\s{}"]/.test(s[j])) j += 1; t.push({ w: s.slice(i, j) }); i = j; } } return t; }
function parse(tokens) { let i = 0; const list = () => { const out = []; while (i < tokens.length && tokens[i] !== "}") { const k = tokens[i]; if (k === "{") { i += 1; out.push(list()); i += 1; } else { out.push(k.s ?? k.w); i += 1; } } return out; }; return list(); }
const attrsOf = (l) => Object.fromEntries((Array.isArray(l) ? l : []).filter(Array.isArray).map((p) => [p[0], p[1]]));
/** Applies one protocol body to the tree. Returns the highest `om` number seen (the client echoes it back). */
export function applyProtocol(nodes, body) {
  let om = null;
  const add = (parent, type, id, attrs, children) => { nodes.set(id, { id, type, attrs: attrsOf(attrs), parent, children: [] }); const p = nodes.get(parent); if (p && !p.children.includes(id)) p.children.push(id); for (const c of Array.isArray(children) ? children : []) if (Array.isArray(c)) add(id, c[0], c[1], c[2], c[3]); };
  const remove = (id) => { const n = nodes.get(id); if (!n) return; for (const c of [...n.children]) remove(c); const p = nodes.get(n.parent); if (p) p.children = p.children.filter((x) => x !== id); nodes.delete(id); };
  const top = parse(tokenize(body));
  for (let i = 0; i < top.length; i += 1) { if (top[i] !== "om") continue; om = Number(top[i + 1]); const cmds = top[i + 2]; if (!Array.isArray(cmds)) continue; for (const c of cmds) { if (!Array.isArray(c)) continue; if (c[0] === "an") add(c[1], c[2], c[3], c[4], c[5]); else if (c[0] === "un") { const n = nodes.get(c[1]); if (n) Object.assign(n.attrs, attrsOf(c[2])); } else if (c[0] === "rn") remove(c[1]); } }
  return om;
}
const byName = (nodes, type, name) => [...nodes.values()].find((n) => n.type === type && (n.attrs.colName === name || n.attrs.name === name));
const fieldValue = (nodes, col) => { const n = byName(nodes, "FormField", col); return n ? String(n.attrs.value ?? "") : null; };
function tableValues(nodes, name) {
  const t = byName(nodes, "Table", name); if (!t) return null;
  const cols = t.children.map((c) => nodes.get(c)).filter((c) => c?.type === "TableColumn");
  const values = (c) => { const vl = c.children.map((x) => nodes.get(x)).find((x) => x?.type === "ValueList"); return (vl ? vl.children.map((x) => nodes.get(x)) : []).map((v) => String(v?.attrs.value ?? "")); };
  return { id: t.id, size: Number(t.attrs.size ?? 0), cols, by: Object.fromEntries(cols.map((c) => [c.attrs.colName, values(c)])), totals: Object.fromEntries(cols.filter((c) => c.attrs.aggregateValue != null).map((c) => [c.attrs.colName, c.attrs.aggregateValue])) };
}

/** The structural checks, before anything is read. Throws with the first difference. */
export function checkStructure(nodes) {
  const all = [...nodes.values()];
  const ui = all.find((n) => n.type === "UserInterface"); if (ui?.attrs.name !== EXPECT.program) throw new Error(`the program is "${ui?.attrs.name ?? "unknown"}", not ${EXPECT.program}`);
  if (!all.some((n) => n.type === "Window" && n.attrs.name === EXPECT.window)) throw new Error(`the window ${EXPECT.window} is not there`);
  for (const [name, cols] of Object.entries(EXPECT.tables)) {
    const t = byName(nodes, "Table", name); if (!t) throw new Error(`the table ${name} is not there`);
    const names = t.children.map((c) => nodes.get(c)).filter((c) => c?.type === "TableColumn").map((c) => c.attrs.colName);
    if (names.join() !== cols.join()) throw new Error(`the columns of ${name} are [${names.join(", ")}], not [${cols.join(", ")}]`);
  }
  for (const [col, type] of Object.entries(EXPECT.listTypes)) { const c = byName(nodes, "TableColumn", col); if (c && c.attrs.varType && c.attrs.varType !== type) throw new Error(`${col} is declared ${c.attrs.varType}, not ${type}`); }
  for (const f of EXPECT.fields) if (!byName(nodes, "FormField", f)) throw new Error(`the field ${f} is not there`);
  if (!all.some((n) => n.type === "Action" && n.attrs.name === EXPECT.signOut)) throw new Error("the sign-out action is not there");
}

/** The flight list: [{ quote, quoteDate, flightDate, aircraft, typeCode }], every value in its expected format. */
export function readFlightList(nodes) {
  const t = tableValues(nodes, "scr_vuelos"); if (!t) throw new Error("the flight list is not there");
  const rows = Array.from({ length: Math.min(t.size, t.by.id_vuelo2.length) }, (_, i) => ({ quote: t.by.id_vuelo2[i], quoteDate: t.by.fecpres2[i], flightDate: t.by.fecha2[i], aircraft: t.by.id_avion2[i], typeCode: t.by.id_tvuelo2[i] }));
  for (const r of rows) if (!QUOTE.test(r.quote) || !DATE.test(r.quoteDate) || !DATE.test(r.flightDate)) throw new Error(`a list row is not in the expected format (${r.quote} / ${r.flightDate})`);
  return rows;
}

/**
 * The record on screen, as a projection with no personal data. Every value is checked against its format and
 * the leg total against the sum of the legs; a failure throws (the import is refused).
 */
export function readRecord(nodes, reference) {
  const quote = fieldValue(nodes, "id_vuelo1"); if (quote !== String(reference)) throw new Error(`the record on screen is ${quote || "none"}, not ${reference}`);
  const legs = tableValues(nodes, "scr_legs"), det = tableValues(nodes, "scr_detov"), pax = tableValues(nodes, "scr_pasajeros_leg");
  if (!legs || !det) throw new Error("the leg tables are not there");
  const n = legs.size; if (!n || n > 20) throw new Error(`the schedule has ${n} legs`);
  if (det.size !== n) throw new Error(`the schedule has ${n} legs but the leg table has ${det.size}`);
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const r = { zDate: legs.by.fechainiutc[i], ltDate: legs.by.fechaini[i], zTime: String(legs.by.horiniutc[i] ?? "").trim(), ltTime: String(legs.by.horini[i] ?? "").trim(), pax: legs.by.pax[i], dep: legs.by.id_oaci_ori[i], depName: legs.by.oaci_ori[i], arr: legs.by.id_oaci_dest[i], arrName: legs.by.oaci_dest[i], estHours: legs.by.horas_etv[i], flightNumber: String(det.by.fnumber3[i] ?? "").replace(/\s+/g, "").trim() || null, pprPresent: !!String(det.by.ppr3[i] ?? "").trim() };
    const bad = [["Z date", r.zDate, DATE], ["LT date", r.ltDate, DATE], ["Z time", r.zTime, TIME], ["LT time", r.ltTime, TIME], ["departure", r.dep, ICAO], ["arrival", r.arr, ICAO], ["Estimated Hours", r.estHours, HOURS], ["PAX", r.pax, /^\d{1,3}$/]].find(([, v, re]) => !re.test(String(v ?? "")));
    if (bad) throw new Error(`leg ${i + 1}: ${bad[0]} is "${bad[1]}", not in the expected format`);
    if (det.by.id_oaci_ori3[i] !== r.dep || det.by.id_oaci_dest3[i] !== r.arr) throw new Error(`leg ${i + 1}: the schedule and the leg table disagree on the route`);
    rows.push(r);
  }
  const total = legs.totals.horas_etv; const sum = rows.reduce((s, r) => s + Number(r.estHours.replace(",", ".")), 0);
  if (total != null && Math.abs(Number(String(total).replace(",", ".")) - sum) > 0.011) throw new Error(`Estimated Hours total ${total} is not the sum of the legs (${sum.toFixed(2)})`);
  const typeCode = fieldValue(nodes, "id_tvuelo1") ?? "";
  const combo = byName(nodes, "FormField", "id_tvuelo1"); const items = combo ? combo.children.flatMap((c) => nodes.get(c)?.children ?? []).map((x) => nodes.get(x)).filter((x) => x?.type === "Item") : [];
  const icaoType = items.find((x) => x.attrs.name === typeCode)?.attrs.text ?? null;   // the portal's own N / X for the code
  return {
    quote, quoteDate: fieldValue(nodes, "fecpres1"), flightDate: fieldValue(nodes, "fecha1"), typeCode, icaoType,
    registration: fieldValue(nodes, "id_avion3") || fieldValue(nodes, "id_avion1"), aircraftName: fieldValue(nodes, "avion3"),
    crewLinesFilled: ["cap3", "foff", "att"].filter((f) => String(fieldValue(nodes, f) ?? "").trim()).length,
    cabinConfig: fieldValue(nodes, "cabconf"), seats: fieldValue(nodes, "seats"), stretcher: fieldValue(nodes, "stretcher"),
    remarksPresent: !!String(fieldValue(nodes, "notdisp") ?? "").replace(/<[^>]+>/g, "").trim(),
    paxRows: pax ? pax.size : null, legs: rows, totalEstimatedHours: total ?? null,
    readAt: new Date().toISOString(), fingerprint: createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 16),
  };
}

// ── The session: five exchanges, one pass ─────────────────────────────────────────────────────────────────────
class Session {
  constructor() { this.jar = new Map(); this.sid = null; this.om = null; this.page = 0; }
  cookies() { return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "); }
  take(res) { for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const i = kv.indexOf("="); if (i > 0) this.jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); } }
  // An EMPTY Cookie header makes their front proxy answer 400 ("Proxy encountered error"): send it only when set.
  // One connection per request (connection: close): a kept-alive connection to their proxy hangs on the next request.
  // Every body is read to the end here: an unread body keeps the connection busy and the next request waits forever.
  async req(url, init = {}) { const res = await fetch(url, { ...init, redirect: "manual", headers: { "user-agent": UA, connection: "close", ...(this.jar.size ? { cookie: this.cookies() } : {}), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30000) }); this.take(res); const text = await res.text(); return { status: res.status, headers: res.headers, text: async () => text }; }
  // Every message ends with a newline: the protocol is line-terminated, and the GAS never answers an event without
  // it (verified live 2026-10-03). The two X-FourJs headers are what the browser client sends on every message.
  async send(body) { this.page += 1; const res = await this.req(`${BASE()}/gas320/ua/sua/${this.sid}?appId=0&pageId=${this.page}`, { method: "POST", headers: { "content-type": "text/plain;charset=UTF-8", "X-FourJs-Client-Features": "prompt", "X-FourJs-Client": "GBC/1.00.68-202504070939" }, body: body.endsWith("\n") ? body : `${body}\n` }); return res.text(); }
}
const TABLE_PAGES = { scr_vuelos: 60, scr_legs: 20, scr_detov: 20, scr_pasajeros_leg: 40, scr_oaci: 20 };

/**
 * Logs in, reads the list (and the record for `reference` when `withRecord`), signs out.
 * → { state: "found", row, record? } | { state: "not_found", listed } | { state: "unavailable", why, notConfigured? }
 * `onEvent` receives { event: "login" | "step" | "record" | "signout" | "error", ... } for the audit trail.
 */
export async function readPortal(reference, { withRecord = false, onEvent = () => {} } = {}) {
  const st = lookupState(); if (!st.on) return { state: "unavailable", why: st.why, notConfigured: true };
  const s = new Session(); const nodes = new Map();
  try {
    await s.req(START());
    const form = new URLSearchParams({ userName: process.env.CNAIR_USER ?? "", password: process.env.CNAIR_PASSWORD ?? "", submit: "Entrar" });
    const login = await s.req(START(), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });
    onEvent({ event: "login", status: login.status });
    if (!s.jar.has("EFFI_TOKEN")) return { state: "unavailable", why: "The portal did not accept the login (no session token was issued)." };
    await s.req(START()); onEvent({ event: "step", name: "page" });
    const boot = await s.req(`${START()}?Bootstrap=done`, { headers: { "X-FourJs-Client-Features": "prompt" } });
    s.sid = boot.headers.get("x-fourjs-id"); const meta = await boot.text(); onEvent({ event: "step", name: "bootstrap" });
    if (!s.sid || !/meta Connection/.test(meta)) return { state: "unavailable", why: "The portal did not start a session after the login." };
    const first = await s.send('meta Client{{name "GBC"}{version "1.00.68"}{encoding "UTF-8"}{encapsulation "0"}{filetransfer "0"}{mobileUI "0"}}');
    onEvent({ event: "step", name: "program" });
    if (/No se ha podido iniciar sesi/i.test(first)) return { state: "unavailable", why: "The portal accepted the login but refused to start the program (as when their server is down)." };
    s.om = applyProtocol(nodes, first);
    if (s.om == null) return { state: "unavailable", why: "The portal answered with something that is not its screen." };
    try { checkStructure(nodes); } catch (e) { onEvent({ event: "error", why: e.message }); return { state: "unavailable", why: `The portal's screen is not what this reader expects: ${e.message}. Nothing was read.`, structural: true }; }
    // Page sizes for every table, so their rows arrive; then the list.
    const cfg = Object.entries(TABLE_PAGES).map(([name, size]) => { const t = byName(nodes, "Table", name); return `{ConfigureEvent 0{{idRef "${t.id}"}{pageSize "${size}"}{bufferSize "${size + 1}"}{offset "0"}}}`; }).join("");
    s.om = applyProtocol(nodes, await s.send(`event _om ${s.om}{}{${cfg}}`)) ?? s.om; onEvent({ event: "step", name: "list" });
    let rows; try { rows = readFlightList(nodes); } catch (e) { onEvent({ event: "error", why: e.message }); return { state: "unavailable", why: `The portal's list is not what this reader expects: ${e.message}. Nothing was read.`, structural: true }; }
    const idx = rows.findIndex((r) => r.quote === String(reference));
    if (idx < 0) return { state: "not_found", listed: rows.length };
    let record = null;
    if (withRecord) {
      const list = byName(nodes, "Table", "scr_vuelos");
      s.om = applyProtocol(nodes, await s.send(`event _om ${s.om}{}{{ConfigureEvent 0{{idRef "${list.id}"}{currentRow "${idx}"}}}}`)) ?? s.om;
      try { record = readRecord(nodes, reference); } catch (e) { onEvent({ event: "error", why: e.message }); return { state: "unavailable", why: `The record could not be read safely: ${e.message}. The import was refused.`, structural: true }; }
      onEvent({ event: "record", reference });
    }
    return { state: "found", row: rows[idx], record };
  } catch (e) {
    onEvent({ event: "error", why: String(e.message).slice(0, 160) });
    return { state: "unavailable", why: `The portal could not be reached: ${String(e.message).split("\n")[0].slice(0, 140)}` };
  } finally {
    // Sign out, best effort: the program's own "Sign out" button (the browser client sends the Button node's id,
    // verified live 2026-10-03; the Action node of the same name is the fallback). The session dies within minutes anyway.
    try { const act = [...nodes.values()].find((n) => n.type === "Button" && n.attrs.name === EXPECT.signOut) ?? [...nodes.values()].find((n) => n.type === "Action" && n.attrs.name === EXPECT.signOut); if (s.sid && act) { await s.send(`event _om ${s.om ?? 0}{}{{ActionEvent 0{{idRef "${act.id}"}}}}`); onEvent({ event: "signout" }); } } catch { /* already gone */ }
  }
}
export const resolveReference = (reference) => readPortal(reference, { withRecord: false });
