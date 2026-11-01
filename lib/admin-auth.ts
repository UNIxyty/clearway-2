import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { resolveRole } from "@/lib/role-resolve";
import { hasInternalDebugAccess } from "@/lib/internal-debug-auth";
import { failure } from "@/lib/public-error";

/** What a person sees when the portal cannot check who they are (the missing setting is logged, not shown). */
export const ACCESS_UNAVAILABLE = "The portal cannot check your access right now. Try again in a few minutes.";

export function accessCheckUnavailable(): NextResponse {
  return failure(500, ACCESS_UNAVAILABLE, {
    tag: "AUTH",
    what: "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set",
  });
}

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
    return { error: accessCheckUnavailable() };
  }

  // Isolated test environments only (mirrors middleware.ts): a synthetic developer so the
  // agent's portal-backed tools can be exercised on a build with no real session.
  if (String(process.env.DISABLE_AUTH_FOR_TESTING || "").toLowerCase() === "true") {
    // The rig's account (see lib/rig-guard.mjs): unmistakable as a test account in every log.
    const email = (process.env.DEVELOPER_EMAILS || "rig-test@rig.invalid").split(",")[0].trim();
    const testUser = { id: "00000000-7e57-4000-8000-000000000000", email, app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: new Date(0).toISOString() } as unknown as AuthSuccess["user"]; // metadata-ok: the rig's stub user, empty
    return { user: testUser, supabase, isDeveloper: true };
  }

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const role = await resolveRole(supabase, user, user.id, user.email ?? null);
  // These helpers mean "Clearway staff" (2026-11-02): a client or an unknown role is refused here, at the endpoint,
  // whether or not the middleware ran. 404: nothing behind it is confirmed to exist.
  if (!isStaffRole(role)) return { error: notForYou() };
  return { user, supabase, isDeveloper: role === "developer" };
}

/** A client, by name (2026-11-02): the only helper a client passes. Their own routes use it; staff get 404 from it. */
export async function requireClient(): Promise<AuthFailure | AuthSuccess> {
  const supabase = makeSupabaseFromCookies();
  if (!supabase) return { error: accessCheckUnavailable() };
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if ((await resolveRole(supabase, user, user.id, user.email ?? null)) !== "client") return { error: notForYou() };
  return { user, supabase, isDeveloper: false };
}

/** Staff, by name: an ordinary staff account ("none" = the User role), admin, developer. Not client, not unknown. */
export function isStaffRole(role: string): boolean {
  return role === "none" || role === "admin" || role === "developer";
}
export function notForYou(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * The staff gate for a route that used to rely on the middleware alone (2026-11-02): signed-in staff, or the platform's
 * own services carrying the internal header (the wall and the agent fetch AIP copies this way). A client, an unknown
 * role or nobody → refused here. Returns the refusal, or null to go on.
 */
export async function staffGate(request: Request): Promise<NextResponse | null> {
  if (hasInternalDebugAccess(request)) return null;
  const auth = await requireAuthenticatedUser();
  return "error" in auth ? auth.error : null;
}

/** Passes for Admin and Developer. Returns isDeveloper so callers can branch. */
export async function requireAdmin(): Promise<AuthFailure | AuthSuccess> {
  const supabase = makeSupabaseFromCookies();
  if (!supabase) {
    return { error: accessCheckUnavailable() };
  }

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const role = await resolveRole(supabase, user, user.id, user.email ?? null);
  // Admin or developer, named (2026-11-02). It used to be `role === "none"` → refuse, i.e. "anything but none passes":
  // a client role, or any role added later, would have passed as staff. An unknown role gets nothing.
  if (role !== "admin" && role !== "developer") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, supabase, isDeveloper: role === "developer" };
}

/** Passes only for Developer. */
export async function requireDeveloper(): Promise<AuthFailure | Omit<AuthSuccess, "isDeveloper">> {
  const supabase = makeSupabaseFromCookies();
  if (!supabase) {
    return { error: accessCheckUnavailable() };
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
