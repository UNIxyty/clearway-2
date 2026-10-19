"use client";

// Limitations on a phone (Tier 2 › list grouped by a key): what applies at this airport? Grouped by the airports
// and countries each limitation matches; a row opens the detail, where an admin can switch it off or on
// (wall.limitations.edit). Writing new ones, with their pickers, stays on a desk.
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePhonePage } from "@/components/m/chrome";
import { MError } from "@/components/m/ui";
import { T2Detail, T2Groups, T2Page, Toggle, type T2Group } from "@/components/m/tier2";
import { useWallUser, userCan } from "@/lib/m/wall";
import { getJson, useAction, useResource, wallUrl } from "@/lib/m/t2";

type Limitation = { id: string; title: string; description?: string; isPermanent?: boolean; startDate?: string | null; endDate?: string | null; isActive: boolean; addedBy?: string | null; updatedBy?: string | null; source?: string | null; matchedFlightCount?: number; match?: { flights?: Array<{ nid: string; label: string }>; airportIcaos?: string[]; countries?: string[] } };
const when = (l: Limitation) => l.isPermanent ? "Permanent" : [l.startDate, l.endDate].filter(Boolean).join(" → ") || "No dates";

export default function LimitationsPhonePage() {
  const search = useSearchParams(); const router = useRouter();
  const openId = search.get("id");
  const r = useResource<{ limitations?: Limitation[] }>(wallUrl("/timeline/limitations?withMatches=true"), { fallback: "The wall did not answer." });
  const user = useWallUser();
  const act = useAction("The wall did not accept that. Try again.");
  const items = useMemo(() => (r.data?.limitations ?? []).filter((l) => !l.source || l.source === "custom"), [r.data]);
  const picked = openId ? items.find((l) => l.id === openId) : null;
  usePhonePage({ title: picked ? "Limitation" : "Limitations", subtitle: picked ? picked.id : items.length ? `${items.filter((l) => l.isActive).length} active of ${items.length}` : null, monoSubtitle: Boolean(picked), back: picked ? () => router.replace("/m/limitations") : null, tab: "more", tabs: !picked });
  const canEdit = userCan(user ?? null, "wall.limitations.edit");
  const setActive = (l: Limitation, isActive: boolean) => act.run(l.id, async () => { await getJson(wallUrl(`/timeline/limitations/${encodeURIComponent(l.id)}`), { method: "PATCH", json: { isActive } }); r.setData((d) => (d ? { ...d, limitations: (d.limitations ?? []).map((x) => (x.id === l.id ? { ...x, isActive } : x)) } : d)); });
  const groups = useMemo<T2Group[]>(() => {
    const by = new Map<string, Limitation[]>();
    for (const l of items) {
      const keys = [...(l.match?.airportIcaos ?? []).map((a) => a.toUpperCase()), ...(l.match?.countries ?? []).map((c) => `COUNTRY · ${c.toUpperCase()}`), ...(l.match?.flights ?? []).map((f) => `FLIGHT · ${f.label}`)];
      for (const k of keys.length ? keys : ["EVERYWHERE"]) { if (!by.has(k)) by.set(k, []); by.get(k)!.push(l); }
    }
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([h, rows]) => ({ h, rows: rows.map((l) => ({ key: `${h}-${l.id}`, title: l.title, sub: `${when(l)}${l.matchedFlightCount ? ` · ${l.matchedFlightCount} flight${l.matchedFlightCount === 1 ? "" : "s"} today` : ""}`, badge: l.isActive ? undefined : ["Off", "neutral"] as const, dim: !l.isActive, href: `/m/limitations?id=${encodeURIComponent(l.id)}` })) }));
  }, [items]);

  if (picked) return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      {act.failed && <MError title="Not changed." icon="triangle-alert" onRetry={act.clear}>{act.failed}</MError>}
      <T2Detail title={picked.title} rows={[{ k: "What it says", v: picked.description || "—" }, { k: "When", v: when(picked), mono: !picked.isPermanent }, { k: "Applies to", v: [...(picked.match?.airportIcaos ?? []), ...(picked.match?.countries ?? []), ...(picked.match?.flights ?? []).map((f) => f.label)].join(", ") || "Everywhere" }, { k: "Flights today", v: String(picked.matchedFlightCount ?? 0), mono: true }, { k: "Added by", v: picked.addedBy || "—" }]}>
        <div className="flex min-h-14 items-center gap-3 rounded-[14px] border border-cw-border bg-cw-bg-surface py-1.5 pl-3.5 pr-2.5">
          <span className="flex min-w-0 flex-1 flex-col"><span className="text-[15px] font-semibold">On the wall</span><span className="text-[13px] text-cw-text-muted">{picked.isActive ? "Shown on matching flights" : "Switched off"}</span></span>
          <Toggle on={picked.isActive} onChange={(on) => void setActive(picked, on)} disabled={!canEdit || act.busy !== null} label="On the wall" />
        </div>
      </T2Detail>
      <span className="px-0.5 text-[13px] leading-normal text-cw-text-muted">{canEdit ? "Writing and removing limitations happens on a desk, where the airport, country and flight pickers are." : "Switching a limitation needs the limitations permission."}</span>
    </div>
  );
  return (
    <T2Page loading={r.loading && !r.data} error={r.error} stale={Boolean(r.data)} empty={items.length === 0} emptyCopy={["No limitations", "Nothing applies to today’s airports or aircraft."]} errorCopy={["Couldn’t load limitations", "The wall still shows the last good list."]} onRetry={r.reload}>
      <T2Groups groups={groups} />
    </T2Page>
  );
}
