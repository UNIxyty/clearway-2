import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { TRY_AGAIN, failure } from "@/lib/public-error";

const NOT_READ = `The ASECNA download status could not be read. ${TRY_AGAIN}`;

export async function GET(
  _request: NextRequest,
  context: { params: { id: string } },
) {
  // Session check in-handler (audit §2.9): middleware's file-extension bypass
  // means a dotted id (e.g. /api/asecna/job/x.pdf) would otherwise skip the
  // login gate entirely and read job rows via the service-role client.
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;

  const id = context.params.id;
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) {
    return failure(503, NOT_READ, { tag: "ASECNA-JOB", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
  }
  const { data, error } = await supabase
    .from("asecna_jobs")
    .select("id,icao,status,pdf_url,s3_key,error,last_heartbeat,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return failure(500, NOT_READ, { tag: "ASECNA-JOB", what: "Database error", detail: error });
  if (!data) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json(data);
}
