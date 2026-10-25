import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/admin-auth";
import { currentPerson, holds, refused, requirePermission } from "@/lib/permissions/server";
import { TRY_AGAIN, failure } from "@/lib/public-error";

const NOT_LOADED = `Users could not be loaded. ${TRY_AGAIN}`;
const NOT_SAVED = `The change was not saved. ${TRY_AGAIN}`;

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const service = createSupabaseServiceRoleClient();
    if (!service) return failure(503, NOT_LOADED, { tag: "ADMIN-USERS", what: "SUPABASE_SERVICE_ROLE_KEY not set" });

    const { data: authData, error: listError } = await service.auth.admin.listUsers({ page: 1, perPage: 500 });
    if (listError) return failure(500, NOT_LOADED, { tag: "ADMIN-USERS", what: "listUsers failed", detail: listError });

    const users = authData?.users ?? [];
    const ids = users.map((u) => u.id);

    const { data: prefs, error: prefsError } = await service
      .from("user_preferences")
      .select("user_id, display_name, is_admin, is_developer, is_approved")
      .in("user_id", ids);
    if (prefsError) return failure(500, NOT_LOADED, { tag: "ADMIN-USERS", what: "user_preferences read failed", detail: prefsError });

    const prefMap = new Map((prefs ?? []).map((p) => {
      const row = p as { user_id?: string | null; display_name?: string | null; is_admin?: boolean | null; is_developer?: boolean | null; is_approved?: boolean | null };
      return [String(row.user_id || ""), row];
    }));

    const rows = users
      .map((u) => {
        const pref = prefMap.get(u.id);
        return {
          id: u.id,
          email: u.email ?? null,
          createdAt: u.created_at ?? null,
          lastSignInAt: u.last_sign_in_at ?? null,
          displayName: pref?.display_name ?? null,
          isAdmin: Boolean(pref?.is_admin),
          isDeveloper: Boolean(pref?.is_developer),
          isApproved: pref ? Boolean(pref.is_approved) : false, // no record means not approved (2026-10-25), as the gates read it
        };
      })
      .sort((a, b) => {
        if (a.isDeveloper !== b.isDeveloper) return a.isDeveloper ? -1 : 1;
        if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
        return String(a.email || "").localeCompare(String(b.email || ""), undefined, { sensitivity: "base" });
      });

    // What the caller may do here, so the page offers only actions that will work (each is checked again on POST).
    const me = await currentPerson();
    const role = "error" in me ? "user" : me.role;
    const [approve, setAdmin, setDeveloper, passwordReset] = await Promise.all(
      ["portal.users.approve", "portal.users.set-admin", "portal.users.set-developer", "portal.users.password-reset"].map((a) => holds(role, a)),
    );
    return NextResponse.json({ users: rows, callerIsDeveloper: auth.isDeveloper, callerId: "error" in me ? null : me.user.id, can: { approve, setAdmin, setDeveloper, passwordReset } });
  } catch (e) {
    return failure(500, NOT_LOADED, { tag: "ADMIN-USERS", what: "GET failed", detail: e });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission(["portal.users.approve", "portal.users.set-admin", "portal.users.set-developer"]);
    if ("error" in auth) return auth.error;
    const callerIsDeveloper = auth.isDeveloper;

    const body = (await request.json().catch(() => ({}))) as {
      userId?: string;
      isAdmin?: boolean;
      isDeveloper?: boolean;
      isApproved?: boolean;
    };
    const targetUserId = String(body.userId ?? "").trim();
    if (!targetUserId) return NextResponse.json({ error: "userId is required." }, { status: 400 });

    const settingAdmin = typeof body.isAdmin === "boolean";
    const settingDeveloper = typeof body.isDeveloper === "boolean";
    const settingApproved = typeof body.isApproved === "boolean";
    if (!settingAdmin && !settingDeveloper && !settingApproved) {
      return NextResponse.json({ error: "isAdmin, isDeveloper, or isApproved (boolean) is required." }, { status: 400 });
    }

    // Each change needs its own permission (Admin → Permissions). Changing a role is only effective for a role that
    // can also manage permissions, and never on yourself: nobody raises their own access.
    if (settingApproved && !(await holds(auth.role, "portal.users.approve"))) return refused("portal.users.approve");
    if (settingAdmin && !(await holds(auth.role, "portal.users.set-admin"))) return refused("portal.users.set-admin");
    if (settingDeveloper && !(await holds(auth.role, "portal.users.set-developer"))) return refused("portal.users.set-developer");
    if (targetUserId === auth.user.id && (settingAdmin || settingDeveloper)) {
      return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 });
    }

    const service = createSupabaseServiceRoleClient();
    if (!service) return failure(503, NOT_SAVED, { tag: "ADMIN-USERS", what: "SUPABASE_SERVICE_ROLE_KEY not set" });

    const { data: targetPref } = await service
      .from("user_preferences")
      .select("is_developer")
      .eq("user_id", targetUserId)
      .maybeSingle();
    const targetIsDeveloper = Boolean((targetPref as { is_developer?: boolean } | null)?.is_developer);

    if (targetIsDeveloper && !callerIsDeveloper) {
      return NextResponse.json({ error: "Admins cannot modify Developer accounts." }, { status: 403 });
    }

    const patch: Record<string, boolean> = {};
    if (settingAdmin) patch.is_admin = body.isAdmin!;
    if (settingDeveloper) patch.is_developer = body.isDeveloper!;
    if (settingApproved) patch.is_approved = body.isApproved!;

    const { error: upsertErr } = await service
      .from("user_preferences")
      .upsert({ user_id: targetUserId, ...patch }, { onConflict: "user_id" });

    if (upsertErr) return failure(500, NOT_SAVED, { tag: "ADMIN-USERS", what: "user_preferences upsert failed", detail: upsertErr });

    if (settingApproved) {
      await service.auth.admin.updateUserById(targetUserId, {
        app_metadata: { is_approved: body.isApproved! }, // app_metadata: the person cannot change it themselves
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(500, NOT_SAVED, { tag: "ADMIN-USERS", what: "POST failed", detail: e });
  }
}
