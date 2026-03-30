import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildAppUrl,
  isValidEmail,
  normalizeEmail,
} from "@/lib/auth-email-flow-utils.mjs";

export async function POST(request: Request) {
  const includeDebug = String(process.env.AUTH_EMAIL_DEBUG || "").toLowerCase() === "true";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });
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
    console.error("[auth/password/forgot] resetPasswordForEmail failed", {
      email,
      message: error.message,
      name: error.name,
      status: error.status,
      code: error.code,
    });
    const response: {
      ok: true;
      sent: false;
      message: string;
      debug?: {
        code: string | null;
        status: number | null;
        message: string;
      };
    } = {
      ok: true,
      sent: false,
      message: "We could not send a reset link right now. Please retry in a minute.",
    };
    if (includeDebug) {
      response.debug = {
        code: error.code ?? null,
        status: error.status ?? null,
        message: error.message,
      };
    }
    // Keep response generic to avoid email enumeration.
    return NextResponse.json(response);
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    message: "If this email exists, a reset link has been sent.",
  });
}
