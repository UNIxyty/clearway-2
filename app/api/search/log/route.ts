import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      query?: string;
      resultCount?: number;
      source?: string;
    };
    const query = (body.query ?? "").trim();
    if (!query) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const { error } = await supabase.from("search_events").insert({
      user_id: user.id,
      query,
      result_count: typeof body.resultCount === "number" ? body.resultCount : null,
      source: typeof body.source === "string" ? body.source : "portal",
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as { message?: string })?.message || "Failed" }, { status: 500 });
  }
}

