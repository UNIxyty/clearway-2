// scopeFor(caller): the one answer to "which flights exist for this person" (Stage 5, 2026-10-25), used by the wall
// backend, the agent and the portal on EVERY read that can return a flight or anything keyed by one.
//   null         → staff: everything (the caller is not a client)
//   { ...scope } → a client: their scope, switches and passenger level, read from public.clients with the service key
//   NOBODY       → a client with no approved row (requested, refused, removed, or the row is gone): nothing exists
// A flight is in scope when its operator, its registration or its trip number is named. Outside scope the answer is
// 404 — never 403, which would confirm the flight exists. Fails closed: a read error is NOBODY, not "everything".
// Plain fetch, no SDK: runs in Node and in the portal's edge middleware.
import { normaliseScope, normaliseSwitches, PASSENGER_LEVELS } from "./switches.mjs";

const TTL_MS = 10_000;
const cache = new Map(); // userId -> { at, scope }

export const NOBODY = Object.freeze({ nobody: true, clientId: null, status: null, scope: { operators: new Set(), registrations: new Set(), trips: new Set() }, switches: new Set(), passengerLevel: "off", company: null });

/** True when this Supabase user is a client (APP metadata only — the person cannot write it). */
export function isClientUser(appMeta) {
  return String(appMeta?.role || "").toLowerCase() === "client";
}

function env() {
  return { url: String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/\/+$/, ""), key: String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim() };
}

/** The clients row → a scope object. Exported for the admin page and the checks; everything else calls scopeFor. */
export function scopeFromRow(row) {
  if (!row || row.status !== "approved") return NOBODY;
  const scope = { operators: new Set(), registrations: new Set(), trips: new Set() };
  for (const e of normaliseScope(row.scope)) {
    if (e.kind === "operator") scope.operators.add(e.value);
    else if (e.kind === "registration") scope.registrations.add(e.value);
    else scope.trips.add(e.value);
  }
  if (!scope.operators.size && !scope.registrations.size && !scope.trips.size) return NOBODY; // approved with no scope: nothing exists
  const level = PASSENGER_LEVELS.includes(row.passenger_level) ? row.passenger_level : "off";
  return { nobody: false, clientId: row.id, status: row.status, company: row.company ?? null, scope, switches: new Set(normaliseSwitches(row.switches)), passengerLevel: row.consent === false && level === "documents" ? "names" : level };
}

/**
 * The caller's scope. `user` carries { userId, appMetadata } (the wall and the agent) or a Supabase user (the portal).
 * Staff → null. A client → their scope, or NOBODY.
 */
export async function scopeFor(user) {
  const appMeta = user?.appMetadata ?? user?.app_metadata ?? user?.claims?.app ?? null;
  if (!isClientUser(appMeta)) return null;
  const userId = String(user?.userId ?? user?.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return NOBODY;
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.scope;
  const { url, key } = env();
  if (!url || !key) return NOBODY;
  let scope = NOBODY;
  try {
    const r = await fetch(`${url}/rest/v1/clients?select=id,status,company,scope,switches,passenger_level,consent&user_id=eq.${encodeURIComponent(userId)}&limit=1`, { headers: { apikey: key, authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (r.ok) { const rows = await r.json(); scope = scopeFromRow(Array.isArray(rows) ? rows[0] : null); }
  } catch { /* a read error is NOBODY */ }
  cache.set(userId, { at: Date.now(), scope });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return scope;
}

/** Forget a client's cached scope (after ops change it) so the next request sees the change at once. */
export function forgetScope(userId) { if (userId) cache.delete(String(userId)); else cache.clear(); }

/** Is this flight one of theirs? `f` is any flight shape the services carry: oprId, aircraftRegistration/registration, tripNo. */
export function flightInScope(scope, f, context = {}) {
  if (scope === null) return true;
  if (!scope || scope.nobody || !f) return false;
  const oprId = String(context.oprId ?? f.oprId ?? "").toLowerCase();
  const reg = String(context.registration ?? f.aircraftRegistration ?? f.registration ?? "").toUpperCase().replace(/\s+/g, "");
  const trip = String(f.tripNo ?? f.tripNumber ?? f.trip?.tripNumber ?? "").trim();
  return (oprId && scope.scope.operators.has(oprId)) || (reg && scope.scope.registrations.has(reg)) || (trip && scope.scope.trips.has(trip));
}

/** "oprId:flightNid" keys (the wall's cache and stream, the agent's flight ids) → is the key's operator alone enough? Only for operator scope. */
export function keyOperatorInScope(scope, key) {
  if (scope === null) return true;
  if (!scope || scope.nobody) return false;
  const oprId = String(key || "").split(":")[0].toLowerCase();
  return Boolean(oprId) && scope.scope.operators.has(oprId);
}

export function hasSwitch(scope, key) { return scope === null ? true : Boolean(scope && !scope.nobody && scope.switches.has(key)); }
