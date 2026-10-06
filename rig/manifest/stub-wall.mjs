// Rig-only stub of the wall's /api/flights/normalized for the manifest picker test: flight records in the wall's own
// shape, times relative to NOW so "upcoming" means something. Nids 880001–880005 exist in mock-leon-user.mjs; 880099
// does not (Leon "cannot see it" → the refusal path).
//   PORT=3992 node rig/manifest/stub-wall.mjs
import http from "node:http";

const PORT = Number(process.env.PORT || 3992);
const H = 3600_000;
const base = Date.now();
const at = (h) => new Date(Math.round((base + h * H) / 300_000) * 300_000).toISOString();
const ap = { LEBL: "Barcelona", LIML: "Milan", EGLF: "Farnborough", EVRA: "Riga", EYVI: "Vilnius", LSGG: "Geneva", EETN: "Tallinn" };
const rec = (oprId, nid, fn, reg, a, b, h, operatorName) => ({
  key: `${oprId}:${nid}`, oprId, flightNid: String(nid), operatorName, registration: reg,
  flight: { flightNid: nid, flightNo: fn, startTimeUTC: at(h), endTimeUTC: at(h + 2), isCnl: false, adep: { icao: a, city: ap[a] }, ades: { icao: b, city: ap[b] } },
});
const today19 = (() => { const d = new Date(base); d.setUTCHours(19, 40, 0, 0); return (d.getTime() - base) / H; })();
const FLIGHTS = [
  rec("cwy-cwy", 880001, "ORO2151", "EC-OMU", "LEBL", "LIML", 1, "CWY-CWY"),
  rec("cwy-cwy", 880002, "ORO2151", "EC-OMU", "LIML", "LEBL", 5, "CWY-CWY"),
  rec("cwy-cwy", 880003, "KLJ7350", "LY-BGS", "EGLF", "EVRA", Math.max(today19, 0.5), "CWY-CWY"),
  rec("cwy-cwy", 880004, "KLJ7351", "LY-BGS", "EVRA", "EGLF", 26, "CWY-CWY"),
  rec("cwy-cwy", 880005, "KLJ7352", "LY-BGS", "EVRA", "EYVI", 30, "CWY-CWY"),
  rec("cwy-cwy", 880099, "BTI472", "YL-ABC", "EVRA", "EETN", 3, "CWY-CWY"),
  rec("cwy-cwy", 880100, "ORO2150", "EC-OMU", "LIML", "LEBL", -30, "CWY-CWY"),
];

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname !== "/api/flights/normalized") { res.writeHead(404); return res.end("{}"); }
  const p = (k) => url.searchParams.get(k);
  const from = Date.parse(p("from") ?? "") || -Infinity, to = Date.parse(p("to") ?? "") || Infinity;
  const flat = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  let rows = FLIGHTS.filter((r) => { const t = Date.parse(r.flight.startTimeUTC); return t >= from && t <= to; });
  if (p("callsign")) rows = rows.filter((r) => flat(r.flight.flightNo).includes(flat(p("callsign"))));
  if (p("registration")) rows = rows.filter((r) => flat(r.registration).includes(flat(p("registration"))));
  if (p("icao")) rows = rows.filter((r) => [r.flight.adep.icao, r.flight.ades.icao].includes(p("icao").toUpperCase()));
  rows.sort((a, b) => Date.parse(a.flight.startTimeUTC) - Date.parse(b.flight.startTimeUTC));
  const limit = Number(p("limit")) || 100;
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, flights: rows.slice(0, limit), total: rows.length, truncated: rows.length > limit, window: null }));
}).listen(PORT, "127.0.0.1", () => process.stdout.write(`stub wall (manifest picker) on :${PORT}\n`));
