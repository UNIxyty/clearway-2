"use client";

// The phone wall's data: the wall backend's API on the same origin (/digital-wall/api/…, the session cookie), the
// same payloads the ops-room display reads, and the same facts from them (shared/wall-facts.mjs). The display is
// the authority; this file never derives a status or a time on its own.
import { ShownError, apiErrorText, shownText } from "@/lib/error-text";
import { useCallback, useEffect, useRef, useState } from "react";
import { CHECK_KEYS, flightTimes, openChecksOf, statusFromFlight, isEstimatedState, mvtOverdue } from "@/shared/wall-facts.mjs";

const WALL = "/digital-wall/api";

export type Limitation = { id?: string; title?: string; description?: string; type: "LIM" | "CAA" | "IMP" | "NTM" | "WX" | string; source?: "custom" | "caa" | "important" | "alert" | string; icao?: string | null; caa?: { authorityName?: string; country?: string } | null };
export type Check = { at: string; by: string; cycle?: string };
export type RawFlight = {
  flightNid: number | string; flightNo?: string; oprId?: string; tripNo?: string; registration?: string; acftTypeIcao?: string;
  adep?: { icao?: string; name?: string; city?: string }; ades?: { icao?: string; name?: string; city?: string };
  startTimeUTC: string; endTimeUTC: string; etd?: string | null; eta?: string | null; atd?: string | null; ata?: string | null;
  takeOffUTC?: string | null; landingUTC?: string | null; ctotUTC?: string | null; eetMin?: number | null;
  movementState?: string; movementStateEstimated?: boolean; isCnl?: boolean; isConfirmed?: boolean; delayMin?: number;
  limitations?: Limitation[]; limitationIds?: string[]; wxDep?: string | null; wxArr?: string | null; checks?: Partial<Record<CheckKey, Check>>;
  operatorName?: string; passengerCount?: number | null; crewCount?: number | null;
};
export type CheckKey = "imp" | "ntm" | "wx" | "caa" | "lim";
/** What flightTimes returns (shared/wall-facts.mjs is plain JS; this names its shape). */
export type Times = {
  stdMs: number; staMs: number; depKind: string; arrKind: string; depMs: number; arrMs: number;
  depHm: string | null; arrHm: string | null; stdHm: string | null; staHm: string | null; atdHm: string | null; ataHm: string | null;
  eetMin: number | null; arrBasis: string; depDeltaMin: number; arrDeltaMin: number; depDelayMin: number; arrDelayMin: number;
  startUtcMs: number; delayedStartUtcMs: number; scheduledEndUtcMs: number; endUtcMs: number;
};

/** One flight with its facts: the shared rules applied to the backend's decorated flight. */
export type Flight = {
  id: string; oprId: string; flightNid: string; callsign: string; registration: string; type: string | null; operator: string;
  adep: string; ades: string; adepName: string; adesName: string;
  status: string; estimated: boolean; raw: RawFlight; t: Times; open: CheckKey[];
  /** The time that matters on the board, with its label (ETD · CTOT · STD · ETA · landed). */
  matters: { hm: string; label: string; ms: number; delayed: boolean };
};

export function toFlight(raw: RawFlight, group?: { oprId?: string; operatorName?: string; registration?: string; acftTypeIcao?: string }): Flight | null {
  const t = flightTimes(raw) as Times | null;
  if (!t) return null;
  const status = statusFromFlight(raw) as string;
  const oprId = String(raw.oprId ?? group?.oprId ?? "opr");
  const flightNid = String(raw.flightNid);
  const landed = status === "arrived";
  const flying = status === "airborne";
  const matters = landed
    ? { hm: t.arrHm ?? "--:--", label: t.arrKind === "LDG" ? "landed" : "ETA", ms: t.arrMs, delayed: false }
    : flying
      ? { hm: t.arrHm ?? "--:--", label: "ETA", ms: t.arrMs, delayed: false }
      : { hm: t.depHm ?? "--:--", label: t.depKind === "STD" ? "STD" : `${t.depKind}${t.depDeltaMin ? ` · was ${t.stdHm}` : ""}`, ms: t.depMs, delayed: status === "delayed" };
  return {
    id: `${oprId}:${flightNid}`, oprId, flightNid,
    callsign: raw.flightNo || "UNKNOWN", registration: raw.registration || group?.registration || "", type: raw.acftTypeIcao || group?.acftTypeIcao || null,
    operator: raw.operatorName || group?.operatorName || "",
    adep: raw.adep?.icao || "UNK", ades: raw.ades?.icao || "UNK", adepName: raw.adep?.name || raw.adep?.city || "", adesName: raw.ades?.name || raw.ades?.city || "",
    status, estimated: isEstimatedState(status, raw.movementStateEstimated), raw, t, open: openChecksOf(raw) as CheckKey[], matters,
  };
}

