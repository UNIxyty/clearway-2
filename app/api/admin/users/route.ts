import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const service = createSupabaseServiceRoleClient();
    if (!service) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
    }

    const { data: authData, error: listError } = await service.auth.admin.listUsers({ page: 1, perPage: 500 });
    if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });

    const users = authData?.users ?? [];
    const ids = users.map((u) => u.id);

    const { data: prefs, error: prefsError } = await service
      .from("user_preferences")
      .select("user_id, display_name, is_admin, is_developer")
      .in("user_id", ids);
    if (prefsError) return NextResponse.json({ error: prefsError.message }, { status: 500 });

    const prefMap = new Map((prefs ?? []).map((p) => {
      const row = p as { user_id?: string | null; display_name?: string | null; is_admin?: boolean | null; is_developer?: boolean | null };
      return [String(row.user_id || ""), row];
    }));

    const rows = users
      .map((u) => {
        const pref = prefMap.get(u.id);
        return {
          id: u.id,
          email: u.email ?? null,
          createdAt: u.created_at ?? null,
          displayName: pref?.display_name ?? null,
          isAdmin: Boolean(pref?.is_admin),
          isDeveloper: Boolean(pref?.is_developer),
        };
      })
      .sort((a, b) => {
        if (a.isDeveloper !== b.isDeveloper) return a.isDeveloper ? -1 : 1;
        if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
        return String(a.email || "").localeCompare(String(b.email || ""), undefined, { sensitivity: "base" });
      });

    return NextResponse.json({ users: rows, callerIsDeveloper: auth.isDeveloper });
  } catch (e) {
    return NextResponse.json({ error: (e as { message?: string })?.message || "Failed to load users." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const callerIsDeveloper = auth.isDeveloper;

    const body = (await request.json().catch(() => ({}))) as {
      userId?: string;
      isAdmin?: boolean;
      isDeveloper?: boolean;
    };
    const targetUserId = String(body.userId ?? "").trim();
    if (!targetUserId) return NextResponse.json({ error: "userId is required." }, { status: 400 });

    const settingAdmin = typeof body.isAdmin === "boolean";
    const settingDeveloper = typeof body.isDeveloper === "boolean";
    if (!settingAdmin && !settingDeveloper) {
      return NextResponse.json({ error: "isAdmin or isDeveloper (boolean) is required." }, { status: 400 });
    }

    if (settingDeveloper && !callerIsDeveloper) {
      return NextResponse.json({ error: "Only Developers can assign the Developer role." }, { status: 403 });
    }

    const service = createSupabaseServiceRoleClient();
    if (!service) return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });

    const { data: targetPref } = await service
      .from("user_preferences")
      .select("is_developer")
      .eq("user_id", targetUserId)
      .maybeSingle();
    const targetIsDeveloper = Boolean((targetPref as { is_developer?: boolean } | null)?.is_developer);

    if (targetIsDeveloper && !callerIsDeveloper) {
      return NextResponse.json({ error: "Admins cannot modify Developer accounts." }, { status: 403 });
    }
    if (targetUserId === auth.user.id && settingAdmin && body.isAdmin === false) {
      return NextResponse.json({ error: "You cannot remove your own admin role." }, { status: 400 });
    }
    if (targetUserId === auth.user.id && settingDeveloper && body.isDeveloper === false) {
      return NextResponse.json({ error: "You cannot remove your own Developer role." }, { status: 400 });
    }

    const patch: Record<string, boolean> = {};
    if (settingAdmin) patch.is_admin = body.isAdmin!;
    if (settingDeveloper) patch.is_developer = body.isDeveloper!;

    const { error: upsertErr } = await service
      .from("user_preferences")
      .upsert({ user_id: targetUserId, ...patch }, { onConflict: "user_id" });

    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as { message?: string })?.message || "Failed to update." }, { status: 500 });
  }
}
