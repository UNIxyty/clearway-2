import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function StatsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const identityId = user?.id ?? null;
  if (!identityId) redirect("/login?next=/stats");

  const admin = createSupabaseServiceRoleClient();
  const db = admin ?? supabase;

  const { data: events, error } = await db
    .from("search_events")
    .select("query, result_count, created_at")
    .eq("user_id", identityId)
    .order("created_at", { ascending: false })
    .limit(500);

  const total = events?.length ?? 0;
  const last7 = (events ?? []).filter((e) => {
    const t = new Date(e.created_at).getTime();
    return t >= Date.now() - 7 * 24 * 60 * 60 * 1000;
  }).length;

  const topQueries = (() => {
    const counts = new Map<string, number>();
    for (const e of events ?? []) {
      const q = (e.query ?? "").trim();
      if (!q) continue;
      counts.set(q, (counts.get(q) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  })();

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Search statistics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Hidden page (direct link only). Identity: <span className="font-mono">{identityId}</span>
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive space-y-1">
            <p>Failed to load stats: {error.message}</p>
            {(error.message.includes("search_events") || error.message.includes("does not exist")) && (
              <p className="text-muted-foreground">
                Run the SQL in <code className="bg-muted px-1 rounded">docs/supabase-search-events.sql</code> in your
                Supabase project → SQL Editor. See <code className="bg-muted px-1 rounded">docs/SUPABASE-SETUP.md</code>.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Total searches</CardTitle>
              <CardDescription>Last 500 events stored</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{total}</div>
            </CardContent>
          </Card>
          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Last 7 days</CardTitle>
              <CardDescription>Rolling window</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{last7}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top queries</CardTitle>
            <CardDescription>Your most searched terms</CardDescription>
          </CardHeader>
          <CardContent>
            {topQueries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No searches yet.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {topQueries.map(([q, n]) => (
                  <div key={q} className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
                    <div className="text-sm font-medium break-words">{q}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{n} searches</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent searches</CardTitle>
            <CardDescription>Most recent first</CardDescription>
          </CardHeader>
          <CardContent>
            {(events ?? []).slice(0, 30).length === 0 ? (
              <p className="text-sm text-muted-foreground">No searches yet.</p>
            ) : (
              <div className="space-y-2">
                {(events ?? []).slice(0, 30).map((e, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium break-words">{e.query}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleString()}
                        {typeof e.result_count === "number" ? ` • ${e.result_count} results` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

