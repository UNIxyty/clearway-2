// Rig-only mock of Leon for the WALL, per operator: the rig walls reach http://127.0.0.1:3985/<oprId>
// (LEON_OPERATOR_API_BASE=http://127.0.0.1:3985/{opr}, rig/start.sh). It answers what the wall's sync asks — the token
// refresh, the schema questions, the OPS checklist definitions, aircraftList, flightList over a time window,
// getModifiedFlightList and flight(flightNid:) — with a day of INVENTED flights (the manifest tests' names: LY-TST,
// TST101 …), timed from the mock's start so the board always has something in each state: landed, airborne, delayed,
// waiting for a CTOT, not yet confirmed, and later today. No people, no passengers' names. Webhook subscriptions are
// kept in memory per operator (list, create, delete), so the console's Webhooks page can be used; every other write
// is refused. Nothing is ever pushed back to the wall.
// The manifest has its own mock (rig/manifest/mock-leon.mjs, :3993); this one is only the wall's.
//   PORT=3985 node rig/wall/mock-leon.mjs
import http from "node:http";

const PORT = Number(process.env.PORT || 3985);
const H = 3600_000, M = 60_000;
const base = Math.round(Date.now() / (5 * M)) * 5 * M;
const at = (h) => new Date(base + h * H).toISOString().replace(/\.\d+Z$/, "Z");
const OPR = "cwy-cwy";
const AIRCRAFT = [
  { aircraftNid: 7001, registration: "LY-TST", paxCapacity: 9, defaultFlightType: "N", acftType: { acftTypeId: 1, icao: "C56X", shortName: "Citation XLS", iata: null } },
  { aircraftNid: 7002, registration: "LY-TSU", paxCapacity: 13, defaultFlightType: "N", acftType: { acftTypeId: 2, icao: "GLEX", shortName: "Global Express", iata: null } },
  { aircraftNid: 7003, registration: "LY-TSV", paxCapacity: 9, defaultFlightType: "N", acftType: { acftTypeId: 3, icao: "CL35", shortName: "Challenger 350", iata: null } },
  { aircraftNid: 7004, registration: "LY-TSW", paxCapacity: 7, defaultFlightType: "G", acftType: { acftTypeId: 4, icao: "PC24", shortName: "Pilatus PC-24", iata: null } },
];
// OPS checklist: Slot and Handling, each with Leon's own status order (least complete first).
const DEFS = [
  { nid: 501, label: "Slot", affectedAirport: "BOTH", statuses: [{ status: "?", color: "#9CA3AF" }, { status: "REQUESTED", color: "#F59E0B" }, { status: "CONFIRMED", color: "#10B981" }] },
  { nid: 502, label: "Handling", affectedAirport: "BOTH", statuses: [{ status: "?", color: "#9CA3AF" }, { status: "REQUESTED", color: "#F59E0B" }, { status: "CONFIRMED", color: "#10B981" }] },
];
// [aircraft index, flightNo, from, to, start (h from mock start), length (h), state, pax]
const LEGS = [
  [0, "TST101", "EYVI", "LSGG", -5, 2.5, "arrived", 3], [0, "TST102", "LSGG", "EVRA", -1.25, 2.75, "airborne", 3],
  [0, "TST103", "EVRA", "EYVI", 3, 1, "scheduled", 2],
  [1, "TST201", "EGLF", "LFPB", -3, 1, "arrived", 0], [1, "TST202", "LFPB", "LIPZ", 1, 1.75, "delayed", 6],
  [1, "TST203", "LIPZ", "EGLF", 6, 2.25, "option", 6],
  [2, "TST301", "EETN", "ESSA", 0.75, 1, "ctot", 4], [2, "TST302", "ESSA", "EETN", 4, 1, "scheduled", 4],
  [3, "TST401", "EVRA", "EETN", 2, 0.75, "scheduled", 2], [3, "TST402", "EETN", "EVRA", 20, 0.75, "scheduled", 2],
];
const FLIGHTS = LEGS.map(([a, no, from, to, off, len, state, pax], i) => {
  const ac = AIRCRAFT[a], s = at(off), e = at(off + len);
  const fw = {};
  if (state === "arrived") Object.assign(fw, { offBlock: at(off - 0.1), toIso: at(off + 0.1), ldgIso: at(off + len - 0.1), blonIso: e, atd: at(off + 0.1), ata: at(off + len - 0.1) });
  if (state === "airborne") Object.assign(fw, { offBlock: s, toIso: at(off + 0.15), atd: at(off + 0.15), etaIso: e });
  if (state === "delayed") Object.assign(fw, { etd: at(off + 0.75), etdIso: at(off + 0.75), eta: at(off + len + 0.75), etaIso: at(off + len + 0.75) });
  if (state === "ctot") Object.assign(fw, { ctot: at(off + 0.33), ctotIso: at(off + 0.33) });
  const done = state === "arrived" || state === "airborne";
  return {
    flightNid: 660001 + i, flightNo: no, status: state === "option" ? "OPTION" : "CONFIRMED", isConfirmed: state !== "option",
    trip: { tripStatus: state === "option" ? "option" : "confirmed" },
    isCnl: false, isActive: true, iconType: null, isSimulator: false, flightType: "COMMERCIAL", isCommercial: true, icaoType: ac.defaultFlightType, isFerry: pax === 0,
    startTimeUTC: s, endTimeUTC: e, startAirport: { code: { icao: from } }, endAirport: { code: { icao: to } },
    acft: { aircraftNid: ac.aircraftNid, registration: ac.registration }, flightWatch: fw,
    checklist: { allItems: DEFS.map((d, k) => ({ cdNid: d.nid, csId: done || (i + k) % 3 === 0 ? "CONFIRMED" : (i + k) % 3 === 1 ? "REQUESTED" : "?", definition: { groupId: "OPS" } })) },
    passengerList: { count: pax }, crewMemberList: [{ loginNid: 1 }, { loginNid: 2 }],
  };
});
const FIELDS = {
  FlightWatch: ["atd", "ata", "toIso", "ldgIso", "etd", "etdIso", "eta", "etaIso", "eet", "eetIso", "ctot", "ctotIso", "tobt", "offBlock", "bloffIso", "blonIso"],
  Flight: ["flightNid", "flightNo", "status", "isConfirmed", "trip", "isCnl", "isActive", "iconType", "isSimulator", "flightType", "isCommercial", "icaoType", "isFerry", "startTimeUTC", "endTimeUTC", "startAirport", "endAirport", "acft", "flightWatch", "checklist", "passengerList", "crewMemberList"],
  ChecklistItem: ["cdNid", "csId", "definition"],
};
const hooks = new Map(); // oprId -> [{ label, webhookUrl, subscription }]
const within = (f, a, b) => Date.parse(f.endTimeUTC) >= Date.parse(a) && Date.parse(f.startTimeUTC) <= Date.parse(b);

