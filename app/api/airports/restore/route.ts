import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requirePermission } from "@/lib/permissions/server";
import { TRY_AGAIN, failure } from "@/lib/public-error";

const NOT_RESTORED = `The airport was not restored. ${TRY_AGAIN}`;

export async function POST(request: Request) {
  const permission = await requirePermission("portal.airports.hide");
  if ("error" in permission) return permission.error;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return failure(500, NOT_RESTORED, { tag: "AIRPORTS-RESTORE", what: "Supabase URL / anon key not set" });
  }

  const cookieStore = cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createSupabaseServiceRoleClient();
  if (!service) {
    return failure(503, NOT_RESTORED, { tag: "AIRPORTS-RESTORE", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
  }

  const body = (await request.json().catch(() => ({}))) as {
    icao?: string;
    deletedId?: number;
  };
  const icao = String(body.icao ?? "").trim().toUpperCase();
  const deletedId = Number(body.deletedId ?? NaN);
  if (!icao && !Number.isFinite(deletedId)) {
    return NextResponse.json({ error: "ICAO or deletedId is required" }, { status: 400 });
  }

  let targetIcao = icao;
  let targetDeletedId = Number.isFinite(deletedId) ? deletedId : NaN;
  if (!targetIcao && Number.isFinite(deletedId)) {
    const { data: deleted, error: deletedError } = await service
      .from("deleted_airports")
      .select("id, icao")
      .eq("id", deletedId)
      .eq("deleted_by", user.id)
      .maybeSingle();
    if (deletedError) return failure(500, NOT_RESTORED, { tag: "AIRPORTS-RESTORE", what: "Database error (deletedError)", detail: deletedError });
    targetIcao = String(deleted?.icao || "").toUpperCase();
    targetDeletedId = Number(deleted?.id ?? NaN);
  }
  if (!targetIcao) return NextResponse.json({ error: "Unable to resolve ICAO" }, { status: 400 });

  if (!Number.isFinite(targetDeletedId)) {
    const { data: latestHidden, error: latestHiddenError } = await service
      .from("deleted_airports")
      .select("id")
      .eq("icao", targetIcao)
      .eq("deleted_by", user.id)
      .is("restored_at", null)
      .order("deleted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestHiddenError) return failure(500, NOT_RESTORED, { tag: "AIRPORTS-RESTORE", what: "Database error (latestHiddenError)", detail: latestHiddenError });
    targetDeletedId = Number(latestHidden?.id ?? NaN);
  }

  if (!Number.isFinite(targetDeletedId)) {
    return NextResponse.json({ error: "No hidden airport found for current user" }, { status: 404 });
  }

  const markRestore = service
    .from("deleted_airports")
    .update({ restored_at: new Date().toISOString() })
    .eq("id", targetDeletedId)
    .eq("deleted_by", user.id)
    .is("restored_at", null)
    .select("id")
    .maybeSingle();
  const { data: restoredRow, error: restoreError } = await markRestore;
  if (restoreError) return failure(500, NOT_RESTORED, { tag: "AIRPORTS-RESTORE", what: "Database error (restoreError)", detail: restoreError });
  if (!restoredRow) {
    return NextResponse.json({ error: "No deletions to restore for current user" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
