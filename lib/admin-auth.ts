import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { resolveRole } from "@/lib/role-resolve";

type SupabaseServerClient = ReturnType<typeof createServerClient>;
type AuthFailure = { error: NextResponse };
type AuthSuccess = {
  user: NonNullable<Awaited<ReturnType<SupabaseServerClient["auth"]["getUser"]>>["data"]["user"]>;
  supabase: SupabaseServerClient;
  isDeveloper: boolean;
};

export type { AuthFailure, AuthSuccess };

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

  // Isolated test environments only (mirrors middleware.ts): a synthetic developer so the
  // agent's portal-backed tools can be exercised on a build with no real session.
  if (String(process.env.DISABLE_AUTH_FOR_TESTING || "").toLowerCase() === "true") {
    // The rig's account (see lib/rig-guard.mjs): unmistakable as a test account in every log.
    const email = (process.env.DEVELOPER_EMAILS || "rig-test@rig.invalid").split(",")[0].trim();
    const testUser = { id: "00000000-7e57-4000-8000-000000000000", email, app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: new Date(0).toISOString() } as unknown as AuthSuccess["user"];
    return { user: testUser, supabase, isDeveloper: true };
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
