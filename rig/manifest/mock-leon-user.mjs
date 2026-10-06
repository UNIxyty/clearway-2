// Rig-only mock of Leon for the passenger manifest's per-user access (agent/lib/leon-user.mjs, LEON_USER_API_BASE).
// Answers the token exchange and the manifest's two read queries from rig/manifest/fixtures.mjs — FAKE people only.
// Any flight nid listed in FLIGHTS answers; any other nid answers flight: null (= "your account cannot see it"),
// and a refresh token containing "revoked" is refused, so both refusal paths can be exercised.
//   PORT=3993 node rig/manifest/mock-leon-user.mjs
import http from "node:http";
import { flight } from "./fixtures.mjs";

const PORT = Number(process.env.PORT || 3993);
// Keyed by Leon flight nid. The rig wall's flights use these nids (rig/manifest/wall-flights.mjs).
export const FLIGHTS = {
  880001: () => ({ ...flight({ pax: 3, nid: 880001 }), flightNo: "ORO2151", startAirport: { code: { icao: "LEBL" } }, endAirport: { code: { icao: "LIML" } }, acft: { registration: "EC-OMU" } }),
  880002: () => ({ ...flight({ pax: 14, nid: 880002 }), flightNo: "ORO2151", startAirport: { code: { icao: "LIML" } }, endAirport: { code: { icao: "LEBL" } }, acft: { registration: "EC-OMU" } }),
  880003: () => ({ ...flight({ pax: 68, nid: 880003, leonCount: 70 }), flightNo: "KLJ7350", startAirport: { code: { icao: "EGLF" } }, endAirport: { code: { icao: "EVRA" } }, acft: { registration: "LY-BGS" } }),
  880004: () => ({
    ...flight({ pax: 4, nid: 880004, operator: "CWY_CWY", mutate: (c) => { c[1].contact.placeOfBirth = null; c[1].departurePassport.expiresDate = null; c[2].arrivalPassport = { ...c[2].departurePassport, number: "TEST99999" }; c[3].contact.surname = "Specimen-De-La-Placeholder-Testwood-Sampleton"; c[3].contact.name = "Maria Alexandra Josephine Konstantina Bernadette Wilhelmina Theodora Evangelina"; } }),
    flightNo: "KLJ7351", startAirport: { code: { icao: "EVRA" } }, endAirport: { code: { icao: "EGLF" } }, acft: { registration: "LY-BGS" },
  }),
  880005: () => ({ ...flight({ pax: 0, nid: 880005, crew: 2 }), flightNo: "KLJ7352", startAirport: { code: { icao: "EVRA" } }, endAirport: { code: { icao: "EYVI" } }, acft: { registration: "LY-BGS" } }),
};

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => { body += d; });
  req.on("end", () => {
    if (req.url === "/access_token/refresh/") {
      const token = new URLSearchParams(body).get("refresh_token") ?? "";
      if (!token || /revoked/.test(token)) { res.writeHead(401); return res.end("refused"); }
      res.writeHead(200, { "content-type": "text/plain" }); return res.end(`rig-access-${Buffer.from(token).toString("base64url").slice(0, 12)}`);
    }
    if (req.url === "/api/graphql/") {
      // Real Leon takes a second or two per query; the build's progress steps are visible at that pace.
      return setTimeout(() => graphql(req, res, body), Number(process.env.MOCK_LEON_DELAY_MS ?? 1500));
    }
    res.writeHead(404); res.end();
  });
});
function graphql(req, res, body) {
    {
      if (!/^Bearer rig-access-/.test(req.headers.authorization ?? "")) { res.writeHead(401); return res.end("{}"); }
      const { query } = JSON.parse(body || "{}");
      res.writeHead(200, { "content-type": "application/json" });
      if (/^\s*mutation/i.test(query)) return res.end(JSON.stringify({ errors: [{ message: "mock: read-only" }] }));
      if (/__typename/.test(query) && !/flight\(/.test(query)) return res.end(JSON.stringify({ data: { __typename: "Query" } }));
      const nid = Number(/flightNid:\s*(\d+)/.exec(query)?.[1]);
      if (/unmaskedData/.test(query)) return res.end(JSON.stringify({ data: null, errors: [{ message: "Permission denied: unmask passport data" }] }));
      const make = FLIGHTS[nid];
      if (!make) return res.end(JSON.stringify({ data: { flight: null } }));
      // Same departure time the stub wall lists for this flight, so the picker row and the document agree.
      fetch(`http://127.0.0.1:3992/api/flights/normalized?limit=100`).then((r) => r.json()).catch(() => null).then((w) => {
        const row = w?.flights?.find((x) => Number(x.flightNid) === nid);
        res.end(JSON.stringify({ data: { flight: { ...make(), ...(row ? { startTimeUTC: row.flight.startTimeUTC } : {}) } } }));
      });
      return;
    }
}
server.listen(PORT, "127.0.0.1", () => process.stdout.write(`mock Leon (per-user, manifest) on :${PORT} — fake passengers only\n`));
