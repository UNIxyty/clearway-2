"use client";

// Flights on the phone: every flight the wall holds (the wall's own cache, as /api/flights/normalized lists it — not
// only the board's window), with the same facts as the board (lib/m/wall.ts toFlight). Grouped by the UTC day of
// the scheduled departure; searched by callsign, registration, airport or trip number.
import { ShownError, apiErrorText, shownText } from "@/lib/error-text";
import { useCallback, useEffect, useRef, useState } from "react";
import { toFlight, type Flight, type RawFlight } from "./wall";

type Normalized = { key?: string; oprId?: string; flightNid?: string | number; operatorName?: string; registration?: string; acftType?: string; acftTypeIcao?: string; flight: RawFlight };

export async function fetchAllFlights(): Promise<Flight[]> {
  const r = await fetch("/digital-wall/api/flights/normalized", { credentials: "include", cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.ok === false) throw new ShownError(apiErrorText(j, `The wall answered ${r.status}.`));
  const rows: Normalized[] = Array.isArray(j) ? j : j?.flights ?? j?.records ?? j?.rows ?? [];
  const out: Flight[] = [];
  for (const n of rows) {
    if (!n?.flight) continue;
    const f = toFlight({ ...n.flight, oprId: n.flight.oprId ?? n.oprId, flightNid: n.flight.flightNid ?? n.flightNid!, registration: n.flight.registration ?? n.registration, acftTypeIcao: n.flight.acftTypeIcao ?? n.acftTypeIcao ?? n.acftType, operatorName: n.flight.operatorName ?? n.operatorName });
    if (f) out.push(f);
  }
  return out;
}

export function useAllFlights() {
  const [flights, setFlights] = useState<Flight[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const load = useCallback(async () => {
    try { const f = await fetchAllFlights(); if (!alive.current) return; setFlights(f); setError(null); }
    catch (e) { if (!alive.current) return; setError(shownText(e, "The wall did not answer.")); }
    finally { if (alive.current) setLoading(false); }
  }, []);
  useEffect(() => { alive.current = true; void load(); const t = setInterval(load, 60_000); return () => { alive.current = false; clearInterval(t); }; }, [load]);
  return { flights, error, loading, reload: load };
}

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "Today", "Tomorrow", "Yesterday" or "Sat 18" for a UTC day. */
export function dayLabel(day: string, today = utcDay(Date.now())) {
  const d = new Date(`${day}T00:00:00Z`), t = new Date(`${today}T00:00:00Z`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 0) return "Today"; if (diff === 1) return "Tomorrow"; if (diff === -1) return "Yesterday";
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
}
export const dayLong = (day: string) => { const d = new Date(`${day}T00:00:00Z`); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

/** Morning · afternoon · evening by the scheduled departure, UTC. */
export function partOfDay(ms: number) {
  const h = new Date(ms).getUTCHours();
  return h < 12 ? "MORNING" : h < 18 ? "AFTERNOON" : "EVENING";
}

/** Case-insensitive match on callsign, registration, either airport or the trip number. */
export function matches(f: Flight, q: string) {
  const s = q.trim().toUpperCase();
  if (!s) return true;
  return [f.callsign, f.registration, f.adep, f.ades, f.raw.tripNo ?? ""].some((v) => String(v).toUpperCase().includes(s));
}
