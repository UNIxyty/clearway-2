// Keyterms for speech-to-text.
//
// This is the whole reason Scribe was chosen over generic STT. A dispatcher
// says "EVRA" and a generic model hears "EV-ra", "Evera", "every A"; it says
// "BTI 1 2 3" and hears "BT one two three". A misheard ICAO code does not
// produce an error — it produces a confident, fluent, completely wrong answer
// about a different airport, which is worse than a failure.
//
// What goes in the list is therefore narrow and deliberate: the tokens that are
// (a) meaningless to a general language model and (b) fatal to get wrong.
// Airport names and ordinary English are NOT included — the model already
// handles those, and a bloated list dilutes the ones that matter.
//
// Two budgets, because the two Scribe endpoints differ (checked against the
// live API, not assumed — the realtime socket refuses the 51st term and any
// term over 20 characters with `invalid_request`):
//   batch    (scribe_v2)           up to 1000 terms, 50 characters each
//   realtime (scribe_v2_realtime)  up to   50 terms, 20 characters each
// The realtime list is RANKED: today's flights first (their airports, then
// callsigns, registrations and operator prefixes), then the fixed vocabulary
// that most often changes an answer. The wider set is kept apart as
// `candidates` — never sent to ElevenLabs, only used on the client to offer
// real alternatives for a low-confidence word (§4.23 uncertain word).

import { wallGet, portalGet } from "../tools/http.mjs";

export const REALTIME_MAX_TERMS = 50;
export const REALTIME_MAX_CHARS = 20;
const BATCH_MAX_TERMS = 400;
const CANDIDATE_MAX = 600;
const TTL_MS = 10 * 60 * 1000;

// Per caller: the list is scoped to what THAT user can see, so one user's
// fleet must never prime (or be offered as alternatives to) another's.
const cache = new Map();

/** ICAO: exactly four letters. Anything else is not one. */
const isIcao = (value) => /^[A-Z]{4}$/.test(String(value ?? "").trim().toUpperCase());

/**
 * Aircraft registration, e.g. YL-ABC, G-ABCD, N123AB. Kept loose on purpose —
 * national formats differ and an over-strict pattern would silently drop the
 * fleet it was meant to protect.
 */
const isRegistration = (value) => /^[A-Z0-9]{1,3}-?[A-Z0-9]{2,5}$/.test(String(value ?? "").trim().toUpperCase());
const isCallsign = (value) => /^[A-Z]{2,3}[0-9][0-9A-Z]{0,4}$/.test(String(value ?? "").replace(/\s+/g, "").toUpperCase());

