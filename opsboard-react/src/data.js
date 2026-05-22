// ─────────────────────────────────────────────────────────────────────────────
// DATA SCHEMA
// Wire your backend by replacing AIRCRAFT below with data fetched from your API.
// Every field is documented. Optional fields can be omitted or set to null/undefined.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Limitation
 * @property {'AOG'|'WX'|'CREW'|'PAX'|'CTOT'} type  - Limitation category
 * @property {string} msg                             - Human-readable description shown in side panel
 */

/**
 * @typedef {Object} Flight
 * @property {string}      fn       - Flight number, e.g. "BT242"
 * @property {string}      dep      - Departure ICAO/IATA, e.g. "RIX"
 * @property {string}      arr      - Arrival ICAO/IATA, e.g. "AMS"
 * @property {string}      etd      - Scheduled departure "HH:MM" (local)
 * @property {string}      eta      - Scheduled arrival  "HH:MM" (local)
 * @property {number}      [dlyMin] - Delay in minutes (omit or 0 if no delay)
 * @property {'scheduled'|'boarding'|'airborne'|'arrived'|'delayed'|'slot'|'aog'} status
 * @property {Limitation}  [lim]    - Optional active limitation on this flight
 * @property {string}      [aogEnd] - For AOG rows: end time "HH:MM" of AOG band
 */

/**
 * @typedef {Object} Aircraft
 * @property {string}   reg      - Registration, e.g. "YL-AAA"
 * @property {string}   type     - Display type string, e.g. "A220-300·RIX"
 * @property {boolean}  [aog]    - True if the aircraft itself is AOG (renders a band instead of pills)
 * @property {Flight[]} flights  - Ordered list of flights for the day
 */

