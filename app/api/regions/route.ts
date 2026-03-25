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
    regionByName.set(r.region, [...r.countries]);
  }

  // Ensure Russia is visible in portal menu even though it is not part of EAD generated countries.
  const europeCountries = regionByName.get("Europe") ?? [];
  if (!europeCountries.includes("Russia")) {
    europeCountries.push("Russia");
    regionByName.set("Europe", europeCountries);
  }

  for (const eadLabel of eadCountryKeys) {
    const region = resolveRegionForEadLabel(eadLabel, regions);
    const list = regionByName.get(region);
    if (list && !list.includes(eadLabel)) list.push(eadLabel);
    else if (!list) regionByName.set(region, [eadLabel]);
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
