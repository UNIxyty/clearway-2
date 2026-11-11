import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/admin-auth";
import { currentPerson, holds, refused, requirePermission } from "@/lib/permissions/server";
import { TRY_AGAIN, failure } from "@/lib/public-error";
import { listAllUsers } from "@/lib/auth-users";
import { sendStaffApproved } from "@/lib/mail/staff-account";

const NOT_LOADED = `Users could not be loaded. ${TRY_AGAIN}`;
const NOT_SAVED = `The change was not saved. ${TRY_AGAIN}`;

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const service = createSupabaseServiceRoleClient();
    if (!service) return failure(503, NOT_LOADED, { tag: "ADMIN-USERS", what: "SUPABASE_SERVICE_ROLE_KEY not set" });

    // every account, not the first 500 (2026-11-07): the tab counts and the waiting list are totals
    let users: Awaited<ReturnType<typeof listAllUsers>>;
    try { users = await listAllUsers(service); }
    catch (listError) { return failure(500, NOT_LOADED, { tag: "ADMIN-USERS", what: "listUsers failed", detail: listError }); }
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
      // Clients (Stage 5) are decided under Admin › Clients, never here: an approval from this page would make a client a staff user.
      .filter((u) => String((u.app_metadata as Record<string, unknown> | undefined)?.role ?? "").toLowerCase() !== "client")
      .map((u) => {
        const pref = prefMap.get(u.id);
        const appMeta = (u.app_metadata ?? {}) as Record<string, unknown>;
        return {
          id: u.id,
          email: u.email ?? null,
          createdAt: u.created_at ?? null,
          lastSignInAt: u.last_sign_in_at ?? null,
          displayName: pref?.display_name ?? null,
          isAdmin: Boolean(pref?.is_admin),
          isDeveloper: Boolean(pref?.is_developer),
          // Approval is what the gates read: app_metadata.is_approved === true (service-key writes); a missing flag is pending (2026-10-25).
          isApproved: appMeta.is_approved === true,
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
      const { data: before } = await service.auth.admin.getUserById(targetUserId);
      const wasApproved = (before?.user?.app_metadata as { is_approved?: unknown } | undefined)?.is_approved === true;
      await service.auth.admin.updateUserById(targetUserId, {
        app_metadata: { is_approved: body.isApproved! }, // app_metadata: the person cannot change it themselves
      });
      // the designed email (03, 2026-11-11): once, when the account turns approved
      if (body.isApproved && !wasApproved && before?.user?.email) {
        const meta = (before.user.user_metadata ?? {}) as { full_name?: string; name?: string }; // metadata-ok: the display name for an email greeting, never a right
        await sendStaffApproved({ userId: targetUserId, email: before.user.email, name: meta.full_name ?? meta.name ?? null, role: patch.is_admin ? "Admin" : patch.is_developer ? "Developer" : "User", approvedBy: auth.user.email ?? null }, request);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(500, NOT_SAVED, { tag: "ADMIN-USERS", what: "POST failed", detail: e });
  }
}
