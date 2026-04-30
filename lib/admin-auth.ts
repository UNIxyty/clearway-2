import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

type SupabaseServerClient = ReturnType<typeof createServerClient>;
type AuthFailure = { error: NextResponse };
type SupabaseSuccess = { supabase: SupabaseServerClient };
type AuthSuccess = { user: NonNullable<Awaited<ReturnType<SupabaseServerClient["auth"]["getUser"]>>["data"]["user"]>; supabase: SupabaseServerClient };

function parseAdminEmails() {
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

async function isAdmin(
  supabase: SupabaseServerClient,
  userId: string,
  email: string | null,
) {
  const adminEmails = parseAdminEmails();
  if (email && adminEmails.includes(email.toLowerCase())) return true;

  const { data, error } = await supabase
    .from("user_preferences")
    .select("is_admin")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return Boolean((data as { is_admin?: boolean } | null)?.is_admin);
}

async function getSupabaseFromCookies(): Promise<AuthFailure | SupabaseSuccess> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { error: NextResponse.json({ error: "Missing Supabase config" }, { status: 500 }) } as const;
  }

  const cookieStore = cookies();
  return {
    supabase: createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }),
  } as const;
}

export async function requireAuthenticatedUser(): Promise<AuthFailure | AuthSuccess> {
  const supabaseResult = await getSupabaseFromCookies();
  if ("error" in supabaseResult) return supabaseResult;

  const {
    data: { user },
    error: userErr,
  } = await supabaseResult.supabase.auth.getUser();
  if (userErr || !user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { user, supabase: supabaseResult.supabase };
}

export async function requireAdmin() {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth;

  const { user, supabase } = auth;
  const admin = await isAdmin(supabase, user.id, user.email ?? null);
  if (!admin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, supabase };
}
