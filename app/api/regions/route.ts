import { NextResponse } from "next/server";
import regionsData from "@/data/regions.json";
import eadCountryIcaos from "@/lib/ead-country-icaos.generated.json";
import dynamicPackages from "@/data/dynamic-packages.json";

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

const SCRAPER_COUNTRY_TO_REGION_FALLBACK: Record<string, string> = {
  "bahrain": "Asia",
  "belarus": "Europe",
  "bhutan": "Asia",
  "bosnia": "Europe",
  "cabo verde": "Africa",
  "chile": "South America",
  "costa rica": "North America & Caribbean",
  "cuba": "North America & Caribbean",
  "ecuador": "South America",
  "el salvador": "North America & Caribbean",
  "guatemala": "North America & Caribbean",
  "honduras": "North America & Caribbean",
  "hong kong": "Asia",
  "india": "Asia",
  "israel": "Asia",
  "japan": "Asia",
  "korea": "Asia",
  "republic of korea": "Asia",
  "kosovo": "Europe",
  "kuwait": "Asia",
  "libya": "Africa",
  "malaysia": "Asia",
  "maldives": "Asia",
  "mongolia": "Asia",
  "myanmar": "Asia",
  "nepal": "Asia",
  "north macedonia": "Europe",
  "pakistan": "Asia",
  "panama": "North America & Caribbean",
  "qatar": "Asia",
  "rwanda": "Africa",
  "saudi arabia": "Asia",
  "somalia": "Africa",
  "sri lanka": "Asia",
  "taiwan": "Asia",
  "tajikistan": "Asia",
  "thailand": "Asia",
  "turkmenistan": "Asia",
  "united arab emirates": "Asia",
  "uae": "Asia",
  "uzbekistan": "Asia",
  "venezuela": "South America",
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

function resolveRegionForCountry(countryLabel: string, regions: RegionEntry[]): string {
  const baseName = baseCountryName(countryLabel).toLowerCase();
  const fallback = SCRAPER_COUNTRY_TO_REGION_FALLBACK[baseName];
  if (fallback) return fallback;
  for (const region of regions) {
    const match = region.countries.find((country) => country.trim().toLowerCase() === baseName);
    if (match) return region.region;
  }
  return "Asia";
}

export async function GET() {
  const regions = regionsData as RegionEntry[];
  const eadCountries = getEadCountryIcaos();
  const eadCountryKeys = Object.keys(eadCountries);
  const scraperCountries = Array.from(
    new Set(
      ((dynamicPackages as { countries?: Array<{ countryName?: string }> }).countries || [])
        .map((c) => String(c.countryName || "").trim())
        .filter(Boolean),
    ),
  );

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

  for (const country of scraperCountries) {
    const region = resolveRegionForCountry(country, regions);
    const list = regionByName.get(region);
    if (list) upsertCountryLabel(list, country);
    else regionByName.set(region, [country]);
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
