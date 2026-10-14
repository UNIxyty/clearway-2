import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildAppUrl,
  isValidEmail,
  normalizeEmail,
} from "@/lib/auth-email-flow-utils.mjs";
import { failure, logFailure } from "@/lib/public-error";
import { TRY_AGAIN_SIGNED_OUT } from "@/lib/error-text";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return failure(500, `The reset email could not be sent. ${TRY_AGAIN_SIGNED_OUT}`, {
      tag: "AUTH-FORGOT",
      what: "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set",
    });
  }

  const requestUrl = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
  };
  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const appUrl = buildAppUrl(process.env.NEXT_PUBLIC_SITE_URL, requestUrl.origin);
  const redirectTo = `${appUrl}/auth/reset`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    // Keep response generic to avoid email enumeration.
    logFailure("AUTH-FORGOT", "resetPasswordForEmail failed", error.message);
    return NextResponse.json({
      ok: true,
      sent: false,
      message: "If this email exists, a reset link has been sent.",
    });
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    message: "If this email exists, a reset link has been sent.",
  });
}
