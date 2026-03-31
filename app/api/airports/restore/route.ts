import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });
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
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
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
  if (!targetIcao && Number.isFinite(deletedId)) {
    const { data: deleted, error: deletedError } = await service
      .from("deleted_airports")
      .select("icao")
      .eq("id", deletedId)
      .maybeSingle();
    if (deletedError) return NextResponse.json({ error: deletedError.message }, { status: 500 });
    targetIcao = String(deleted?.icao || "").toUpperCase();
  }
  if (!targetIcao) return NextResponse.json({ error: "Unable to resolve ICAO" }, { status: 400 });

  const { error: updateError } = await service
    .from("airports")
    .update({ visible: true, updated_at: new Date().toISOString() })
    .eq("icao", targetIcao);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const markRestore = service
    .from("deleted_airports")
    .update({ restored_at: new Date().toISOString() })
    .eq("icao", targetIcao)
    .is("restored_at", null);
  if (Number.isFinite(deletedId)) {
    markRestore.eq("id", deletedId);
  }
  const { error: restoreError } = await markRestore;
  if (restoreError) return NextResponse.json({ error: restoreError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
