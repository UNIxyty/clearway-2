// Forgot password (sent by us since 2026-11-02, lib/mail/auth-links.ts): Supabase makes the reset link, we send it from
// the brand's sender and it appears in Mailbox › Sent. The answer is the same whether or not the address has an account,
// so this page does not tell anyone which addresses exist; `sent: false` only when an email to a real account failed
// (the signed-in profile pages use that to say so). One reset email per address a minute, a few per asker an hour.
import { NextResponse } from "next/server";
import { callerAddress, hourlyLimit, NO_ADDRESS, noAddressRefused } from "@/lib/caller-address.mjs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { isValidEmail, normalizeEmail } from "@/lib/auth-email-flow-utils.mjs";
import { failure, logFailure } from "@/lib/public-error";
import { TRY_AGAIN_SIGNED_OUT } from "@/lib/error-text";
import { appUrl } from "@/lib/mail/send";
import { resetWait, sendResetEmail } from "@/lib/mail/auth-links";

export const dynamic = "force-dynamic";
const GENERIC = "If this email exists, a reset link has been sent.";
const asked = hourlyLimit(10);   // per address of the asker (lib/caller-address.mjs: never a header the caller writes)

export async function POST(request: Request) {
  const service = createSupabaseServiceRoleClient();
  if (!service) {
    return failure(500, `The reset email could not be sent. ${TRY_AGAIN_SIGNED_OUT}`, { tag: "AUTH-FORGOT", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
  }
  // counted before the body is read: a malformed request spends the allowance too
  const ip = callerAddress(request.headers);
  if (!ip) { noAddressRefused("/api/auth/password/forgot"); return NextResponse.json({ error: NO_ADDRESS }, { status: 403 }); }
  if (!asked.take(ip)) return NextResponse.json({ error: "Too many reset requests from here in the last hour. Try again later." }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }
  const wait = resetWait(email);
  if (wait > 0) return NextResponse.json({ error: `A reset email went to this address a moment ago. Check that inbox; you can ask again in ${wait} seconds.`, code: "too_soon" }, { status: 429 });

  const out = await sendResetEmail(service, email, appUrl(request));
  if (out.noAccount) return NextResponse.json({ ok: true, sent: true, message: GENERIC }); // same answer as a real send
  if (!out.ok) {
    logFailure("AUTH-FORGOT", "reset email not sent", out.error);
    return NextResponse.json({ ok: true, sent: false, message: GENERIC });
  }
  return NextResponse.json({ ok: true, sent: true, message: GENERIC });
}
