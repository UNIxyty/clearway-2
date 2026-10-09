// Who may change what on the wall (portal foundations 1.1).
//
// The wall used to let ANY signed-in Clearway user make every write — operators, aircraft, kiosk approval, the big
// screen's settings, webhooks. Now writes are ADMIN-ONLY BY DEFAULT: a write endpoint is open to an ordinary signed-in
// user only if it is listed in USER_WRITES below, so an endpoint added later without a thought is closed, not open.
//
// "Admin" is the portal's rule, mirrored from lib/admin-auth.ts resolveRole (admin or developer):
//   DEVELOPER_EMAILS / ADMIN_EMAILS, the Supabase metadata role / roles / is_admin / is_developer, or
//   user_preferences.is_admin / is_developer (read with the service-role key; the wall has no user-scoped client).

const VERDICT_TTL_MS = 60 * 1000;
const verdicts = new Map(); // userId -> { admin, expiresAtMs }

// Writes any signed-in console user may make: their own view, and the day-to-day ops actions on a flight. Each is a
// [method, path pattern, why] row; the why is what the access report and the review rely on.
export const USER_WRITES = [
  ["POST", /^\/api\/display\/env$/, "every wall/console screen reports its size automatically; not a user action"],
  // Own profile only; the handler itself refuses the main wall's profile and the global window to non-admins.
  ["PUT", /^\/api\/display\/settings$/, "My view (own colours, fonts, sizing)"],
  ["DELETE", /^\/api\/display\/settings\/profile\/[^/]+$/, "reset My view"],
  ["POST", /^\/api\/display\/overlay$/, "show / close a flight on the big screen (an ops action, not a setting)"],
  ["POST", /^\/api\/flight-checks$/, "mark a flight's IMP / NOTAM / WX / CAA as Checked"],
  ["POST", /^\/api\/notam-check\/ack$/, "acknowledge an airport's NOTAMs"],
  ["POST", /^\/api\/notam-check\/resync$/, "re-fetch one airport's NOTAMs (a read)"],
  ["POST", /^\/api\/timeline\/refresh$/, "re-pull flights from Leon now (a read)"],
  ["POST", /^\/api\/aip\/send$/, "email an AIP / GEN document to yourself"],
  ["POST", /^\/api\/reports$/, "raise a report (IT, office…)"],
  ["PATCH", /^\/api\/reports\/[^/]+$/, "update a report's status or text"],
  ["POST", /^\/api\/reports\/[^/]+\/send$/, "email a report to its recipient"],
];

/** True when this write is open to any signed-in user; every other write needs an admin. */
export function isUserWrite(method, pathname) {
  return USER_WRITES.some(([m, re]) => m === method && re.test(pathname));
}

export function isWriteMethod(method) {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function emailList(raw) {
  return String(raw || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
}

/** From the Supabase user's metadata alone: "developer" | "admin" | "none" (lib/admin-auth.ts roleFromSupabaseUser). */
export function roleFromClaims(claims) {
  const app = claims?.app ?? {};
  const meta = claims?.user ?? {};
  const role = String(app.role || meta.role || "").toLowerCase();
  if (role === "developer") return "developer";
  if (role === "admin") return "admin";
  const rolesRaw = app.roles || meta.roles;
  const roles = Array.isArray(rolesRaw) ? rolesRaw.map((v) => String(v).toLowerCase()) : [];
  if (roles.includes("developer")) return "developer";
  if (roles.includes("admin")) return "admin";
  if (app.is_developer === true || meta.is_developer === true) return "developer";
  if (app.is_admin === true || meta.is_admin === true) return "admin";
  return "none";
}

async function preferencesRow(userId) {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key || !/^[0-9a-f-]{36}$/i.test(String(userId))) return null;
  const r = await fetch(`${url}/rest/v1/user_preferences?select=is_admin,is_developer&user_id=eq.${userId}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`user_preferences ${r.status}`);
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

/**
 * Is this signed-in person an admin (or developer)? Devices and anonymous callers never are. A failed preferences
 * read falls back to the env lists and metadata only (fails closed for preference-only admins) and is not cached.
 */
export async function resolveIsAdmin(user) {
  if (!user || user.device) return false;
  if (user.mock) return true; // DISABLE_AUTH_FOR_TESTING's mock admin (rigs only)
  const email = String(user.email || "").toLowerCase();
  if (email && (emailList(process.env.DEVELOPER_EMAILS).includes(email) || emailList(process.env.ADMIN_EMAILS).includes(email))) return true;
  if (roleFromClaims(user.claims) !== "none") return true;
  const cached = verdicts.get(user.userId);
  if (cached && Date.now() < cached.expiresAtMs) return cached.admin;
  let row;
  try {
    row = await preferencesRow(user.userId);
  } catch (error) {
    console.warn(`[roles] could not read user_preferences: ${error?.message || error}`);
    return false;
  }
  const admin = Boolean(row?.is_admin || row?.is_developer);
  verdicts.set(user.userId, { admin, expiresAtMs: Date.now() + VERDICT_TTL_MS });
  if (verdicts.size > 500) verdicts.delete(verdicts.keys().next().value);
  return admin;
}

export const ADMIN_ONLY_MESSAGE = "Only an admin can change this. You can view it, and change your own view in Settings → My view.";
