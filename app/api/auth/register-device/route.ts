import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { setCorporateSessionCookie } from "@/lib/corporate-auth";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    accountId?: string;
    profileName?: string;
    selectedProfileId?: string;
    ipAddress?: string;
    uaHash?: string;
  };

  const accountId = (body.accountId ?? "").trim();
  const profileName = (body.profileName ?? "").trim();
  const selectedProfileId = (body.selectedProfileId ?? "").trim();
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  let profileId = selectedProfileId;
  if (!profileId) {
    if (!profileName) {
      return NextResponse.json({ error: "Provide profile name or select profile" }, { status: 400 });
    }
    const { data: created, error: createErr } = await supabase
      .from("device_profiles")
      .insert({
        account_id: accountId,
        display_name: profileName,
        ip_address: body.ipAddress || "unknown",
        device_name: body.uaHash || "unknown",
      })
      .select("id, display_name")
      .single();
    if (createErr || !created) {
      return NextResponse.json({ error: createErr?.message ?? "Failed to create profile" }, { status: 500 });
    }
    profileId = created.id;
  }

  if (!selectedProfileId && profileId) {
    await supabase
      .from("device_profiles")
      .update({
        ip_address: body.ipAddress || "unknown",
        device_name: body.uaHash || "unknown",
      })
      .eq("id", profileId);
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { error: sessionErr } = await supabase.from("user_sessions").insert({
    token,
    device_profile_id: profileId,
    expires_at: expiresAt,
  });
  if (sessionErr) {
    return NextResponse.json({ error: sessionErr.message }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true, corporate: true, profileId });
  setCorporateSessionCookie(response, token, expiresAt);
  return response;
}

