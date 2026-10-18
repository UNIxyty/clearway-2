// The wall's facts, in one place (2026-10-18). The ops-room display is the authority for what a flight shows:
// which time is "the time that matters", its signed difference from the schedule, the bar's span, the flight's
// state and whether it is estimated, whether it is overdue for a movement, and which markers it carries. These
// rules used to live in the display's own code (opsboard-react: services/timelineApi.js mapFlight,
// components/FlightPill.jsx). They were lifted out verbatim so the phone wall in the portal (app/m) draws the SAME
// facts from the same code — shared, never copied. The display imports them back; its rendering is unchanged
// (rig/wall/console-theme-check.mjs: pixel-identical).
//
// Rule for this file: plain ES module, no React, no DOM, no colours. Colours are each surface's own (the display's
// per-account palette; the portal's tokens), chosen by the STATUS key this file returns.
//
// Inputs are the wall backend's decorated flight (digital-wall/leon-sync.mjs decorateFlightWithLimitations):
// startTimeUTC/endTimeUTC (STD/STA), etd, eta, takeOffUTC, landingUTC, ctotUTC, eetMin, atd, ata, movementState,
// movementStateEstimated, isCnl, delayMin, limitations[], wxDep/wxArr, checks{}.

/** `new Date(null)` is the 1970 epoch, not Invalid Date — a null ATD/ATA must NOT read as "00:00". */
export function toDate(value) {
  if (value == null || value === '') return null;
  const dt = new Date(value);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

/** "HH:MM" in UTC, or null. */
export function toHm(value) {
  const dt = toDate(value);
  if (!dt) return null;
  return `${String(dt.getUTCHours()).padStart(2, '0')}:${String(dt.getUTCMinutes()).padStart(2, '0')}`;
}

/** "HH:MM" UTC of an epoch-ms instant ("--:--" when invalid). */
export function hmOfMs(ms) {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '--:--';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

// ── State ────────────────────────────────────────────────────────────────────
// The backend derives movementState from Leon's semantics (digital-wall/LEON-PILL-MAPPING.md): arrived (ATA) →
// airborne (ATD, no ATA) → ctot → delayed (departure delay > 0) → scheduled. Older cached flights without it fall
// back to this derivation. A cancelled flight almost never reaches the wall (the sync drops it) but the key exists.
export const STATUS_KEYS = ['scheduled', 'delayed', 'ctot', 'airborne', 'arrived', 'cancelled'];
const STATUS_ALIAS = { boarding: 'scheduled', slot: 'ctot' };

export function statusFromFlight(flight) {
  if (flight?.isCnl) return 'cancelled';
  if (flight?.movementState) return STATUS_ALIAS[flight.movementState] || flight.movementState;
  if (flight?.ata) return 'arrived';
  if (flight?.atd) return 'airborne';
  if ((flight?.delayMin ?? 0) > 0) return 'delayed';
  return 'scheduled';
}

/** What the state is called, everywhere a person reads it. */
export const STATUS_LABEL = { scheduled: 'Scheduled', delayed: 'Delayed', ctot: 'CTOT', airborne: 'Flying', arrived: 'Arrived', cancelled: 'Cancelled' };

/** The wall legend's meaning of each state, as the portal's status-pill token suffix (--ca-st-<token>-bg/-fg). */
export const STATUS_TOKEN = { scheduled: 'scheduled', delayed: 'delayed', ctot: 'ctot', airborne: 'flying', arrived: 'arrived', cancelled: 'aog' };

/** Estimated states (clock-derived, no flight-watch data) render HOLLOW on the display; the phone says "estimated". */
export const isEstimatedState = (status, estimated) => estimated === true && (status === 'airborne' || status === 'arrived');

// ── Times ────────────────────────────────────────────────────────────────────
/**
 * Ops timing rules (bug reports 7–9): the initial schedule is STD/STA; actuals are T/O and LDG. Departure display:
 * T/O beats everything; otherwise the LATER of CTOT and ETD; plain STD when no flight-watch estimate exists.
 * Arrival display: LDG once landed; otherwise departure + EET; otherwise ETA when it differs from STA; otherwise STA
 * moved by the departure's delta; otherwise STA. Off-block is never displayed. Deltas are SIGNED minutes against the
 * schedule. Any instant more than 48 h from its scheduled anchor is unusable (stale epoch bugs once produced
 * -29645850 min deltas). Returns null when the flight has no usable STD/STA.
 */
export function flightTimes(flight) {
  const stdMs = toDate(flight.startTimeUTC)?.getTime();
  const staMs = toDate(flight.endTimeUTC)?.getTime();
  if (!Number.isFinite(stdMs) || !Number.isFinite(staMs)) return null;
  const sane = (value, refMs) => {
    const ms = toDate(value)?.getTime();
    return Number.isFinite(ms) && Math.abs(ms - refMs) <= 48 * 3600_000 ? ms : null;
  };
  const toMs = sane(flight.takeOffUTC, stdMs);
  const ldgMs = sane(flight.landingUTC, staMs);
  const ctotMs = sane(flight.ctotUTC, stdMs);
  const etdMs = sane(flight.etd, stdMs) ?? stdMs;
  const etaMs = sane(flight.eta, staMs) ?? staMs;

  // Stale-estimate guard (bug report 2, item 4): a flight-watch ETD more than 30 min BEFORE the schedule on a
  // not-yet-departed flight is almost always a leftover from re-planning. Real early departures show through T/O.
  const etdEffMs = toMs == null && etdMs < stdMs - 30 * 60_000 ? stdMs : etdMs;

  let depKind;
  let depDisplayMs;
  if (toMs != null) {
    depKind = 'T/O';
    depDisplayMs = toMs;
  } else if (ctotMs != null || etdEffMs !== stdMs) {
    // CTOT and ETD are EQUAL priority — the LATER (bigger) one is shown.
    depDisplayMs = Math.max(ctotMs ?? -Infinity, etdEffMs);
    depKind = ctotMs != null && ctotMs >= etdEffMs ? 'CTOT' : 'ETD';
  } else {
    depKind = 'STD';
    depDisplayMs = stdMs;
  }
  const depDeltaMin = Math.round((depDisplayMs - stdMs) / 60_000);

  // Bar end, first that applies: LDG; departure + EET (Leon's flight-watch EET); ETA when it differs from STA; STA
  // moved by the departure's delta (a delayed or early flight keeps its scheduled duration); STA.
  const eetMin = Number(flight.eetMin);
  const hasEet = Number.isFinite(eetMin) && eetMin > 0 && eetMin <= 24 * 60;
  let arrKind;
  let arrDisplayMs;
  if (ldgMs != null) {
    arrKind = 'LDG';
    arrDisplayMs = ldgMs;
  } else if (hasEet) {
    arrKind = 'ETA'; // an estimated arrival; arrBasis says it came from the EET
    arrDisplayMs = depDisplayMs + eetMin * 60_000;
  } else if (etaMs !== staMs) {
    arrKind = 'ETA';
    arrDisplayMs = etaMs;
  } else if (toMs != null || depDeltaMin !== 0) {
    arrKind = 'ETA';
    arrDisplayMs = staMs + depDeltaMin * 60_000;
  } else {
    arrKind = 'STA';
    arrDisplayMs = staMs;
  }
  const arrDeltaMin = Math.round((arrDisplayMs - staMs) / 60_000);

  // The hatch LEADS the body (bug report 3): it spans schedule → actual departure, the coloured body runs from the
  // actual departure to the arrival. The body is never shorter than 5 minutes.
  const spanStartMs = Math.min(stdMs, depDisplayMs);
  const solidEndMs = Math.max(arrDisplayMs, depDisplayMs + 5 * 60_000);

  return {
    stdMs, staMs,
    depKind, arrKind,
    depMs: depDisplayMs, arrMs: arrDisplayMs,
    depHm: toHm(new Date(depDisplayMs)), arrHm: toHm(new Date(arrDisplayMs)),
    stdHm: toHm(new Date(stdMs)), staHm: toHm(new Date(staMs)),
    eetMin: hasEet ? eetMin : null,
    arrBasis: ldgMs != null ? 'LDG' : hasEet ? 'EET' : etaMs !== staMs ? 'ETA' : (toMs != null || depDeltaMin !== 0) ? 'STA+delta' : 'STA',
    depDeltaMin, arrDeltaMin,
    depDelayMin: Math.max(depDeltaMin, 0), arrDelayMin: Math.max(arrDeltaMin, 0),
    atdHm: toHm(flight.atd), ataHm: toHm(flight.ata),
    startUtcMs: spanStartMs,
    delayedStartUtcMs: depDisplayMs,
    scheduledEndUtcMs: solidEndMs,
    endUtcMs: solidEndMs,
  };
}

/**
 * MVT-overdue: no T/O `thresholdMin` past the expected departure (CTOT/ETD when set, else STD — that instant IS
 * delayedStartUtcMs). ONE definition for the wall's blink ring, the console and the phone. `flight` is a mapped
 * flight (depKind, atdHm, status, delayedStartUtcMs) or a decorated one run through flightTimes first.
 */
export function mvtOverdue(flight, nowMs, thresholdMin = 15) {
  const mvtRefMs = Number(flight.delayedStartUtcMs) || Number(flight.startUtcMs) || 0;
  return (
    (flight.depKind ?? 'STD') !== 'T/O' &&
    !flight.atdHm &&
    flight.status !== 'arrived' &&
    !flight.isCnl &&
    mvtRefMs > 0 &&
    Number(nowMs) > mvtRefMs + thresholdMin * 60_000
  );
}

// ── Markers (checks) ─────────────────────────────────────────────────────────
// IMP: an Important notice matches the flight. CAA: an authority's details match. NTM: an unreviewed NOTAM alert
// (a limitation with source 'alert' and type NTM). WX: a CheckWX category at the departure / arrival airport. LIM: a
// custom limitation (the wall's sidebar card) matched the flight. The backend drops a marker once it is checked (an
// airport's NOTAMs acknowledged for the day; a per-flight check acknowledged for the cycle), except LIM and WX, whose
// per-flight checks only mute them: `checks` says which.
const ALERT_MARK_TYPES = new Set(['NTM']);
/** The five checks, in the order the phone and the console name them. */
export const CHECK_KEYS = ['imp', 'ntm', 'wx', 'caa', 'lim'];
export const CHECK_LABEL = { imp: 'IMP', ntm: 'NTM', wx: 'WX', caa: 'CAA', lim: 'LIM' };
export const CHECK_NAME = { imp: 'Important', ntm: 'NOTAMs', wx: 'Weather', caa: 'CAA', lim: 'Limitations' };

/** Which markers a decorated flight carries, as the display decides them (before per-account chip toggles). */
export function markerKeysOf(flight) {
  const lims = flight.limitations || [];
  return {
    IMP: lims.some((lim) => lim.type === 'IMP'),
    CAA: lims.some((lim) => lim.type === 'CAA'),
    WXD: flight.wxDep || null,
    WXA: flight.wxArr || null,
    NTM: lims.some((l) => l.source === 'alert' && ALERT_MARK_TYPES.has(l.type)),
    LIM: (flight.limitationIds || []).length > 0 || lims.some((l) => l.type === 'LIM'),
  };
}

/** The checks a flight still has open, in CHECK_KEYS order: a marker is present and no check of that kind is recorded. */
export function openChecksOf(flight) {
  const m = markerKeysOf(flight);
  const checks = flight.checks || {};
  const present = { imp: m.IMP, ntm: m.NTM, wx: Boolean(m.WXD || m.WXA), caa: m.CAA, lim: m.LIM };
  return CHECK_KEYS.filter((k) => present[k] && !checks[k]);
}
