"use client";

// The client wall (Stage 5, design: Client Wall.dc.html). One product, two sizes: board and flight side by side from
// 700px, the board first and a flight full screen below it. It BUILDS ITSELF from the client's switches — a switch that
// is off adds nothing; nothing is greyed or locked. Every number here comes from the wall backend's scoped answers
// (/digital-wall/api/*): the server has already cut them to this client's flights, so this page never filters by scope
// and never asks for a flight it was not given. Passengers come through the one passenger viewer (shared/passenger-viewer.jsx).
import { useCallback, useEffect, useMemo, useState } from "react";
import MaskIcon from "@/components/portal/Icon";
import PassengerViewer from "@/shared/passenger-viewer.jsx";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Me = { ok: boolean; status: string; company: string; personName: string; switches: string[]; passengerLevel: "off" | "names" | "documents"; scopeKinds: string[] };
// a note ops matched to the flight, sent only with its switch (digital-wall/lib/client-scope.mjs › clientFlight)
type Note = { id: string; type: "LIM" | "IMP" | "CAA"; title?: string | null; description?: string | null; caa?: Record<string, unknown> };
type Flight = { limitations?: Note[]; flightNid: number; flightNo: string; status?: string; movementState?: string; isCnl?: boolean; startTimeUTC?: string; endTimeUTC?: string; etd?: string; eta?: string; atd?: string; ata?: string; ctot?: string; ctotUTC?: string; delayMin?: number | null; tripNo?: string | null; aircraftRegistration?: string | null; icaoType?: string | null; adep?: { icao?: string; name?: string }; ades?: { icao?: string; name?: string }; passengerCount?: number | null; isAirborne?: boolean; hasArrived?: boolean };
type Rec = { key: string; oprId: string; operatorName?: string; registration: string; flight: Flight; notamCheck?: { checked?: boolean } | null };
type Info = { ok: boolean; flight?: Flight; notams?: { dep?: { ok?: boolean; notams?: Array<{ id?: string; text?: string; category?: string }>; count?: number } | null; arr?: unknown }; weather?: { dep?: Record<string, unknown> | null; arr?: Record<string, unknown> | null }; aip?: { dep?: { available?: boolean; url?: string } | null; arr?: { available?: boolean; url?: string } | null } };

const hhmm = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(11, 16) : "—");
const dayKey = (iso?: string) => (iso ? iso.slice(0, 10) : "");
const STATUS: Record<string, string> = { scheduled: "Scheduled", delayed: "Delayed", ctot: "CTOT", flying: "Flying", airborne: "Flying", arrived: "Arrived", landed: "Arrived", aog: "AOG", cancelled: "Cancelled" };
// the ICAO flight-type letter, in words: a client reads "Non-scheduled", not "N" (2026-11-09)
const FLIGHT_TYPE: Record<string, string> = { S: "Scheduled", N: "Non-scheduled", G: "General aviation", M: "Military", X: "Other" };

function stateOf(f: Flight): keyof typeof STATUS {
  if (f.isCnl) return "cancelled";
  if (f.hasArrived || f.movementState === "arrived" || f.movementState === "landed") return "arrived";
  if (f.isAirborne || f.movementState === "airborne" || f.movementState === "flying") return "flying";
  if (f.ctotUTC || f.ctot) return "ctot";
  if ((f.delayMin ?? 0) > 0 || f.movementState === "delayed") return "delayed";
  return "scheduled";
}

