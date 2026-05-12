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

function parseAdminEmails() {
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

type Role = "none" | "admin" | "developer";

async function resolveRole(
  supabase: SupabaseServerClient,
  userId: string,
  email: string | null,
): Promise<Role> {
  // ADMIN_EMAILS env var confers developer (highest) privilege.
  const adminEmails = parseAdminEmails();
  if (email && adminEmails.includes(email.toLowerCase())) return "developer";

  const { data, error } = await supabase
    .from("user_preferences")
    .select("is_admin, is_developer")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return "none";
  const row = data as { is_admin?: boolean; is_developer?: boolean };
  if (row.is_developer) return "developer";
  if (row.is_admin) return "admin";
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

  const role = await resolveRole(supabase, user.id, user.email ?? null);
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

  const role = await resolveRole(supabase, user.id, user.email ?? null);
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

  const role = await resolveRole(supabase, user.id, user.email ?? null);
  if (role !== "developer") {
    return { error: NextResponse.json({ error: "Forbidden — Developer role required" }, { status: 403 }) };
  }
  return { user, supabase };
}
