import dynamicPackages from "@/data/dynamic-packages.json";
import { getDynamicWebAipUrl } from "@/lib/dynamic-web-aip";

type DynamicCountryPackage = {
  countryName?: string;
  effectiveDate?: string | null;
  webAipUrl?: string | null;
};

function normalizeCountry(v: string): string {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .trim()
    .toLowerCase();
}

const packages = (dynamicPackages as { countries?: DynamicCountryPackage[] }).countries ?? [];

export function getDynamicPackageByCountry(country: string): DynamicCountryPackage | null {
  const key = normalizeCountry(country);
  const row = packages.find((c) => normalizeCountry(String(c.countryName || "")) === key) || null;
  if (!row) return null;
  return {
    ...row,
    webAipUrl: row.webAipUrl || getDynamicWebAipUrl(country) || null,
  };
}

