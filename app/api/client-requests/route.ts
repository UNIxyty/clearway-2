import { NextResponse } from "next/server";
import { callerAddress, hourlyLimit, NO_ADDRESS } from "@/lib/caller-address.mjs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { NOT_READY, createRequest, onboardingReady } from "@/lib/clients/onboarding";
import { appUrl } from "@/lib/mail/send";
import { failure } from "@/lib/public-error";
import { TRY_AGAIN_SIGNED_OUT } from "@/lib/error-text";

export const dynamic = "force-dynamic";
const NOT_SENT = `Your request could not be sent just now. ${TRY_AGAIN_SIGNED_OUT}`;
const asks = hourlyLimit(8);   // per address of the asker: at most 8 requests an hour (signed-out route; lib/caller-address.mjs)

// Ask for access (2026-11-02): public, signed out. A request is a clients row with no account; ops are emailed. The
// answer says the request is on file — which is true once the row is written, whether or not the ops email went (that
// one is in Mailbox › Sent with its own status, and the request is on Admin › Clients regardless).
export async function POST(request: Request) {
  // counted before the body is read: a malformed request spends the allowance too
  const ip = callerAddress(request.headers);
  if (!ip) return NextResponse.json({ ok: false, error: NO_ADDRESS }, { status: 403 });
  if (!asks.take(ip)) return NextResponse.json({ ok: false, error: "Too many requests from here in the last hour. Try again later." }, { status: 429 });
  try {
    const service = createSupabaseServiceRoleClient();
    if (!service) return failure(503, NOT_SENT, { tag: "CLIENT-REQUEST", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
    if (!(await onboardingReady(service))) return NextResponse.json({ ok: false, error: "Asking for access is not available yet. Try again later, or write to Clearway ops.", notReady: true }, { status: 503 });
    const body = (await request.json().catch(() => ({}))) as Record<string, string>;
    const out = await createRequest(service, { name: body.name, company: body.company, email: body.email, kind: body.kind, note: body.note }, appUrl(request));
    if ("problems" in out) return NextResponse.json({ ok: false, error: out.problems.join(" "), problems: out.problems }, { status: 400 });
    return NextResponse.json({ ok: true, alreadyApproved: out.opsNotice === "already-approved" });
  } catch (error) {
    return failure(500, NOT_SENT, { tag: "CLIENT-REQUEST", what: "request failed", detail: error });
  }
}
