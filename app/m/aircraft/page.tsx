"use client";

// Aircraft on a phone (Tier 2 › list that opens a detail): look up a registration. Search on top; the detail shows
// the operator, the next flight and whether the aircraft is shown on the wall (wall.aircraft.visibility).
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePhonePage } from "@/components/m/chrome";
import { MError } from "@/components/m/ui";
import { T2Detail, T2Groups, T2Page, T2Search, Toggle } from "@/components/m/tier2";
import { useWallUser, userCan } from "@/lib/m/wall";
import { dayTime, getJson, matches, useAction, useResource, wallUrl } from "@/lib/m/t2";

type Aircraft = { registration: string; oprId: string; operatorName?: string; flightCount?: number; nextFlightStart?: string | null; isHidden?: boolean };

export default function AircraftPhonePage() {
  const search = useSearchParams(); const router = useRouter();
  const openReg = search.get("reg");
  const r = useResource<{ aircraft?: Aircraft[] }>(wallUrl("/aircraft/schedule?days=7&refresh=false"), { fallback: "The wall did not answer." });
  const user = useWallUser();
  const act = useAction("The wall did not accept that. Try again.");
  const [q, setQ] = useState("");
  const list = useMemo(() => (r.data?.aircraft ?? []).slice().sort((a, b) => a.registration.localeCompare(b.registration)), [r.data]);
  const picked = openReg ? list.find((a) => `${a.oprId}:${a.registration}` === openReg) : null;
  usePhonePage({ title: picked ? picked.registration : "Aircraft", subtitle: picked ? picked.operatorName ?? picked.oprId : list.length ? `${list.length} on the wall’s operators` : null, mono: Boolean(picked), back: picked ? () => router.replace("/m/aircraft") : null, tab: "more", tabs: !picked });
  const shown = list.filter((a) => matches(q, a.registration, a.operatorName, a.oprId));
  const canHide = userCan(user ?? null, "wall.aircraft.visibility");
  const setHidden = (a: Aircraft, isHidden: boolean) => act.run(a.registration, async () => { await getJson(wallUrl("/aircraft/visibility"), { method: "PUT", json: { oprId: a.oprId, registration: a.registration, isHidden } }); r.setData((d) => (d ? { ...d, aircraft: (d.aircraft ?? []).map((x) => (x.registration === a.registration && x.oprId === a.oprId ? { ...x, isHidden } : x)) } : d)); });

  if (picked) return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      {act.failed && <MError title="Not changed." icon="plane" onRetry={act.clear}>{act.failed}</MError>}
      <T2Detail title={picked.registration} mono rows={[{ k: "Operator", v: picked.operatorName ?? picked.oprId }, { k: "Flights in the next 7 days", v: String(picked.flightCount ?? 0), mono: true }, { k: "Next flight", v: picked.nextFlightStart ? dayTime(picked.nextFlightStart) : "None scheduled", mono: Boolean(picked.nextFlightStart) }]}>
        <div className="flex min-h-14 items-center gap-3 rounded-[14px] border border-cw-border bg-cw-bg-surface py-1.5 pl-3.5 pr-2.5">
          <span className="flex min-w-0 flex-1 flex-col"><span className="text-[15px] font-semibold">Shown on the wall</span><span className="text-[13px] text-cw-text-muted">{picked.isHidden ? "Hidden: its flights are not on the board" : "Its flights are on the board"}</span></span>
          <Toggle on={!picked.isHidden} onChange={(on) => void setHidden(picked, !on)} disabled={!canHide || act.busy !== null} label="Shown on the wall" />
        </div>
      </T2Detail>
      {!canHide && <span className="px-0.5 text-[13px] text-cw-text-muted">Hiding an aircraft needs the aircraft-visibility permission.</span>}
    </div>
  );
  return (
    <T2Page loading={r.loading && !r.data} error={r.error} stale={Boolean(r.data)} empty={list.length === 0} emptyCopy={["No aircraft", "The wall lists aircraft as Leon sends their flights."]} errorCopy={["Couldn’t load aircraft", "Try again in a moment."]} onRetry={r.reload}
      top={<T2Search value={q} onChange={setQ} placeholder="Registration or operator" />}>
      {shown.length === 0 ? <span className="px-0.5 py-6 text-center text-[14.5px] text-cw-text-muted">No aircraft match “{q.trim()}”. Check the registration, or add it on a wider screen.</span>
        : <T2Groups groups={[{ h: `${shown.length} AIRCRAFT`, rows: shown.map((a) => ({ key: `${a.oprId}:${a.registration}`, title: a.registration, mono: true, sub: `${a.operatorName ?? a.oprId} · ${a.flightCount ?? 0} flight${a.flightCount === 1 ? "" : "s"} in 7 days`, badge: a.isHidden ? ["Hidden", "neutral"] : undefined, href: `/m/aircraft?reg=${encodeURIComponent(`${a.oprId}:${a.registration}`)}` })) }]} />}
    </T2Page>
  );
}
