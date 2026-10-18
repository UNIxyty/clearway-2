"use client";

// One airport on a phone (mobile-portal-spec.md › Tier 1 › Airport): check one NOTAM or the weather before a flight.
// Header with the weather category, the local time and the tabs NOTAMs · Weather · Documents. NOTAMs filter to the
// next flight's window at this airport (arrival or departure ±1 h) by default, carry the wall's five categories on a
// 4 px edge, and open one at a time (?notam=). Weather leads with decoded tiles; the raw METAR is under them. A
// document is the AIP copy the portal holds, on paper (?doc=ad2), with the date it was fetched — never a promise of a
// refresh. Each source loads and fails on its own, so a NOTAM source that is down leaves the weather and the document.
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import MaskIcon from "@/components/portal/Icon";
import { usePhonePage } from "@/components/m/chrome";
import { MButton, MCard, MEmpty, MError, MSegmented, MSkeleton } from "@/components/m/ui";
import { pushRecent } from "@/lib/portal-recents";
import { WX_LOOK, activeDuring, categorise, cleanCondition, clockOf, dayOf, notamWhen, searchAirports, useAipCopy, useNotams, useWallGroups, useWeather, type Airport, type Notam } from "@/lib/m/airport";
import { useWallBoard } from "@/lib/m/wall";
import { PdfView, type PdfHandle, type PdfStatus } from "@/components/agent/viewer/PdfView";
import { useThemeMotion } from "@/components/m/motion";

type Tab = "notams" | "weather" | "docs";

export default function AirportPhonePage() {
  const { icao: raw } = useParams<{ icao: string }>();
  const icao = String(raw).toUpperCase();
  const router = useRouter();
  const search = useSearchParams();
  const tab = (search.get("tab") as Tab) || "notams";
  const notamId = search.get("notam");
  const doc = search.get("doc");
  const [airport, setAirport] = useState<Airport | null>(null);
  useEffect(() => { searchAirports(icao).then((r) => { const a = r.find((x) => x.icao.toUpperCase() === icao) ?? r[0] ?? null; setAirport(a); if (a) pushRecent({ icao, name: a.name, country: a.country }); }).catch(() => {}); }, [icao]);
  const { flights } = useWallBoard();
  // The next flight touching this airport, for the NOTAM window and the wall's weather category.
  const flight = useMemo(() => {
    const now = Date.now();
    const here = (flights ?? []).filter((f) => f.adep === icao || f.ades === icao).map((f) => ({ f, at: f.adep === icao ? f.t.depMs : f.t.arrMs, wx: f.adep === icao ? f.raw.wxDep : f.raw.wxArr, role: (f.adep === icao ? "departure" : "arrival") as "departure" | "arrival" }));
    return here.filter((h) => h.at >= now - 3_600_000).sort((a, b) => a.at - b.at)[0] ?? here.sort((a, b) => b.at - a.at)[0] ?? null;
  }, [flights, icao]);
  const { wx } = useWeather(icao);
  const category = flight?.wx ?? wx?.decoded?.category ?? null;
  const go = (next: Partial<{ tab: Tab; notam: string | null; doc: string | null }>) => {
    const p = new URLSearchParams(); const t = next.tab ?? tab; if (t !== "notams") p.set("tab", t);
    if (next.notam) p.set("notam", next.notam); if (next.doc) p.set("doc", next.doc);
    router.replace(`/m/airport/${icao}${p.toString() ? `?${p}` : ""}`);
  };
  const deep = Boolean(notamId || doc);
  usePhonePage({ title: notamId ? notamId : doc ? "AD 2" : icao, subtitle: notamId ? `${icao} · NOTAM` : airport?.name ?? null, mono: !doc, back: deep ? () => go({ notam: null, doc: null }) : "/m/airport", tab: "more", tabs: !deep, actions: deep ? [] : [{ icon: "bot", label: "Ask the agent", href: `/m/agent?icao=${icao}` }] });

  if (notamId) return <NotamDetail icao={icao} id={notamId} />;
  if (doc) return <DocView icao={icao} />;
  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-[3] flex flex-col gap-2.5 border-b border-cw-border bg-cw-bg-page px-4 pb-2.5 pt-3">
        <div className="flex items-center gap-2.5 text-[13px] text-cw-text-muted">
          {category && <span className="inline-flex h-[22px] items-center rounded-[5px] px-1.5 font-mono text-[11.5px] font-bold" style={{ background: WX_LOOK[category]?.bg, color: WX_LOOK[category]?.fg }}>{category}</span>}
          <span className="font-mono">{airport?.iata ? `${airport.iata} · ` : ""}{airport?.country ?? ""}</span>
          <span className="flex-1" />
          {wx?.decoded?.obs && <span className="font-mono">METAR {wx.decoded.obs}</span>}
        </div>
        <MSegmented value={tab} onChange={(t) => go({ tab: t })} label="Section" options={[{ value: "notams", label: "NOTAMs" }, { value: "weather", label: "Weather" }, { value: "docs", label: "Documents" }]} />
      </div>
      {tab === "notams" && <NotamsTab icao={icao} flight={flight} onOpen={(id) => go({ notam: id })} />}
      {tab === "weather" && <WeatherTab icao={icao} />}
      {tab === "docs" && <DocsTab icao={icao} onOpen={() => go({ doc: "ad2" })} />}
    </div>
  );
}

