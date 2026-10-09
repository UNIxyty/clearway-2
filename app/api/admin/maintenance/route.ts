import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { holds, refused, requirePermission } from "@/lib/permissions/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
    // Turning maintenance on and off are two permissions (Admin → Permissions); by default a developer turns it on and
    // any admin can turn it off, so an admin who signs in during maintenance can end it (portal foundations 1.2).
    const auth = await requirePermission(["portal.maintenance.enable", "portal.maintenance.disable"]);
    if ("error" in auth) return auth.error;
    const { user, role } = auth;

    const body = (await request.json().catch(() => ({}))) as {
      enabled?: boolean;
      message?: string | null;
      eta_text?: string | null;
    };

    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled(boolean) is required" }, { status: 400 });
    }
    const needed = body.enabled ? "portal.maintenance.enable" : "portal.maintenance.disable";
    if (!(await holds(role, needed))) return refused(needed);

    const payload = {
      enabled: body.enabled,
      message: (body.message ?? "").trim() || null,
      eta_text: (body.eta_text ?? "").trim() || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    // Written with the service role after the check above: the table no longer takes inserts from any signed-in user
    // (docs/supabase-maintenance.sql), which let anyone switch maintenance on or off straight through Supabase.
    const { data, error } = await createSupabaseAdminClient()
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
