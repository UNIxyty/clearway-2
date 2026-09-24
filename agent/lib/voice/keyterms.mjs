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

import { wallGet, portalGet } from "../tools/http.mjs";

// Scribe caps the prompt; well under any documented limit, and past a few
// hundred the terms stop being "key" in any useful sense.
const MAX_TERMS = 400;
const TTL_MS = 30 * 60 * 1000;

let cache = { at: 0, terms: [], sources: {} };

/** ICAO: exactly four letters. Anything else is not one. */
const isIcao = (value) => /^[A-Z]{4}$/.test(String(value ?? "").trim().toUpperCase());

/**
 * Aircraft registration, e.g. YL-ABC, G-ABCD, N123AB. Kept loose on purpose —
 * national formats differ and an over-strict pattern would silently drop the
 * fleet it was meant to protect.
 */
const isRegistration = (value) => /^[A-Z0-9]{1,3}-?[A-Z0-9]{2,5}$/.test(String(value ?? "").trim().toUpperCase());

/**
 * The terms to prime STT with, for this user.
 *
 * Scoped to what the CALLER can see: the fleet and airports come through the
 * user's own session, so the list cannot become a way to learn which operators
 * or registrations exist beyond their access.
 */
export async function keytermsFor(user, { reload = false } = {}) {
  const now = Date.now();
  if (!reload && cache.at && now - cache.at < TTL_MS) return cache;

  const terms = new Set();
  const sources = { airports: 0, registrations: 0, operators: 0, fixed: 0 };

  // Aircraft registrations and operator prefixes, from the wall's fleet.
  const fleet = await wallGet("/api/timeline/aircraft", user, { timeoutMs: 15_000 }).catch(() => null);
  for (const row of fleet?.aircraft ?? []) {
    const reg = String(row?.registration ?? "").trim().toUpperCase();
    if (reg && isRegistration(reg)) { terms.add(reg); sources.registrations++; }
    const opr = String(row?.operatorCode ?? row?.oprId ?? "").trim().toUpperCase();
    if (opr && /^[A-Z]{2,3}$/.test(opr)) { terms.add(opr); sources.operators++; }
  }

  // ICAO codes the dispatcher actually works with. The airports table is large;
  // what matters is the codes, not the names.
  const airports = await portalGet("/api/airports?limit=10000", user, { timeoutMs: 20_000 }).catch(() => null);
  for (const row of airports?.airports ?? airports?.data ?? []) {
    const icao = String(row?.icao ?? "").trim().toUpperCase();
    if (isIcao(icao)) { terms.add(icao); sources.airports++; }
  }

  // Vocabulary a general model transcribes as ordinary words, or mangles.
  // Deliberately short: these are the terms whose meaning changes the answer.
  for (const term of FIXED_AVIATION_TERMS) { terms.add(term); sources.fixed++; }

  const list = [...terms].slice(0, MAX_TERMS);
  cache = { at: now, terms: list, sources };
  return cache;
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

/** Shape Scribe expects: a flat list of strings. */
export function keytermPrompt(cacheEntry) {
  return cacheEntry.terms;
}

export function _clearKeytermCache() {
  cache = { at: 0, terms: [], sources: {} };
}
