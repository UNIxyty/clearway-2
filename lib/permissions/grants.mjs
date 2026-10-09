// Who may do what, read from public.permission_grants (service role), for the portal, the agent and the wall alike.
// Fails CLOSED: grants that cannot be read, or an action with no row, mean no. The one exception is PINNED (the
// developer role always manages permissions), so there is always a way back in. Plain fetch, no imports beyond the
// catalogue: it runs in Node and in the portal's edge middleware.
import { ACTIONS, PINNED, ROLES } from "./catalogue.mjs";

const TTL_MS = 10_000; // a change in the grid reaches every service within this
const RETRY_MS = 2_000; // after a failed read, try again soon (and refuse meanwhile)
let cache = null; // { at, ok, grants: { role: Set } }
let inflight = null;

function env() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { url, key };
}

/** Normalises a resolved role: the portal's "none" is the User role; anything unknown has no role. */
export function roleKey(role) {
  const r = String(role || "").toLowerCase();
  if (r === "none" || r === "user" || r === "ops" || r === "temporary") return "user";
  return ROLES.includes(r) ? r : null;
}

export function isPinned(role, action) {
  return PINNED.some(([r, a]) => r === role && a === action);
}

async function read() {
  const { url, key } = env();
  if (!url || !key) return { ok: false, grants: {} };
  try {
    const r = await fetch(`${url}/rest/v1/permission_grants?select=role,action&allowed=eq.true`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return { ok: false, grants: {} };
    const rows = await r.json();
    if (!Array.isArray(rows)) return { ok: false, grants: {} };
    const grants = Object.fromEntries(ROLES.map((role) => [role, new Set()]));
    for (const row of rows) if (grants[row.role]) grants[row.role].add(String(row.action));
    return { ok: true, grants };
  } catch {
    return { ok: false, grants: {} };
  }
}

/** The current grants ({ ok, grants }). `fresh` skips the cache (the permissions screen after a change). */
export async function loadGrants({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && cache && now - cache.at < (cache.ok ? TTL_MS : RETRY_MS)) return cache;
  if (!inflight) inflight = read().then((g) => { cache = { ...g, at: Date.now() }; inflight = null; return cache; });
  return inflight;
}

export function invalidateGrants() { cache = null; }

/** May this role do this action? Fails closed; honours PINNED and `requires`. */
export async function can(role, action) {
  const r = roleKey(role);
  if (!r || !ACTIONS.has(action)) return false;
  if (isPinned(r, action)) return true;
  const { ok, grants } = await loadGrants();
  if (!ok || !grants[r]?.has(action)) return false;
  const needs = ACTIONS.get(action).requires;
  return needs ? can(r, needs) : true;
}

/**
 * The same answer from the grants already loaded (no fetch): for code that cannot wait, like the agent's tool list.
 * Fails closed when nothing is loaded yet; the agent loads the grants at the start of every request.
 */
export function canCached(role, action) {
  const r = roleKey(role);
  if (!r || !ACTIONS.has(action)) return false;
  if (isPinned(r, action)) return true;
  if (!cache?.ok || !cache.grants[r]?.has(action)) return false;
  const needs = ACTIONS.get(action).requires;
  return needs ? canCached(r, needs) : true;
}

/** Any of several actions (an endpoint whose handler then checks the precise one). */
export async function canAny(role, actions) {
  for (const a of actions) if (await can(role, a)) return true;
  return false;
}

/** Every action this role holds right now: { action: true } (for a client to draw its buttons). */
export async function grantsFor(role, service = null) {
  const out = {};
  for (const [key, a] of ACTIONS) if (!service || a.service === service) out[key] = await can(role, key);
  return out;
}

export const REFUSED = "You don't have permission to do this. An admin can grant it under Admin → Permissions.";
