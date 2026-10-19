"use client";

// Service status on a phone (Tier 2 › list): is a source down? The desktop's table becomes a list grouped by state;
// the donut's legend becomes filter chips. A row opens the country's note. Editing lives on a desk (/admin/service-status).
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePhonePage } from "@/components/m/chrome";
import { T2Chips, T2Detail, T2Groups, T2Page, type T2Group, type Tone } from "@/components/m/tier2";
import { COUNTRY_SERVICE_STATE_META, COUNTRY_SERVICE_STATES, type CountryServiceState } from "@/lib/country-service-status-shared";
import { dayTime, useResource } from "@/lib/m/t2";

type Country = { country: string; state: CountryServiceState; note?: string | null; updatedAt?: string | null; runningDebug?: boolean };
const TONE: Record<CountryServiceState, Tone> = { not_checked: "neutral", in_work: "warn", partially_works: "warn", operational: "ok", issues: "bad" };
const ORDER: CountryServiceState[] = ["issues", "partially_works", "in_work", "not_checked", "operational"];

export default function ServiceStatusPhonePage() {
  const search = useSearchParams(); const router = useRouter();
  const open = search.get("country");
  const r = useResource<{ countries?: Country[] }>("/api/country-service-status", { poll: 10_000, fallback: "The status service did not answer." });
  const [filter, setFilter] = useState<"all" | CountryServiceState>("all");
  const countries = useMemo(() => (r.data?.countries ?? []).slice().sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || a.country.localeCompare(b.country)), [r.data]);
  const picked = open ? countries.find((c) => c.country === open) : null;
  usePhonePage({ title: picked ? picked.country : "Service status", subtitle: picked ? "AIP source" : countries.length ? `${countries.filter((c) => c.state === "operational").length} of ${countries.length} working` : null, back: picked ? () => router.replace("/m/service-status") : null, tab: "more", tabs: !picked });
  const counts = useMemo(() => { const c: Partial<Record<CountryServiceState, number>> = {}; for (const x of countries) c[x.state] = (c[x.state] ?? 0) + 1; return c; }, [countries]);
  const shown = filter === "all" ? countries : countries.filter((c) => c.state === filter);
  const groups: T2Group[] = ORDER.map((st) => ({ h: `${COUNTRY_SERVICE_STATE_META[st].label.toUpperCase()}`, count: counts[st] ?? 0, tone: st === "issues" ? "warning" : undefined, rows: shown.filter((c) => c.state === st).map((c) => ({ key: c.country, title: c.country, sub: c.note || (c.updatedAt ? `Updated ${dayTime(c.updatedAt)}` : undefined), badge: [COUNTRY_SERVICE_STATE_META[c.state].label, TONE[c.state]], href: `/m/service-status?country=${encodeURIComponent(c.country)}` })) }));

  if (picked) return (
    <div className="px-4 pb-6 pt-4">
      <T2Detail title={picked.country} rows={[{ k: "Status", v: COUNTRY_SERVICE_STATE_META[picked.state].label }, { k: "What it means", v: COUNTRY_SERVICE_STATE_META[picked.state].description }, { k: "Updated", v: picked.updatedAt ? dayTime(picked.updatedAt) : "—", mono: true }, { k: "Note", v: picked.note || "No note." }, ...(picked.runningDebug ? [{ k: "Right now", v: "A check is running against this source." }] : [])]} />
      <p className="mt-3 text-[13px] leading-normal text-cw-text-muted">The status is set by an admin on a desk after a check. Airport pages keep using the last good copy while a source is down.</p>
    </div>
  );
  return (
    <T2Page loading={r.loading && !r.data} error={r.error} stale={Boolean(r.data)} empty={countries.length === 0} emptyCopy={["No sources yet", "Countries appear here once their AIP source is listed."]} errorCopy={["Couldn’t load status", "Airport pages still use their last good copy."]} onRetry={r.reload}
      top={<T2Chips value={filter} onChange={setFilter} chips={[{ k: "all", label: "All", n: countries.length }, ...COUNTRY_SERVICE_STATES.map((st) => ({ k: st, label: COUNTRY_SERVICE_STATE_META[st].label, n: counts[st] ?? 0 }))]} />}>
      {shown.length === 0 ? <span className="px-0.5 py-6 text-center text-[14.5px] text-cw-text-muted">No sources in that state. Clear the filter to see all {countries.length}.</span> : <T2Groups groups={groups} />}
    </T2Page>
  );
}
