import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import PortalShell from "@/components/portal/Shell";
import { PCard, PSectionTitle } from "@/components/portal/ui";

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
    <PortalShell>
      <div className="max-w-[1100px] px-[30px] pb-10 pt-[26px]">
        <h1 className="m-0 mb-[5px] text-[26px] font-extrabold tracking-[-0.02em]">
          Search statistics
        </h1>
        <p className="m-0 mb-5 text-[15px] text-[#6c7079]">
          Hidden page (direct link only). Identity: <span className="font-mono">{identityId}</span>
        </p>

        <div className="flex flex-col gap-4">
          {error && (
            <div className="space-y-1 rounded-[10px] border border-[#f0d4d4] bg-[#fdf2f2] px-3.5 py-2.5 text-sm text-[#a12a2e]">
              <p className="m-0">Failed to load stats: {error.message}</p>
              {(error.message.includes("search_events") || error.message.includes("does not exist")) && (
                <p className="m-0 text-[#6c7079]">
                  Run the SQL in{" "}
                  <code className="rounded bg-[#f0f1f3] px-1 font-mono">docs/supabase-search-events.sql</code>{" "}
                  in your Supabase project → SQL Editor. See{" "}
                  <code className="rounded bg-[#f0f1f3] px-1 font-mono">docs/SUPABASE-SETUP.md</code>.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <PCard className="p-[22px]">
              <PSectionTitle>Total searches</PSectionTitle>
              <div className="mt-3 font-mono text-[32px] font-semibold leading-none text-[#17181c]">
                {total}
              </div>
              <div className="mt-2 text-[12.5px] text-[#9aa0a8]">Last 500 events stored</div>
            </PCard>
            <PCard className="p-[22px]">
              <PSectionTitle>Last 7 days</PSectionTitle>
              <div className="mt-3 font-mono text-[32px] font-semibold leading-none text-[#17181c]">
                {last7}
              </div>
              <div className="mt-2 text-[12.5px] text-[#9aa0a8]">Rolling window</div>
            </PCard>
          </div>

          <PCard className="p-[22px]">
            <PSectionTitle>Top queries</PSectionTitle>
            <p className="m-0 mt-1 text-[13px] text-[#6c7079]">Your most searched terms</p>
            <div className="mt-4">
              {topQueries.length === 0 ? (
                <p className="m-0 text-sm text-[#6c7079]">No searches yet.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {topQueries.map(([q, n]) => (
                    <div
                      key={q}
                      className="rounded-[10px] border border-[#e6e7ea] bg-[#fbfbfc] px-3.5 py-2.5"
                    >
                      <div className="break-words text-sm font-semibold text-[#17181c]">{q}</div>
                      <div className="mt-0.5 font-mono text-xs text-[#9aa0a8]">{n} searches</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </PCard>

          <PCard className="overflow-hidden">
            <div className="border-b border-[#eef0f2] px-[22px] py-4">
              <PSectionTitle>Recent searches</PSectionTitle>
              <p className="m-0 mt-1 text-[13px] text-[#6c7079]">Most recent first</p>
            </div>
            {(events ?? []).slice(0, 30).length === 0 ? (
              <p className="m-0 px-[22px] py-5 text-sm text-[#6c7079]">No searches yet.</p>
            ) : (
              <div>
                {(events ?? []).slice(0, 30).map((e, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 border-b border-[#f2f3f5] px-[22px] py-3 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="break-words text-sm font-semibold text-[#17181c]">
                        {e.query}
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-[#9aa0a8]">
                        {new Date(e.created_at).toLocaleString()}
                        {typeof e.result_count === "number" ? ` • ${e.result_count} results` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PCard>
        </div>
      </div>
    </PortalShell>
  );
}
