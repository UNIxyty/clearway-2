"use client";

// Flights on a phone (mobile-portal-spec.md › Tier 1 › Flights): find one flight and fix one thing. A search field on
// top, matching callsign, registration, airport or trip; day chips; rows of 64 px grouped by morning, afternoon and
// evening, each with STD, callsign, registration, route, status and a note (the ETD or CTOT when it differs).
import Link from "next/link";
import { useMemo, useState } from "react";
import MaskIcon from "@/components/portal/Icon";
import { usePhonePage } from "@/components/m/chrome";
import { MEmpty, MError, MSkeleton, StatusPill } from "@/components/m/ui";
import { dayLabel, dayLong, matches, partOfDay, useAllFlights, utcDay } from "@/lib/m/flights";
import type { Flight } from "@/lib/m/wall";

function Highlight({ text, q }: { text: string; q: string }) {
  const s = q.trim().toUpperCase();
  const i = s ? text.toUpperCase().indexOf(s) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded-[3px] bg-mx-mark-bg px-0.5 text-mx-mark-fg">{text.slice(i, i + s.length)}</mark>{text.slice(i + s.length)}</>;
}

function Row({ f, q }: { f: Flight; q: string }) {
  const note = f.status === "ctot" ? `CTOT ${f.t.depHm}` : f.t.depKind === "ETD" && f.t.depDeltaMin ? `ETD ${f.t.depHm}` : q && utcDay(f.t.stdMs) !== utcDay(Date.now()) ? dayLabel(utcDay(f.t.stdMs)) : "";
  return (
    <Link href={`/m/flights/${encodeURIComponent(f.id)}`} className="grid min-h-16 grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 border-b border-cw-divider text-cw-text" aria-label={`${f.callsign} ${f.adep} to ${f.ades}`}>
      <span className="font-mono text-[16px] font-semibold">{f.t.stdHm}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-baseline gap-2"><span className="font-mono text-[15px] font-bold"><Highlight text={f.callsign} q={q} /></span><span className="font-mono text-[12px] text-cw-text-muted"><Highlight text={f.registration} q={q} /></span></span>
        <span className="font-mono text-[13.5px] font-medium text-cw-text-body"><Highlight text={f.adep} q={q} /> → <Highlight text={f.ades} q={q} /></span>
      </span>
      <span className="flex flex-col items-end gap-[3px]"><StatusPill status={f.status} small />{note && <span className="font-mono text-[11.5px] text-cw-text-muted">{note}</span>}</span>
    </Link>
  );
}

export default function FlightsListPage() {
  const { flights, error, loading, reload } = useAllFlights();
  const [q, setQ] = useState("");
  const today = utcDay(Date.now());
  const [day, setDay] = useState(today);
  usePhonePage({ title: q ? "Find a flight" : "Flights", subtitle: q ? null : `${dayLabel(day)} · ${dayLong(day)}`, tab: "flights", back: q ? () => setQ("") : null });

  const days = useMemo(() => {
    const set = new Set<string>([utcDay(Date.now() - 86_400_000), today, utcDay(Date.now() + 86_400_000), ...(flights ?? []).map((f) => utcDay(f.t.stdMs))]);
    return [...set].sort();
  }, [flights, today]);
  const searching = q.trim().length > 0;
  const list = useMemo(() => {
    const all = (flights ?? []).slice().sort((a, b) => a.t.stdMs - b.t.stdMs);
    if (searching) return all.filter((f) => matches(f, q));
    return all.filter((f) => utcDay(f.t.stdMs) === day);
  }, [flights, day, q, searching]);
  const groups = useMemo(() => {
    if (searching) return [{ h: `${list.length} FLIGHT${list.length === 1 ? "" : "S"} · ${q.trim().toUpperCase()}`, rows: list }];
    const by: Record<string, Flight[]> = {};
    for (const f of list) (by[partOfDay(f.t.stdMs)] ??= []).push(f);
    return ["MORNING", "AFTERNOON", "EVENING"].filter((h) => by[h]).map((h) => ({ h, rows: by[h] }));
  }, [list, searching, q]);

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-[3] flex flex-col gap-2.5 bg-cw-bg-page px-4 pb-2 pt-3">
        <label className="flex h-12 items-center gap-2.5 rounded-[12px] border border-cw-border-control bg-cw-bg-surface px-3 focus-within:border-cw-focus focus-within:shadow-[0_0_0_3px_var(--cw-focus-halo)]">
          <MaskIcon name="search" size={18} color="var(--cw-text-muted)" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Callsign, reg, airport, trip" aria-label="Find a flight" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            className={`min-w-0 flex-1 bg-transparent text-[15.5px] text-cw-text outline-none placeholder:text-cw-text-placeholder ${q ? "font-mono font-semibold" : ""}`} />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="flex h-9 w-9 items-center justify-center rounded-[9px] text-cw-text-muted"><MaskIcon name="circle-x" size={18} color="currentColor" /></button>}
        </label>
        {searching ? <span className="text-[13px] text-cw-text-muted">Callsign, registration, airport or trip number · other days included</span> : (
          <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {days.map((d) => { const on = d === day; return <button key={d} type="button" onClick={() => setDay(d)} aria-pressed={on} className={`inline-flex h-11 flex-none items-center rounded-[20px] border px-3.5 text-[14px] font-semibold ${on ? "border-cw-text bg-cw-text text-cw-bg-page" : "border-cw-border-control bg-cw-bg-surface text-cw-text-body"}`}>{dayLabel(d, today)}</button>; })}
          </div>
        )}
      </div>
      {loading && !flights && <MSkeleton kind="rows" label="Loading flights" />}
      {error && !flights && !loading && <MError title="Couldn’t load the flights" onRetry={reload}>{error} The wall still shows the last good list.</MError>}
      {error && flights && <MError stale title="Not updating." onRetry={reload}>Showing the list as it was.</MError>}
      {flights && list.length === 0 && (searching
        ? <MEmpty icon="search" title={`Nothing matches “${q.trim()}”`}>Try the callsign, the registration, an airport code or the trip number.</MEmpty>
        : <MEmpty icon="calendar-x" title={`No flights on ${dayLong(day)}`}>Nothing is planned in Leon for this day yet.</MEmpty>)}
      {flights && list.length > 0 && (
        <div className="flex flex-col px-4 pb-5">
          {groups.map((g) => (<div key={g.h}><div className="pb-1 pt-3.5 text-[11.5px] font-bold tracking-[.08em] text-cw-text-muted">{g.h}</div>{g.rows.map((f) => <Row key={f.id} f={f} q={searching ? q : ""} />)}</div>))}
        </div>
      )}
    </div>
  );
}
