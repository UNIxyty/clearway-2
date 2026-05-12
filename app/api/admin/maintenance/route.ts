import { NextResponse } from "next/server";
import { requireAdmin, requireDeveloper } from "@/lib/admin-auth";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
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
    const auth = await requireDeveloper();
    if ("error" in auth) return auth.error;
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
