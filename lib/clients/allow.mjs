// The client allow-list (2026-11-04): every address in the PORTAL a client may reach, and the switch that opens it.
// This is the enforcement, not a filter. Anything not on this list answers 404 to a client, whatever it is and whoever
// added it — a page, an API, a debug route written next year.
//
// Why a list and not filtering: of the portal's 135 endpoints, 19 hold rows that trace to no operator, aircraft or
// trip — users, permissions, metrics, debug runs, the help inbox, maintenance (the inventory of 2026-11-02). There is
// nothing to filter those BY. A filter has to be right in every endpoint, forever, and fails open the day someone adds
// one and forgets; a list is right by default for every endpoint nobody thought about. Do not build filtering here.
//
// Three services, three lists, because they are three servers: this one (the portal, enforced in middleware.ts), the
// wall backend's CLIENT_READS (digital-wall/lib/client-scope.mjs, which also cuts every payload to the client's
// flights) and the agent's passenger routes (agent/lib/passengers/api.mjs). rig/client-allow-check.mjs walks this one.
//
// Plain module: the portal's edge middleware, its pages and the rig checks import it alike.

/** Pages. `switch: null` is the front door: every approved client has it (what is on it is cut by the wall's own scope). */
export const CLIENT_PAGES = [
  { path: "/client", switch: null, label: "Flights", icon: "plane", menu: true },
  { path: "/client/airports", switch: "airport_search", label: "Airports", icon: "search", menu: true },
  { path: "/client/documents", switch: "documents", label: "Documents", icon: "file-text", menu: true },
];

/** The holding pages: reached by status, never by switch, and never with a menu. */
export const CLIENT_HOLDING_PAGES = ["/client/refused", "/client/removed"];

/** Portal APIs. Everything a client's pages need from the PORTAL itself; their flights come from the wall's API. */
export const CLIENT_APIS = [
  { path: "/api/client/me", methods: ["GET"], switch: null },   // their own standing: switches and level, never their scope's values
];
// Not on this list because they are not a client's: the PUBLIC addresses middleware.ts answers before it knows who is
// asking (sign-in, /api/auth/* for confirming an email and resetting a password, asking for access, the set-password
// link). They serve anyone signed out, the same for everyone. Signing out happens in the browser (Supabase), no API.

// exact addresses only: "/api/client/me/anything" is not "/api/client/me" (2026-11-04, the first walk found the gap)
const matches = (entry, pathname) => pathname === entry.path;
const has = (switches, key) => key === null || (switches instanceof Set ? switches.has(key) : Array.isArray(switches) && switches.includes(key));

/** The entry for an address, or null — null means 404 for a client. */
export function clientEntry(pathname, method = "GET") {
  const p = String(pathname || "/");
  if (p.startsWith("/api/")) return CLIENT_APIS.find((e) => matches(e, p) && e.methods.includes(String(method).toUpperCase())) ?? null;
  return CLIENT_PAGES.find((e) => matches(e, p)) ?? null;
}

/** May an APPROVED client with these switches reach this address? → { ok, entry, why } */
export function clientMayReach(pathname, method, switches) {
  const entry = clientEntry(pathname, method);
  if (!entry) return { ok: false, entry: null, why: "not on the client allow-list" };
  if (!has(switches, entry.switch)) return { ok: false, entry, why: `switch ${entry.switch} is off` };
  return { ok: true, entry, why: null };
}

/** The client's menu: the allowed pages that are menu items, nothing else. Empty for a client who can reach nothing. */
export function clientMenu(switches) {
  return CLIENT_PAGES.filter((e) => e.menu && has(switches, e.switch)).map(({ path, label, icon }) => ({ path, label, icon }));
}
