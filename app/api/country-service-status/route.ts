import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { listRunningDebugCountries } from "@/lib/debug-runner";
import {
  loadCountryServiceStatusMap,
  listKnownCountriesFromSupabase,
} from "@/lib/country-service-status-store";
import type { CountryServiceSummaryResponse } from "@/lib/country-service-status-shared";

export async function GET() {
  const auth = await requireAuthenticatedUser();
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
