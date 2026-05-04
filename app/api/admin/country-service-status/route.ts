import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listRunningDebugCountries } from "@/lib/debug-runner";
import {
  loadCountryServiceStatusMap,
  listKnownCountriesFromSupabase,
  upsertCountryServiceStatus,
} from "@/lib/country-service-status-store";
import {
  COUNTRY_SERVICE_STATES,
  type CountryServiceState,
  type CountryServiceSummaryResponse,
} from "@/lib/country-service-status-shared";

function isCountryServiceState(value: string): value is CountryServiceState {
  return COUNTRY_SERVICE_STATES.includes(value as CountryServiceState);
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const [statusMap, knownCountries] = await Promise.all([
    loadCountryServiceStatusMap(),
    listKnownCountriesFromSupabase(),
  ]);
  const running = listRunningDebugCountries();

  const countries = new Set<string>(knownCountries);
  for (const country of statusMap.keys()) countries.add(country);
  for (const country of running.countries) countries.add(country);

  const rows = [...countries]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((country) => {
      const stored = statusMap.get(country);
      return {
        country,
        state: stored?.state || "not_checked",
        note: stored?.note || "",
        updatedAt: stored?.updatedAt || null,
        updatedBy: stored?.updatedBy || null,
        runningDebug: running.hasGlobalRunningDebug || running.countries.includes(country),
      };
    });

  const payload: CountryServiceSummaryResponse = {
    countries: rows,
    hasGlobalRunningDebug: running.hasGlobalRunningDebug,
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as {
    country?: string;
    state?: string;
    note?: string;
  };

  const country = String(body.country || "").trim();
  const state = String(body.state || "").trim();
  if (!country) return NextResponse.json({ error: "Country is required" }, { status: 400 });
  if (!isCountryServiceState(state)) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  const row = await upsertCountryServiceStatus({
    country,
    state,
    note: String(body.note || ""),
    updatedBy: auth.user.email || auth.user.id,
  });
  return NextResponse.json({ ok: true, row });
}
