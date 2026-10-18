"use client";

// The airport page's data on a phone: the portal's own routes (search, NOTAMs, weather, the AIP copy), the wall's
// NOTAM keyword groups for the categories (the same as the desktop's NOTAM card), and the wall's flights for "on
// today's flights" and the flight's window.
import { ShownError, apiErrorText, shownText } from "@/lib/error-text";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_NOTAM_GROUPS, compileNotamGroups, formatNotamTime, matchNotamText, parseNotamTime } from "@/digital-wall/lib/notam-rules.mjs";
import { parseOpmetBullets } from "@/lib/format-opmet-weather";
import { decodeMetar, tafPeriods, type Decoded } from "./metar";

export type Airport = { icao: string; name: string; country: string; iata?: string | null };
export type Notam = { location: string; number: string; class: string; startDateUtc: string; endDateUtc: string; condition: string };
type Group = { group: string; color: string; terms: string[]; patterns: string[] };

/** The wall's NOTAM categories, by position, as the portal's tokens (the desktop's NOTAM card uses the same five). */
export const NOTAM_LOOK = [
  { dot: "var(--cw-danger)", bg: "var(--cw-danger-tint)", fg: "var(--cw-danger-text)" },
  { dot: "var(--cw-orange)", bg: "var(--cw-orange-tint)", fg: "var(--cw-orange-text)" },
  { dot: "var(--cw-success)", bg: "var(--cw-success-tint)", fg: "var(--cw-success-text)" },
  { dot: "var(--cw-primary)", bg: "var(--cw-primary-tint)", fg: "var(--cw-text-link)" },
  { dot: "var(--cw-neutral)", bg: "var(--cw-neutral-tint)", fg: "var(--cw-neutral-text)" },
];
export const SHORT: Record<string, string> = { "Closure / prohibition": "Closure", "Restriction / conditional": "Restriction", "Runway / taxiway / infra": "Runway / infra", "Other / info": "Info" };

export function useWallGroups(): Group[] {
  const [groups, setGroups] = useState<Group[]>(DEFAULT_NOTAM_GROUPS as Group[]);
  useEffect(() => {
    fetch("/digital-wall/api/alerts/rules", { cache: "no-store", credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then((d) => { const g = d?.rules?.notamGroups; if (Array.isArray(g) && g.length) setGroups(g); }).catch(() => {});
  }, []);
  return groups;
}

export function categorise(notams: Notam[], groups: Group[]) {
  const compiled = compileNotamGroups(groups);
  const fallback = groups.length - 1;
  return notams.map((n, i) => {
    const hit = matchNotamText(`${n.number ?? ""} ${n.condition ?? ""}`, compiled)[0];
    const cat = hit ? Math.max(0, groups.findIndex((g) => g.group === hit.group)) : fallback;
    return { n, i, cat, catName: SHORT[groups[cat]?.group] ?? groups[cat]?.group ?? "Info", look: NOTAM_LOOK[Math.min(cat, NOTAM_LOOK.length - 1)] };
  }).sort((a, b) => a.cat - b.cat || a.i - b.i);
}

export const notamWhen = (raw: string) => { const p = parseNotamTime(raw); return p == null ? (raw || "—") : formatNotamTime(p); };
export const notamMs = (raw: string): number | null => { const p = parseNotamTime(raw) as unknown; if (p == null) return null; const t = p instanceof Date ? p.getTime() : typeof p === "number" ? p : Date.parse(String(p)); return Number.isFinite(t) ? t : null; };
/** Active at some point inside [fromMs, toMs]: starts before the end and (if it ends) ends after the start. */
export function activeDuring(n: Notam, fromMs: number, toMs: number) {
  const s = notamMs(n.startDateUtc), e = notamMs(n.endDateUtc);
  if (s !== null && s > toMs) return false;
  if (e !== null && e < fromMs) return false;
  return true;
}
export const cleanCondition = (c: string) => c.split("\n").filter((l) => !/^\|#\d+\|[-\s]+/.test(l) && !/^[A-Z]\d+\/\d+\s+NOTAM[A-Z]?\s/.test(l)).join("\n").trim();

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new ShownError(apiErrorText(j, `The portal answered ${r.status}.`));
  return j as T;
}

export const searchAirports = (q: string) => getJson<{ results: Airport[] }>(`/api/search?q=${encodeURIComponent(q)}`).then((d) => d.results ?? []);

export function useNotams(icao: string) {
  const [notams, setNotams] = useState<Notam[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (sync = false) => {
    setLoading(true); setError(null);
    try { const d = await getJson<{ notams: Notam[]; updatedAt: string | null }>(`/api/notams?icao=${icao}${sync ? "&sync=1" : ""}`); setNotams(d.notams ?? []); setUpdatedAt(d.updatedAt ?? null); }
    catch (e) { setError(shownText(e, "The NOTAM source did not answer.")); }
    finally { setLoading(false); }
  }, [icao]);
  useEffect(() => { void load(false); }, [load]);
  return { notams, updatedAt, error, loading, reload: () => load(true) };
}

export type Weather = { metar: string | null; taf: string | null; decoded: Decoded | null; periods: ReturnType<typeof tafPeriods>; updatedAt: string | null };
export function useWeather(icao: string) {
  const [wx, setWx] = useState<Weather | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (sync = false) => {
    setLoading(true); setError(null);
    try {
      const d = await getJson<{ weather: string; updatedAt: string | null }>(`/api/weather?icao=${icao}${sync ? "&sync=1" : ""}`);
      const { bullets } = parseOpmetBullets(d.weather || "");
      const metar = bullets.find((b) => b.kind.toUpperCase() === "METAR")?.body ?? null;
      const taf = bullets.find((b) => b.kind.toUpperCase() === "TAF")?.body ?? null;
      setWx({ metar, taf, decoded: metar ? decodeMetar(metar) : null, periods: taf ? tafPeriods(taf) : [], updatedAt: d.updatedAt ?? null });
    } catch (e) { setError(shownText(e, "The weather source did not answer.")); }
    finally { setLoading(false); }
  }, [icao]);
  useEffect(() => { void load(false); }, [load]);
  return { wx, error, loading, reload: () => load(true) };
}

export type AipCopy = { cached: boolean; source: string; pdfPath: string; filesPath: string | null; copyFetchedAt: string | null; revision?: { airac?: string | null; effectiveDate?: string | null } | null };
export function useAipCopy(icao: string) {
  const [copy, setCopy] = useState<AipCopy | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getJson<AipCopy>(`/api/aip/resolve?icao=${icao}`).then(setCopy).catch((e) => setError(shownText(e, "Could not find the document."))); }, [icao]);
  return { copy, error };
}

export const clockOf = (iso?: string | null) => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dayOf = (iso?: string | null) => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const WX_LOOK: Record<string, { bg: string; fg: string; dot: string }> = {
  VFR: { bg: "var(--cw-success-tint)", fg: "var(--cw-success-text)", dot: "var(--cw-success)" },
  MVFR: { bg: "var(--cw-info-tint)", fg: "var(--cw-info-text)", dot: "var(--cw-info)" },
  IFR: { bg: "var(--cw-danger-tint)", fg: "var(--cw-danger-text)", dot: "var(--cw-danger)" },
  LIFR: { bg: "var(--ca-sens-tint)", fg: "var(--ca-sens-text)", dot: "var(--ca-sens)" },
};
