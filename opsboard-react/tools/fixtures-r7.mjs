// Bug report 7 verification fixtures (tools/wall-verify.mjs). Same frozen clock as tools/fixtures.mjs; the
// default fixture set is untouched. Every flight goes through the SERVER's own mapper (mapLeonFlight) from a
// Leon-shaped record, so what is checked is the real derivation, not a hand-set flag.
//   - five trips with the statuses Leon returned on 2026-10-06 (flight numbers, registrations and statuses as Leon
//     holds them; times and airports placed inside the frozen window so they are on screen),
//   - three EET cases (EET = STA − STD, EET longer, EET shorter),
//   - one flight carrying every chip (IMP, CAA, NOTAM alert, WX at both ends),
//   - a busy day: 24 aircraft with short KlasJet-style rotations, for the horizontal-sizing counts.
import { mapLeonFlight } from "../../digital-wall/leon-sync.mjs";
import { FROZEN_NOW_MS, buildFixtures } from "./fixtures.mjs";

const M = 60_000;
const iso = (offsetMin) => new Date(FROZEN_NOW_MS + offsetMin * M).toISOString().replace(/\.\d+Z$/, "Z");

/** A Leon-shaped raw flight → the wall's server record (mapLeonFlight) + the airport / limitation fields. */
function leonFlight({ nid, fn, status = "CONFIRMED", dep, arr, std, sta, eetMin = null, to = null, limitations = [], limIds = [], wxDep = null, wxArr = null }) {
  const raw = {
    flightNid: nid, flightNo: fn, status, startTimeUTC: iso(std), endTimeUTC: iso(sta),
    flightWatch: { ...(eetMin != null ? { eet: eetMin * 60, eetIso: `${String(Math.floor(eetMin / 60)).padStart(2, "0")}:${String(eetMin % 60).padStart(2, "0")}` } : {}), ...(to != null ? { toIso: iso(to) } : {}) },
  };
  return { ...mapLeonFlight(raw), adep: { icao: dep }, ades: { icao: arr }, limitations, limitationIds: limIds, wxDep, wxArr, checks: {} };
}

/** The five trips: three OPTION and two CONFIRMED at the source on 2026-10-06. */
export const FIVE_TRIPS = [
  { oprId: "cwy-cwy", registration: "UP-LA255", nid: 72924895, fn: "UPLA255", status: "OPTION", dep: "UAAA", arr: "EVRA", std: 30, sta: 150 },
  { oprId: "bys", registration: "EW-579PP", nid: 74856062, fn: "BYS", status: "OPTION", dep: "UMMS", arr: "EVRA", std: 70, sta: 240 },
  { oprId: "vpc", registration: "ES-BTC", nid: 75619493, fn: "VPC004", status: "OPTION", dep: "EETN", arr: "LIML", std: 50, sta: 470 },
  { oprId: "cwy-cwy", registration: "EC-OMU", nid: 74954680, fn: "ORO2151", status: "CONFIRMED", dep: "LEBL", arr: "LIML", std: 40, sta: 115 },
  { oprId: "klj", registration: "LY-JMS", nid: 74375326, fn: "KLJ7292", status: "CONFIRMED", dep: "EYVI", arr: "EVRA", std: 90, sta: 150 },
];

/** EET cases: the bar must start at STD (no T/O) in all three and end at STD + EET. */
export const EET_CASES = [
  { registration: "EC-EQ1", nid: 99701, fn: "ORO2151", label: "EET equals STA − STD", dep: "LEBL", arr: "LEIB", std: 60, sta: 105, eetMin: 45 },
  { registration: "EC-EQ2", nid: 99702, fn: "ORO2152", label: "EET longer (02:00 on a 45-min schedule)", dep: "LEBL", arr: "LEIB", std: 60, sta: 105, eetMin: 120 },
  { registration: "EC-EQ3", nid: 99703, fn: "ORO2153", label: "EET shorter (1:00 on a 2-h schedule)", dep: "LEBL", arr: "GCLP", std: 60, sta: 180, eetMin: 60 },
];

function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

export function buildR7TimelineFlights({ busy = false } = {}) {
  const aircraft = [
    ...FIVE_TRIPS.map((t) => ({ oprId: t.oprId, registration: t.registration, operatorName: t.oprId.toUpperCase(), flights: [leonFlight(t)] })),
    ...EET_CASES.map((c) => ({ oprId: "cwy-cwy", registration: c.registration, operatorName: c.label, flights: [leonFlight({ ...c })] })),
    {
      oprId: "klj", registration: "LY-CHP", operatorName: "Chip test",
      flights: [leonFlight({
        nid: 99801, fn: "KLJ9910", dep: "EYVI", arr: "EVRA", std: 20, sta: 80, limIds: ["lim-1"], wxDep: "IFR", wxArr: "VFR",
        limitations: [
          { id: "imp-1", type: "IMP", title: "Important", source: "important" },
          { id: "caa-1", type: "CAA", title: "CAA", source: "caa" },
          { id: "ntm-1", type: "NTM", title: "NOTAM", source: "alert" },
        ],
      })],
    },
  ];
  if (busy) {
    const rnd = seeded(7);
    const airports = ["EYVI", "EVRA", "EETN", "EPWA", "ESSA", "EKCH", "LKPR", "EDDB", "EFHK", "LOWW"];
    for (let a = 0; a < 24; a += 1) {
      const flights = [];
      let t = -180 + Math.floor(rnd() * 90);
      let at = airports[a % airports.length];
      for (let k = 0; t < 14 * 60; k += 1) {
        const dur = [20, 25, 35, 45, 55, 70, 90][Math.floor(rnd() * 7)];
        const to = airports[Math.floor(rnd() * airports.length)];
        const lim = rnd() < 0.3;
        flights.push(leonFlight({
          nid: 100000 + a * 100 + k, fn: `LY${5100 + a * 10 + k}`, dep: at, arr: to === at ? "EVRA" : to, std: t, sta: t + dur,
          limIds: lim ? ["lim-2"] : [], wxDep: rnd() < 0.25 ? "MVFR" : null,
          limitations: [...(rnd() < 0.2 ? [{ id: `imp-${a}-${k}`, type: "IMP", source: "important" }] : []), ...(rnd() < 0.15 ? [{ id: `ntm-${a}-${k}`, type: "NTM", source: "alert" }] : [])],
        }));
        at = to === at ? "EVRA" : to;
        t += dur + [10, 15, 20, 30, 45][Math.floor(rnd() * 5)];
      }
      aircraft.push({ oprId: "klj", registration: `LY-B${String(a).padStart(2, "0")}`, operatorName: "Busy day", flights });
    }
  }
  return { ok: true, source: "fixture-r7", aircraft };
}

export function buildR7Fixtures({ busy = false, settings = {} } = {}) {
  const base = buildFixtures();
  return {
    ...base,
    "/api/timeline/flights": buildR7TimelineFlights({ busy }),
    "/api/display/settings": { ...base["/api/display/settings"], settings: { ...base["/api/display/settings"].settings, ...settings } },
  };
}
