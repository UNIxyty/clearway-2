import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listActiveLeonOperators, upsertLeonOperator } from "@/lib/leon/store";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const includeInactive = true;
    const supabase = createSupabaseServiceRoleClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
    }

    if (!includeInactive) {
      const active = await listActiveLeonOperators();
      return NextResponse.json({ operators: active });
    }

    const { data, error } = await supabase
      .from("leon_operators")
      .select("id, opr_id, name, notes, is_active, last_sync_at, last_sync_status, last_sync_error, created_at, updated_at")
      .order("opr_id", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ operators: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const body = (await request.json().catch(() => ({}))) as {
      oprId?: string;
      name?: string | null;
      notes?: string | null;
      isActive?: boolean;
    };
    const oprId = String(body.oprId || "").trim().toLowerCase();
    if (!oprId) {
      return NextResponse.json({ error: "oprId is required." }, { status: 400 });
    }

    const row = await upsertLeonOperator({
      oprId,
      name: body.name ?? null,
      notes: body.notes ?? "",
      isActive: typeof body.isActive === "boolean" ? body.isActive : true,
    });
    return NextResponse.json({ operator: row });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
