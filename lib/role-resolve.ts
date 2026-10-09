// The portal's one rule for admin / developer (lib/admin-auth.ts uses it for API routes, middleware.ts for the
// maintenance gate). No next/* imports, so the middleware can load it. digital-wall/lib/roles.mjs mirrors it.
import type { createServerClient } from "@supabase/ssr";

type SupabaseServerClient = ReturnType<typeof createServerClient>;

export function parseEmailList(raw: string | undefined) {
  return String(raw || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

export type Role = "none" | "admin" | "developer";

export function roleFromSupabaseUser(user: { app_metadata?: unknown; user_metadata?: unknown }): Role {
  const appMeta = (user.app_metadata || {}) as Record<string, unknown>;
  const userMeta = (user.user_metadata || {}) as Record<string, unknown>;
  const roleValue = String(appMeta.role || userMeta.role || "").toLowerCase();
  if (roleValue === "developer") return "developer";
  if (roleValue === "admin") return "admin";

  const rolesRaw = appMeta.roles || userMeta.roles;
  const roles = Array.isArray(rolesRaw) ? rolesRaw.map((v) => String(v).toLowerCase()) : [];
  if (roles.includes("developer")) return "developer";
  if (roles.includes("admin")) return "admin";

  if (appMeta.is_developer === true || userMeta.is_developer === true) return "developer";
  if (appMeta.is_admin === true || userMeta.is_admin === true) return "admin";
  return "none";
}

export async function resolveRole(
  supabase: SupabaseServerClient,
  user: NonNullable<Awaited<ReturnType<SupabaseServerClient["auth"]["getUser"]>>["data"]["user"]>,
  userId: string,
  email: string | null,
): Promise<Role> {
  // Developer is a flag, not an admin tier (help-centre gate): it comes ONLY
  // from explicit developer signals — DEVELOPER_EMAILS, metadata role/flag, or
  // user_preferences.is_developer. ADMIN_EMAILS confers admin, nothing more,
  // so listing an ops manager there never opens the developer inbox.
  const lowerEmail = email ? email.toLowerCase() : null;
  if (lowerEmail && parseEmailList(process.env.DEVELOPER_EMAILS).includes(lowerEmail)) return "developer";

  const userRole = roleFromSupabaseUser(user);
  if (userRole === "developer") return "developer";

  const { data, error } = await supabase
    .from("user_preferences")
    .select("is_admin, is_developer")
    .eq("user_id", userId)
    .maybeSingle();
  const row = (error ? null : data) as { is_admin?: boolean; is_developer?: boolean } | null;
  if (row?.is_developer) return "developer";

  if (userRole === "admin") return "admin";
  if (lowerEmail && parseEmailList(process.env.ADMIN_EMAILS).includes(lowerEmail)) return "admin";
  if (row?.is_admin) return "admin";
  return "none";
}
