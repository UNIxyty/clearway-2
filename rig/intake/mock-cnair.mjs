// The rig's CNAIR portal: an HTTP server that speaks the Genero client protocol the real portal speaks, built from
// the recorded screen structure (rig/fixtures/cnair/portal-structure.json) and the redacted record fixtures
// (rig/fixtures/cnair/26*.json). The agent's reader (agent/lib/intake/providers/cnair.mjs) cannot tell the
// difference at the protocol level: login form → 302 + EFFI_TOKEN, Bootstrap → meta Connection + X-FourJs-Id,
// then om/an/un messages for the screen, the list rows, the record on row selection, and the sign-out action.
//
// Every login, record read and sign-out is appended to rig/.scratch/cnair-mock-log.jsonl: the evidence for
// "no login happened before approval". Faults, for tests:  MOCK_CNAIR_BREAK=columns | total | down | login
//   PORT=3994 node rig/intake/mock-cnair.mjs
import http from "node:http";
import { readFileSync, readdirSync, appendFileSync, existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
const PORT = Number(process.env.PORT || 3994);
const FX = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../fixtures/cnair");
const LOG = path.resolve(process.env.RIG_SCRATCH || path.join(path.dirname(new URL(import.meta.url).pathname), "../.scratch"), "cnair-mock-log.jsonl");
const BREAK = () => String(process.env.MOCK_CNAIR_BREAK ?? (existsSync(LOG + ".break") ? readFileSync(LOG + ".break", "utf8").trim() : "")).trim();
const log = (e) => appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...e }) + "\n");
const S = JSON.parse(readFileSync(path.join(FX, "portal-structure.json"), "utf8"));
const records = readdirSync(FX).filter((f) => /^\d{7}-.*\.json$/.test(f)).map((f) => JSON.parse(readFileSync(path.join(FX, f), "utf8")));
// One extra, synthetic: an aircraft name the agent does not know (must block, never guess).
records.push({ header: { quote: "2619001", quoteDate: "02/10/2026", typeOfFlightCode: "NP", aircraft: "EC-ZZL", flightDate: "12/10/2026" }, legDetails: { registration: "EC-ZZL", aircraftName: "Learjet 60XR", captain: "present", firstOfficer: "present", flightAttendant: "empty" },
  schedule: { size: 1, totalEstimatedHours: "1,10", rows: [{ zDate: "12/10/2026", ltDate: "12/10/2026", zTime: "09:00:00", ltTime: "11:00:00", pax: "2", dep: "LEBL", depName: "Barcelona", arr: "LEPA", arrName: "Son Sant Joan", estHours: "1,10" }] }, legs: { size: 1, rows: [{ leg: "1", dep: "LEBL", arr: "LEPA", flightNumber: "ORO 1041", ppr: "empty" }] }, cabin: { cabinConfig: "Pax", seats: "7", stretcher: "No" }, remarks: { present: false }, paxByLeg: { size: 2 }, airports: { size: 1, rows: [{ leg: "1", icao: "LEBL" }] } });
// A second synthetic one (a known aircraft) that a test can HIDE from the list for a number of reads with the file
// <log>.hide = "<quote> <reads>" (a record can show up days after its quote date): the agent must retry on its
// schedule, not fall through to anything else. The counter in the file goes down on every list read.
const hidden = () => { try { const [quote, n] = readFileSync(LOG + ".hide", "utf8").trim().split(/\s+/); const left = Number(n); if (left > 0) { writeFileSync(LOG + ".hide", `${quote} ${left - 1}`); return quote; } } catch {} return null; };
records.push({ ...structuredClone(records[records.length - 1]), header: { quote: "2619002", quoteDate: "02/10/2026", typeOfFlightCode: "NP", aircraft: "EC-ZZL", flightDate: "14/10/2026" }, legDetails: { registration: "EC-ZZL", aircraftName: "Citation CJ4", captain: "present", firstOfficer: "present", flightAttendant: "empty" },
  schedule: { size: 1, totalEstimatedHours: "1,10", rows: [{ zDate: "14/10/2026", ltDate: "14/10/2026", zTime: "09:00:00", ltTime: "11:00:00", pax: "2", dep: "LEBL", depName: "Barcelona", arr: "LEPA", arrName: "Son Sant Joan", estHours: "1,10" }] } });
const allRows = records.map((r) => ({ quote: r.header.quote, quoteDate: r.header.quoteDate, flightDate: r.header.flightDate, aircraft: r.header.aircraft, typeCode: r.header.typeOfFlightCode })).sort((a, b) => b.quote.localeCompare(a.quote));
let list = allRows;

