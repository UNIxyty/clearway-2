// Who is this person on the wall: their role (user / admin / developer), for the permissions check
// (lib/permissions/, docs/permissions.md — which action each write needs, and which role may).
//
// The role is the portal's rule, mirrored from lib/role-resolve.ts resolveRole:
//   DEVELOPER_EMAILS / ADMIN_EMAILS, the Supabase metadata role / roles / is_admin / is_developer, or
//   user_preferences.is_admin / is_developer (read with the service-role key; the wall has no user-scoped client).

const VERDICT_TTL_MS = 60 * 1000;
const verdicts = new Map(); // userId -> { row, expiresAtMs } (user_preferences flags)

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
 * This signed-in person's role: "developer" | "admin" | "user"; null for a device or nobody. The rig's auth-off mock
 * is a developer. A failed preferences read falls back to the env lists and metadata (fails closed for
 * preference-only roles) and is not cached.
 */
export async function resolveRoleKey(user) {
  if (!user || user.device) return null;
  if (user.mock) return "developer";
  const email = String(user.email || "").toLowerCase();
  if (email && emailList(process.env.DEVELOPER_EMAILS).includes(email)) return "developer";
  const meta = roleFromClaims(user.claims);
  if (meta === "developer") return "developer";
  const cached = verdicts.get(user.userId);
  let row = null;
  if (cached && Date.now() < cached.expiresAtMs) row = cached.row;
  else {
    try {
      row = await preferencesRow(user.userId);
      verdicts.set(user.userId, { row, expiresAtMs: Date.now() + VERDICT_TTL_MS });
      if (verdicts.size > 500) verdicts.delete(verdicts.keys().next().value);
    } catch (error) {
      console.warn(`[roles] could not read user_preferences: ${error?.message || error}`);
    }
  }
  if (row?.is_developer) return "developer";
  if (meta === "admin" || (email && emailList(process.env.ADMIN_EMAILS).includes(email)) || row?.is_admin) return "admin";
  return "user";
}

