import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ enabled: false, message: null, eta_text: null });
  }

  try {
    const cookieStore = cookies();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    });

    const { data, error } = await supabase
      .from("maintenance")
      .select("enabled, message, eta_text, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ enabled: false, message: null, eta_text: null });
    }

    return NextResponse.json({
      enabled: Boolean(data.enabled),
      message: data.message ?? null,
      eta_text: data.eta_text ?? null,
      updated_at: data.updated_at ?? null,
    });
  } catch {
    return NextResponse.json({ enabled: false, message: null, eta_text: null });
  }
}
