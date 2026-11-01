import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { NOT_READY, newLink, onboardingReady } from "@/lib/clients/onboarding";
import { appUrl } from "@/lib/mail/send";
import { failure } from "@/lib/public-error";
import { TRY_AGAIN_SIGNED_OUT } from "@/lib/error-text";

export const dynamic = "force-dynamic";
const NOT_DONE = `A new link could not be sent just now. ${TRY_AGAIN_SIGNED_OUT}`;

// An expired or replaced link asks for a new one (2026-11-02). It goes to the address on the request — never to the
// person asking, who only proves they hold an old link — and only while the client is approved and has no account.
export async function POST(request: Request) {
  try {
    const service = createSupabaseServiceRoleClient();
    if (!service) return failure(503, NOT_DONE, { tag: "CLIENT-INVITE", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
    if (!(await onboardingReady(service))) return NextResponse.json({ ok: false, error: NOT_READY, notReady: true }, { status: 503 }); // migration 0028 not applied yet
    const body = (await request.json().catch(() => ({}))) as { token?: string };
    const out = await newLink(service, String(body.token ?? ""), appUrl(request));
    return NextResponse.json({ ok: out.state === "sent", ...out });
  } catch (error) { return failure(500, NOT_DONE, { tag: "CLIENT-INVITE", what: "new link failed", detail: error }); }
}
