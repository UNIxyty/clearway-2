"use client";

// The Wall on a phone (mobile-portal-spec.md › Tier 1 › Wall): what needs doing next, and to mark it checked.
// Attention first — flights with open checks, soonest at the top; All shows the whole range with the now-line between
// past and future. A card shows the time that matters with its label, the callsign and registration, the route, the
// status pill and up to three open-check chips. The facts are the ops-room display's (shared/wall-facts.mjs); the
// board is its own smaller thing and shows less, never different.
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePhonePage } from "@/components/m/chrome";
import { CheckChip, MButton, MEmpty, MError, MSegmented, MSkeleton, StatusPill, hmUtc } from "@/components/m/ui";
import { useWallBoard, type Flight } from "@/lib/m/wall";
import { hmOfMs } from "@/shared/wall-facts.mjs";

// The ranges, relative to now in UTC: the past is one sixth of the window, so the now-line sits in the same place
// whatever the range (the earlier phone spec, kept).
const RANGES: Record<string, { label: string; before: number; after: number }> = { "6H": { label: "6H", before: 1, after: 5 }, "12H": { label: "12H", before: 2, after: 10 }, DAY: { label: "DAY", before: 4, after: 20 } };

function Card({ f, past }: { f: Flight; past: boolean }) {
  const shown = f.open.slice(0, 3);
  return (
    <Link href={`/m/wall/${encodeURIComponent(f.id)}`} className="flex flex-col gap-2.5 rounded-[14px] border border-cw-border bg-cw-bg-surface px-3.5 py-3 text-cw-text shadow-cw-1" style={{ opacity: past ? 0.72 : 1 }} aria-label={`${f.callsign} ${f.adep} to ${f.ades}`}>
      <div className="grid grid-cols-[62px_minmax(0,1fr)_auto] items-center gap-3">
        <span className="flex flex-col gap-px">
          <span className="font-mono text-[21px] font-semibold tracking-[-.02em]" style={{ color: f.matters.delayed ? "var(--ca-st-delayed-fg)" : "var(--cw-text)" }}>{f.matters.hm}</span>
          <span className="text-[11.5px] leading-tight text-cw-text-muted">{f.matters.label}</span>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-baseline gap-2"><span className="font-mono text-[15.5px] font-bold">{f.callsign}</span><span className="font-mono text-[12px] text-cw-text-muted">{f.registration}</span></span>
          <span className="font-mono text-[14px] font-medium text-cw-text-body">{f.adep} → {f.ades}</span>
        </span>
        <StatusPill status={f.status}>{f.estimated ? `${f.status === "airborne" ? "Flying" : "Arrived"}?` : undefined}</StatusPill>
      </div>
      {f.open.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {shown.map((k) => <CheckChip key={k} k={k} />)}
          <span className="ml-1 text-[12.5px] text-cw-text-muted">{f.open.length > 3 ? `+${f.open.length - 3} more` : f.open.length === 1 ? "1 open" : `${f.open.length} open`}</span>
        </div>
      ) : !past ? (
        <span className="flex items-center gap-1.5 text-[12.5px] text-cw-success-text">All checked</span>
      ) : null}
    </Link>
  );
}

