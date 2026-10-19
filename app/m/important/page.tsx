"use client";

// Important on a phone (Tier 2 › cards): the notices that matter today, newest first, a severity edge on each card —
// red while it needs confirming, blue once reviewed, grey when off. A card opens the whole notice; an admin can
// switch it off or on (wall.imp.edit).
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePhonePage } from "@/components/m/chrome";
import { MError } from "@/components/m/ui";
import { T2Cards, T2Detail, T2Page, Toggle } from "@/components/m/tier2";
import { useWallUser, userCan } from "@/lib/m/wall";
import { dayTime, getJson, useAction, useResource, wallUrl } from "@/lib/m/t2";

type Notice = { id: string; title: string; body?: string; isActive: boolean; reviewed?: boolean; addedAt?: string | null; addedBy?: string | null; confirmedAt?: string | null; confirmedBy?: string | null; matchedFlightCount?: number; match?: { countries?: string[]; airportIcaos?: string[]; operators?: string[]; registrations?: string[]; validFrom?: string | null; validTo?: string | null } };
const scope = (n: Notice) => [...(n.match?.airportIcaos ?? []), ...(n.match?.countries ?? []), ...(n.match?.operators ?? []), ...(n.match?.registrations ?? [])].join(", ") || "All flights";

export default function ImportantPhonePage() {
  const search = useSearchParams(); const router = useRouter();
  const openId = search.get("id");
  const r = useResource<{ entries?: Notice[] }>(wallUrl("/important?includeInactive=true&withMatches=true"), { fallback: "The wall did not answer." });
  const user = useWallUser();
  const act = useAction("The wall did not accept that. Try again.");
  const items = useMemo(() => (r.data?.entries ?? []).slice().sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? "")), [r.data]);
  const picked = openId ? items.find((n) => n.id === openId) : null;
  usePhonePage({ title: picked ? "Notice" : "Important", subtitle: picked ? picked.id : items.length ? `${items.filter((n) => n.isActive).length} on the wall` : null, monoSubtitle: Boolean(picked), back: picked ? () => router.replace("/m/important") : null, tab: "more", tabs: !picked });
  const canEdit = userCan(user ?? null, "wall.imp.edit");
  const setActive = (n: Notice, isActive: boolean) => act.run(n.id, async () => { await getJson(wallUrl(`/important/${encodeURIComponent(n.id)}`), { method: "PATCH", json: { isActive } }); r.setData((d) => (d ? { ...d, entries: (d.entries ?? []).map((x) => (x.id === n.id ? { ...x, isActive } : x)) } : d)); });

  if (picked) return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      {act.failed && <MError title="Not changed." icon="star" onRetry={act.clear}>{act.failed}</MError>}
      <T2Detail title={picked.title} rows={[{ k: "Notice", v: <span className="whitespace-pre-wrap">{picked.body || "—"}</span> }, { k: "Applies to", v: scope(picked) }, { k: "Valid", v: [picked.match?.validFrom, picked.match?.validTo].filter(Boolean).join(" → ") || "Until switched off", mono: Boolean(picked.match?.validFrom) }, { k: "Flights today", v: String(picked.matchedFlightCount ?? 0), mono: true }, { k: "Added", v: `${picked.addedBy || "—"} · ${dayTime(picked.addedAt)}` }, { k: "Reviewed", v: picked.reviewed ? `${picked.confirmedBy || "—"} · ${dayTime(picked.confirmedAt)}` : "Not yet" }]}>
        <div className="flex min-h-14 items-center gap-3 rounded-[14px] border border-cw-border bg-cw-bg-surface py-1.5 pl-3.5 pr-2.5">
          <span className="flex min-w-0 flex-1 flex-col"><span className="text-[15px] font-semibold">On the wall</span><span className="text-[13px] text-cw-text-muted">{picked.isActive ? "Flagged on matching flights" : "Switched off"}</span></span>
          <Toggle on={picked.isActive} onChange={(on) => void setActive(picked, on)} disabled={!canEdit || act.busy !== null} label="On the wall" />
        </div>
      </T2Detail>
      <span className="px-0.5 text-[13px] leading-normal text-cw-text-muted">Writing notices, attachments and reviewing happen on a desk.</span>
    </div>
  );
  return (
    <T2Page loading={r.loading && !r.data} error={r.error} stale={Boolean(r.data)} empty={items.length === 0} emptyCopy={["No notices", "Important notices for today’s flights appear here."]} errorCopy={["Couldn’t load notices", "Try again in a moment."]} onRetry={r.reload}>
      <T2Cards cards={items.map((n) => ({ key: n.id, tone: !n.isActive ? "neutral" : n.reviewed ? "info" : "bad", title: n.title, line: `${scope(n)}${n.matchedFlightCount ? ` · ${n.matchedFlightCount} flight${n.matchedFlightCount === 1 ? "" : "s"} today` : ""}${n.isActive ? "" : " · off"}`, by: `${n.addedBy || "—"} · ${dayTime(n.addedAt)}`, href: `/m/important?id=${encodeURIComponent(n.id)}` }))} />
    </T2Page>
  );
}