function NotamsTab({ icao, flight, onOpen }: { icao: string; flight: { f: { callsign: string }; at: number; role: "departure" | "arrival" } | null; onOpen: (id: string) => void }) {
  const { notams, updatedAt, error, loading, reload } = useNotams(icao);
  const groups = useWallGroups();
  const [onlyFlight, setOnlyFlight] = useState(true);
  const all = useMemo(() => categorise(notams ?? [], groups), [notams, groups]);
  const windowed = flight && onlyFlight ? all.filter((x) => activeDuring(x.n, flight.at - 3_600_000, flight.at + 3_600_000)) : all;
  const counts = useMemo(() => { const c: Record<string, { n: number; look: (typeof all)[number]["look"] }> = {}; for (const x of windowed) { c[x.catName] = { n: (c[x.catName]?.n ?? 0) + 1, look: x.look }; } return c; }, [windowed]);
  if (loading && notams === null) return <MSkeleton kind="cards" label="Loading NOTAMs" />;
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-6 pt-3">
      {error && (
        <div role="alert" className="flex flex-col gap-2 rounded-[12px] border border-cw-danger-border bg-cw-danger-tint px-3.5 py-3">
          <span className="flex gap-2 text-[14.5px] font-bold"><MaskIcon name="radio-tower" size={17} color="var(--cw-danger-text)" />NOTAM source isn’t answering</span>
          <span className="text-[13.5px] leading-normal text-cw-text-body">{notams ? `Showing the last good copy from ${clockOf(updatedAt) ?? "earlier"} UTC, ${notams.length} NOTAMs.` : "No copy is held for this airport yet."} Weather and documents still work.</span>
          <MButton size="sm" icon="refresh-cw" className="self-start" onClick={reload}>Try again</MButton>
        </div>
      )}
      {flight && (
        <button type="button" onClick={() => setOnlyFlight((v) => !v)} role="switch" aria-checked={onlyFlight} className={`flex min-h-[52px] items-center gap-3 rounded-[12px] border px-3 py-1.5 text-left ${onlyFlight ? "border-cw-primary-tint-border bg-cw-bg-selected" : "border-cw-border bg-cw-bg-surface"}`}>
          <MaskIcon name="plane" size={17} color="var(--cw-text-muted)" className="flex-none" />
          <span className="flex flex-1 flex-col"><span className="text-[14.5px] font-semibold text-cw-text">Only during {flight.f.callsign}</span><span className="font-mono text-[12px] text-cw-text-muted">{flight.role} {clockOf(new Date(flight.at).toISOString())} ±1 h</span></span>
          <span className={`relative h-7 w-12 flex-none rounded-[14px] ${onlyFlight ? "bg-cw-primary" : "bg-cw-border-strong"}`}><span className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-cw-knob transition-[left]" style={{ left: onlyFlight ? 23 : 3 }} /></span>
        </button>
      )}
      {Object.keys(counts).length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {Object.entries(counts).map(([name, c]) => <span key={name} className="inline-flex h-10 flex-none items-center gap-[7px] rounded-[20px] border border-cw-border-control bg-cw-bg-surface px-3 text-[13.5px] font-semibold text-cw-text"><span className="h-2 w-2 rounded-[2px]" style={{ background: c.look.dot }} />{name}<span className="font-mono text-[12px] text-cw-text-muted">{c.n}</span></span>)}
        </div>
      )}
      {notams && windowed.length === 0 && !error && <MEmpty icon="radio-tower" title={`No NOTAMs for ${icao}${flight && onlyFlight ? " in the flight’s window" : ""}`}>{updatedAt ? `Checked ${clockOf(updatedAt)} UTC.` : "Nothing is held for this airport."}</MEmpty>}
      {windowed.map(({ n, catName, look }) => (
        <button key={n.number} type="button" onClick={() => onOpen(n.number)} className="flex flex-col gap-1 rounded-[12px] border border-cw-border bg-cw-bg-surface px-3.5 py-3 text-left" style={{ borderLeft: `4px solid ${look.dot}` }}>
          <span className="flex items-center gap-2"><span className="font-mono text-[12.5px] text-cw-text-muted">{n.number}</span><span className="flex-1 text-[11.5px] font-semibold text-cw-text-muted">{catName}</span></span>
          <span className="line-clamp-3 text-[15.5px] font-semibold leading-snug text-cw-text">{cleanCondition(n.condition).split("\n")[0]}</span>
          <span className="font-mono text-[12px] text-cw-text-muted">{notamWhen(n.startDateUtc)} – {notamWhen(n.endDateUtc)}</span>
        </button>
      ))}
      {notams && flight && (
        <span className="py-1.5 text-center text-[13px] text-cw-text-muted">{onlyFlight ? (all.length > windowed.length ? `${all.length - windowed.length} more outside the flight’s window · turn off the filter to see all ${all.length}` : `All ${all.length} held for ${icao} fall in the flight’s window`) : `All ${all.length} NOTAMs held for ${icao}`}</span>
      )}
    </div>
  );
}