export default function ClientWall() {
  const [me, setMe] = useState<Me | null>(null);
  const [recs, setRecs] = useState<Rec[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [day, setDay] = useState<"today" | "tomorrow" | "week">("today");
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "flight">("board");
  const [now, setNow] = useState(() => Date.now());
  const [check, setCheck] = useState<{ sign?: string; ranAt?: string } | null>(null);
  const [viewerName, setViewerName] = useState("");
  const [feed, setFeed] = useState<{ live?: boolean; updatedAt?: string | null } | null>(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { createSupabaseBrowserClient().auth.getUser().then(({ data }) => setViewerName(String((data.user?.user_metadata as Record<string, unknown> | undefined)?.full_name || data.user?.email || "You"))); }, []); // metadata-ok: the display name only, for the viewer's watermark
  const on = useCallback((k: string) => Boolean(me?.switches?.includes(k)), [me]);

  const load = useCallback(async () => {
    try {
      const m = await (await fetch("/api/client/me", { cache: "no-store" })).json();
      if (!m.ok) throw new Error("account");
      setMe(m as Me);
      const to = new Date(Date.now() + 7 * 86400e3).toISOString();
      const r = await fetch(`/digital-wall/api/flights/normalized?window=all-cached&limit=500&from=${encodeURIComponent(new Date(Date.now() - 2 * 3600e3).toISOString())}&to=${encodeURIComponent(to)}`, { cache: "no-store" });
      if (!r.ok) throw new Error("board");
      const d = await r.json();
      setRecs(((d.flights ?? []) as Rec[]).filter((x) => !x.flight?.isCnl).sort((a, b) => String(a.flight.startTimeUTC).localeCompare(String(b.flight.startTimeUTC))));
      if ((m as Me).switches?.includes("notam_check_status")) fetch("/digital-wall/api/notam-check/today", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).then((x) => x && setCheck(x)).catch(() => {});
      if ((m as Me).switches?.includes("service_status")) fetch("/digital-wall/api/timeline/sync-status", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).then((x) => x && setFeed(x)).catch(() => {});
      setErr(null);
    } catch { setErr("Your flights could not be loaded. Try again in a few minutes."); }
  }, []);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 60_000); return () => clearInterval(t); }, [load]);

  const tripScoped = Boolean(me?.scopeKinds?.length && me.scopeKinds.every((k) => k === "trip"));
  const todayKey = new Date(now).toISOString().slice(0, 10), tomorrowKey = new Date(now + 86400e3).toISOString().slice(0, 10);
  const shown = useMemo(() => (recs ?? []).filter((r) => tripScoped || day === "week" || dayKey(r.flight.startTimeUTC) === (day === "today" ? todayKey : tomorrowKey)), [recs, day, tripScoped, todayKey, tomorrowKey]);
  const groups = useMemo(() => {
    if (tripScoped) { const m = new Map<string, Rec[]>(); for (const r of shown) { const k = String(r.flight.tripNo ?? "—"); m.set(k, [...(m.get(k) ?? []), r]); } return [...m.entries()].map(([k, rows]) => ({ label: `Trip ${k}`, trip: k, rows })); }
    const m = new Map<string, Rec[]>(); for (const r of shown) { const k = dayKey(r.flight.startTimeUTC); m.set(k, [...(m.get(k) ?? []), r]); }
    return [...m.entries()].map(([k, rows]) => ({ label: `${k === todayKey ? "TODAY" : k === tomorrowKey ? "TOMORROW" : k} · ${new Date(k).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).toUpperCase()}`, trip: null, rows }));
  }, [shown, tripScoped, todayKey, tomorrowKey]);
  const selected = useMemo(() => (recs ?? []).find((r) => r.key === sel) ?? shown[0] ?? null, [recs, sel, shown]);


  if (err && !recs) return <main className="clw-hold"><h1>Your flights</h1><p>{err}</p><button type="button" className="cl-btn" onClick={() => void load()}>Try again</button></main>;

  return (
    // the shell (components/client/ClientShell.tsx) carries the header and the menu; this is the Flights page itself
    <div className="clw-wall" data-client-wall data-view={view}>
        {((on("notam_check_status") && check?.sign === "CHECKED") || (on("service_status") && feed)) && <div className="clw-wallbar">
          {/* Service status: is the flight data live, and when it was last brought up to date. Said in words, both ways. */}
          {on("service_status") && feed && <span className={`clw-chip ${feed.live ? "" : "warn"}`} data-service-status={feed.live ? "live" : "behind"}><MaskIcon name={feed.live ? "activity" : "circle-alert"} size={14} />{feed.live ? "Flight data is live" : "Flight data may be behind"}{feed.updatedAt ? ` · updated ${hhmm(feed.updatedAt)} UTC` : ""}</span>}
          {on("notam_check_status") && check?.sign === "CHECKED" && <span className="clw-chip" data-notam-checked><MaskIcon name="shield-check" size={14} />NOTAMs reviewed by Clearway{check.ranAt ? ` · ${hhmm(check.ranAt)} UTC` : ""}</span>}
        </div>}
        <div className="clw-body">
          <aside className="clw-board" data-board>
            <div className="clw-board-head">
              <div className="clw-row"><span className="clw-h">{tripScoped ? "Your trips" : "Flights"}</span><span className="clw-muted">{shown.length} flight{shown.length === 1 ? "" : "s"}</span></div>
              {!tripScoped && <div className="clw-seg" role="tablist">{(["today", "tomorrow", "week"] as const).map((k) => <button type="button" role="tab" key={k} aria-selected={day === k} className={day === k ? "on" : ""} onClick={() => setDay(k)}>{k === "today" ? "Today" : k === "tomorrow" ? "Tomorrow" : "7 days"}</button>)}</div>}
              {tripScoped && <span className="clw-muted">Flights on your trips with Clearway. New legs appear here as soon as they are added to a trip.</span>}
            </div>
            <div className="clw-list">
              {recs === null && [1, 2, 3].map((i) => <div key={i} className="clw-skel" />)}
              {recs !== null && !shown.length && <div className="clw-empty">No flights {day === "today" ? "today" : day === "tomorrow" ? "tomorrow" : "in the next 7 days"}.</div>}
              {groups.map((g) => (
                <div key={g.label} className="clw-group">
                  {g.trip ? <div className="clw-trip"><MaskIcon name="hash" size={14} /><span className="clw-tripno">Trip {g.trip}</span><span className="clw-muted">{g.rows.length} flight{g.rows.length === 1 ? "" : "s"}</span></div> : <span className="clw-day">{g.label}</span>}
                  {g.rows.map((r) => { const f = r.flight; const st = stateOf(f); const t1 = st === "arrived" ? (f.ata || f.endTimeUTC) : st === "flying" ? (f.eta || f.endTimeUTC) : (f.etd || f.startTimeUTC); return (
                    <button type="button" key={r.key} className={`clw-flight ${selected?.key === r.key && view !== "board" ? "sel" : ""} ${selected?.key === r.key ? "cur" : ""}`} data-flight={r.key} onClick={() => { setSel(r.key); setView("flight"); }}>
                      <span className="clw-t"><span className={`clw-t1 ${st === "delayed" ? "delayed" : ""}`}>{hhmm(t1)}</span><span className="clw-t0">{st === "arrived" ? "landed" : st === "flying" ? "ETA" : st === "ctot" ? `CTOT ${hhmm(f.ctotUTC)}` : f.etd && f.etd !== f.startTimeUTC ? `was ${hhmm(f.startTimeUTC)}` : "STD"}</span></span>
                      <span className="clw-mid"><span className="clw-cs">{f.flightNo}<small>{r.registration}</small></span><span className="clw-route">{f.adep?.icao} → {f.ades?.icao}</span></span>
                      <span className={`clw-st st-${st}`}><span className="dot" />{STATUS[st]}</span>
                    </button>); })}
                </div>
              ))}
            </div>
          </aside>
          <main className="clw-detail" data-detail>
            {selected ? <FlightDetail rec={selected} on={on} level={me?.passengerLevel ?? "off"} viewerName={viewerName} onBack={() => setView("board")} /> : recs !== null ? <div className="clw-empty">{recs.length ? "Pick a flight on the left." : "No flights on your account in the next seven days. When Clearway has one, it appears here with its times, weather and NOTAMs."}</div> : null}
          </main>
        </div>
    </div>
  );
}

