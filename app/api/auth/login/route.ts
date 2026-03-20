import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { setCorporateSessionCookie } from "@/lib/corporate-auth";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function fingerprintFromRequest(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ua = request.headers.get("user-agent") || "unknown";
  return { ipAddress: ip, uaHash: sha256(ua) };
}

export async function POST(request: Request) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
    selectedProfileId?: string;
    profileName?: string;
  };
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  const { data: account, error: accountErr } = await supabase
    .from("corporate_accounts")
    .select("id, username, password_hash")
    .ilike("username", username)
    .maybeSingle();

  if (accountErr || !account) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  if (sha256(password) !== account.password_hash) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const fp = fingerprintFromRequest(request);
  const { data: existing } = await supabase
    .from("device_profiles")
    .select("id, account_id, display_name, ip_address, device_name")
    .eq("account_id", account.id)
    .eq("ip_address", fp.ipAddress)
    .eq("device_name", fp.uaHash)
    .maybeSingle();

  if (!existing) {
    const { data: profiles } = await supabase
      .from("device_profiles")
      .select("id, display_name")
      .eq("account_id", account.id)
      .order("created_at", { ascending: true });
    return NextResponse.json({
      needsProfile: true,
      accountId: account.id,
      accountUsername: account.username,
      fingerprint: fp,
      profiles: profiles ?? [],
    });
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { error: sessionErr } = await supabase.from("user_sessions").insert({
    token,
    device_profile_id: existing.id,
    expires_at: expiresAt,
  });
  if (sessionErr) {
    return NextResponse.json({ error: sessionErr.message }, { status: 500 });
  }

  const response = NextResponse.json({
    ok: true,
    corporate: true,
    profile: { id: existing.id, displayName: existing.display_name ?? null },
  });
  setCorporateSessionCookie(response, token, expiresAt);
  return response;
}

