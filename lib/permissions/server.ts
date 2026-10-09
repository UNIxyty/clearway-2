// The portal's permission check for route handlers (docs/permissions.md). Every write handler calls it with the action
// it performs; the middleware has already checked the endpoint, this checks again where the work happens (and is the
// only check for a handler whose action depends on the request, e.g. turning maintenance on vs off).
import { NextResponse } from "next/server";
import type { createServerClient } from "@supabase/ssr";
import { makeSupabaseFromCookies } from "@/lib/admin-auth";
import { resolveRole } from "@/lib/role-resolve";
import { can, canAny, REFUSED, roleKey } from "@/lib/permissions/grants.mjs";

type SupabaseServerClient = ReturnType<typeof createServerClient>;
type User = NonNullable<Awaited<ReturnType<SupabaseServerClient["auth"]["getUser"]>>["data"]["user"]>;
export type PermissionSuccess = { user: User; supabase: SupabaseServerClient; role: "user" | "admin" | "developer"; isDeveloper: boolean };
export type PermissionFailure = { error: NextResponse };

/** The signed-in person and their role, or a 401. The rig's auth-off mode is its test account, as a developer. */
export async function currentPerson(): Promise<PermissionFailure | PermissionSuccess> {
  const supabase = makeSupabaseFromCookies();
  if (!supabase) return { error: NextResponse.json({ error: "Missing Supabase config" }, { status: 500 }) };
  if (String(process.env.DISABLE_AUTH_FOR_TESTING || "").toLowerCase() === "true") {
    const email = (process.env.DEVELOPER_EMAILS || "rig-test@rig.invalid").split(",")[0].trim();
    const testUser = { id: "00000000-7e57-4000-8000-000000000000", email, app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: new Date(0).toISOString() } as unknown as User;
    return { user: testUser, supabase, role: "developer", isDeveloper: true };
  }
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const role = roleKey(await resolveRole(supabase, user, user.id, user.email ?? null)) as PermissionSuccess["role"];
  return { user, supabase, role, isDeveloper: role === "developer" };
}

/** Passes when the person's role holds the action (or, given several, any of them). Fails closed. */
export async function requirePermission(action: string | string[]): Promise<PermissionFailure | PermissionSuccess> {
  const who = await currentPerson();
  if ("error" in who) return who;
  const ok = Array.isArray(action) ? await canAny(who.role, action) : await can(who.role, action);
  if (!ok) return { error: NextResponse.json({ error: REFUSED, permission: action }, { status: 403 }) };
  return who;
}

/** A second, precise check inside a handler that already passed requirePermission. */
export async function holds(role: string, action: string): Promise<boolean> {
  return can(role, action);
}

export function refused(action: string) {
  return NextResponse.json({ error: REFUSED, permission: action }, { status: 403 });
}