function FlightDetail({ rec, on, level, viewerName, onBack }: { rec: Rec; on: (k: string) => boolean; level: "off" | "names" | "documents"; viewerName: string; onBack: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const f = rec.flight; const st = stateOf(f);
  useEffect(() => { let alive = true; setInfo(null); fetch(`/digital-wall/api/flight-info?flightNid=${f.flightNid}&oprId=${encodeURIComponent(rec.oprId)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) setInfo(d); }).catch(() => {}); return () => { alive = false; }; }, [f.flightNid, rec.oprId]);
  const api = useMemo(() => ({
    list: async () => { const r = await fetch(`/agent/api/flights/${encodeURIComponent(rec.key)}/passengers`, { cache: "no-store" }); const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.message || "Passengers are not available."), { shown: true }); return d; },
    reveal: async (id: string) => { const r = await fetch(`/agent/api/flights/${encodeURIComponent(rec.key)}/passengers/${encodeURIComponent(id)}/reveal`, { method: "POST" }); const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.message || "The document could not be shown."), { shown: true }); return d; },
  }), [rec.key]);
  const icon = (name: string, size: number, color?: string) => <MaskIcon name={name} size={size} color={color ?? "currentColor"} />;
  const wx = info?.weather ?? {}; const nt = info?.notams ?? {}; const aip = info?.aip ?? {};
  const notamList = (side: unknown) => { const s = side as { notams?: Array<{ id?: string; text?: string; category?: string }>; items?: Array<{ id?: string; text?: string }> } | null; return (s?.notams ?? s?.items ?? []) as Array<{ id?: string; text?: string; category?: string }>; };
  const row = (k: string, v: unknown) => (v === undefined || v === null || v === "" ? null : <span key={k} className="clw-kv">{k}<b>{String(v)}</b></span>);
  // ops' notes for this flight, by kind; each kind is sent only with its switch, so an empty list is "none", in words
  const notes = (type: Note["type"]) => (f.limitations ?? []).filter((n) => n.type === type);
  const many = (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).join(", ") : v);
  const noteCard = (card: string, type: "LIM" | "IMP", title: string, iconName: string, none: string) => { const list = notes(type); return (
    <section className="clw-card" data-card={card}><div className="clw-card-head"><MaskIcon name={iconName} size={16} /><span>{title}</span><small>{list.length ? `${list.length} for this flight` : ""}</small></div>
      {list.length ? list.map((n) => <div key={n.id} className="clw-note"><b>{n.title}</b>{n.description ? <p>{n.description}</p> : null}</div>) : <p className="clw-card-text clw-muted">{none}</p>}</section>); };
  const weatherCard = (side: "dep" | "arr", icao?: string) => { const w = (wx as Record<string, Record<string, unknown> | null>)[side]; return (
    <div className="clw-wx" key={side}><span className="clw-wx-head"><b>{icao}</b><span className="clw-muted">{side === "dep" ? "Departure" : "Arrival"}</span>{w?.observedAt ? <small>obs {hhmm(String(w.observedAt))}</small> : null}</span>
      {w ? <div className="clw-kvs">{row("Wind", w.wind)}{row("Visibility", w.visibility)}{row("Ceiling", w.ceiling ?? w.clouds)}{row("Temp / dew", w.temperature ?? w.temp)}{row("QNH", w.qnh)}{row("Category", w.category ?? w.flightCategory)}</div> : <span className="clw-muted">No current observation.</span>}
      {w?.taf ? <span className="clw-taf">TAF {String(w.taf)}</span> : null}{w?.metar && !w?.wind ? <span className="clw-taf">{String(w.metar)}</span> : null}</div>); };
  return (
    <div className="clw-detail-in">
      <button type="button" className="clw-back" onClick={onBack}><MaskIcon name="arrow-left" size={16} />All flights</button>
      <section className="clw-card clw-hero">
        <div className="clw-row wrap"><span className="clw-callsign">{f.flightNo}</span><span className={`clw-st big st-${st}`}><span className="dot" />{STATUS[st]}</span>{(f.delayMin ?? 0) > 0 ? <span className="clw-delay">+{f.delayMin} min</span> : null}<span className="clw-grow" /><span className="clw-muted mono">{rec.registration}{f.icaoType ? ` · ${FLIGHT_TYPE[f.icaoType] ?? f.icaoType}` : ""}</span></div>
        <div className="clw-route-big"><span><b>{f.adep?.icao}</b><small>{f.adep?.name ?? ""}</small></span><MaskIcon name="arrow-right" size={20} /><span className="right"><b>{f.ades?.icao}</b><small>{f.ades?.name ?? ""}</small></span></div>
        <div className="clw-times">
          <div className="clw-timebox"><span className="clw-muted">Departure · {f.adep?.icao}</span>{row("STD", `${hhmm(f.startTimeUTC)}Z`)}{row(f.ctotUTC ? "CTOT" : "ETD", `${hhmm(f.ctotUTC || f.etd || f.startTimeUTC)}Z`)}{row("ATD", f.atd ? `${hhmm(f.atd)}Z` : "—")}</div>
          <div className="clw-timebox"><span className="clw-muted">Arrival · {f.ades?.icao}</span>{row("STA", `${hhmm(f.endTimeUTC)}Z`)}{row("ETA", `${hhmm(f.eta || f.endTimeUTC)}Z`)}{row("ATA", f.ata ? `${hhmm(f.ata)}Z` : "—")}</div>
        </div>
      </section>
      <div className="clw-cards">
        {on("weather") && <section className="clw-card span" data-card="weather"><div className="clw-card-head"><MaskIcon name="cloud-sun" size={16} /><span>Weather</span><small>METAR · TAF</small></div><div className="clw-wx2">{weatherCard("dep", f.adep?.icao)}{weatherCard("arr", f.ades?.icao)}</div></section>}
        {on("notams") && <section className="clw-card" data-card="notams"><div className="clw-card-head"><MaskIcon name="radio-tower" size={16} /><span>NOTAMs</span><small>{notamList(nt.dep).length + notamList(nt.arr).length} active</small></div>{(["dep", "arr"] as const).map((side) => { const list = notamList((nt as Record<string, unknown>)[side]); return <div key={side} className="clw-notams"><b>{side === "dep" ? f.adep?.icao : f.ades?.icao}</b>{list.length ? list.slice(0, 4).map((n, i) => <span key={n.id ?? i} className="clw-notam"><small>{n.id ?? ""}</small>{n.text ?? ""}</span>) : <span className="clw-muted">None on file.</span>}</div>; })}</section>}
        {on("radar") && <section className="clw-card" data-card="radar"><div className="clw-card-head"><MaskIcon name="radar" size={16} /><span>Flight radar</span></div><div className="clw-prog"><span>{f.adep?.icao}</span><span className="clw-line"><span className="clw-line-fill" style={{ width: st === "arrived" ? "100%" : st === "flying" ? "50%" : "0%" }} /></span><span>{f.ades?.icao}</span></div><span className="clw-muted">{st === "arrived" ? `Landed at ${f.ades?.icao}${f.ata ? ` at ${hhmm(f.ata)}Z` : ""}.` : st === "flying" ? "Airborne. Position is tracked by Clearway ops." : `Not airborne yet. Tracking starts at take-off from ${f.adep?.icao}.`}</span></section>}
        {on("limitations") && noteCard("limitations", "LIM", "Limitations", "triangle-alert", "No limitations apply to this flight.")}
        {on("important") && noteCard("important", "IMP", "Important notices", "megaphone", "No notices for this flight.")}
        {on("caa") && <section className="clw-card" data-card="caa"><div className="clw-card-head"><MaskIcon name="landmark" size={16} /><span>CAA details</span><small>{notes("CAA").length ? `${notes("CAA").length} for this flight` : ""}</small></div>
          {notes("CAA").length ? notes("CAA").map((n) => { const c = n.caa ?? {}; return <div key={n.id} className="clw-note"><b>{String(c.authorityName || n.title || c.country || "")}</b>{c.country && c.authorityName ? <span className="clw-muted">{String(c.country)}</span> : null}
            <div className="clw-kvs one">{row("For", c.functionText)}{row("Valid", c.validity)}{row("Contact", c.contact)}{row("Phone", many(c.phones))}{row("Email", many(c.mail))}{row("SITA", c.sita)}{row("AFTN", c.aftn)}</div>{c.info ? <p>{String(c.info)}</p> : null}</div>; }) : <p className="clw-card-text clw-muted">No authority details on file for this flight.</p>}</section>}
        {level !== "off" && <section className="clw-card" data-card="passengers"><div className="clw-card-head"><MaskIcon name="users" size={16} /><span>Passengers</span></div><PassengerViewer api={api} viewer={{ name: viewerName || "You" }} icon={icon} /><div className="clw-card-foot">{level === "documents" ? "Documents open one passenger at a time and close after 30 seconds. Each view is logged with your name." : "Names and seats as entered in Leon."}</div></section>}
        {on("documents") && <section className="clw-card" data-card="documents"><div className="clw-card-head"><MaskIcon name="file-text" size={16} /><span>Documents</span></div>{(["dep", "arr"] as const).map((side) => { const a = (aip as Record<string, { available?: boolean; url?: string } | null>)[side]; const icao = side === "dep" ? f.adep?.icao : f.ades?.icao; return <div key={side} className="clw-doc"><MaskIcon name="file" size={15} /><span className="clw-grow"><b>AIP AD 2 {icao}</b></span>{a?.available ? <a href={`/digital-wall/api/aip-pdf?icao=${icao}`} target="_blank" rel="noreferrer"><MaskIcon name="download" size={15} /></a> : <small className="clw-muted">not on file</small>}</div>; })}</section>}
      </div>
    </div>
  );
}

/** /client/airports (switch airport_search): the wall's airport search; the AIP link only with documents on. */
export function AirportsTab({ documents }: { documents: boolean }) {
  type Ap = { icao: string; name?: string; country?: string };
  const [q, setQ] = useState(""); const [rows, setRows] = useState<Ap[]>([]); const [searched, setSearched] = useState("");
  const mine = useMyAirports();
  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) { setRows([]); setSearched(""); return; }
    const t = setTimeout(() => {
      fetch(`/digital-wall/api/airports/search?q=${encodeURIComponent(term)}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { setRows(((d?.results ?? d?.airports ?? d ?? []) as Ap[]).slice(0, 20)); setSearched(term); })
        .catch(() => { setRows([]); setSearched(term); });
    }, 250);
    return () => clearTimeout(t);
  }, [term]);
  // a small portal reads as finished (2026-11-09): words before a search, the client's own airports one tap away, and a
  // no-match line only once a search has come back — never an empty box
  return (
    <main className="clw-tab" data-tab="airports">
      <h2 className="clw-h">Airports</h2>
      <p className="clw-muted">Find any airport by its ICAO code or its name{documents ? ", and open its AIP pages" : ""}.</p>
      <input className="clw-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ICAO or name, e.g. EVRA" aria-label="Search airports" />
      {term.length < 2 && mine && mine.length > 0 && (
        <div className="clw-picks" data-my-airports="">
          <span className="clw-muted">On your flights:</span>
          {mine.map((i) => <button type="button" key={i} className="clw-pick mono" onClick={() => setQ(i)}>{i}</button>)}
        </div>
      )}
      {rows.length > 0 && <div className="clw-results">{rows.map((a) => <div key={a.icao} className="clw-doc"><b className="mono">{a.icao}</b><span className="clw-grow">{a.name ?? ""}{a.country ? ` · ${a.country}` : ""}</span>{documents && <a href={`/digital-wall/api/aip-pdf?icao=${a.icao}`} target="_blank" rel="noreferrer" aria-label={`AIP for ${a.icao}`}><MaskIcon name="download" size={15} /></a>}</div>)}</div>}
      {term.length >= 2 && searched === term && !rows.length && <p className="clw-empty" data-no-match="">No airport matches “{term}”. Try its four-letter ICAO code.</p>}
    </main>
  );
}

