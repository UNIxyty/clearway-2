// Deterministic API fixtures for the wall/console verification harness
// (tools/wall-audit.mjs). Every payload is derived from a FROZEN now so
// screenshots are byte-reproducible, and the flight set deliberately covers
// every pill state the wall can render: scheduled, delayed (leading hatch),
// CTOT, airborne (+ signed deltas both ways), arrived early (−), cancelled,
// estimated (hollow), unconfirmed (italic), MVT-overdue (blink), a sub-45min
// short flight, and two near-touching pills for hit-area gap tests.

export const FROZEN_NOW_ISO = "2026-09-17T11:38:00.000Z";
export const FROZEN_NOW_MS = Date.parse(FROZEN_NOW_ISO);

const H = 3600_000;
const M = 60_000;
const at = (offsetMin) => new Date(FROZEN_NOW_MS + offsetMin * M).toISOString();

function flight(over) {
  return {
    flightNid: over.flightNid,
    flightNo: over.fn,
    oprId: over.oprId || "bti",
    adep: { icao: over.dep },
    ades: { icao: over.arr },
    startTimeUTC: over.std,
    endTimeUTC: over.sta,
    takeOffUTC: over.to ?? null,
    landingUTC: over.ldg ?? null,
    atd: over.to ?? null,
    ata: over.ldg ?? null,
    etd: over.etd ?? null,
    eta: over.eta ?? null,
    ctotUTC: over.ctot ?? null,
    movementState: over.state ?? null,
    movementStateEstimated: over.estimated === true,
    isCnl: over.cnl === true,
    isConfirmed: over.confirmed !== false,
    delayMin: over.delayMin ?? 0,
    icaoType: over.icaoType || "S",
    checklistColor: null,
    limitationIds: over.limIds || [],
    limitations: [],
    wxDep: over.wxDep ?? null,
    wxArr: over.wxArr ?? null,
    checks: over.checks || {},
  };
}

export function buildTimelineFlights() {
  const aircraft = [
    {
      oprId: "bti", registration: "YL-AAU", operatorName: "airBaltic", defaultIcaoType: "S",
      flights: [
        // Airborne, departed +10 late: leading hatch STD→T/O, amber +10 both ends.
        flight({ flightNid: 9001, fn: "BTI472", dep: "EVRA", arr: "EGLL", std: at(-8), sta: at(87), to: at(2), eta: at(97), state: "airborne", wxDep: "VFR", wxArr: "IFR", limIds: ["lim-1"] }),
        // Later return, plain scheduled.
        flight({ flightNid: 9002, fn: "BTI473", dep: "EGLL", arr: "EVRA", std: at(142), sta: at(237), state: "scheduled" }),
      ],
    },
    {
      oprId: "slx", registration: "9H-SLD", operatorName: "SmartLynx Malta",
      flights: [
        // MVT overdue: ETD 28 min ago, never departed → blink ring, delayed fill.
        flight({ flightNid: 9003, fn: "SLX102", dep: "EVRA", arr: "ESSA", std: at(-38), sta: at(52), etd: at(-28), state: "delayed", delayMin: 10 }),
      ],
    },
    {
      oprId: "pnv", registration: "YL-PVA", operatorName: "Pan Aviatic",
      flights: [
        // CTOT wins over ETD (later of the two), CTOT label + fill.
        flight({ flightNid: 9004, fn: "PNV210", dep: "EVRA", arr: "LFPG", std: at(22), sta: at(157), etd: at(27), ctot: at(62), state: "ctot", wxDep: "VFR" }),
      ],
    },
    {
      oprId: "klj", registration: "LY-JMS", operatorName: "KlasJet",
      flights: [
        // Estimated (no flight watch) — hollow outline convention.
        flight({ flightNid: 9005, fn: "KLJ301", dep: "EYVI", arr: "EVRA", std: at(-49), sta: at(31), to: at(-45), eta: at(31), state: "airborne", estimated: true }),
      ],
    },
    {
      oprId: "ryr", registration: "EI-DYX", operatorName: "Ryanair",
      flights: [
        // Unconfirmed trip — italic callsign.
        flight({ flightNid: 9006, fn: "RYR8144", dep: "EIDW", arr: "EVRA", std: at(92), sta: at(187), state: "scheduled", confirmed: false }),
      ],
    },
    {
      oprId: "lot", registration: "SP-LIL", operatorName: "LOT Polish Airlines",
      flights: [
        // Arrived EARLY: −5 green delta.
        flight({ flightNid: 9007, fn: "LOT764", dep: "EPWA", arr: "EVRA", std: at(-133), sta: at(-23), to: at(-131), ldg: at(-28), state: "arrived", wxArr: "MVFR" }),
        // Cancelled later rotation.
        flight({ flightNid: 9008, fn: "LOT765", dep: "EVRA", arr: "EPWA", std: at(52), sta: at(162), cnl: true, state: "cancelled" }),
      ],
    },
    {
      oprId: "pnv", registration: "YL-PVB", operatorName: "Pan Aviatic",
      flights: [
        // Two short hops 12 min apart — sub-45min minimum-width + gap-split hit areas.
        flight({ flightNid: 9009, fn: "PNV901", dep: "EVRA", arr: "EYVI", std: at(-20), sta: at(5), to: at(-19), ldg: at(4), state: "arrived" }),
        flight({ flightNid: 9010, fn: "PNV902", dep: "EYVI", arr: "EVRA", std: at(17), sta: at(42), state: "scheduled" }),
      ],
    },
  ];
  return { ok: true, source: "fixture", aircraft };
}

