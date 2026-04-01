import asecnaDb from "@/data/asecna-airports.json";

export type AsecnaAirport = {
  icao: string;
  countryCode: string;
  countryName: string;
  sourceType: "ASECNA_DYNAMIC";
  dynamicUpdated: true;
  webAipUrl: string;
  ad2HtmlUrl?: string;
  name?: string;
  lat?: number | null;
  lon?: number | null;
};

export type AsecnaCountry = {
  code: string;
  name: string;
  iso2: string | null;
  sourceType: "ASECNA_DYNAMIC";
  dynamicUpdated: true;
  webAipUrl: string;
  menuDirUrl: string;
  gen12: { anchor: string; href: string; label: string; htmlUrl?: string } | null;
  airports: AsecnaAirport[];
};

type AsecnaDb = {
  source: string;
  generatedAt: string;
  menuBasename: string;
  menuUrl: string;
  countries: AsecnaCountry[];
};

function normalizeCountry(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .trim()
    .toLowerCase();
}

const db = asecnaDb as AsecnaDb;
const asecnaCountries = Array.isArray(db.countries) ? db.countries : [];
const countrySet = new Set(asecnaCountries.map((c) => normalizeCountry(c.name)));
const airportMap = new Map<string, AsecnaAirport>();
for (const country of asecnaCountries) {
  for (const airport of country.airports ?? []) {
    const icao = String(airport.icao || "").toUpperCase();
    if (!icao) continue;
    airportMap.set(icao, airport);
  }
}

export function getAsecnaData(): AsecnaDb {
  return db;
}

export function getAsecnaAirportsSet(): Set<string> {
  return new Set(airportMap.keys());
}

export function getAsecnaAirportByIcao(icao: string): AsecnaAirport | null {
  return airportMap.get(String(icao || "").toUpperCase()) ?? null;
}

export function isAsecnaAirportIcao(icao: string): boolean {
  return airportMap.has(String(icao || "").toUpperCase());
}

export function isAsecnaCountry(country: string): boolean {
  return countrySet.has(normalizeCountry(country));
}

