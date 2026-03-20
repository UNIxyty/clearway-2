import { createClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "clearway_session";

type CorporateSessionRow = {
  token: string;
  device_profile_id: string;
  expires_at: string;
  device_profiles?: {
    id: string;
    account_id: string;
    display_name: string | null;
  } | null;
};

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getCorporateTokenFromRequest(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export function getCorporateTokenFromCookieStore(cookieStore: { get: (name: string) => { value: string } | undefined }): string | null {
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function getCorporateSessionByToken(token: string): Promise<CorporateSessionRow | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !token) return null;
  const { data, error } = await supabase
    .from("user_sessions")
    .select("token, device_profile_id, expires_at, device_profiles(id, account_id, display_name)")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return null;
  if (!data.expires_at || new Date(data.expires_at).getTime() <= Date.now()) return null;
  const profileRaw = Array.isArray(data.device_profiles) ? data.device_profiles[0] : data.device_profiles;
  return {
    token: data.token,
    device_profile_id: data.device_profile_id,
    expires_at: data.expires_at,
    device_profiles: profileRaw
      ? {
          id: String(profileRaw.id),
          account_id: String(profileRaw.account_id),
          display_name: profileRaw.display_name ?? null,
        }
      : null,
  };
}

export async function getCorporateSessionFromRequest(request: NextRequest) {
  const token = getCorporateTokenFromRequest(request);
  if (!token) return null;
  return getCorporateSessionByToken(token);
}

export function setCorporateSessionCookie(response: NextResponse, token: string, expiresAt: string) {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