export default function WallBoardPage() {
  const { flights, at, error, loading, reload } = useWallBoard();
  const [seg, setSeg] = useState<"att" | "all">("att");
  const [range, setRange] = useState<keyof typeof RANGES>("6H");
  const [rangeOpen, setRangeOpen] = useState(false);
  usePhonePage({ title: "Wall", subtitle: "utc", monoSubtitle: true, tab: "wall", actions: [{ icon: "search", label: "Find a flight", href: "/m/flights" }] });

  const now = Date.now();
  const { inRange, attention, nextOut } = useMemo(() => {
    const all = flights ?? [];
    const r = RANGES[range];
    const lo = now - r.before * 3_600_000, hi = now + r.after * 3_600_000;
    const inRange = all.filter((f) => f.matters.ms >= lo && f.matters.ms <= hi).sort((a, b) => a.matters.ms - b.matters.ms);
    const attention = inRange.filter((f) => f.open.length > 0 && f.status !== "arrived");
    const nextOut = all.filter((f) => f.matters.ms > hi).sort((a, b) => a.matters.ms - b.matters.ms)[0] ?? null;
    return { inRange, attention, nextOut };
  }, [flights, range, now]);

  const rows = seg === "att" ? attention : inRange;
  const isPast = (f: Flight) => f.status === "arrived" || (f.status !== "airborne" && f.matters.ms < now);

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-[3] flex items-center gap-2 bg-cw-bg-page px-4 pb-2.5 pt-3">
        <div className="flex-1">
          <MSegmented value={seg} onChange={setSeg} label="Which flights" options={[{ value: "att", label: "Attention", count: attention.length, countTone: "warning" }, { value: "all", label: "All", count: inRange.length }]} />
        </div>
        <div className="relative">
          <button type="button" aria-label={`Range: ${RANGES[range].label}`} onClick={() => setRangeOpen((v) => !v)} className="inline-flex h-11 items-center gap-1.5 rounded-[12px] border border-cw-border-control bg-cw-bg-surface px-3 font-mono text-[13.5px] font-semibold text-cw-text">{RANGES[range].label}<span className="text-cw-text-muted">▾</span></button>
          {rangeOpen && (
            <div role="menu" className="absolute right-0 top-[48px] z-10 flex w-[120px] flex-col rounded-[12px] border border-cw-border bg-cw-bg-raised p-1 shadow-cw-pop">
              {(Object.keys(RANGES) as Array<keyof typeof RANGES>).map((k) => (
                <button key={k} type="button" role="menuitem" onClick={() => { setRange(k); setRangeOpen(false); }} className={`h-11 rounded-[9px] px-3 text-left font-mono text-[14px] ${k === range ? "bg-cw-bg-selected font-bold text-cw-text" : "text-cw-text-body"}`}>{RANGES[k].label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && flights && <MError stale title="Not updating." onRetry={reload}>Showing the board as it was at <span className="font-mono">{at ? hmUtc(at) : "--:--"} UTC</span>.</MError>}
      {loading && !flights && <MSkeleton kind="cards" label="Loading the board" />}
      {error && !flights && !loading && <MError title="Couldn’t load the board" onRetry={reload}>{error} The ops-room wall is not affected.</MError>}

      {flights && rows.length === 0 && !loading && (
        seg === "att" && inRange.length > 0 ? (
          <MEmpty icon="circle-check" title="Nothing open" action={<MButton size="sm" onClick={() => setSeg("all")}>Show all {inRange.length}</MButton>}>Every flight in the next {RANGES[range].after} hours has its checks done.</MEmpty>
        ) : (
          <MEmpty icon="plane" title={`No flights in the next ${RANGES[range].after} hours`} action={range !== "DAY" ? <MButton size="sm" onClick={() => setRange("DAY")}>Show 24 hours</MButton> : undefined}>
            {nextOut ? <>The next one is {nextOut.callsign} at {hmOfMs(nextOut.matters.ms)} UTC.</> : "Nothing further is on the wall."}
          </MEmpty>
        )
      )}

      {flights && rows.length > 0 && (
        <div className="flex flex-col gap-2.5 px-4 pb-5 pt-0.5">
          {rows.map((f, i) => {
            const past = isPast(f);
            const nowLine = seg === "all" && !past && i > 0 && isPast(rows[i - 1]);
            return (
              <div key={f.id} className="contents">
                {nowLine && <div className="my-0.5 flex items-center gap-2" aria-label="Now"><span className="inline-flex h-[22px] items-center rounded-[6px] bg-mx-now px-1.5 font-mono text-[12px] font-bold text-cw-bg-page">{hmUtc()}</span><span className="h-[2px] flex-1 rounded-[1px] bg-mx-now" /></div>}
                <Card f={f} past={past} />
              </div>
            );
          })}
          {seg === "att" && inRange.length > attention.length && (
            <button type="button" onClick={() => setSeg("all")} className="flex h-12 items-center justify-center rounded-[12px] border border-dashed border-cw-border-strong text-[14px] font-semibold text-cw-text-body">
              {inRange.length - attention.length} more flight{inRange.length - attention.length === 1 ? "" : "s"} with nothing open · Show all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
