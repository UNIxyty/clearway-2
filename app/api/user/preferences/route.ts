import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("user_preferences")
      .select("display_name, aip_model, gen_model, created_at, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned (expected for first-time users)
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ preferences: data });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message || "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      display_name?: string;
      aip_model?: string;
      gen_model?: string;
    };

    // Build update object with only provided fields
    const updates: {
      user_id: string;
      display_name?: string;
      aip_model?: string;
      gen_model?: string;
    } = {
      user_id: user.id,
    };

    if (body.display_name !== undefined) {
      updates.display_name = body.display_name.trim() || null;
    }
    if (body.aip_model?.trim()) {
      updates.aip_model = body.aip_model.trim();
    }
    if (body.gen_model?.trim()) {
      updates.gen_model = body.gen_model.trim();
    }

    const { data, error } = await supabase
      .from("user_preferences")
      .upsert(updates, { onConflict: "user_id" })
      .select("display_name, aip_model, gen_model, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, preferences: data });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message || "Failed" },
      { status: 500 }
    );
  }
}
