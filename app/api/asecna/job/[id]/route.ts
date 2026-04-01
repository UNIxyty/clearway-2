import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";

export async function GET(
  _request: NextRequest,
  context: { params: { id: string } },
) {
  const id = context.params.id;
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
  }
  const { data, error } = await supabase
    .from("asecna_jobs")
    .select("id,icao,status,pdf_url,s3_key,error,last_heartbeat,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json(data);
}