/** Count occurrences and return the keys most-used first. */
const ranked = (counts) => [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

/**
 * Everything the caller's own session can see that is worth priming with.
 * Returns ranked groups plus route hints for callsigns (for the popover:
 * "GBJ88 · EPWA→EVRA").
 */
async function gather(user) {
  const icaos = new Map(), callsigns = new Map(), registrations = new Map(), operators = new Map();
  const hints = new Map();
  const sources = { flights: 0, airports: 0, registrations: 0, operators: 0, callsigns: 0, fixed: 0, airportTable: 0 };

  // Today's flights on the wall — the codes a dispatcher is most likely to say.
  const timeline = await wallGet("/api/timeline/flights?allOperators=true", user, { timeoutMs: 15_000 }).catch(() => null);
  const rows = [];
  for (const ac of timeline?.aircraft ?? []) for (const f of ac.flights ?? []) rows.push({ f, ac });
  for (const f of timeline?.flights ?? []) rows.push({ f, ac: f.aircraft ?? null });
  for (const { f, ac } of rows) {
    sources.flights++;
    const dep = String(f?.adep?.icao ?? "").toUpperCase(), arr = String(f?.ades?.icao ?? "").toUpperCase();
    if (isIcao(dep)) bump(icaos, dep);
    if (isIcao(arr)) bump(icaos, arr);
    const cs = String(f?.callsign ?? "").replace(/\s+/g, "").toUpperCase();
    if (cs && isCallsign(cs)) {
      bump(callsigns, cs);
      if (isIcao(dep) || isIcao(arr)) hints.set(cs, `${dep || "?"}→${arr || "?"}`);
      const prefix = /^([A-Z]{3})\d/.exec(cs)?.[1];
      if (prefix) bump(operators, prefix);
    }
    const reg = String(ac?.registration ?? f?.registration ?? "").trim().toUpperCase();
    if (reg && isRegistration(reg)) { bump(registrations, reg); if (cs) hints.set(reg, cs); }
  }

  // The fleet list adds registrations and operator codes with no flight today.
  const fleet = await wallGet("/api/timeline/aircraft", user, { timeoutMs: 15_000 }).catch(() => null);
  for (const row of fleet?.aircraft ?? []) {
    const reg = String(row?.registration ?? "").trim().toUpperCase();
    if (reg && isRegistration(reg) && !registrations.has(reg)) registrations.set(reg, 0);
    const opr = String(row?.operatorCode ?? row?.oprId ?? "").trim().toUpperCase();
    if (opr && /^[A-Z]{2,3}$/.test(opr) && !operators.has(opr)) operators.set(opr, 0);
  }

  // Airports table: bounded. Only when the wall gave too few airports to fill
  // the candidate list — the whole table is thousands of codes and would make
  // every four-letter word "close to" something.
  if (icaos.size < 100) {
    const airports = await portalGet("/api/airports?limit=200", user, { timeoutMs: 15_000 }).catch(() => null);
    for (const row of airports?.airports ?? airports?.data ?? []) {
      const icao = String(row?.icao ?? "").trim().toUpperCase();
      if (isIcao(icao) && !icaos.has(icao)) { icaos.set(icao, 0); sources.airportTable++; }
      if (icaos.size >= 100) break;
    }
  }

  sources.airports = icaos.size; sources.callsigns = callsigns.size; sources.registrations = registrations.size; sources.operators = operators.size;
  return { icaos: ranked(icaos), callsigns: ranked(callsigns), registrations: ranked(registrations), operators: ranked(operators), hints, sources };
}

/**
 * The realtime list: at most 50 terms of at most 20 characters, ranked.
 * Interleaved so no one group can starve the others: a wall with 300 flights
 * must still leave room for the airports those flights use.
 */
export function rankRealtime({ icaos, callsigns, registrations, operators }, fixed = REALTIME_FIXED_TERMS, max = REALTIME_MAX_TERMS) {
  const out = [];
  const seen = new Set();
  const add = (t) => {
    const term = String(t ?? "").trim();
    if (!term || term.length > REALTIME_MAX_CHARS || seen.has(term) || out.length >= max) return;
    seen.add(term); out.push(term);
  };
  // Quotas first (what a dispatcher says most), then fill in the same order.
  const quota = [[icaos, 16], [callsigns, 12], [registrations, 6], [operators, 4], [fixed, 12]];
  for (const [list, n] of quota) for (const t of list.slice(0, n)) add(t);
  for (const [list] of quota) for (const t of list) add(t);
  return out;
}

/**
 * The terms to prime STT with, for this user.
 *
 * Scoped to what the CALLER can see: the fleet and airports come through the
 * user's own session, so the list cannot become a way to learn which operators
 * or registrations exist beyond their access.
 */
export async function keytermsFor(user, { reload = false } = {}) {
  const key = String(user?.userId ?? "anon");
  const now = Date.now();
  const hit = cache.get(key);
  if (!reload && hit && now - hit.at < TTL_MS) return hit;

  const g = await gather(user);
  const batch = [...new Set([...g.icaos, ...g.callsigns, ...g.registrations, ...g.operators, ...FIXED_AVIATION_TERMS])].slice(0, BATCH_MAX_TERMS);
  const realtime = rankRealtime(g);
  const candidates = [];
  for (const [kind, list] of [["airport", g.icaos], ["callsign", g.callsigns], ["registration", g.registrations], ["operator", g.operators]]) {
    for (const term of list) if (candidates.length < CANDIDATE_MAX) candidates.push({ term, kind, hint: g.hints.get(term) ?? null });
  }
  const entry = { at: now, terms: batch, realtime, candidates, sources: { ...g.sources, fixed: FIXED_AVIATION_TERMS.length } };
  cache.set(key, entry);
  if (cache.size > 500) cache.delete(cache.keys().next().value); // bounded
  return entry;
}

/**
 * Terms that must survive transcription intact in BOTH languages.
 *
 * These are never translated and never transliterated into Cyrillic: a
 * dispatcher reading "НОТАМ" or "МЕТАР" back to a controller is reading
 * something that does not exist. The same list is reused downstream to hold
 * them steady in a Russian reply.
 */
export const FIXED_AVIATION_TERMS = [
  "NOTAM", "METAR", "TAF", "SNOWTAM", "ATIS", "SIGMET", "AIRMET",
  "CTOT", "EOBT", "ETOT", "TOBT", "PPR", "SLOT", "ATC", "ATFM",
  "AIP", "AIRAC", "AMDT", "SUP", "AD", "ENR", "GEN",
  "ILS", "VOR", "NDB", "RNAV", "RNP", "LVP", "RVR", "QNH", "QFE",
  "TWY", "RWY", "APRON", "STAND", "GATE",
  "ICAO", "IATA", "FIR", "UIR", "TMA", "CTR",
  "MTOW", "PAX", "CREW", "MEL", "AOG",
  "UTC", "ZULU", "LOCAL",
];

/** The fixed terms that earn a realtime slot: the ones a generic model gets wrong AND that change the answer. */
export const REALTIME_FIXED_TERMS = ["NOTAM", "METAR", "TAF", "CTOT", "EOBT", "TOBT", "SNOWTAM", "ATIS", "PPR", "AIRAC", "LVP", "RVR", "QNH", "SIGMET", "MEL", "AOG"];

/** Shape Scribe batch expects: a flat list of strings. */
export function keytermPrompt(cacheEntry) {
  return cacheEntry.terms;
}

export function _clearKeytermCache() {
  cache.clear();
}