/** @type {Aircraft[]} */
export const AIRCRAFT = [
  { reg: 'YL-AAA', type: 'A220-300·RIX', flights: [
    { fn: 'BT311', dep: 'RIX', arr: 'CDG', etd: '06:26', eta: '09:21', status: 'arrived' },
    { fn: 'BT3xx', dep: 'CDG', arr: 'HEL', etd: '10:55', eta: '12:40', status: 'airborne' },
    { fn: 'BT355', dep: 'RIX', arr: 'IST', etd: '14:48', eta: '18:10', status: 'scheduled' },
  ]},
  { reg: 'YL-AAB', type: 'A220-300·RIX', flights: [
    { fn: 'BT241', dep: 'RIX', arr: 'AMS', etd: '07:02', eta: '09:21', status: 'arrived' },
    { fn: 'BT242', dep: 'AMS', arr: 'RIX', etd: '10:55', eta: '13:28', dlyMin: 35, status: 'delayed' },
    { fn: 'BT281', dep: 'RIX', arr: 'LHR', etd: '13:55', eta: '15:30', status: 'scheduled', lim: { type: 'PAX', msg: 'BT281 LHR — 6 UM, 1 WCHR. Boarding from G14.' } },
    { fn: 'BT282', dep: 'LHR', arr: 'RIX', etd: '16:30', eta: '20:10', status: 'scheduled' },
  ]},
  { reg: 'YL-AAC', type: 'A220-300·RIX', flights: [
    { fn: 'BT101', dep: 'RIX', arr: 'TLL', etd: '06:30', eta: '07:05', status: 'arrived' },
    { fn: 'BT102', dep: 'TLL', arr: 'RIX', etd: '10:22', eta: '11:00', status: 'arrived' },
    { fn: 'BT421', dep: 'RIX', arr: 'ARN', etd: '11:40', eta: '13:10', status: 'airborne' },
    { fn: 'BT461', dep: 'RIX', arr: 'OSL', etd: '14:30', eta: '16:00', status: 'scheduled' },
    { fn: 'BT462', dep: 'OSL', arr: 'RIX', etd: '16:45', eta: '18:15', status: 'scheduled' },
  ]},
  { reg: 'YL-AAD', type: 'A220-300·RIX', flights: [
    { fn: 'BT651', dep: 'RIX', arr: 'BCN', etd: '08:01', eta: '11:42', status: 'airborne', lim: { type: 'CTOT', msg: 'BT651/652 slot LFMMZOZX, do not push before TSAT.' } },
    { fn: 'BT652', dep: 'BCN', arr: 'RIX', etd: '12:10', eta: '15:55', dlyMin: 150, status: 'delayed' },
    { fn: 'BT599', dep: 'RIX', arr: 'ZRH', etd: '16:55', eta: '19:20', status: 'scheduled' },
  ]},
  { reg: 'YL-AAE', type: 'A220-300·RIX', flights: [
    { fn: 'BT725', dep: 'RIX', arr: 'FCO', etd: '06:54', eta: '09:50', status: 'arrived' },
    { fn: 'BT726', dep: 'FCO', arr: 'RIX', etd: '11:10', eta: '14:05', status: 'airborne' },
    { fn: 'BT801', dep: 'RIX', arr: 'DUB', etd: '15:19', eta: '17:30', status: 'scheduled' },
  ]},
  { reg: 'YL-AAF', type: 'A220-300·TLL', flights: [
    { fn: 'BT211', dep: 'TLL', arr: 'CDG', etd: '07:38', eta: '10:29', status: 'arrived' },
    { fn: 'BT212', dep: 'CDG', arr: 'TLL', etd: '11:40', eta: '15:05', status: 'airborne' },
    { fn: 'BT257', dep: 'TLL', arr: 'MUC', etd: '16:10', eta: '18:05', status: 'scheduled' },
  ]},
  { reg: 'YL-AAG', type: 'A220-300·VNO', flights: [
    { fn: 'BT341', dep: 'VNO', arr: 'AMS', etd: '08:04', eta: '09:52', status: 'arrived', lim: { type: 'CREW', msg: 'CPT Bērziņš FTL ceiling at 19:30 LT. No discretion.' } },
    { fn: 'BT391', dep: 'VNO', arr: 'BER', etd: '14:19', eta: '15:55', status: 'scheduled' },
    { fn: 'BT392', dep: 'BER', arr: 'VNO', etd: '16:55', eta: '18:30', status: 'scheduled' },
  ]},
  { reg: 'YL-AAH', type: 'A220-300·RIX', aog: true, flights: [
    { fn: 'BT131', dep: 'RIX', arr: 'HEL', etd: '07:10', eta: '08:10', aogEnd: '14:00', status: 'aog',
      lim: { type: 'AOG', msg: 'Engine 2 borescope — release ETA 14:00 LT. Cover BT131/132 from AAJ.' } },
  ]},
  { reg: 'YL-AAJ', type: 'A220-300·RIX', flights: [
    { fn: 'BT901', dep: 'RIX', arr: 'JFK', etd: '11:40', eta: '19:55', status: 'airborne' },
  ]},
];

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND WIRING EXAMPLE
//
// Replace the static AIRCRAFT export above with a fetch call, e.g.:
//
//   export async function fetchAircraft() {
//     const res = await fetch('https://your-api/ops/daily?date=2024-01-15&operator=cwy');
//     const json = await res.json();
//     return json.aircraft.map(mapLeonToAircraft);
//   }
//
// Leon Software GraphQL query pattern:
//   query OpsFlights($operatorCode: String!, $startLocal: String!, $endLocal: String!) {
//     flights(operatorCode: $operatorCode, startLocal: $startLocal, endLocal: $endLocal) {
//       flightNo
//       aircraft { registration typeCode homeBase }
//       departure { airport { iataCode } scheduledLocal delayMinutes }
//       arrival   { airport { iataCode } scheduledLocal }
//       status    # "SCHEDULED" | "BOARDING" | "AIRBORNE" | "ARRIVED" | "DELAYED"
//       limitations { type message }
//       aog { active releaseTime }
//     }
//   }
//
// Mapping function from Leon response → this schema:
//   function mapLeonToAircraft(raw) { ... }
// ─────────────────────────────────────────────────────────────────────────────

export const START_HOUR   = 6;
export const TOTAL_HOURS  = 18;

export function hm(t)          { const [h,m]=t.split(':').map(Number); return h*60+m; }
export function addMin(t, min) { const tot=hm(t)+min; return p2(Math.floor(tot/60)%24)+':'+p2(tot%60); }
export function p2(n)          { return String(n).padStart(2,'0'); }
export function frac(t)        { return (hm(t)/60 - START_HOUR) / TOTAL_HOURS; }
export function clamp(v)       { return Math.max(0, Math.min(1, v)); }