export const isOverdue = (f: Flight, nowMs: number, thresholdMin = 15) => mvtOverdue({ ...f.t, status: f.status, isCnl: f.raw.isCnl }, nowMs, thresholdMin);
export const CHECKS: CheckKey[] = CHECK_KEYS as CheckKey[];

/** The wall's own `error` text, which is written for a person, with the status and the permission it named. */
export class WallError extends ShownError { status?: number; permission?: string }

async function wall<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const r = await fetch(`${WALL}${path}`, { credentials: "include", cache: "no-store", ...init, ...(init?.json !== undefined ? { method: init.method ?? "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(init.json) } : {}) });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.ok === false) { const e = new WallError(apiErrorText(j, `The wall answered ${r.status}.`)); e.status = r.status; e.permission = j?.permission; throw e; }
  return j as T;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** The board as the display fetches it: yesterday 00:00Z to +4 days; the server applies the wall's own window. */
export async function fetchBoard(): Promise<Flight[]> {
  const now = new Date();
  const from = new Date(now.getTime() - 86_400_000), to = new Date(now.getTime() + 4 * 86_400_000);
  const d = await wall<{ aircraft?: Array<{ oprId?: string; operatorName?: string; registration?: string; acftTypeIcao?: string; flights?: RawFlight[] }> }>(`/timeline/flights?allOperators=true&refresh=false&from=${isoDay(from)}T00:00:00Z&to=${isoDay(to)}T00:00:00Z`);
  const out: Flight[] = [];
  for (const g of d.aircraft ?? []) for (const raw of g.flights ?? []) { const f = toFlight(raw, g); if (f) out.push(f); }
  return out;
}

export type NotamAirport = { icao: string; name?: string; flights?: string[]; error?: string | null; checked?: { by: string; at: string } | null; all?: NotamItem[]; filtered?: NotamItem[] };
export type NotamItem = { number?: string; class?: string; condition?: string; startDateUtc?: string; endDateUtc?: string; matches?: Array<{ group?: string }>; inWindow?: boolean; status?: string };
export type NotamState = { day?: string; sign?: "NONE" | "CHECK" | "CHECKED"; done?: number; total?: number; ranAt?: string | null; airports?: NotamAirport[] };
export const fetchNotamToday = () => wall<NotamState>("/notam-check/today");
export const ackNotamAirport = (icao: string) => wall<NotamState>("/notam-check/ack", { json: { icao } });
export const postFlightCheck = (oprId: string, flightNid: string, types: CheckKey[] | "all", checked = true) => wall<{ checks?: Partial<Record<CheckKey, Check>> }>("/flight-checks", { json: { oprId, flightNid, types, checked } });

export type WallUser = { name?: string; email?: string; initials?: string; can?: Record<string, boolean> | string[] };
export async function fetchWallUser(): Promise<WallUser | null> {
  try { const d = await wall<{ user?: WallUser }>("/user"); return d.user ?? null; } catch { return null; }
}
export const userCan = (u: WallUser | null, action: string) => Array.isArray(u?.can) ? u!.can.includes(action) : Boolean((u?.can as Record<string, boolean> | undefined)?.[action]);

/** Polls the wall (every 30 s, and when the tab comes back); keeps the last good board through a failure. */
export function useWallBoard() {
  const [flights, setFlights] = useState<Flight[] | null>(null);
  const [at, setAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const load = useCallback(async () => {
    try { const f = await fetchBoard(); if (!alive.current) return; setFlights(f); setAt(new Date()); setError(null); }
    catch (e) { if (!alive.current) return; setError(shownText(e, "The wall did not answer.")); }
    finally { if (alive.current) setLoading(false); }
  }, []);
  useEffect(() => {
    alive.current = true; void load();
    const t = setInterval(load, 30_000);
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive.current = false; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);
  return { flights, at, error, loading, reload: load };
}

export function useNotamToday() {
  const [state, setState] = useState<NotamState | null>(null);
  const load = useCallback(() => fetchNotamToday().then(setState).catch(() => {}), []);
  useEffect(() => { void load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);
  return { notam: state, setNotam: setState, reload: load };
}

export function useWallUser() {
  const [user, setUser] = useState<WallUser | null | undefined>(undefined);
  useEffect(() => { fetchWallUser().then(setUser); }, []);
  return user;
}

/** "DS · 14:20Z" for a check's `by` (an email or a name) and `at`. */
export const checkedBy = (c?: Check | null) => {
  if (!c) return "";
  const who = String(c.by || "").split("@")[0];
  const d = new Date(c.at); const hm = Number.isFinite(d.getTime()) ? `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}Z` : "";
  return [who, hm].filter(Boolean).join(" · ");
};
