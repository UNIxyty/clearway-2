"use client";

// Passenger manifest — the flight picker. Opens above the composer with UPCOMING flights already listed (no typing),
// soonest first. Typing filters on callsign, registration, route and date at once (manifestSearch.ts). Every row shows
// callsign, registration, route and date WITH departure time, so legs that share a callsign cannot be confused.
// ↑↓ move · ⏎ choose · Esc close. Loading, no-match and failed states are drawn. No native <select>, no browser
// autocomplete. The flights come from the user's own session (search_flights → the wall's records); the manifest
// itself is then read from Leon with the user's own Leon account.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { C, SHADOW, mono } from "../ui/tokens";
import { Icon } from "../ui/primitives";
import { AGENT_BASE } from "../types";
import { pickRows, serverFilters, toPickerFlight, whenLabel, type PickerFlight } from "./manifestSearch";

type Status = "loading" | "ready" | "error";

async function searchFlights(input: Record<string, unknown>): Promise<PickerFlight[]> {
  const r = await fetch(`${AGENT_BASE}/api/tools/invoke`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "search_flights", input }) });
  const b = await r.json().catch(() => null);
  if (!r.ok || !b || b.ok === false || !Array.isArray(b.flights)) throw new Error(b?.message ?? `HTTP ${r.status}`);
  return (b.flights as Parameters<typeof toPickerFlight>[0][]).map(toPickerFlight).filter((f): f is PickerFlight => Boolean(f));
}

