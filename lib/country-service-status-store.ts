import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import {
  COUNTRY_SERVICE_STATES,
  type CountryServiceState,
  type CountryServiceStatusRow,
} from "@/lib/country-service-status-shared";

function normalizeCountry(country: string | null | undefined): string {
  return String(country || "").trim();
}

function byCountry(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export async function loadCountryServiceStatusMap(): Promise<Map<string, CountryServiceStatusRow>> {
  const service = createSupabaseServiceRoleClient();
  if (!service) return new Map();
  const { data, error } = await service
    .from("country_service_statuses")
    .select("country,state,note,updated_at,updated_by");
  if (error || !data) return new Map();

  const out = new Map<string, CountryServiceStatusRow>();
  for (const row of data as Array<{
    country?: string | null;
    state?: string | null;
    note?: string | null;
    updated_at?: string | null;
    updated_by?: string | null;
  }>) {
    const country = normalizeCountry(row.country);
    if (!country) continue;
    const stateRaw = String(row.state || "");
    const state = COUNTRY_SERVICE_STATES.includes(stateRaw as CountryServiceState)
      ? (stateRaw as CountryServiceState)
      : "not_checked";
    out.set(country, {
      country,
      state,
      note: String(row.note || ""),
      updatedAt: row.updated_at || null,
      updatedBy: row.updated_by || null,
    });
  }
  return out;
}

export async function saveCountryServiceStatusMap(map: Map<string, CountryServiceStatusRow>): Promise<void> {
  const service = createSupabaseServiceRoleClient();
  if (!service) return;
  const rows = [...map.values()]
    .map((row) => ({
      country: normalizeCountry(row.country),
      state: row.state,
      note: String(row.note || ""),
      updated_at: row.updatedAt || new Date().toISOString(),
      updated_by: row.updatedBy || null,
    }))
    .filter((row) => row.country)
    .sort((a, b) => byCountry(a.country, b.country));

  if (rows.length === 0) return;
  await service.from("country_service_statuses").upsert(rows, { onConflict: "country" });
}

export async function upsertCountryServiceStatus(input: {
  country: string;
  state: CountryServiceState;
  note?: string;
  updatedBy?: string | null;
}): Promise<CountryServiceStatusRow> {
  const country = normalizeCountry(input.country);
  if (!country) throw new Error("Country is required");
  const service = createSupabaseServiceRoleClient();
  if (!service) throw new Error("Missing Supabase service role configuration");
  const row: CountryServiceStatusRow = {
    country,
    state: input.state,
    note: String(input.note || ""),
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy || null,
  };
  const { error } = await service.from("country_service_statuses").upsert(
    {
      country: row.country,
      state: row.state,
      note: row.note,
      updated_at: row.updatedAt,
      updated_by: row.updatedBy,
    },
    { onConflict: "country" }
  );
  if (error) throw new Error(error.message);
  return row;
}

export async function listKnownCountriesFromSupabase(): Promise<string[]> {
  const service = createSupabaseServiceRoleClient();
  if (!service) return [];
  const PAGE_SIZE = 1000;
  const MAX_ROWS = 20_000;
  const countries = new Set<string>();
  let offset = 0;

  while (offset < MAX_ROWS) {
    const { data, error } = await service
      .from("airports")
      .select("country")
      .eq("visible", true)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    for (const row of data as Array<{ country?: string | null }>) {
      const country = normalizeCountry(String(row.country || ""));
      if (country) countries.add(country);
    }
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return [...countries].sort(byCountry);
}