function NotamDetail({ icao, id }: { icao: string; id: string }) {
  const { notams } = useNotams(icao);
  const [copied, setCopied] = useState(false);
  const n: Notam | undefined = (notams ?? []).find((x) => x.number === id);
  if (!notams) return <MSkeleton kind="rows" count={4} label="Loading the NOTAM" />;
  if (!n) return <MError title="This NOTAM is not in the copy held" icon="radio-tower">It may have ended. The list shows what is held now.</MError>;
  const text = cleanCondition(n.condition);
  const rows: Array<[string, string]> = [["Where", n.location || icao], ["Class", n.class || "—"], ["From", notamWhen(n.startDateUtc)], ["Until", notamWhen(n.endDateUtc)]];
  const copy = () => { navigator.clipboard?.writeText(`${n.number}\n${text}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };
  return (
    <div className="flex flex-col gap-3.5 px-4 pb-6 pt-4">
      <span className="text-[19px] font-bold leading-snug">{text.split("\n")[0]}</span>
      <MCard>{rows.map(([k, v], i) => <div key={k} className={`grid min-h-12 grid-cols-[90px_minmax(0,1fr)] items-center gap-2.5 px-3.5 py-1.5 ${i ? "border-t border-cw-divider" : ""}`}><span className="text-[13px] text-cw-text-muted">{k}</span><span className="font-mono text-[14px] font-semibold">{v}</span></div>)}</MCard>
      <div className="flex flex-col gap-1.5"><span className="text-[12px] font-bold tracking-[.06em] text-cw-text-muted">AS PUBLISHED</span><pre className="m-0 whitespace-pre-wrap break-words rounded-[12px] border border-cw-border bg-cw-bg-sunken px-3.5 py-3 font-mono text-[13px] leading-relaxed text-cw-text">{text}</pre></div>
      <div className="grid grid-cols-2 gap-2.5">
        <MButton size="sm" icon="copy" onClick={copy}>{copied ? "Copied" : "Copy"}</MButton>
        <MButton size="sm" icon="bot" href={`/m/agent?icao=${icao}`}>Ask the agent</MButton>
      </div>
    </div>
  );
}

function WeatherTab({ icao }: { icao: string }) {
  const { wx, error, loading, reload } = useWeather(icao);
  if (loading && !wx) return <MSkeleton kind="cards" count={3} label="Loading the weather" />;
  if (error && !wx) return <MError title="Couldn’t get the weather" onRetry={reload} icon="cloud-off">{error}</MError>;
  if (!wx?.metar) return <MEmpty icon="cloud-sun" title={`No weather held for ${icao}`} action={<MButton size="sm" icon="refresh-cw" onClick={reload}>Get it now</MButton>}>The portal fetches a METAR and TAF when asked.</MEmpty>;
  const d = wx.decoded!;
  const bad = (k: string) => (k === "Ceiling" && d.ceilFt !== null && d.ceilFt < 1000) || (k === "Visibility" && d.visM !== null && d.visM < 5000);
  const tiles: Array<[string, string | null]> = [["Wind", d.wind], ["Visibility", d.visibility], ["Ceiling", d.ceiling], ["Temp / dew", d.temp], ["QNH", d.qnh], ["Weather", d.weather ?? "nil significant"]];
  return (
    <div className="flex flex-col gap-3.5 px-4 pb-6 pt-3.5">
      {error && <MError stale title="Not updated." onRetry={reload}>Showing the copy from {clockOf(wx.updatedAt) ?? "earlier"} UTC.</MError>}
      <div className="flex items-baseline"><span className="flex-1 text-[17px] font-extrabold">Now</span><span className="font-mono text-[12.5px] text-cw-text-muted">METAR {d.obs ?? ""}{wx.updatedAt ? ` · fetched ${clockOf(wx.updatedAt)}Z` : ""}</span></div>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map(([k, v]) => <div key={k} className="flex flex-col gap-[3px] rounded-[12px] border px-3 py-2.5" style={{ borderColor: bad(k) ? "var(--cw-danger-border)" : "var(--cw-border)", background: bad(k) ? "var(--cw-danger-tint)" : "var(--cw-bg-surface)" }}><span className="text-[12px] font-semibold text-cw-text-muted">{k}</span><span className="font-mono text-[17px] font-semibold" style={{ color: bad(k) ? "var(--cw-danger-text)" : "var(--cw-text)" }}>{v ?? "—"}</span></div>)}
      </div>
      <pre className="m-0 whitespace-pre-wrap break-words rounded-[10px] border border-cw-border bg-cw-bg-sunken px-3 py-2.5 font-mono text-[13px] leading-normal text-cw-text">{wx.metar}</pre>
      {wx.taf && (
        <>
          <span className="pt-1 text-[17px] font-extrabold">Next hours · TAF</span>
          <MCard>{wx.periods.map((p, i) => <div key={i} className={`grid min-h-14 grid-cols-[88px_52px_minmax(0,1fr)] items-center gap-2.5 px-3.5 py-1.5 ${i ? "border-t border-cw-divider" : ""}`}><span className="font-mono text-[13.5px] font-semibold">{p.when}</span><span className="inline-flex h-[22px] items-center justify-center rounded-[5px] px-1.5 font-mono text-[11px] font-bold" style={{ background: p.category ? WX_LOOK[p.category].bg : "var(--cw-neutral-tint)", color: p.category ? WX_LOOK[p.category].fg : "var(--cw-neutral-text)" }}>{p.category ?? "—"}</span><span className="break-words font-mono text-[12.5px] text-cw-text-body">{p.text}</span></div>)}</MCard>
          <span className="text-[12px] text-cw-text-muted">Categories are read from the visibility and ceiling in each group; the wall’s own category for today’s flights comes from CheckWX.</span>
        </>
      )}
      <MButton size="sm" icon="refresh-cw" className="self-start" onClick={reload}>Get weather again</MButton>
    </div>
  );
}

function DocsTab({ icao, onOpen }: { icao: string; onOpen: () => void }) {
  const { copy, error } = useAipCopy(icao);
  if (!copy && !error) return <MSkeleton kind="rows" count={3} label="Loading documents" />;
  const date = copy?.copyFetchedAt ? dayOf(copy.copyFetchedAt) : null;
  const old = copy?.copyFetchedAt ? Date.now() - new Date(copy.copyFetchedAt).getTime() > 28 * 86_400_000 : false;
  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-3">
      <span className="text-[13px] text-cw-text-muted">{copy?.revision?.airac ? `AIRAC ${copy.revision.airac} · effective ${copy.revision.effectiveDate ?? "—"} · ` : ""}{copy?.source?.toUpperCase() ?? ""}</span>
      <MCard>
        <button type="button" onClick={onOpen} disabled={!copy?.cached} className="grid min-h-[58px] w-full grid-cols-[62px_minmax(0,1fr)_auto] items-center gap-2.5 px-3.5 py-2 text-left disabled:opacity-60">
          <span className="font-mono text-[13.5px] font-semibold">AD 2</span>
          <span className="flex flex-col"><span className="text-[14.5px] leading-snug text-cw-text">{icao} aerodrome, the whole document</span><span className="text-[12.5px] text-cw-text-muted">{copy?.cached ? `This copy is from ${date}.` : "No copy is held yet"}</span></span>
          <MaskIcon name="chevron-right" size={15} color="var(--cw-text-muted)" />
        </button>
      </MCard>
      {copy?.cached && <span className={`text-[13px] leading-snug ${old ? "text-cw-warning-text" : "text-cw-text-muted"}`}>{old ? "That is more than one AIRAC cycle (28 days) ago. " : ""}It is not refreshed automatically: fetch the current document from the airport page on a desk, or check the Web AIP.</span>}
      {!copy?.cached && !error && <Link href={`/aip/${icao}`} className="flex h-11 items-center gap-1.5 text-[14px] font-semibold text-cw-text-link">Fetch it on the desktop airport page<MaskIcon name="chevron-right" size={15} color="currentColor" /></Link>}
      {error && <MError title="Couldn’t find the document" icon="file-text">{error}</MError>}
    </div>
  );
}

function DocView({ icao }: { icao: string }) {
  const { copy } = useAipCopy(icao);
  const ref = useRef<PdfHandle>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [status, setStatus] = useState<PdfStatus | null>(null);
  const reduced = useThemeMotion();
  const [w, setW] = useState(358);
  useEffect(() => { const read = () => setW(Math.min(window.innerWidth, 430) - 24); read(); window.addEventListener("resize", read); return () => window.removeEventListener("resize", read); }, []);
  if (!copy) return <MSkeleton kind="rows" count={3} label="Loading the document" />;
  const url = copy.cached && copy.filesPath ? copy.filesPath : `${copy.pdfPath}&inline=1`;
  const err = status?.state === "error" ? status.detail : null;
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 bg-cw-bg-sunken px-3 py-4">
        <div className="mx-auto rounded-[4px] shadow-cw-2" style={{ width: w, background: "var(--mx-paper)", color: "var(--mx-paper-ink)" }}>
          {err ? <MError title="Couldn’t show the document" icon="file-text">{err}</MError> : (
            <PdfView ref={ref} url={url} bytes={null} targetPage={1} zoom={zoom} rotation={0} canvasWidth={w} thumbnails={false} citations={[]} activeCitation={null} reducedMotion={reduced}
              onStatus={(s) => { setStatus(s); if (s.state === "ready" || s.state === "progressive") setPages(s.pages); }} onPage={setPage} onZoom={() => {}} onRotation={() => {}} onSearch={() => {}} onCitationResult={() => {}} onAnnounce={() => {}} />
          )}
        </div>
        <span className="mt-2 block text-center text-[12px] text-cw-text-muted">Clearway copy{copy.copyFetchedAt ? ` from ${dayOf(copy.copyFetchedAt)}` : ""} · not refreshed automatically</span>
      </div>
      <div className="sticky bottom-0 z-[5] grid grid-cols-[52px_minmax(0,1fr)_52px_52px] items-center gap-2 border-t border-cw-border bg-cw-bg-page px-4 pb-[max(30px,env(safe-area-inset-bottom))] pt-2.5">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => ref.current?.goToPage(page - 1)} className="flex h-12 items-center justify-center rounded-[12px] border border-cw-border-control bg-cw-bg-surface text-cw-text disabled:text-cw-text-disabled"><MaskIcon name="chevron-left" size={20} color="currentColor" /></button>
        <span className="text-center font-mono text-[14px] font-semibold">{page} / {pages || "…"}</span>
        <button type="button" aria-label="Next page" disabled={pages > 0 && page >= pages} onClick={() => ref.current?.goToPage(page + 1)} className="flex h-12 items-center justify-center rounded-[12px] border border-cw-border-control bg-cw-bg-surface text-cw-text disabled:text-cw-text-disabled"><MaskIcon name="chevron-right" size={20} color="currentColor" /></button>
        <button type="button" aria-label={zoom === "fit" ? "Zoom in" : "Fit to width"} onClick={() => { const z = zoom === "fit" ? 1.6 : "fit"; setZoom(z); ref.current?.setZoom(z); }} className="flex h-12 items-center justify-center rounded-[12px] border border-cw-border-control bg-cw-bg-surface text-cw-text"><MaskIcon name={zoom === "fit" ? "zoom-in" : "minimize-2"} size={19} color="currentColor" /></button>
      </div>
    </div>
  );
}
