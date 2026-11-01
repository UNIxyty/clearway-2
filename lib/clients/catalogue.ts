// What a client's scope may name (2026-11-02): only things that exist. Operators from leon_operators (the operators the
// wall syncs); aircraft registrations and trip numbers from the Digital Wall's own flights, read as the admin asking. The
// Clients page suggests from this, and saving or approving refuses a NEW scope entry that is not in it — ops cannot
// grant scope over an operator that does not exist. Cached for a minute; a part that cannot be read says so (wallOk false)
// and new entries of its kind are refused rather than let through unchecked.
import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliseScope } from "@/lib/clients/switches.mjs";

export type CatalogueOperator = { oprId: string; name: string };
export type CatalogueAircraft = { registration: string; oprId: string; operatorName: string; type: string };
export type CatalogueTrip = { trip: string; oprId: string; operatorName: string; registrations: string[]; first: string; last: string };
export type Catalogue = { operators: CatalogueOperator[]; registrations: CatalogueAircraft[]; trips: CatalogueTrip[]; operatorsOk: boolean; wallOk: boolean; at: number };

const TTL_MS = 60_000;
let cache: Catalogue | null = null;
const day = (n: number) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
const wallBase = () => (process.env.DIGITAL_WALL_INTERNAL_URL || "http://digital-wall-backend:5174").replace(/\/+$/, "");
const bareReg = (r: string) => String(r ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function scopeCatalogue(service: SupabaseClient, accessToken: string | null, { fresh = false } = {}): Promise<Catalogue> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache;
  let operators: CatalogueOperator[] = []; let operatorsOk = true;
  try {
    const { data, error } = await service.from("leon_operators").select("opr_id,name,is_active").eq("is_active", true);
    if (error) throw error;
    operators = (data ?? []).map((o: { opr_id: string; name: string | null }) => ({ oprId: String(o.opr_id), name: String(o.name ?? o.opr_id) }));
  } catch (e) { operatorsOk = false; console.error("[clients-catalogue] operators not read", e); }
  let registrations: CatalogueAircraft[] = []; let trips: CatalogueTrip[] = []; let wallOk = true;
  try {
    // the wall's timeline for the cached window around today: the fleet (every aircraft it shows) and the trips flown
    const url = `${wallBase()}/api/timeline/flights?allOperators=true&from=${day(-14)}&to=${day(60)}`;
    const res = await fetch(url, { headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {}, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`wall ${res.status}`);
    const body = (await res.json()) as { aircraft?: Array<{ registration?: string; oprId?: string; operatorName?: string; acftTypeShortName?: string; acftTypeIcao?: string; flights?: Array<{ tripNo?: string | null; startTimeUTC?: string; oprId?: string }> }> };
    const byTrip = new Map<string, CatalogueTrip>();
    for (const a of body.aircraft ?? []) {
      if (!a.registration) continue;
      registrations.push({ registration: a.registration, oprId: String(a.oprId ?? ""), operatorName: String(a.operatorName ?? a.oprId ?? ""), type: String(a.acftTypeShortName ?? a.acftTypeIcao ?? "") });
      for (const f of a.flights ?? []) {
        const t = String(f.tripNo ?? "").trim(); if (!t) continue;
        const cur = byTrip.get(t) ?? { trip: t, oprId: String(f.oprId ?? a.oprId ?? ""), operatorName: String(a.operatorName ?? ""), registrations: [], first: f.startTimeUTC ?? "", last: f.startTimeUTC ?? "" };
        if (!cur.registrations.includes(a.registration)) cur.registrations.push(a.registration);
        if (f.startTimeUTC && (!cur.first || f.startTimeUTC < cur.first)) cur.first = f.startTimeUTC;
        if (f.startTimeUTC && (!cur.last || f.startTimeUTC > cur.last)) cur.last = f.startTimeUTC;
        byTrip.set(t, cur);
      }
    }
    trips = [...byTrip.values()];
  } catch (e) { wallOk = false; console.error("[clients-catalogue] the wall's flights not read", e instanceof Error ? e.message : e); }
  cache = { operators, registrations, trips, operatorsOk, wallOk, at: Date.now() };
  return cache;
}

/** Problems for scope entries that are new (not in `before`) and do not exist; [] when all are real. */
export function unknownScope(before: unknown, after: unknown, cat: Catalogue): string[] {
  const had = new Set(normaliseScope(before).map((e: { kind: string; value: string }) => `${e.kind}:${e.value}`));
  const problems: string[] = [];
  for (const e of normaliseScope(after) as Array<{ kind: string; value: string }>) {
    if (had.has(`${e.kind}:${e.value}`)) continue;
    if (e.kind === "operator") {
      if (!cat.operatorsOk) problems.push(`Couldn't check that operator ${e.value} exists (the operator list did not load). Nothing was saved; try again.`);
      else if (!cat.operators.some((o) => o.oprId.toLowerCase() === e.value.toLowerCase())) problems.push(`There is no operator ${e.value} in Leon. Pick one from the suggestions.`);
    } else if (e.kind === "registration") {
      if (!cat.wallOk) problems.push(`Couldn't check that aircraft ${e.value} exists (the Digital Wall did not answer). Nothing was saved; try again.`);
      else if (!cat.registrations.some((a) => bareReg(a.registration) === bareReg(e.value))) problems.push(`There is no aircraft ${e.value} in the fleet. Pick one from the suggestions.`);
    } else if (e.kind === "trip") {
      if (!cat.wallOk) problems.push(`Couldn't check that trip ${e.value} exists (the Digital Wall did not answer). Nothing was saved; try again.`);
      else if (!cat.trips.some((t) => t.trip === e.value)) problems.push(`There is no trip ${e.value} among the wall's flights. Pick one from the suggestions.`);
    }
  }
  return problems;
}
