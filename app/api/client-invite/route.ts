import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { activate, readLink } from "@/lib/clients/onboarding";
import { failure } from "@/lib/public-error";
import { TRY_AGAIN_SIGNED_OUT } from "@/lib/error-text";

export const dynamic = "force-dynamic";
const NOT_DONE = `That did not work just now. ${TRY_AGAIN_SIGNED_OUT}`;

// The set-password link (2026-11-02), signed out. GET says what the link is (valid, used, expired, replaced, closed,
// unknown) with the address masked; POST sets the password, which is where the account is made.
export async function GET(request: Request) {
  try {
    const service = createSupabaseServiceRoleClient();
    if (!service) return failure(503, NOT_DONE, { tag: "CLIENT-INVITE", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const { state, email, company } = await readLink(service, token);
    return NextResponse.json({ ok: true, state, email: email ?? null, company: company ?? null });
  } catch (error) { return failure(500, NOT_DONE, { tag: "CLIENT-INVITE", what: "read failed", detail: error }); }
}
export async function POST(request: Request) {
  try {
    const service = createSupabaseServiceRoleClient();
    if (!service) return failure(503, NOT_DONE, { tag: "CLIENT-INVITE", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
    const body = (await request.json().catch(() => ({}))) as { token?: string; password?: string };
    const out = await activate(service, String(body.token ?? ""), String(body.password ?? ""));
    if ("problems" in out) return NextResponse.json({ ok: false, error: out.problems.join(" ") }, { status: 400 });
    return NextResponse.json({ ok: true, email: out.email });
  } catch (error) { return failure(500, NOT_DONE, { tag: "CLIENT-INVITE", what: "activate failed", detail: error }); }
}
