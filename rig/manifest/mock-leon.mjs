// Rig-only mock of Leon for the passenger manifest, PER OPERATOR: the agent reaches http://127.0.0.1:3993/<oprId>
// (LEON_OPERATOR_API_BASE=http://127.0.0.1:3993/{opr}). Answers the token exchange, the all-operator flight search
// (flightList) and the manifest's two reads — FAKE people only (rig/manifest/fixtures.mjs). Times are relative to now.
// A refresh token containing "revoked" is refused (a broken key); an operator id it does not know answers no flights.
//   PORT=3993 node rig/manifest/mock-leon.mjs
import http from "node:http";
import { flight } from "./fixtures.mjs";

const PORT = Number(process.env.PORT || 3993);
const DELAY = Number(process.env.MOCK_LEON_DELAY_MS ?? 1200); // real Leon takes a second or two per query
const H = 3600_000;
const base = Date.now();
const at = (h) => new Date(Math.round((base + h * H) / 300_000) * 300_000).toISOString().replace(/\.\d+Z$/, "Z");
const city = { LEBL: "Barcelona", LIML: "Milan", EGLF: "Farnborough", EVRA: "Riga", EYVI: "Vilnius", LSGG: "Geneva", EETN: "Tallinn", UACC: "Astana", UATG: "Atyrau", LFLL: "Lyon" };
// The Clearway rig tenant is a guest sub-operator account in Leon (planMode "sub_operator"), like production's.
const OWN = { "cwy-cwy": { name: "RIG_GUEST_ACCOUNT", planMode: "sub_operator", isGuest: true }, klj: { name: "KlasJet", planMode: "pro", isGuest: false }, artlw: { name: "ART-Line Wings LLC", planMode: "pro", isGuest: false }, tst: { name: "SAMPLE AVIATION UAB", planMode: "pro", isGuest: false } };
const NOTE = "1. FAKENAME Alpha  P/N RIG000001  LV\n2. FAKENAME Beta  P/N RIG000002  LV\n(operator's note — fake, rig only)";
const today19 = (() => { const d = new Date(base); d.setUTCHours(19, 40, 0, 0); return Math.max((d.getTime() - base) / H, 0.5); })();

// [nid, flightNo, registration, adep, ades, hours from now, manifest fixture]
const FLIGHTS = {
  "cwy-cwy": [
    [880001, "ORO2151", "EC-OMU", "LEBL", "LIML", 1, () => flight({ pax: 3, nid: 880001 })],
    [880002, "ORO2151", "EC-OMU", "LIML", "LEBL", 5, () => flight({ pax: 14, nid: 880002 })],
    [880003, "KLJ7350", "LY-BGS", "EGLF", "EVRA", today19, () => flight({ pax: 68, nid: 880003, leonCount: 70, operator: "CWY_CWY" })],
    [880004, "KLJ7351", "LY-BGS", "EVRA", "EGLF", 26, () => flight({ pax: 4, nid: 880004, operator: "CWY_CWY", mutate: (c) => { c[1].contact.placeOfBirth = null; c[1].departurePassport.expiresDate = null; c[2].arrivalPassport = { ...c[2].departurePassport, number: "TEST99999" }; c[3].contact.surname = "Specimen-De-La-Placeholder-Testwood-Sampleton"; c[3].contact.name = "Maria Alexandra Josephine Konstantina Bernadette Wilhelmina Theodora Evangelina"; } })],
    [880005, "KLJ7352", "LY-BGS", "EVRA", "EYVI", 30, () => flight({ pax: 0, nid: 880005, crew: 2 })],
    // Passengers only as the operator's free-text note in Leon.
    [880006, "DLV240", "D-IMOI", "EVRA", "EETN", 9, () => { const f = flight({ pax: 0, nid: 880006, crew: 2 }); f.passengerList = { count: 2, realCount: 0, isDataSourceText: true, isDataSourceContact: false, passengerText: NOTE, passengerListAsText: "", fileList: [], passengerContactList: null }; return f; }],
  ],
  klj: [
    // The same callsign as cwy-cwy's 880004, held by KlasJet itself: two rows, two operators, different passengers.
    [770004, "KLJ7351", "LY-BGS", "EVRA", "EGLF", 26, () => flight({ pax: 2, nid: 770004, operator: "KlasJet" })],
    [770010, "LY5193", "LY-MGM", "EYVI", "LFLL", 8, () => flight({ pax: 9, nid: 770010, operator: "KlasJet" })],
  ],
  artlw: [
    [660001, "UPAV001", "UP-AV001", "UACC", "UATG", 20, () => flight({ pax: 5, nid: 660001, operator: "ART-Line Wings LLC" })],
  ],
  tst: [
    [550001, "TST101", "LY-TST", "EYVI", "LSGG", 3, () => flight({ pax: 1, nid: 550001, operator: "SAMPLE AVIATION UAB" })],
  ],
};

