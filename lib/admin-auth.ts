import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

type SupabaseServerClient = ReturnType<typeof createServerClient>;
type AuthFailure = { error: NextResponse };
type AuthSuccess = {
  user: NonNullable<Awaited<ReturnType<SupabaseServerClient["auth"]["getUser"]>>["data"]["user"]>;
  supabase: SupabaseServerClient;
  isDeveloper: boolean;
};

export type { AuthFailure, AuthSuccess };

function parseEmailList(raw: string | undefined) {
  return String(raw || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

type Role = "none" | "admin" | "developer";

function roleFromSupabaseUser(user: { app_metadata?: unknown; user_metadata?: unknown }): Role {
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

async function resolveRole(
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

export function makeSupabaseFromCookies(): SupabaseServerClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const cookieStore = cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll() {},
    },
  });
}

export async function requireAuthenticatedUser(): Promise<AuthFailure | AuthSuccess> {
  const supabase = makeSupabaseFromCookies();
  if (!supabase) {
    return { error: NextResponse.json({ error: "Missing Supabase config" }, { status: 500 }) };
  }

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const role = await resolveRole(supabase, user, user.id, user.email ?? null);
  return { user, supabase, isDeveloper: role === "developer" };
}

/** Passes for Admin and Developer. Returns isDeveloper so callers can branch. */
export async function requireAdmin(): Promise<AuthFailure | AuthSuccess> {
  const supabase = makeSupabaseFromCookies();
  if (!supabase) {
    return { error: NextResponse.json({ error: "Missing Supabase config" }, { status: 500 }) };
  }

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const role = await resolveRole(supabase, user, user.id, user.email ?? null);
  if (role === "none") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, supabase, isDeveloper: role === "developer" };
}

/** Passes only for Developer. */
export async function requireDeveloper(): Promise<AuthFailure | Omit<AuthSuccess, "isDeveloper">> {
  const supabase = makeSupabaseFromCookies();
  if (!supabase) {
    return { error: NextResponse.json({ error: "Missing Supabase config" }, { status: 500 }) };
  }

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const role = await resolveRole(supabase, user, user.id, user.email ?? null);
  if (role !== "developer") {
    return { error: NextResponse.json({ error: "Forbidden — Developer role required" }, { status: 403 }) };
  }
  return { user, supabase };
}