export function buildFixtures() {
  return {
    "/api/timeline/flights": buildTimelineFlights(),
    "/api/timeline/limitations": {
      ok: true,
      limitations: [
        { id: "lim-1", title: "EGLL slot enforcement", description: "Heathrow CTOT strictly enforced — confirm slot with delivery before pushback. No tolerance beyond -5/+10.", active: true, kind: "CTOT" },
        { id: "lim-2", title: "Baltic low-vis operations", description: "LVP likely EVRA/EYVI early mornings this week. Expect CAT II/III, extended taxi, de-ice on stand.", active: true, kind: "WX" },
      ],
    },
    "/api/display/settings": {
      ok: true,
      account: "fixture@clearway.aero",
      settings: {
        scale: 1.3, timeZoom: 1, rowZoom: 1, pillHeight: 1, markerScale: 1, labelScale: 1,
        autoFitRows: false, overlayScale: 1.3, sidebarScale: 1.3, headerScale: 1.3, acColScale: 1,
        upcomingHorizonHours: 17, postLandingHours: 2, mvtThresholdMin: 15, mvtFlashSeconds: 1,
        upcomingTableEnabled: false, upcomingTableSide: "right", upcomingTableScale: 1, upcomingTableWidthPct: 30,
        colors: {},
      },
    },
    "/api/display/clocks": {
      ok: true,
      clocks: [
        { label: "Riga", timeZone: "Europe/Riga", home: true },
        { label: "Paris", timeZone: "Europe/Paris" },
        { label: "New York", timeZone: "America/New_York" },
        { label: "Istanbul", timeZone: "Europe/Istanbul" },
        { label: "UTC", timeZone: "UTC" },
      ],
    },
    "/api/notam-check/today": {
      ok: true, day: null, timeZone: "Europe/Riga", checkHour: 10, ranAt: null,
      dailyFiredFor: null, emailedAt: null, emailedTo: null, emailError: null,
      remindersSent: 0, lastReminderAt: null,
    },
    "/api/upcoming/flights": { ok: true, flights: [] },
    "/api/presence": { ok: true, clients: [] },
    "/api/user": { ok: true, user: { email: "fixture@clearway.aero", name: "Fixture User" } },
  };
}
