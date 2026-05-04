import { readJsonFromStorage, writeJsonToStorage } from "@/lib/aip-storage";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import {
  type CountryServiceState,
  type CountryServiceStatusRow,
} from "@/lib/country-service-status-shared";

const STORAGE_KEY = "admin/country-service-statuses.json";

type StoredStatuses = {
  rows: CountryServiceStatusRow[];
  savedAt: string;
};

function normalizeCountry(country: string): string {
  return String(country || "").trim();
}

function byCountry(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export async function loadCountryServiceStatusMap(): Promise<Map<string, CountryServiceStatusRow>> {
  const payload = await readJsonFromStorage<StoredStatuses>(STORAGE_KEY);
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const out = new Map<string, CountryServiceStatusRow>();
  for (const row of rows) {
    const country = normalizeCountry(row.country);
    if (!country) continue;
    out.set(country, {
      country,
      state: row.state,
      note: String(row.note || ""),
      updatedAt: row.updatedAt || null,
      updatedBy: row.updatedBy || null,
    });
  }
  return out;
}

export async function saveCountryServiceStatusMap(map: Map<string, CountryServiceStatusRow>): Promise<void> {
  const rows = [...map.values()]
    .map((row) => ({
      country: normalizeCountry(row.country),
      state: row.state,
      note: String(row.note || ""),
      updatedAt: row.updatedAt || null,
      updatedBy: row.updatedBy || null,
    }))
    .filter((row) => row.country)
    .sort((a, b) => byCountry(a.country, b.country));

  await writeJsonToStorage(STORAGE_KEY, {
    rows,
    savedAt: new Date().toISOString(),
  } satisfies StoredStatuses);
}

export async function upsertCountryServiceStatus(input: {
  country: string;
  state: CountryServiceState;
  note?: string;
  updatedBy?: string | null;
}): Promise<CountryServiceStatusRow> {
  const country = normalizeCountry(input.country);
  if (!country) throw new Error("Country is required");
  const map = await loadCountryServiceStatusMap();
  const row: CountryServiceStatusRow = {
    country,
    state: input.state,
    note: String(input.note || ""),
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy || null,
  };
  map.set(country, row);
  await saveCountryServiceStatusMap(map);
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
