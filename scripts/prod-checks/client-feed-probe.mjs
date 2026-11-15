// What a client of one operator is sent by the wall (2026-11-12, after the test client saw "No aircraft on your account
// yet"): the same feed the client's Timeline reads, as a check client scoped to CHECK_CLIENT_OPERATOR. Counts only:
// status, aircraft, flights, operators. Run: CHECK_CLIENT_OPERATOR=<oprId> scripts/check-accounts.sh run client-feed-probe
// Since 2026-11-15 also what each flight carries (Part 1.3: a client never sees Limitations, Important, CAA, service
// status or the NOTAM check): every flight of the feeds is the listed fields and nothing else, the weather category only
// with the Weather switch and only a category or null, and no key of the never-list at any depth of any answer. The
// lists are digital-wall/lib/client-scope.mjs's, carried in gate-inventory.json (rig/lib/gate-inventory.mjs writes it;
// the rig's client-gate-check fails when the copy is stale): this runs in the portal container, which has no wall
// sources to import. Counts only, never a key's value.
import { readFileSync } from "node:fs";
import path from "node:path";
export const ROLES = ["client"];
const INV = JSON.parse(readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "gate-inventory.json"), "utf8"));
const WX = new Set(["VFR", "MVFR", "IFR", "LIFR"]);
const flightsIn = (v, out = []) => { if (Array.isArray(v)) v.forEach((x) => flightsIn(x, out)); else if (v && typeof v === "object") { if ("flightNid" in v && "startTimeUTC" in v) out.push(v); for (const [k, x] of Object.entries(v)) if (k !== "adep" && k !== "ades") flightsIn(x, out); } return out; };
const neverCount = (v, never) => { let n = 0; const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") for (const [k, y] of Object.entries(x)) { if (never.has(k)) n += 1; walk(y); } }; walk(v); return n; };

export async function check({ base, accounts: [c], ok }) {
  const get = (p) => fetch(`${base}${p}`, { redirect: "manual", headers: { cookie: c.cookie }, signal: AbortSignal.timeout(30000) }).catch(() => ({ status: 0, json: async () => null }));
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)).toISOString();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 4)).toISOString();
  const r = await get(`/digital-wall/api/timeline/flights?allOperators=true&refresh=false&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  let d = null; try { d = await r.json(); } catch { /* judged below */ }
  const aircraft = d?.aircraft ?? [];
  const flights = aircraft.reduce((n, a) => n + (a.flights?.length ?? 0), 0);
  console.log(`      operator ${process.env.CHECK_CLIENT_OPERATOR || "(none)"}: ${r.status} · ${aircraft.length} aircraft · ${flights} flights · operators ${JSON.stringify(d?.operators ?? [])} · totalAircraft ${d?.totalAircraft ?? "?"}`);
  const me = await get("/api/client/me"); let mj = null; try { mj = await me.json(); } catch { /* */ }
  console.log(`      standing: ${me.status} · switches ${mj?.switches?.length ?? "?"} · level ${mj?.passengerLevel ?? "?"}`);
  ok(r.status === 200 && Array.isArray(d?.aircraft), "the wall's feed answers the client", r.status);
  ok(process.env.CHECK_CLIENT_OPERATOR ? aircraft.length > 0 : aircraft.length === 0, process.env.CHECK_CLIENT_OPERATOR ? "a client of a real operator is sent that operator's aircraft" : "a client whose scope matches nothing is sent nothing", `${aircraft.length} aircraft`);

  // ── what each flight carries (2026-11-15) ──
  const L = INV.clientFlight;
  ok(Array.isArray(L?.fields) && L.fields.length > 0 && Array.isArray(L?.never) && L.never.length > 0 && L.switchFields && typeof L.switchFields === "object", "the lists of what a client's flight may and may never carry are in gate-inventory.json (node rig/lib/gate-inventory.mjs --write)", L ? `${L.fields?.length ?? 0} fields · ${L.never?.length ?? 0} never` : "missing");
  if (!L?.fields?.length || !L?.never?.length) return;   // fails closed: nothing to judge against
  const switches = Array.isArray(mj?.switches) ? mj.switches : [];
  const allowed = new Set([...L.fields, ...Object.entries(L.switchFields).filter(([, sw]) => switches.includes(sw)).map(([k]) => k)]);
  const never = new Set(L.never);
  const reads = [
    ["timeline", `/digital-wall/api/timeline/flights?allOperators=true&refresh=false&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`],
    ["upcoming", "/digital-wall/api/upcoming/flights"],
    ["normalized", `/digital-wall/api/flights/normalized?window=all-cached&limit=500&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`],
    ["aircraft", "/digital-wall/api/timeline/aircraft"],
  ];
  // (not /api/flight-info here: one flight's read asks the portal for that airport's NOTAMs, which can start a scrape on
  // production; the rig's client-feed-check walks it)
  let read = 0, beyond = 0, wxBad = 0, neverKeys = 0; const statuses = [];
  for (const [label, p] of reads) {
    const res = await get(p); let j = null; try { j = await res.json(); } catch { /* not JSON */ }
    statuses.push(`${label} ${res.status}`);
    if (res.status !== 200 || !j) continue;
    const fl = flightsIn(j); read += fl.length;
    for (const f of fl) { beyond += Object.keys(f).filter((k) => !allowed.has(k)).length; wxBad += ["wxDep", "wxArr"].filter((k) => k in f && (!switches.includes("weather") || !(f[k] === null || WX.has(f[k])))).length; }
    neverKeys += neverCount(j, never);
  }
  console.log(`      reads: ${statuses.join(" · ")} · ${read} flights read · ${beyond} keys beyond the list · ${wxBad} weather values out of rule · ${neverKeys} never-list keys`);
  ok(statuses.every((x) => / 200$/.test(x)), "every feed a client reads answers", statuses.join(" · "));
  ok(beyond === 0 && wxBad === 0, `every flight the client is sent (${read}) is the listed fields, the weather category a category or null and only with Weather`, `${beyond} beyond · ${wxBad} weather`);
  ok(neverKeys === 0, `no answer holds a key of the never-list (${L.never.length}: limitations, checks, notamCheck, important, caa, notes…) at any depth`, `${neverKeys} found`);
}
