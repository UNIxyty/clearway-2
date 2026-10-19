"use client";

// The Tier 2 pages' data on a phone: one hook over the portal's own routes (`/api/...`), the agent's (`/agent/api/...`)
// and the wall's (`/digital-wall/api/...`), with the three states every page shows and a poll that keeps the last good
// answer through a failure. Shown errors go through lib/error-text: our own API's `error` is written for a person;
// anything else shows the page's own fallback.
import { useCallback, useEffect, useRef, useState } from "react";
import { ShownError, apiErrorText, shownText } from "@/lib/error-text";
import { AGENT_BASE } from "@/components/agent/types";

export const WALL_BASE = "/digital-wall/api";

export async function getJson<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init, ...(init?.json !== undefined ? { method: init.method ?? "POST", headers: { "content-type": "application/json", ...(init.headers ?? {}) }, body: JSON.stringify(init.json) } : {}) });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.ok === false) { const e = new ApiFailure(apiErrorText(j, j?.message && typeof j.message === "string" ? j.message : `The server answered ${r.status}.`)); e.status = r.status; throw e; }
  return j as T;
}
export class ApiFailure extends ShownError { status = 0; }
export const agentUrl = (path: string) => `${AGENT_BASE}/api${path}`;
export const wallUrl = (path: string) => `${WALL_BASE}${path}`;

export type Resource<T> = { data: T | null; loading: boolean; error: string | null; status: number; reload: () => Promise<void>; setData: (fn: (d: T | null) => T | null) => void };

/** Loads once (and every `poll` ms, and when the tab comes back); keeps the last good `data` through a failure. */
export function useResource<T>(url: string | null, { poll, fallback = "The server did not answer." }: { poll?: number; fallback?: string } = {}): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(0);
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!url) { setLoading(false); return; }
    try { const d = await getJson<T>(url); if (!alive.current) return; setData(d); setError(null); setStatus(200); }
    catch (e) { if (!alive.current) return; setError(shownText(e, fallback)); setStatus(e instanceof ApiFailure ? e.status : 0); }
    finally { if (alive.current) setLoading(false); }
  }, [url, fallback]);
  useEffect(() => {
    alive.current = true; setLoading(true); void load();
    const t = poll ? setInterval(load, poll) : null;
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive.current = false; if (t) clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [load, poll]);
  return { data, loading, error, status, reload: load, setData: (fn) => setData((d) => fn(d)) };
}

/** A write with its own busy and failure text; `run` resolves true when it worked. */
export function useAction(fallback = "That did not go through.") {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const run = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setFailed(null);
    try { await fn(); return true; } catch (e) { setFailed(shownText(e, fallback)); return false; } finally { setBusy(null); }
  }, [fallback]);
  return { busy, failed, run, clear: () => setFailed(null) };
}

// ── time, for rows ──
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n: number) => String(n).padStart(2, "0");
export const hmZ = (iso?: string | null) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` : "—"; };
export const dayShort = (iso?: string | null) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? `${p2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}` : "—"; };
export const dayTime = (iso?: string | null) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? `${p2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${hmZ(iso)} UTC` : "—"; };
export function ago(iso?: string | null, now = Date.now()) {
  const t = iso ? new Date(iso).getTime() : NaN; if (Number.isNaN(t)) return "—";
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 1) return "now"; if (m < 60) return `${m} min`; const h = Math.round(m / 60); if (h < 24) return `${h} h`; const d = Math.round(h / 24); return d === 1 ? "yesterday" : `${d} d`;
}
/** Today · Yesterday · a date, for grouping rows by their UTC day. */
export function dayHeading(iso?: string | null, now = new Date()) {
  const d = iso ? new Date(iso) : null; if (!d || Number.isNaN(d.getTime())) return "UNDATED";
  const day = (x: Date) => Math.floor(x.getTime() / 86_400_000);
  const diff = day(now) - day(d);
  return diff === 0 ? "TODAY" : diff === 1 ? "YESTERDAY" : diff < 7 ? "THIS WEEK" : dayShort(iso).toUpperCase();
}
/** Group rows by a heading, in first-seen order. */
export function groupBy<T>(rows: T[], key: (r: T) => string): Array<{ h: string; rows: T[] }> {
  const out: Array<{ h: string; rows: T[] }> = []; const idx = new Map<string, number>();
  for (const r of rows) { const h = key(r); let i = idx.get(h); if (i === undefined) { i = out.length; idx.set(h, i); out.push({ h, rows: [] }); } out[i].rows.push(r); }
  return out;
}
export const matches = (q: string, ...fields: Array<string | null | undefined>) => { const s = q.trim().toLowerCase(); return !s || fields.some((f) => (f ?? "").toLowerCase().includes(s)); };
