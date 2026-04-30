import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";

function parseAdminEmails() {
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

async function isAdmin(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  email: string | null,
) {
  const adminEmails = parseAdminEmails();
  if (email && adminEmails.includes(email.toLowerCase())) return true;

  const { data, error } = await supabase
    .from("user_preferences")
    .select("is_admin")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return Boolean((data as { is_admin?: boolean } | null)?.is_admin);
}

async function authAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { error: NextResponse.json({ error: "Missing Supabase config" }, { status: 500 }) };
  }

  const cookieStore = cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {},
    },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const admin = await isAdmin(supabase, user.id, user.email ?? null);
  if (!admin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  try {
    const auth = await authAdmin();
    if ("error" in auth) return auth.error;

    const service = createSupabaseServiceRoleClient();
    if (!service) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
    }

    const { data: authData, error: listError } = await service.auth.admin.listUsers({
      page: 1,
      perPage: 500,
    });
    if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });

    const users = authData?.users ?? [];
    const ids = users.map((u) => u.id);

    const { data: prefs, error: prefsError } = await service
      .from("user_preferences")
      .select("user_id, display_name, is_admin")
      .in("user_id", ids);
    if (prefsError) return NextResponse.json({ error: prefsError.message }, { status: 500 });

    const prefMap = new Map(
      (prefs ?? []).map((p) => [
        String((p as { user_id?: string | null }).user_id || ""),
        p as { user_id?: string | null; display_name?: string | null; is_admin?: boolean | null },
      ]),
    );

    const rows = users
      .map((u) => {
        const pref = prefMap.get(u.id);
        return {
          id: u.id,
          email: u.email ?? null,
          createdAt: u.created_at ?? null,
          displayName: pref?.display_name ?? null,
          isAdmin: Boolean(pref?.is_admin),
        };
      })
      .sort((a, b) => {
        if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
        return String(a.email || "").localeCompare(String(b.email || ""), undefined, {
          sensitivity: "base",
        });
      });

    return NextResponse.json({ users: rows });
  } catch (e) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message || "Failed to load users." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authAdmin();
    if ("error" in auth) return auth.error;

    const body = (await request.json().catch(() => ({}))) as {
      userId?: string;
      isAdmin?: boolean;
    };
    const targetUserId = String(body.userId ?? "").trim();
    const nextAdmin = body.isAdmin;
    if (!targetUserId || typeof nextAdmin !== "boolean") {
      return NextResponse.json({ error: "userId and isAdmin(boolean) are required." }, { status: 400 });
    }

    if (targetUserId === auth.user.id && nextAdmin === false) {
      return NextResponse.json({ error: "You cannot remove admin from your own account." }, { status: 400 });
    }

    const service = createSupabaseServiceRoleClient();
    if (!service) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
    }

    const { error: upsertErr } = await service
      .from("user_preferences")
      .upsert(
        {
          user_id: targetUserId,
          is_admin: nextAdmin,
        },
        { onConflict: "user_id" },
      );

    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message || "Failed to update admin flag." },
      { status: 500 },
    );
  }
}

