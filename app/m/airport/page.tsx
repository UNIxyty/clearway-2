"use client";

// Airport search on a phone (mobile-portal-spec.md › Tier 1 › Airport › search): the search field, today's airports
// as 44 px chips with the wall's weather category as a dot, and the recently opened ones.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MaskIcon from "@/components/portal/Icon";
import { usePhonePage } from "@/components/m/chrome";
import { MEmpty, MLabel } from "@/components/m/ui";
import { readRecents, type RecentEntry } from "@/lib/portal-recents";
import { WX_LOOK, searchAirports, type Airport } from "@/lib/m/airport";
import { useWallBoard } from "@/lib/m/wall";

export default function AirportSearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Airport[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const { flights } = useWallBoard();
  usePhonePage({ title: "Airports", tab: "more", back: null });
  useEffect(() => { setRecents(readRecents()); }, []);
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setResults(null); return; }
    setSearching(true);
    const t = setTimeout(() => { searchAirports(s).then(setResults).catch(() => setResults([])).finally(() => setSearching(false)); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  // Today's airports: every departure and arrival on the wall, with the wall's own weather category where it has one.
  const today = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const f of flights ?? []) { if (!m.has(f.adep) || f.raw.wxDep) m.set(f.adep, f.raw.wxDep ?? m.get(f.adep) ?? null); if (!m.has(f.ades) || f.raw.wxArr) m.set(f.ades, f.raw.wxArr ?? m.get(f.ades) ?? null); }
    return [...m.entries()].filter(([c]) => /^[A-Z0-9]{4}$/.test(c)).sort(([a], [b]) => a.localeCompare(b));
  }, [flights]);

  return (
    <div className="flex min-h-full flex-col gap-3.5 px-4 pb-6 pt-3">
      <label className="flex h-12 items-center gap-2.5 rounded-[12px] border border-cw-border-control bg-cw-bg-surface px-3 focus-within:border-cw-focus focus-within:shadow-[0_0_0_3px_var(--cw-focus-halo)]">
        <MaskIcon name="search" size={18} color="var(--cw-text-muted)" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ICAO, IATA or city" aria-label="Find an airport" autoCapitalize="characters" autoCorrect="off" spellCheck={false} className="min-w-0 flex-1 bg-transparent text-[15.5px] text-cw-text outline-none placeholder:text-cw-text-placeholder" />
        {q && <button type="button" onClick={() => setQ("")} aria-label="Clear" className="flex h-11 w-11 items-center justify-center rounded-[11px] text-cw-text-muted"><MaskIcon name="circle-x" size={18} color="currentColor" /></button>}
      </label>
      {q.trim().length >= 2 ? (
        <div className="flex flex-col">
          <MLabel>{searching ? "SEARCHING…" : `${results?.length ?? 0} MATCH${results?.length === 1 ? "" : "ES"}`}</MLabel>
          {results?.map((a) => (
            <Link key={a.icao} href={`/m/airport/${a.icao}`} className="flex min-h-14 items-center gap-3 border-b border-cw-divider text-cw-text"><span className="w-[52px] font-mono text-[16px] font-bold">{a.icao}</span><span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-[15px]">{a.name}</span><span className="truncate text-[12.5px] text-cw-text-muted">{a.country}</span></span><MaskIcon name="chevron-right" size={16} color="var(--cw-text-muted)" /></Link>
          ))}
          {results && results.length === 0 && !searching && <MEmpty icon="search" title={`Nothing matches “${q.trim()}”`}>Try the four-letter ICAO code, the IATA code or the city.</MEmpty>}
        </div>
      ) : (
        <>
          {today.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <MLabel>ON TODAY’S FLIGHTS</MLabel>
              <div className="flex flex-wrap gap-2">
                {today.map(([c, wx]) => <Link key={c} href={`/m/airport/${c}`} className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-cw-border-control bg-cw-bg-surface px-3.5 font-mono text-[15px] font-semibold text-cw-text">{c}<span className="h-2 w-2 rounded-full" style={{ background: wx && WX_LOOK[wx] ? WX_LOOK[wx].dot : "var(--cw-border-strong)" }} aria-label={wx ? `${wx} on the wall` : "no category"} /></Link>)}
              </div>
            </div>
          )}
          <div className="flex flex-col">
            <MLabel>RECENT</MLabel>
            {recents.length === 0 && <span className="py-3 text-[14px] text-cw-text-muted">Airports you open appear here.</span>}
            {recents.map((r) => <Link key={r.icao} href={`/m/airport/${r.icao}`} className="flex min-h-14 items-center gap-3 border-b border-cw-divider text-cw-text"><span className="w-[52px] font-mono text-[16px] font-bold">{r.icao}</span><span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-[15px] text-cw-text-body">{r.name}</span><span className="truncate text-[12.5px] text-cw-text-muted">{r.country}</span></span><MaskIcon name="chevron-right" size={16} color="var(--cw-text-muted)" /></Link>)}
          </div>
        </>
      )}
    </div>
  );
}
