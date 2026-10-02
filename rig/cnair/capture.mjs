// CNAIR flight-dispatcher portal: authorised read-only capture (account holder's authorisation, 2026-10-01).
//
// REDACTION AT THE POINT OF CAPTURE. Genero protocol responses are parsed IN MEMORY into the program's widget
// tree; the only thing written per record is an allowlisted projection (dates, times, ICAO codes, flight
// numbers, registration, aircraft name, counts, field names/types). Crew names and ids, passenger rows,
// contact names, phones, e-mail addresses and remark text are never serialised: not in a traffic log (metadata
// only), not in a screenshot (none are taken), not in a temp file. Credentials come from .env and are never
// printed. One session, one record every few seconds. Afterwards the idle-session limit is measured with pings
// at growing gaps (2, 5, 10, 20, 40, 55 min).
//   node rig/cnair/capture.mjs            → rig/.scratch/cnair/out2/{log.txt, records.json, network-meta.jsonl}
import { chromium } from "../../node_modules/playwright/index.mjs";
import fs from "node:fs"; import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split("\n").filter((l) => /^CNAIR_(USER|PASSWORD)=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const USER = env.CNAIR_USER, PASS = env.CNAIR_PASSWORD;
if (!USER || !PASS) { console.error("CNAIR_USER / CNAIR_PASSWORD missing"); process.exit(2); }
// --quote <n>: open only that record (list rows are still read; nothing else is opened). --no-probe: skip the idle probes.
const argOf = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const ONLY = argOf("--quote"); const NO_PROBE = process.argv.includes("--no-probe");
const OUT = path.join(root, ONLY ? `rig/.scratch/cnair/out-${ONLY}` : "rig/.scratch/cnair/out2"); fs.mkdirSync(OUT, { recursive: true });
const SECRETS = [PASS, USER, encodeURIComponent(USER), encodeURIComponent(PASS)].filter((v) => v && v.length >= 3);
const scrub = (s) => { let t = String(s ?? ""); for (const v of SECRETS) t = t.split(v).join("<redacted>"); return t; };
const logFile = path.join(OUT, "log.txt"); fs.writeFileSync(logFile, "");
const log = (...a) => { const line = `${new Date().toISOString()} ${scrub(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "))}`; fs.appendFileSync(logFile, line + "\n"); console.log(line); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Genero AUI protocol → in-memory tree ─────────────────────────────────────────────────────────────────────
function tokenize(s) { const t = []; let i = 0; while (i < s.length) { const c = s[i]; if (c === "{" || c === "}") { t.push(c); i += 1; } else if (c === '"') { let j = i + 1, v = ""; while (j < s.length && s[j] !== '"') { if (s[j] === "\\" && j + 1 < s.length) { v += s[j + 1]; j += 2; } else { v += s[j]; j += 1; } } t.push({ s: v }); i = j + 1; } else if (/\s/.test(c)) i += 1; else { let j = i; while (j < s.length && !/[\s{}"]/.test(s[j])) j += 1; t.push({ w: s.slice(i, j) }); i = j; } } return t; }
function parse(tokens) { let i = 0; const list = () => { const out = []; while (i < tokens.length && tokens[i] !== "}") { const k = tokens[i]; if (k === "{") { i += 1; out.push(list()); i += 1; } else { out.push(k.s ?? k.w); i += 1; } } return out; }; return list(); }
const nodes = new Map();
const attrsOf = (l) => Object.fromEntries((Array.isArray(l) ? l : []).filter(Array.isArray).map((p) => [p[0], p[1]]));
function addNode(parent, type, id, attrs, children) { const n = { id, type, attrs: attrsOf(attrs), parent, children: [] }; nodes.set(id, n); const p = nodes.get(parent); if (p) p.children.push(id); for (const c of Array.isArray(children) ? children : []) if (Array.isArray(c)) addNode(id, c[0], c[1], c[2], c[3]); }
function removeNode(id) { const n = nodes.get(id); if (!n) return; for (const c of [...n.children]) removeNode(c); const p = nodes.get(n.parent); if (p) p.children = p.children.filter((x) => x !== id); nodes.delete(id); }
function apply(body) {
  const top = parse(tokenize(body));
  for (let i = 0; i < top.length; i += 1) { if (top[i] !== "om") continue; const cmds = top[i + 2]; if (!Array.isArray(cmds)) continue; for (const c of cmds) { if (!Array.isArray(c)) continue; if (c[0] === "an") addNode(c[1], c[2], c[3], c[4], c[5]); else if (c[0] === "un") { const n = nodes.get(c[1]); if (n) Object.assign(n.attrs, attrsOf(c[2])); } else if (c[0] === "rn") removeNode(c[1]); } }
}
const byName = (type, name) => [...nodes.values()].find((n) => n.type === type && (n.attrs.colName === name || n.attrs.name === name));
const field = (col) => { const n = byName("FormField", col); return n ? String(n.attrs.value ?? "") : null; };
function table(name) {
  const t = byName("Table", name); if (!t) return null; const cols = {};
  for (const cid of t.children) { const c = nodes.get(cid); if (c?.type !== "TableColumn") continue; const vl = c.children.map((x) => nodes.get(x)).find((x) => x?.type === "ValueList"); cols[c.attrs.colName] = (vl ? vl.children.map((x) => nodes.get(x)) : []).map((v) => String(v?.attrs.value ?? "")); if (c.attrs.aggregateValue != null) cols[c.attrs.colName + "__total"] = c.attrs.aggregateValue; }
  return { size: Number(t.attrs.size ?? 0), pageSize: Number(t.attrs.pageSize ?? 0), cols };
}
const rows = (tb, keys) => Array.from({ length: Math.min(tb.size, Math.max(0, ...keys.map((k) => (tb.cols[k] || []).length))) }, (_, i) => Object.fromEntries(keys.map((k) => [k, (tb.cols[k] || [])[i] ?? null])));

// ── Allowlisted projection (the only per-record data that reaches disk) ───────────────────────────────────────
const presence = (v) => (v && String(v).trim() ? "present" : "empty");
const hm = (s) => { const m = /(\d{1,2}):(\d{2})/.exec(String(s || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
function snapshot() {
  const legs = table("scr_legs"), det = table("scr_detov"), pax = table("scr_pasajeros_leg"), apt = table("scr_oaci");
  const sched = legs ? rows(legs, ["fechainiutc", "fechaini", "horiniutc", "horini", "pax", "id_oaci_ori", "oaci_ori", "id_oaci_dest", "oaci_dest", "horas_etv"]) : [];
  // Estimated Hours check, computed here: Z departure + hours (decimal) vs the next leg / any Z time the remarks quote.
  const remark = String(field("notdisp") || "").replace(/<[^>]+>/g, " ");
  const zTimesInRemarks = new Set((remark.match(/\b(\d{2})(\d{2})Z\b/g) || []).map((z) => Number(z.slice(0, 2)) * 60 + Number(z.slice(2, 4))));
  const hoursCheck = sched.map((l) => { const h = Number(String(l.horas_etv || "").replace(",", ".")); const std = hm(l.horiniutc); const arrDecimal = std != null && Number.isFinite(h) ? (std + Math.round(h * 60)) % 1440 : null; const arrHmm = std != null ? (std + Math.floor(h) * 60 + Math.round((h % 1) * 100)) % 1440 : null; return { hours: l.horas_etv, stdZ: l.horiniutc?.trim() ?? null, arrivalIfDecimalHours: arrDecimal != null ? `${String(Math.floor(arrDecimal / 60)).padStart(2, "0")}:${String(arrDecimal % 60).padStart(2, "0")}Z` : null, arrivalIfHmm: arrHmm != null ? `${String(Math.floor(arrHmm / 60)).padStart(2, "0")}:${String(arrHmm % 60).padStart(2, "0")}Z` : null, decimalArrivalQuotedInRemarks: arrDecimal != null && zTimesInRemarks.has(arrDecimal), hmmArrivalQuotedInRemarks: arrHmm != null && zTimesInRemarks.has(arrHmm) }; });
  return {
    header: { quote: field("id_vuelo1"), quoteDate: field("fecpres1"), typeOfFlightCode: field("id_tvuelo1"), aircraft: field("id_avion1"), flightDate: field("fecha1") },
    schedule: legs && { size: legs.size, pageSize: legs.pageSize, totalEstimatedHours: legs.cols["horas_etv__total"] ?? null, rows: sched.map((r) => ({ zDate: r.fechainiutc, ltDate: r.fechaini, zTime: r.horiniutc, ltTime: r.horini, pax: r.pax, dep: r.id_oaci_ori, depName: r.oaci_ori, arr: r.id_oaci_dest, arrName: r.oaci_dest, estHours: r.horas_etv })) },
    hoursCheck,
    legDetails: { flightOrder: field("id_vuelo3"), registration: field("id_avion3"), aircraftName: field("avion3"), mtow: presence(field("mtow3")), captain: presence(field("cap3")), firstOfficer: presence(field("foff")), flightAttendant: presence(field("att")) },
    legs: det && { size: det.size, rows: rows(det, ["id_leg3", "id_oaci_ori3", "id_oaci_dest3", "fnumber3", "ppr3"]).map((r) => ({ leg: r.id_leg3, dep: r.id_oaci_ori3, arr: r.id_oaci_dest3, flightNumber: r.fnumber3, ppr: presence(r.ppr3) })) },
    cabin: { cabinConfig: field("cabconf"), seats: field("seats"), stretcher: field("stretcher") },
    remarks: { present: remark.trim().length > 0, mentionsSlot: /\bslot/i.test(remark), zTimesQuoted: zTimesInRemarks.size },
    paxByLeg: pax && { size: pax.size, rowsPerLeg: Object.fromEntries(rows(pax, ["id_leg32", "tipo32", "genero"]).reduce((m, r) => m.set(r.id_leg32, (m.get(r.id_leg32) || 0) + 1), new Map())), typeCodesUsed: [...new Set(rows(pax, ["tipo32"]).map((r) => r.tipo32))], genderFilled: rows(pax, ["genero"]).every((r) => r.genero && r.genero.trim()) },
    airports: apt && { size: apt.size, rows: rows(apt, ["id_leg33", "id_oaci33", "proveedor33", "telefo33", "nombre33", "email"]).map((r) => ({ leg: r.id_leg33, icao: r.id_oaci33, supplierIsClearway: /clearway/i.test(r.proveedor33 || ""), supplier: presence(r.proveedor33), phone: presence(r.telefo33), contact: presence(r.nombre33), email: presence(r.email) })) },
  };
}
function structure() {
  const out = { windows: [], tables: {}, formFields: [], actions: [], comboLists: {} };
  for (const n of nodes.values()) {
    if (n.type === "Window") out.windows.push({ name: n.attrs.name, text: n.attrs.text });
    if (n.type === "Table") out.tables[n.attrs.name] = { id: n.id, columns: n.children.map((c) => nodes.get(c)).filter((c) => c?.type === "TableColumn").map((c) => ({ id: c.id, colName: c.attrs.colName, label: c.attrs.text, varType: c.attrs.varType ?? null, noEntry: c.attrs.noEntry === "1" })) };
    if (n.type === "FormField") out.formFields.push({ id: n.id, colName: n.attrs.colName, varType: n.attrs.varType ?? null, hidden: n.attrs.hidden === "1", noEntry: n.attrs.noEntry === "1" });
    if (n.type === "Action" || n.type === "ActionDefault") out.actions.push({ name: n.attrs.name, text: n.attrs.text ?? null, accelerator: n.attrs.acceleratorName ?? null, hidden: n.attrs.hidden === "1" });
    if (n.type === "ComboBox") { const items = n.children.map((c) => nodes.get(c)).filter((c) => c?.type === "Item").map((c) => ({ value: c.attrs.name, text: c.attrs.text })); const owner = nodes.get(n.parent); if (items.length) out.comboLists[owner?.attrs.colName || n.id] = items; }
  }
  return out;
}

// ── Session ──────────────────────────────────────────────────────────────────────────────────────────────────
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1600, height: 2400 }, acceptDownloads: false, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36", locale: "en-GB" });
const page = await ctx.newPage();
const net = path.join(OUT, "network-meta.jsonl"); fs.writeFileSync(net, "");
let pending = Promise.resolve(), protoCount = 0, sid = null;
page.on("response", (res) => {
  const req = res.request(); const url = req.url(); if (["image", "font", "stylesheet", "script"].includes(req.resourceType())) return;
  const m = /\/ua\/(sua|ping)\/([0-9a-f]{32})/.exec(url); if (m) sid = m[2];
  fs.appendFileSync(net, JSON.stringify({ at: new Date().toISOString(), method: req.method(), url: scrub(url.replace(/[0-9a-f]{32}/g, "<session>")).slice(0, 160), status: res.status(), contentType: res.headers()["content-type"] ?? null, fourjsTimeout: res.headers()["x-fourjs-timeout"] ?? null, fourjsResult: res.headers()["x-fourjs-request-result"] ?? null }) + "\n");
  if (/\/ua\/sua\//.test(url)) pending = pending.then(async () => { try { apply(await res.text()); protoCount += 1; } catch { /* no body */ } });
});
page.on("popup", async (p) => { log("popup opened:", p.url().replace(/[0-9a-f]{32}/g, "<session>").slice(0, 160)); await p.close().catch(() => {}); });
page.on("download", (d) => { log("download offered (cancelled):", d.suggestedFilename() ? "named file" : "unnamed", d.url().replace(/[0-9a-f]{32}/g, "<session>").slice(0, 160)); d.cancel().catch(() => {}); });
const settle = async (ms = 3000) => { await pause(ms); await pending; };
const screenEnded = async () => /Session does not exist|application ended|Session not found/i.test(await page.evaluate(() => document.body.innerText).catch(() => ""));

const t0 = Date.now();
await page.goto("https://cnair.efficens.es/gas320/ua/r/cnair/flightdispatcher", { waitUntil: "load" });
await pause(1500); await page.fill("#uusr", USER); await page.fill("#pswd", PASS);
await Promise.all([page.waitForLoadState("load").catch(() => {}), page.click("#subbb")]);
await settle(8000);
log("login done; protocol messages:", protoCount, "nodes:", nodes.size, "ended:", await screenEnded());
const struct = structure(); fs.writeFileSync(path.join(OUT, "structure.json"), JSON.stringify(struct, null, 1));
log("structure: windows", struct.windows.length, "tables", Object.keys(struct.tables).join(","), "fields", struct.formFields.length, "actions", struct.actions.length);
log("table node ids this session:", Object.fromEntries(Object.entries(struct.tables).map(([k, v]) => [k, v.id])));

const list = table("scr_vuelos"); const listRows = list ? rows(list, ["id_vuelo2", "fecpres2", "fecha2", "id_avion2", "id_tvuelo2"]) : [];
log("flight list:", listRows.length, "rows;", JSON.stringify(listRows));
const records = [];
if (ONLY && !listRows.some((r) => r.id_vuelo2 === ONLY)) log(`quote ${ONLY} is NOT in the list (default filter)`);
for (const r of listRows) {
  const q = r.id_vuelo2; if (ONLY && q !== ONLY) continue; const before = protoCount; const at = new Date().toISOString();
  await page.getByText(q, { exact: true }).first().click(); await settle(3500);
  const snap = snapshot(); const open1 = JSON.stringify(snap);
  // Does selecting another leg row change the per-leg panels? (pax/airport tables are expected to be whole-record)
  let legClickChanged = null;
  if (snap.legs && snap.legs.size > 1) { const fn = snap.legs.rows[1]?.flightNumber; if (fn) { const b2 = protoCount; await page.getByText(fn, { exact: true }).first().click().catch(() => {}); await settle(2500); legClickChanged = { protocolMessages: protoCount - b2, snapshotChanged: JSON.stringify(snapshot()) !== open1 }; } }
  records.push({ openedAt: at, listRow: r, protocolMessages: protoCount - before, legClickChanged, ...snap });
  log(`record ${q}: legs ${snap.legs?.size ?? "?"}, schedule rows ${snap.schedule?.size ?? "?"}, pax rows ${snap.paxByLeg?.size ?? "?"}, airports ${snap.airports?.size ?? "?"}, hours ${snap.schedule?.rows.map((x) => x.estHours).join("/")}`);
  fs.writeFileSync(path.join(OUT, "records.json"), JSON.stringify(records, null, 1));
  if (await screenEnded()) { log("session ended during collection"); break; }
}
// Determinism: re-open the first record and compare the projection.
if (listRows[0] && !ONLY) { await page.getByText(listRows[0].id_vuelo2, { exact: true }).first().click(); await settle(3000); const again = snapshot(); const first = records[0]; const same = JSON.stringify({ ...again }) === JSON.stringify(Object.fromEntries(Object.entries(first).filter(([k]) => !["openedAt", "listRow", "protocolMessages", "legClickChanged"].includes(k)))); log("re-read of first record identical:", same); }
// The "View" column of the schedule table: what does it trigger? (any popup/download is closed/cancelled, never saved)
if (!ONLY) { const b2 = protoCount; const n0 = fs.readFileSync(net, "utf8").split("\n").length; await page.locator("text=View").first().click().catch(() => {}); await settle(3000); const added = fs.readFileSync(net, "utf8").split("\n").slice(n0 - 1).filter(Boolean).map((l) => JSON.parse(l)); log("View click: protocol messages", protoCount - b2, "new requests", added.map((x) => `${x.method} ${x.url} ${x.status} ${x.contentType}`)); }
log("collection done at", Math.round((Date.now() - t0) / 1000), "s; session id known:", !!sid);
const cookies = await ctx.cookies();
await b.close(); nodes.clear(); // the browser and the in-memory tree go away before the idle probes
if (NO_PROBE) { log("done (no probes)"); process.exit(0); }

// ── Idle-session limit: pings at growing gaps, no other traffic ──────────────────────────────────────────────
const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const ping = async () => { try { const r = await fetch(`https://cnair.efficens.es/gas320/ua/ping/${sid}?appId=0`, { method: "POST", headers: { cookie: cookieHeader, "user-agent": "Mozilla/5.0" } }); const t = await r.text(); return { status: r.status, text: t.slice(0, 60), timeout: r.headers.get("x-fourjs-timeout") }; } catch (e) { return { error: e.message }; } };
log("probe 0 (immediately):", await ping());
for (const minutes of [2, 5, 10, 20, 40, 55]) {
  await pause(minutes * 60_000);
  const res = await ping(); log(`probe after ${minutes} min idle:`, res);
  if (res.status !== 200) { log(`session gone: survived < ${minutes} min idle`); break; }
}
log("done");
