// Dashboard "Recently used" (platform redesign Phase 3, audit §6.1).
// Read-only over the EXISTING search_events log — no new event recording
// (decision): the portal already logs every search/browse-open per user, so
// the dashboard just surfaces the current user's latest distinct queries.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const ICAO_RE = /^[A-Za-z0-9]{4}$/;

type RecentItem = {
  resource: string;
  service: string;
  action: "Searched" | "Opened";
  when: string;
  href: string;
};

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
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const disableAuthForTesting =
      String(process.env.DISABLE_AUTH_FOR_TESTING || "").toLowerCase() === "true";
    if (!user?.id) {
      // Isolated test environments have no session — the shape must still be right.
      if (disableAuthForTesting) return NextResponse.json({ recents: [] });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = createSupabaseServiceRoleClient() ?? supabase;
    const { data, error } = await service
      .from("search_events")
      .select("query, source, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(120);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Newest first already; dedupe by query keeping the newest, cap 12.
    const seen = new Set<string>();
    const recents: RecentItem[] = [];
    for (const row of (data ?? []) as Array<{ query?: string; source?: string; created_at?: string }>) {
      const query = String(row.query ?? "").trim();
      if (!query) continue;
      const key = query.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const isIcao = ICAO_RE.test(query);
      recents.push({
        resource: isIcao ? key : query,
        service: "AIP Portal",
        action: row.source === "browse" ? "Opened" : "Searched",
        when: new Date(row.created_at ?? Date.now()).toISOString(),
        href: isIcao ? `/aip/${key}` : `/aip?icao=${encodeURIComponent(query)}`,
      });
      if (recents.length >= 12) break;
    }

    return NextResponse.json({ recents });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message || "Failed" },
      { status: 500 },
    );
  }
}