export function ManifestPicker({ initialQuery = "", panel = false, onPick, onBlank, onClose }: {
  initialQuery?: string;
  panel?: boolean;
  onPick: (f: PickerFlight) => void;
  onBlank: () => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [flights, setFlights] = useState<PickerFlight[]>([]);
  const [query, setQuery] = useState(initialQuery);
  const [highlight, setHighlight] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const id = useId();

  // First load: the next fortnight and the past week (what is not loaded here is fetched when typed, below).
  useEffect(() => {
    let alive = true;
    setStatus("loading");
    const now = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString();
    Promise.all([
      searchFlights({ from: iso(now - 2 * 3600_000), to: iso(now + 14 * 86_400_000), limit: 100 }),
      searchFlights({ from: iso(now - 7 * 86_400_000), to: iso(now - 2 * 3600_000), limit: 100 }).catch(() => [] as PickerFlight[]),
    ]).then(([up, past]) => { if (alive) { setFlights([...up, ...past]); setStatus("ready"); } })
      .catch(() => { if (alive) setStatus("error"); });
    return () => { alive = false; };
  }, [attempt]);

  // Typing a callsign, registration or ICAO also asks the server (past 30 days → next 60), so a flight outside the
  // first load is still found.
  useEffect(() => {
    const filters = serverFilters(query);
    if (!filters.length || status !== "ready") return;
    let alive = true;
    const t = setTimeout(() => {
      const now = Date.now();
      Promise.all(filters.map((f) => searchFlights({ ...f, from: new Date(now - 30 * 86_400_000).toISOString(), to: new Date(now + 60 * 86_400_000).toISOString(), limit: 50 }).catch(() => [] as PickerFlight[])))
        .then((sets) => { if (alive) setFlights((cur) => [...cur, ...sets.flat()]); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [query, status]);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 0); }, []);
  // Esc closes the picker wherever focus is (after voice, focus sits on the voice button, not in the search box).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && document.activeElement !== inputRef.current) { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const rows = useMemo(() => pickRows(flights, query).slice(0, 60), [flights, query]);
  // Row 0 is always the blank form; flights follow.
  const count = rows.length + 1;
  useEffect(() => { setHighlight((h) => Math.min(h, Math.max(0, count - 1))); }, [count]);
  useEffect(() => { listRef.current?.querySelector(`[data-index="${highlight}"]`)?.scrollIntoView({ block: "nearest" }); }, [highlight]);

  const choose = useCallback((i: number) => { if (i === 0) onBlank(); else if (rows[i - 1]) onPick(rows[i - 1]); }, [rows, onBlank, onPick]);
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, count - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); setHighlight(0); }
    else if (e.key === "End") { e.preventDefault(); setHighlight(count - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (status === "ready" || highlight === 0) choose(highlight); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };
  const optionId = (i: number) => `${id}-opt-${i}`;
  const repeated = new Set(rows.map((r) => r.callsign).filter((c, i, a) => a.indexOf(c) !== i));

  return (
    <div className="ag-menu-in" data-manifest-picker="" style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: panel ? 12 : 14, boxShadow: panel ? SHADOW.menuPanel : SHADOW.menu, zIndex: 20, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: panel ? "9px 10px" : "10px 14px", borderBottom: `1px solid ${C.divider}` }}>
        <Icon name="search" size={15} color={C.faint} />
        <input
          ref={inputRef} name="manifest-flight-search" type="text" role="combobox" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={optionId(highlight)} aria-autocomplete="list"
          autoComplete="off" autoCorrect="off" spellCheck={false} data-1p-ignore="" data-lpignore="true"
          value={query} onChange={(e) => { setQuery(e.target.value); setHighlight(e.target.value ? 1 : 0); }} onKeyDown={onKeyDown}
          placeholder="Callsign, registration, route or date — e.g. KLJ7350, LY-BGS, EVRA, tomorrow"
          aria-label="Find the flight for the passenger manifest"
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: panel ? 13.5 : 14, color: C.ink, minWidth: 0 }}
        />
        <button type="button" onClick={onClose} aria-label="Close" style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: C.hover, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><Icon name="x" size={11} color={C.muted} /></button>
      </div>
      <div id={`${id}-list`} ref={listRef} role="listbox" aria-label="Flights" style={{ padding: 6, maxHeight: panel ? 280 : 340, overflowY: "auto" }}>
        <Row index={0} id={optionId(0)} active={highlight === 0} onHover={setHighlight} onChoose={choose}>
          <span style={{ width: 26, height: 26, borderRadius: 7, background: C.hover, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="file-text" size={14} color={C.body} /></span>
          <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap" }}>Blank form</span>
          <span style={{ fontSize: 12.5, color: C.muted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{panel ? "for filling by hand" : "no flight — the empty manifest for filling by hand"}</span>
        </Row>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", color: C.faint, padding: "8px 10px 2px" }}>{query.trim() ? "MATCHING FLIGHTS" : "UPCOMING FLIGHTS · SOONEST FIRST"}</div>
        {status === "loading" && <State icon="loader-circle" text="Loading flights…" />}
        {status === "error" && (
          <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 10px", fontSize: 13, color: C.danger }}>
            <Icon name="circle-alert" size={14} color={C.danger} />The flight search failed.
            <button type="button" onClick={() => setAttempt((a) => a + 1)} style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: C.primaryHover, background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline" }}>Try again</button>
          </div>
        )}
        {status === "ready" && rows.length === 0 && <State icon="search" text={query.trim() ? `No flight matches “${query.trim()}”. Try a callsign, registration, ICAO, city or date.` : "No upcoming flights in the next 14 days. Type to search earlier ones."} />}
        {status === "ready" && rows.map((f, i) => (
          <Row key={f.key} index={i + 1} id={optionId(i + 1)} active={highlight === i + 1} onHover={setHighlight} onChoose={choose}>
            <span style={{ width: 26, height: 26, borderRadius: 7, background: C.hover, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="plane-takeoff" size={14} color={C.body} /></span>
            {panel ? (
              // The side panel is narrow: two lines — callsign · registration, then route · date and time.
              <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: 1 }}>
                <span style={{ display: "flex", gap: 8, alignItems: "baseline", minWidth: 0 }}>
                  <span style={mono({ fontSize: 13, fontWeight: 600 })}>{f.callsign || "—"}</span>
                  <span style={{ ...mono({ fontSize: 12 }), color: C.body }}>{f.registration}</span>
                  {f.cancelled && <span style={{ fontSize: 11, color: C.faint }}>cancelled</span>}
                </span>
                <span style={{ ...mono({ fontSize: 12, fontWeight: repeated.has(f.callsign) ? 600 : 400 }), color: repeated.has(f.callsign) ? C.ink : C.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.adep || "????"} → {f.ades || "????"} · {whenLabel(f.std)}</span>
              </span>
            ) : (
              <>
                <span style={{ ...mono({ fontSize: 13.5, fontWeight: 600 }), minWidth: 76 }}>{f.callsign || "—"}</span>
                <span style={{ ...mono({ fontSize: 12.5 }), color: C.body, minWidth: 66 }}>{f.registration}</span>
                <span style={{ ...mono({ fontSize: 12.5 }), color: C.body, minWidth: 92 }}>{f.adep || "????"} → {f.ades || "????"}</span>
                <span style={{ ...mono({ fontSize: 12.5, fontWeight: repeated.has(f.callsign) ? 600 : 400 }), color: repeated.has(f.callsign) ? C.ink : C.body }}>{whenLabel(f.std)}</span>
                <span style={{ fontSize: 12, color: C.faint, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>{f.cancelled ? "cancelled · " : ""}{f.operator}</span>
              </>
            )}
          </Row>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, padding: panel ? "7px 12px" : "8px 16px", whiteSpace: "nowrap", borderTop: `1px solid ${C.divider}`, background: C.page, fontSize: 12, color: C.faint }}>
        <span>↑↓ move</span><span>⏎ make{panel ? "" : " the manifest"}</span><span>Esc close</span>{!panel && <><span style={{ flex: 1 }} /><span>Read from Leon with your own account</span></>}
      </div>
    </div>
  );
}

function Row({ index, id, active, onHover, onChoose, children }: { index: number; id: string; active: boolean; onHover: (i: number) => void; onChoose: (i: number) => void; children: React.ReactNode }) {
  return (
    <div id={id} role="option" aria-selected={active} data-index={index} onMouseEnter={() => onHover(index)} onMouseDown={(e) => e.preventDefault()} onClick={() => onChoose(index)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 8, background: active ? C.primaryTint : "transparent", cursor: "pointer" }}>
      {children}
    </div>
  );
}

function State({ icon, text }: { icon: string; text: string }) {
  return <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 10px", fontSize: 13, color: C.muted }}><Icon name={icon} size={14} color={C.faint} />{text}</div>;
}
