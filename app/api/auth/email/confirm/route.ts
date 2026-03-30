import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import {
  isValidPassword,
  normalizeEmail,
  sha256Hex,
} from "@/lib/auth-email-flow-utils.mjs";

function createSupabaseFromCookies() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const cookieStore = cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // No-op for API handler reads.
      },
    },
  });
}

async function loadConfirmation(token: string) {
  const service = createSupabaseServiceRoleClient();
  if (!service) return { error: "Missing SUPABASE_SERVICE_ROLE_KEY", row: null };
  const tokenHash = sha256Hex(token);
  const { data, error } = await service
    .from("email_confirmations")
    .select("id, email, purpose, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .eq("purpose", "signup")
    .maybeSingle();
  if (error || !data) return { error: "Invalid or expired token.", row: null };
  if (data.used_at) return { error: "Token has already been used.", row: null };
  if (new Date(data.expires_at).getTime() <= Date.now()) return { error: "Token has expired.", row: null };
  return { error: null, row: data };
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token") ?? "";
  if (!token) return NextResponse.json({ error: "Token is required." }, { status: 400 });

  const supabase = createSupabaseFromCookies();
  if (!supabase) return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id || !user.email) {
    return NextResponse.json({ error: "Please open this page from your email link." }, { status: 401 });
  }

  const confirmation = await loadConfirmation(token);
  if (confirmation.error || !confirmation.row) {
    return NextResponse.json({ error: confirmation.error ?? "Invalid token." }, { status: 400 });
  }

  if (normalizeEmail(user.email) !== normalizeEmail(confirmation.row.email)) {
    return NextResponse.json({ error: "Token email does not match the current account." }, { status: 403 });
  }

  return NextResponse.json({ ok: true, email: confirmation.row.email });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    password?: string;
  };
  const token = String(body.token ?? "").trim();
  const password = String(body.password ?? "");
  if (!token) return NextResponse.json({ error: "Token is required." }, { status: 400 });
  if (!isValidPassword(password)) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const supabase = createSupabaseFromCookies();
  if (!supabase) return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id || !user.email) {
    return NextResponse.json({ error: "Please open this page from your email link." }, { status: 401 });
  }

  const confirmation = await loadConfirmation(token);
  if (confirmation.error || !confirmation.row) {
    return NextResponse.json({ error: confirmation.error ?? "Invalid token." }, { status: 400 });
  }
  if (normalizeEmail(user.email) !== normalizeEmail(confirmation.row.email)) {
    return NextResponse.json({ error: "Token email does not match the current account." }, { status: 403 });
  }

  const service = createSupabaseServiceRoleClient();
  if (!service) return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });

  const { error: updateError } = await service.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
  });
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: markUsedError } = await service
    .from("email_confirmations")
    .update({ used_at: new Date().toISOString() })
    .eq("id", confirmation.row.id);
  if (markUsedError) {
    return NextResponse.json({ error: markUsedError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
