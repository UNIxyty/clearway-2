import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function parseAdminEmails() {
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

async function isAdmin(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  email: string | null
) {
  const adminEmails = parseAdminEmails();
  if (email && adminEmails.includes(email.toLowerCase())) return true;

  const { data, error } = await supabase
    .from("user_preferences")
    .select("is_admin")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return false;
  return Boolean(data && "is_admin" in data && (data as { is_admin?: boolean }).is_admin);
}

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ isAdmin: false });
    }

    const cookieStore = cookies();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ isAdmin: false });
    }

    const admin = await isAdmin(supabase, user.id, user.email ?? null);
    return NextResponse.json({ isAdmin: admin });
  } catch {
    return NextResponse.json({ isAdmin: false });
  }
}
