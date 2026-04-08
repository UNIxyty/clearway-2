import { NextResponse } from "next/server";
import regionsData from "@/data/regions.json";
import eadCountryIcaos from "@/lib/ead-country-icaos.generated.json";

export const dynamic = "force-dynamic";

function getEadCountryIcaos(): Record<string, unknown> {
  return eadCountryIcaos as Record<string, unknown>;
}

type RegionEntry = { region: string; countries: string[] };

const EAD_COUNTRY_TO_REGION_FALLBACK: Record<string, string> = {
  "KFOR SECTOR (BK)": "Europe",
  "Faroe Islands (XX)": "Europe",
  "Greenland (BG)": "North America & Caribbean",
  "Jordan (OJ)": "Asia",
  "Kazakhstan (UA)": "Asia",
  "Kyrgyzstan (UC)": "Asia",
  "Philippines (RP)": "Asia",
  "Turkey (LT)": "Europe",
};

function baseCountryName(countryLabel: string): string {
  return countryLabel.replace(/\s*\([A-Z0-9]{2}\)\s*$/, "").trim();
}

function normalizeCountryKey(countryLabel: string): string {
  return baseCountryName(countryLabel).toLowerCase();
}

function isEadCountryLabel(countryLabel: string): boolean {
  return /\([A-Z0-9]{2}\)\s*$/.test(countryLabel);
}

function upsertCountryLabel(list: string[], countryLabel: string): string[] {
  const key = normalizeCountryKey(countryLabel);
  const existingIndex = list.findIndex((entry) => normalizeCountryKey(entry) === key);

  if (existingIndex === -1) {
    list.push(countryLabel);
    return list;
  }

  const existing = list[existingIndex];
  if (existing === countryLabel) return list;

  // Prefer EAD label (e.g. "Austria (LO)") over plain base label ("Austria")
  // so country selection maps directly to generated EAD airport data.
  if (!isEadCountryLabel(existing) && isEadCountryLabel(countryLabel)) {
    list[existingIndex] = countryLabel;
  }
  return list;
}

function resolveRegionForEadLabel(countryLabel: string, regions: RegionEntry[]): string {
  const fallback = EAD_COUNTRY_TO_REGION_FALLBACK[countryLabel];
  if (fallback) return fallback;
  const baseName = baseCountryName(countryLabel).toLowerCase();
  for (const region of regions) {
    const match = region.countries.find((country) => country.trim().toLowerCase() === baseName);
    if (match) return region.region;
  }
  return "Europe";
}

export async function GET() {
  const regions = regionsData as RegionEntry[];
  const eadCountries = getEadCountryIcaos();
  const eadCountryKeys = Object.keys(eadCountries);

  const regionByName = new Map<string, string[]>();
  for (const r of regions) {
    const deduped: string[] = [];
    for (const country of r.countries) {
      upsertCountryLabel(deduped, country);
    }
    regionByName.set(r.region, deduped);
  }

  // Ensure Russia is visible in portal menu even though it is not part of EAD generated countries.
  const europeCountries = regionByName.get("Europe") ?? [];
  upsertCountryLabel(europeCountries, "Russia");
  regionByName.set("Europe", europeCountries);

  for (const eadLabel of eadCountryKeys) {
    const region = resolveRegionForEadLabel(eadLabel, regions);
    const list = regionByName.get(region);
    if (list) upsertCountryLabel(list, eadLabel);
    else regionByName.set(region, [eadLabel]);
  }

  const withEad: RegionEntry[] = [...regions].map((r) => ({
    region: r.region,
    countries: regionByName.get(r.region) ?? r.countries,
  }));

  return NextResponse.json(
    { regions: withEad },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