/** The airports on the client's flights, next seven days (the wall's scoped feed): quick picks on Airports. */
function useMyAirports() {
  const [icaos, setIcaos] = useState<string[] | null>(null);
  useEffect(() => {
    fetch(`/digital-wall/api/flights/normalized?window=all-cached&limit=500&from=${encodeURIComponent(new Date(Date.now() - 2 * 3600e3).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 7 * 86400e3).toISOString())}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { const recs = ((d?.flights ?? []) as Rec[]).filter((x) => !x.flight?.isCnl); setIcaos([...new Set(recs.flatMap((r) => [r.flight.adep?.icao, r.flight.ades?.icao]).filter(Boolean))] as string[]); })
      .catch(() => setIcaos([]));
  }, []);
  return icaos;
}

/** /client/documents (switch documents): the AIP pages for the airports on their flights — read from the wall, scoped. */
export function ClientDocuments() {
  const [recs, setRecs] = useState<Rec[] | null>(null);
  useEffect(() => { fetch(`/digital-wall/api/flights/normalized?window=all-cached&limit=500&from=${encodeURIComponent(new Date(Date.now() - 2 * 3600e3).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 7 * 86400e3).toISOString())}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => setRecs(((d?.flights ?? []) as Rec[]).filter((x) => !x.flight?.isCnl))).catch(() => setRecs([])); }, []);
  if (recs === null) return <main className="clw-tab" data-tab="documents"><h2 className="clw-h">Documents</h2><div className="clw-skel" /></main>;
  return <DocumentsTab recs={recs} />;
}

function DocumentsTab({ recs }: { recs: Rec[] }) {
  const icaos = [...new Set(recs.flatMap((r) => [r.flight.adep?.icao, r.flight.ades?.icao]).filter(Boolean))] as string[];
  return (
    <main className="clw-tab" data-tab="documents">
      <h2 className="clw-h">Documents</h2>
      <p className="clw-muted">AIP aerodrome pages for the airports on your flights.</p>
      <div className="clw-results">{icaos.map((i) => <div key={i} className="clw-doc"><MaskIcon name="file" size={15} /><span className="clw-grow"><b>AIP AD 2 {i}</b></span><a href={`/digital-wall/api/aip-pdf?icao=${i}`} target="_blank" rel="noreferrer" aria-label={`AIP for ${i}`}><MaskIcon name="download" size={15} /></a></div>)}{!icaos.length && <span className="clw-muted">No flights, so no documents yet.</span>}</div>
    </main>
  );
}
