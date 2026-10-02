// Read-only Leon lookups used by the intake: what Leon itself says about airports, aircraft, checklist
// definitions and existing flights. Nothing here writes. Results are cached briefly in memory.
//
// Airports come from Leon (airportByCode), not from our own list, because the only airport codes that
// matter for a send are the ones Leon accepts — and Leon also knows each airport's time zone, which is what
// the UTC/local cross-check and the "local time" option on the review screen use.
import { leonGraphql } from "./leon-client.mjs";

const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = await fn();
  cache.set(key, { value, until: Date.now() + ttlMs });
  return value;
}

/** { icao, iata, name, city, tz } or null when Leon does not know the code. Throws only on transport errors. */
export async function airport(code) {
  const c = String(code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(c)) return null;
  return cached(`apt:${c}`, 6 * 3600_000, async () => {
    const r = await leonGraphql(`query($c:AirportCodeScalar!){ airportByCode(airportCode:$c){ name city code{ icao iata } timezone{ name nativeTimezoneName } } }`, { c });
    const a = r.data?.airportByCode;
    if (!a) return null;
    return { icao: a.code?.icao ?? null, iata: a.code?.iata ?? null, name: a.name ?? null, city: a.city ?? null, tz: a.timezone?.nativeTimezoneName || null, tzLabel: a.timezone?.name ?? null };
  });
}

// Offsets and local → UTC live in ../tzdata.mjs: guarded by the tz-data self-test, and refusing ambiguous times.
export { offsetMinutes, localToUtc, localToUtcChecked } from "../tzdata.mjs";

/** Operator aircraft by registration: { nid, registration, type } or null. */
export async function aircraftByRegistration(reg) {
  const r0 = String(reg ?? "").trim().toUpperCase();
  if (!r0) return null;
  const list = await cached("acft:list", 15 * 60_000, async () => {
    const r = await leonGraphql(`query{ aircraftList(onlyActive:true){ acftNid registration acftType{ icao } } }`);
    if (r.errors) throw new Error(`Leon aircraftList: ${r.errors[0]?.message}`);
    return (r.data?.aircraftList ?? []).map((a) => ({ nid: a.acftNid, registration: a.registration, type: a.acftType?.icao ?? null }));
  });
  const norm = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return list.find((a) => norm(a.registration) === norm(r0)) ?? null;
}

/** The operator's OPS checklist definitions, live: [{ nid, label, section, autoAdd, statuses:[{id,caption}], defaultStatus }]. */
export async function checklistDefinitions() {
  return cached("chk:defs", 10 * 60_000, async () => {
    const r = await leonGraphql(`query{ checklist{ getAvailableDefinitions(groupId: OPS){ nid label section isAutoAddToLeg enableForUse defaultStatus{ checklistStatusId } statuses{ checklistStatusId caption } } } }`);
    if (r.errors) throw new Error(`Leon checklist definitions: ${r.errors[0]?.message}`);
    return (r.data?.checklist?.getAvailableDefinitions ?? []).filter((d) => d.enableForUse).map((d) => ({
      nid: d.nid, label: d.label, section: d.section, autoAdd: d.isAutoAddToLeg,
      defaultStatus: d.defaultStatus?.checklistStatusId ?? null,
      statuses: (d.statuses ?? []).map((s) => ({ id: s.checklistStatusId, caption: String(s.caption ?? "").trim() })),
    }));
  });
}

/** Items already on a flight's checklist (auto-added by Leon, or set by a person): [{ cdNid, csId, comment }]. */
export async function flightChecklist(flightNid) {
  const r = await leonGraphql(`query($n:FlightNid!){ flight(flightNid:$n){ checklist{ allItems{ cdNid csId comment } } } }`, { n: Number(flightNid) });
  if (r.errors) throw new Error(`Leon flight checklist: ${r.errors[0]?.message}`);
  return r.data?.flight?.checklist?.allItems ?? [];
}

/** Flights (not cancelled) in a UTC window. Leon caps a flightList window at 3 months; ours is days. */
export async function flightsBetween(startIso, endIso, extra = {}) {
  const r = await leonGraphql(`query($f:FlightFilter!){ flightList(filter:$f){ flightNid tripNid flightNo startTimeUTC endTimeUTC isCnl creationDateTime acft{ registration } startAirport{ code{ icao } } endAirport{ code{ icao } } notes{ ops } trip{ tripNumber } } }`,
    { f: { timeInterval: { start: startIso, end: endIso }, isCnl: false, ...extra } });
  if (r.errors) throw new Error(`Leon flightList: ${r.errors[0]?.message}`);
  return (r.data?.flightList ?? []).map((f) => ({
    nid: f.flightNid, tripNid: f.tripNid, flightNo: f.flightNo, std: f.startTimeUTC, sta: f.endTimeUTC, created: f.creationDateTime,
    registration: f.acft?.registration ?? null, adep: f.startAirport?.code?.icao ?? null, ades: f.endAirport?.code?.icao ?? null,
    opsNotes: f.notes?.ops ?? "", tripNumber: f.trip?.tripNumber ?? null,
  }));
}

export function _clearLeonCache() { cache.clear(); }