http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => { body += c; }); req.on("end", () => {
    const m = /^\/([^/]+)(\/.*)$/.exec(req.url.split("?")[0]); const opr = m?.[1], path = m?.[2];
    const json = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (path === "/access_token/refresh/") { res.writeHead(200, { "content-type": "text/plain" }); return res.end(`rig-wall-access-${opr}`); }
    if (path === "/.well-known/keys/leon-subscriptions-webhook-1.pub") { res.writeHead(404); return res.end(); }
    if (path !== "/api/graphql/") { res.writeHead(404); return res.end(); }
    if (req.headers.authorization !== `Bearer rig-wall-access-${opr}`) { res.writeHead(401); return res.end("{}"); }
    const { query = "", variables = {} } = JSON.parse(body || "{}");
    const subs = hooks.get(opr) ?? []; hooks.set(opr, subs);
    if (/createSubscriptionWebhook/.test(query)) {
      const i = subs.findIndex((h) => h.label === variables.label); if (i >= 0) subs.splice(i, 1);
      subs.push({ label: variables.label, webhookUrl: variables.webhookUrl, subscription: variables.subscription });
      return json({ data: { webhook: { createSubscriptionWebhook: { result: true } } } });
    }
    if (/deleteSubscriptionWebhook/.test(query)) {
      const i = subs.findIndex((h) => h.label === variables.label); if (i >= 0) subs.splice(i, 1);
      return json({ data: { webhook: { deleteSubscriptionWebhook: true } } });
    }
    if (/subscriptionList/.test(query)) return json({ data: { webhook: { subscriptionList: subs } } });
    if (/^\s*mutation/i.test(query)) return json({ errors: [{ message: "The rig's Leon is read-only." }] });
    const mine = opr === OPR;
    const type = /__type\(name:\s*"(\w+)"\)/.exec(query)?.[1];
    if (type) return json({ data: { __type: { fields: (FIELDS[type] ?? []).map((name) => ({ name })) } } });
    // The phone wall's Service status (2026-10-27) asks for captions as the intake does (statuses{ checklistStatusId caption }).
    const CAPTION = { "?": "?", REQUESTED: "Requested", CONFIRMED: "Confirmed" };
    if (/getAvailableDefinitions/.test(query) && /checklistStatusId/.test(query)) return json({ data: { checklist: { getAvailableDefinitions: mine ? DEFS.map((d) => ({ nid: d.nid, label: d.label, section: d.label === "Slot" ? "Slots" : "Handling", statuses: d.statuses.map((st) => ({ checklistStatusId: st.status, caption: CAPTION[st.status] ?? st.status })) })) : [] } } });
    if (/getAvailableDefinitions/.test(query)) return json({ data: { checklist: { getAvailableDefinitions: mine ? DEFS : [] } } });
    if (/flight\(flightNid:\s*\$n\)/.test(query) && /allItems\s*{\s*cdNid csId comment/.test(query)) {
      const f = mine ? FLIGHTS.find((x) => x.flightNid === Number(variables?.n)) : null;
      return json({ data: { flight: f ? { checklist: { allItems: (f.checklist?.allItems ?? []).map((it, k) => ({ cdNid: it.cdNid, csId: it.csId, comment: k === 0 ? `Invented handler for the rig · ARR ${String(f.endTimeUTC).slice(11, 16).replace(":", "")}Z\n261027 / 261027\nhttps://example.invalid/slot` : null })) } } : null } });
    }
    if (/aircraftList/.test(query)) return json({ data: { aircraftList: mine ? AIRCRAFT : [] } });
    if (/getModifiedFlightList/.test(query)) return json({ data: { getModifiedFlightList: [] } });
    if (/operator\s*{\s*oprNid/.test(query)) return json({ data: { operator: { oprNid: 1 } } });
    const win = /timeInterval:\s*{\s*start:\s*"([^"]+)",\s*end:\s*"([^"]+)"/.exec(query);
    if (/flightList/.test(query)) return json({ data: { flightList: mine ? FLIGHTS.filter((f) => !win || within(f, win[1], win[2])) : [] } });
    const nid = Number(/flightNid:\s*(\d+)/.exec(query)?.[1]);
    if (nid) return json({ data: { flight: (mine && FLIGHTS.find((f) => f.flightNid === nid)) || null } });
    return json({ errors: [{ message: "The rig's Leon does not answer this query." }] });
  });
}).listen(PORT, "127.0.0.1", () => process.stdout.write(`wall mock Leon on :${PORT}: ${FLIGHTS.length} invented flights for ${OPR}\n`));