function flightRecord(row, opr) {
  const [nid, fn, reg, a, b, h, make] = row;
  return { ...make(), operator: OWN[opr], flightNid: nid, flightNo: fn, startTimeUTC: at(h), acft: { registration: reg }, startAirport: { code: { icao: a }, name: `${city[a]} airport`, city: city[a] }, endAirport: { code: { icao: b }, name: `${city[b]} airport`, city: city[b] } };
}

http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => { body += d; });
  req.on("end", () => setTimeout(() => {
    const [, opr, ...rest] = req.url.split("/");
    const path = `/${rest.join("/")}`;
    if (path === "/access_token/refresh/") {
      const token = new URLSearchParams(body).get("refresh_token") ?? "";
      if (!token || /revoked/.test(token)) { res.writeHead(401); return res.end("refused"); }
      res.writeHead(200, { "content-type": "text/plain" }); return res.end(`rig-access-${opr}`);
    }
    if (path === "/api/graphql/") {
      if (req.headers.authorization !== `Bearer rig-access-${opr}`) { res.writeHead(401); return res.end("{}"); }
      const { query } = JSON.parse(body || "{}");
      res.writeHead(200, { "content-type": "application/json" });
      if (/^\s*mutation/i.test(query)) return res.end(JSON.stringify({ errors: [{ message: "mock: read-only" }] }));
      const rows = FLIGHTS[opr] ?? [];
      if (/aircraftList/.test(query)) {
        const regs = [...new Set(rows.map((r) => r[2]))];
        return res.end(JSON.stringify({ data: { aircraftList: regs.map((reg) => ({ registration: reg, registrationWithoutSpecialChars: reg.replace(/[^A-Za-z0-9]/g, ""), operator: OWN[opr] })) } }));
      }
      if (/flightList/.test(query)) {
        return res.end(JSON.stringify({ data: { flightList: rows.map((r) => { const f = flightRecord(r, opr); return { flightNid: f.flightNid, flightNo: f.flightNo, status: "CONFIRMED", startTimeUTC: f.startTimeUTC, iconType: null, isActive: true, isSimulator: false, flightType: "COMMERCIAL", startAirport: f.startAirport, endAirport: f.endAirport, acft: f.acft }; }) } }));
      }
      const nid = Number(/flightNid:\s*(\d+)/.exec(query)?.[1]);
      if (/unmaskedData/.test(query)) return res.end(JSON.stringify({ data: null, errors: [{ message: "Permission denied: unmask passport data" }] }));
      const row = rows.find((r) => r[0] === nid);
      return res.end(JSON.stringify({ data: { flight: row ? flightRecord(row, opr) : null } }));
    }
    res.writeHead(404); res.end();
  }, DELAY));
}).listen(PORT, "127.0.0.1", () => process.stdout.write(`mock Leon (per operator, manifest) on :${PORT} — fake passengers only\n`));
