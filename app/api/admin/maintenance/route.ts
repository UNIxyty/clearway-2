import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function parseAdminEmails() {
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

async function isAdmin(supabase: ReturnType<typeof createServerClient>, userId: string, email: string | null) {
  const adminEmails = parseAdminEmails();
  if (email && adminEmails.includes(email.toLowerCase())) return true;

  const { data, error } = await supabase
    .from("user_preferences")
    .select("is_admin")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return false;
  return Boolean(data && "is_admin" in data && (data as { is_admin?: boolean }).is_admin);
}

async function authAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { error: NextResponse.json({ error: "Missing Supabase config" }, { status: 500 }) };

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

  if (userErr || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const ok = await isAdmin(supabase, user.id, user.email ?? null);
  if (!ok) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { supabase, user };
}

export async function GET() {
  try {
    const auth = await authAdmin();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const { data, error } = await supabase
      .from("maintenance")
      .select("id, enabled, message, eta_text, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ enabled: false, message: null, eta_text: null, updated_at: null });
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: (e as { message?: string })?.message || "Failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authAdmin();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;

    const body = (await request.json().catch(() => ({}))) as {
      enabled?: boolean;
      message?: string | null;
      eta_text?: string | null;
    };

    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled(boolean) is required" }, { status: 400 });
    }

    const payload = {
      enabled: body.enabled,
      message: (body.message ?? "").trim() || null,
      eta_text: (body.eta_text ?? "").trim() || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("maintenance")
      .insert(payload)
      .select("id, enabled, message, eta_text, updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, maintenance: data });
  } catch (e) {
    return NextResponse.json({ error: (e as { message?: string })?.message || "Failed" }, { status: 500 });
  }
}