// ── Protocol text ────────────────────────────────────────────────────────────────────────────────────────────
const q = (v) => `"${String(v ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const attrs = (o) => `{${Object.entries(o).map(([k, v]) => `{${k} ${q(v)}}`).join(" ")}}`;
const node = (type, id, a, kids = []) => `{${type} ${id} ${attrs(a)} {${kids.join(" ")}}}`;
let nextId = 5000; const vlId = {}; const idOf = (col) => (vlId[col] ??= nextId++);
function screen() {
  const tables = Object.entries(S.tables).map(([name, t]) => node("Table", t.id, { name, tabName: name, active: "1" }, t.columns.map((c) => {
    const colName = BREAK() === "columns" && c.colName === "horas_etv" ? "horas_vuelo" : c.colName;
    return node("TableColumn", c.id, { name: `formonly.${colName}`, colName, text: c.label, ...(c.varType ? { varType: c.varType } : {}), active: "1" }, [node("ValueList", idOf(c.colName), { size: "0" })]);
  })));
  const fields = S.formFields.map((f) => node("FormField", f.id, { name: `formonly.${f.colName}`, colName: f.colName, ...(f.varType ? { varType: f.varType } : {}), value: "" },
    f.colName === "id_tvuelo1" ? [node("ComboBox", nextId++, { width: "17" }, S.typeOfFlight.map((it) => node("Item", nextId++, { name: it.value, text: it.text })))] : []));
  const actions = S.actions.map((a) => node("Action", nextId++, { name: a.name, text: a.text ?? "", active: "1", hidden: "0" }));
  // The "Sign out" button: the browser client sends its id (not the Action's) when signing out, as the reader does.
  const signOut = node("Button", 712, { name: "cerrarsesion", text: "🔒Sign out", width: "10" });
  const form = node("Form", 780, { name: "cn_clearway.tmp" }, [...tables, ...fields, signOut]);
  const win = node("Window", 781, { name: S.window, text: "CNAIR - CLEARWAY HANDLING & OPERATIONS" }, [form, node("Dialog", 150, { active: "1" }, actions)]);
  return `om 0 {{an 0 UserInterface 0 {{name ${q(S.program)}} {text ${q(S.program)}} {procId "mock:1"} {dbDate "DMY4/"} {decimalSeparator ","}} {${win}}}}`;
}
const addValues = (col, values) => values.map((v) => `{an ${idOf(col)} Value ${nextId++} {{value ${q(v)}}} {}}`).join(" ");
function listMessage(om) {
  const t = S.tables.scr_vuelos;
  const hide = hidden(); list = hide ? allRows.filter((r) => r.quote !== hide) : allRows;
  const cols = { id_vuelo2: list.map((r) => r.quote), fecpres2: list.map((r) => r.quoteDate), fecha2: list.map((r) => r.flightDate), id_avion2: list.map((r) => r.aircraft), id_tvuelo2: list.map((r) => r.typeCode) };
  return `om ${om} {${Object.entries(cols).map(([c, v]) => addValues(c, v)).join(" ")} {un ${t.id} {{size ${q(list.length)}} {currentRow "0"}}}}`;
}
const setField = (col, value) => { const f = S.formFields.find((x) => x.colName === col); return f ? `{un ${f.id} {{value ${q(value)}}}}` : ""; };
function recordMessage(om, r) {
  const sch = r.schedule.rows, legs = r.legs.rows;
  const total = BREAK() === "total" ? "9,99" : r.schedule.totalEstimatedHours;
  const horas = S.tables.scr_legs.columns.find((c) => c.colName === "horas_etv");
  const parts = [
    setField("id_vuelo1", r.header.quote), setField("fecpres1", r.header.quoteDate), setField("id_tvuelo1", r.header.typeOfFlightCode), setField("id_avion1", r.header.aircraft), setField("fecha1", r.header.flightDate),
    setField("id_vuelo3", r.header.quote), setField("id_avion3", r.legDetails.registration), setField("avion3", r.legDetails.aircraftName),
    setField("cap3", r.legDetails.captain === "present" ? "MOCK CAPTAIN" : ""), setField("foff", r.legDetails.firstOfficer === "present" ? "MOCK FIRST OFFICER" : ""), setField("att", r.legDetails.flightAttendant === "present" ? "MOCK ATTENDANT" : ""),
    setField("cabconf", r.cabin?.cabinConfig ?? ""), setField("seats", r.cabin?.seats ?? ""), setField("stretcher", r.cabin?.stretcher ?? ""), setField("notdisp", r.remarks?.present ? "<p>mock remarks</p>" : ""),
    addValues("fechainiutc", sch.map((x) => x.zDate)), addValues("fechaini", sch.map((x) => x.ltDate)), addValues("horiniutc", sch.map((x) => ` ${x.zTime.trim()}`)), addValues("horini", sch.map((x) => x.ltTime.trim())),
    addValues("pax", sch.map((x) => x.pax)), addValues("id_oaci_ori", sch.map((x) => x.dep)), addValues("oaci_ori", sch.map((x) => x.depName)), addValues("id_oaci_dest", sch.map((x) => x.arr)), addValues("oaci_dest", sch.map((x) => x.arrName)), addValues("horas_etv", sch.map((x) => x.estHours)),
    `{un ${S.tables.scr_legs.id} {{size ${q(sch.length)}} {currentRow "0"}}}`, horas ? `{un ${horas.id} {{aggregateValue ${q(total)}} {varType "DECIMAL(16,2)"}}}` : "",
    addValues("id_leg3", legs.map((x) => x.leg)), addValues("id_oaci_ori3", legs.map((x) => x.dep)), addValues("id_oaci_dest3", legs.map((x) => x.arr)), addValues("fnumber3", legs.map((x) => x.flightNumber)), addValues("ppr3", legs.map((x) => (x.ppr === "present" ? "PPR1" : ""))),
    `{un ${S.tables.scr_detov.id} {{size ${q(legs.length)}} {currentRow "0"}}}`,
    addValues("id_leg32", Array.from({ length: r.paxByLeg?.size ?? 0 }, (_, i) => String(i + 1))), `{un ${S.tables.scr_pasajeros_leg.id} {{size ${q(r.paxByLeg?.size ?? 0)}}}}`,
    addValues("id_leg33", (r.airports?.rows ?? []).map((x) => x.leg)), addValues("id_oaci33", (r.airports?.rows ?? []).map((x) => x.icao)), addValues("proveedor33", (r.airports?.rows ?? []).map(() => "MOCK HANDLER")), addValues("email", (r.airports?.rows ?? []).map(() => "mock@handler.example")), `{un ${S.tables.scr_oaci.id} {{size ${q((r.airports?.rows ?? []).length)}}}}`,
  ];
  return `om ${om} {${parts.filter(Boolean).join(" ")}}`;
}

// ── HTTP ──────────────────────────────────────────────────────────────────────────────────────────────────────
const sessions = new Map();
const cookie = (req, name) => (req.headers.cookie ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith(name + "="))?.slice(name.length + 1) ?? null;
const text = (res, body, headers = {}) => { res.writeHead(200, { "content-type": "text/plain; charset=UTF-8", "x-fourjs-server": "GAS/mock", ...headers }); res.end(body); };
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x"); let body = ""; for await (const d of req) body += d;
  if (u.pathname === "/gas320/ua/r/cnair/flightdispatcher") {
    if (req.method === "POST") {
      const p = new URLSearchParams(body); const ok = p.get("userName") && p.get("password") && BREAK() !== "login";
      log({ event: "login", ok: !!ok, user: ok ? "<present>" : "<refused>" });
      res.writeHead(302, { location: "/gas320/ua/r/cnair/flightdispatcher", "set-cookie": ok ? [`EFFI_TOKEN=${randomBytes(24).toString("hex")}; Path=/gas320/ua/r/cnair`, "EFFI_USER=mock; Path=/gas320/ua/r/cnair"] : [] }); return res.end();
    }
    if (u.searchParams.get("Bootstrap") === "done") {
      if (!cookie(req, "EFFI_TOKEN")) { res.writeHead(401); return res.end("no session"); }
      const sid = randomBytes(16).toString("hex"); sessions.set(sid, { om: 0, started: Date.now() });
      return text(res, 'meta Connection {{encoding "UTF-8"} {protocolVersion "102"} {interfaceVersion "110"} {runtimeVersion "mock"} {compression "none"} {encapsulation "1"} {filetransfer "1"} {frontEndID "{mock}"} {procId "mock:1"}}', { "x-fourjs-id": sid, "x-fourjs-timeout": "150" });
    }
    res.writeHead(200, { "content-type": "text/html; charset=UTF-8", "set-cookie": "lang=en; Path=/" }); return res.end('<html><body><form method="post"><input id="uusr" name="userName"><input id="pswd" name="password" type="password"><button id="subbb" name="submit" value="Entrar">Entrar</button></form></body></html>');
  }
  const m = /^\/gas320\/ua\/(sua|ping)\/([0-9a-f]{32})$/.exec(u.pathname);
  if (m) {
    const s = sessions.get(m[2]); if (!s) { res.writeHead(404); return res.end("Session not found"); }
    if (m[1] === "ping") return text(res, "");
    // As the live GAS behaves (2026-10-03): an event that is not newline-terminated, or sent without the client
    // headers, is never answered. The mock refuses instead of hanging so a regression fails fast.
    if (/^event/.test(body) && (!body.endsWith("\n") || !req.headers["x-fourjs-client"])) { res.writeHead(400); return res.end("mock: the live portal would never answer this (no trailing newline or no X-FourJs-Client header)"); }
    if (/^meta Client/.test(body)) { if (BREAK() === "down") return text(res, "No se ha podido iniciar sesión"); s.om = 0; return text(res, screen()); }
    if (/ActionEvent/.test(body)) { log({ event: "signout" }); sessions.delete(m[2]); return text(res, `om ${++s.om} {}`); }
    if (/pageSize/.test(body)) return text(res, listMessage(++s.om));
    const row = /currentRow "(\d+)"/.exec(body);
    if (row) { const r = records.find((x) => x.header.quote === list[Number(row[1])]?.quote); log({ event: "record", ref: r?.header.quote ?? null }); return text(res, r ? recordMessage(++s.om, r) : `om ${++s.om} {}`); }
    return text(res, `om ${++s.om} {}`);
  }
  res.writeHead(404); res.end();
}).listen(PORT, "127.0.0.1", () => console.log(`mock CNAIR portal on :${PORT} · ${list.length} records · log ${LOG}`));
