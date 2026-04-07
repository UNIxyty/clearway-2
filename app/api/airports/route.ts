import { NextRequest, NextResponse } from "next/server";
import aipData from "@/data/aip-data.json";
import usaByState from "@/data/usa-aip-icaos-by-state.json";
import airportCoords from "@/data/airport-coords.json";
import eadCountryIcaos from "@/lib/ead-country-icaos.generated.json";
import rusAirportsDb from "@/data/rus-aip-international-airports.json";
import dynamicAirportsData from "@/data/dynamic-airports.json";
import { formatRussiaAirportName } from "@/lib/russia-airport-name";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { getAsecnaAirportsSet, getAsecnaAirportByIcao, isAsecnaCountry } from "@/lib/asecna-airports";
import { getDynamicWebAipUrl } from "@/lib/dynamic-web-aip";

export const dynamic = "force-dynamic";

/** EAD country → ICAOs with names: from lib/ead-country-icaos.generated.json (written at build by scripts/embed-ead-icaos.mjs). No fetch, no cache issues on Vercel. */
function getEadCountryIcaos(): Record<string, Array<{ icao: string; name: string }>> {
  const data = eadCountryIcaos as Record<string, unknown>;
  const out: Record<string, Array<{ icao: string; name: string }>> = {};
  for (const [key, val] of Object.entries(data)) {
    if (Array.isArray(val)) {
      out[key] = val.map((v) => {
        if (typeof v === 'object' && v !== null && 'icao' in v) {
          return {
            icao: String(v.icao).toUpperCase(),
            name: String((v as any).name || '')
          };
        }
        return { icao: String(v).toUpperCase(), name: '' };
      });
    }
  }
  return out;
}

type AIPCountry = {
  country: string;
  GEN_1_2?: string;
  GEN_1_2_POINT_4?: string;
  airports: Array<{
    "Publication Date"?: string;
    "Airport Code": string;
    "Airport Name": string;
    "AD2.2 Types of Traffic Permitted": string;
    "AD2.2 Remarks": string;
    "AD2.2 AD Operator"?: string;
    "AD2.2 Address"?: string;
    "AD2.2 Telephone"?: string;
    "AD2.2 Telefax"?: string;
    "AD2.2 E-mail"?: string;
    "AD2.2 AFS"?: string;
    "AD2.2 Website"?: string;
    "AD2.3 AD Operator": string;
    "AD 2.3 Customs and Immigration": string;
    "AD2.3 ATS": string;
    "AD2.3 Remarks": string;
    "AD2.6 AD category for fire fighting": string;
    "AD2.12 Runway Number"?: string;
    "AD2.12 Runway Dimensions"?: string;
  }>;
};

export type AIPAirport = {
  country: string;
  gen1_2: string;
  gen1_2_point_4: string;
  icao: string;
  name: string;
  publicationDate: string;
  trafficPermitted: string;
  trafficRemarks: string;
  ad22Operator: string;
  ad22Address: string;
  ad22Telephone: string;
  ad22Telefax: string;
  ad22Email: string;
  ad22Afs: string;
  ad22Website: string;
  operator: string;
  customsImmigration: string;
  ats: string;
  atsRemarks: string;
  fireFighting: string;
  runwayNumber: string;
  runwayDimensions: string;
  lat?: number;
  lon?: number;
  sourceType?: string;
  dynamicUpdated?: boolean;
  webAipUrl?: string;
};

const coordsMap = airportCoords as Record<string, { lat: number; lon: number }>;

type DbAirportRow = {
  country: string | null;
  state: string | null;
  icao: string | null;
  name: string | null;
  lat: number | null;
  lon: number | null;
};

function normalizeCountryLabel(country: string): string {
  return country.replace(/\s*\([A-Z0-9]{2}\)\s*$/, "").trim();
}

function asciiCountry(country: string): string {
  return normalizeCountryLabel(country)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .toLowerCase();
}

const COUNTRY_ALIASES: Record<string, string[]> = {
  benin: ["Bénin", "Benin"],
  "burkina faso": ["Burkina Faso"],
  cameroun: ["Cameroun", "Cameroon"],
  cameroon: ["Cameroun", "Cameroon"],
  centrafrique: ["Centrafrique", "Central African Republic"],
  "central african republic": ["Centrafrique", "Central African Republic"],
  congo: ["Congo", "Congo (Brazza)"],
  comores: ["Comores", "Comoros"],
  comoros: ["Comores", "Comoros"],
  "cote d'ivoire": ["Côte d'Ivoire", "Cote d'Ivoire", "Côte d’Ivoire", "Ivory Coast (Côte d’Ivoire)", "Ivory Coast"],
  "guinee equatoriale": ["Guinée Equatoriale", "Equatorial Guinea"],
  "equatorial guinea": ["Guinée Equatoriale", "Equatorial Guinea"],
  guinee: ["Guinée", "Guinea"],
  guinea: ["Guinée", "Guinea"],
  "guinee bissau": ["Guinée Bissau", "Guinea-Bissau"],
  "guinea-bissau": ["Guinée Bissau", "Guinea-Bissau"],
  madagascar: ["Madagascar"],
  mali: ["Mali"],
  mauritanie: ["Mauritanie", "Mauritania"],
  mauritania: ["Mauritanie", "Mauritania"],
  niger: ["Niger"],
  senegal: ["Sénégal", "Senegal"],
  "sénégal": ["Sénégal", "Senegal"],
  tchad: ["Tchad", "Chad"],
  chad: ["Tchad", "Chad"],
  rwanda: ["Rwanda"],
  togo: ["Togo"],
};

function buildCountryCandidates(country?: string | null): string[] {
  if (!country) return [];
  const raw = country.trim();
  const normalized = normalizeCountryLabel(raw);
  const set = new Set<string>();
  if (raw) set.add(raw);
  if (normalized) set.add(normalized);
  const aliasKey = asciiCountry(raw);
  const aliases = COUNTRY_ALIASES[aliasKey];
  if (aliases) {
    for (const alias of aliases) set.add(alias);
  }
  return Array.from(set);
}

function mapDbRowToAirport(row: DbAirportRow): AIPAirport {
  const country = row.country ?? "";
  const dynamicWebAipUrl = getDynamicWebAipUrl(country);
  const sourceType = dynamicWebAipUrl ? "SCRAPER_DYNAMIC" : "DB_DYNAMIC";
  return {
    country,
    gen1_2: "",
    gen1_2_point_4: "",
    icao: (row.icao ?? "").toUpperCase(),
    name: row.name ?? "",
    publicationDate: "",
    trafficPermitted: "",
    trafficRemarks: "",
    ad22Operator: "",
    ad22Address: "",
    ad22Telephone: "",
    ad22Telefax: "",
    ad22Email: "",
    ad22Afs: "",
    ad22Website: "",
    operator: "",
    customsImmigration: "",
    ats: "",
    atsRemarks: "",
    fireFighting: "",
    runwayNumber: "",
    runwayDimensions: "",
    lat: row.lat ?? undefined,
    lon: row.lon ?? undefined,
    sourceType,
    dynamicUpdated: true,
    webAipUrl: dynamicWebAipUrl,
  };
}

async function fetchVisibleAirportsFromDb(country?: string | null, state?: string | null): Promise<AIPAirport[] | null> {
  const service = createSupabaseServiceRoleClient();
  if (!service) return null;

  const countryCandidates = buildCountryCandidates(country);
  let query = service
    .from("airports")
    .select("country,state,icao,name,lat,lon")
    .eq("visible", true)
    .order("icao", { ascending: true });
  if (countryCandidates.length === 1) query = query.eq("country", countryCandidates[0]);
  if (countryCandidates.length > 1) query = query.in("country", countryCandidates);
  if (state) query = query.eq("state", state);

  const { data, error } = await query.limit(10000);
  if (error) {
    // Fallback to static dataset when DB table is unavailable or not migrated yet.
    return null;
  }
  const rows = (data ?? []) as DbAirportRow[];
  return rows
    .filter((r) => r.icao)
    .map(mapDbRowToAirport);
}

type USAirportRow = {
  "Publication Date"?: string;
  "Airport Code": string;
  "Airport Name": string;
  "AD2.2 Types of Traffic Permitted": string;
  "AD2.2 Remarks": string;
  "AD2.2 AD Operator"?: string;
  "AD2.2 Address"?: string;
  "AD2.2 Telephone"?: string;
  "AD2.2 Telefax"?: string;
  "AD2.2 E-mail"?: string;
  "AD2.2 AFS"?: string;
  "AD2.2 Website"?: string;
  "AD2.3 AD Operator": string;
  "AD 2.3 Customs and Immigration": string;
  "AD2.3 ATS": string;
  "AD2.3 Remarks": string;
  "AD2.6 AD category for fire fighting": string;
  "AD2.12 Runway Number"?: string;
  "AD2.12 Runway Dimensions"?: string;
};

type USAData = {
  country: string;
  GEN_1_2?: string;
  GEN_1_2_POINT_4?: string;
  by_state?: Record<string, USAirportRow[]>;
};

type RUSAirportRow = {
  icao: string;
  airport_name: string;
};

type RUSData = {
  airports?: RUSAirportRow[];
};

function flattenUSAByState(state: string): AIPAirport[] {
  const data = usaByState as USAData;
  const gen1_2 = data.GEN_1_2 ?? "";
  const gen1_2_point_4 = data.GEN_1_2_POINT_4 ?? "";
  const stateAirports = data.by_state?.[state];
  if (!stateAirports || !Array.isArray(stateAirports)) return [];
  return stateAirports.map((a) => {
    const icao = a["Airport Code"] ?? "";
    const coord = coordsMap[icao];
    return {
      country: data.country,
      gen1_2,
      gen1_2_point_4,
      icao,
      name: a["Airport Name"] ?? "",
      publicationDate: a["Publication Date"] ?? "",
      trafficPermitted: a["AD2.2 Types of Traffic Permitted"] ?? "",
      trafficRemarks: a["AD2.2 Remarks"] ?? "",
      ad22Operator: a["AD2.2 AD Operator"] ?? "",
      ad22Address: a["AD2.2 Address"] ?? "",
      ad22Telephone: a["AD2.2 Telephone"] ?? "",
      ad22Telefax: a["AD2.2 Telefax"] ?? "",
      ad22Email: a["AD2.2 E-mail"] ?? "",
      ad22Afs: a["AD2.2 AFS"] ?? "",
      ad22Website: a["AD2.2 Website"] ?? "",
      operator: a["AD2.3 AD Operator"] ?? "",
      customsImmigration: a["AD 2.3 Customs and Immigration"] ?? "",
      ats: a["AD2.3 ATS"] ?? "",
      atsRemarks: a["AD2.3 Remarks"] ?? "",
      fireFighting: a["AD2.6 AD category for fire fighting"] ?? "",
      runwayNumber: a["AD2.12 Runway Number"] ?? "",
      runwayDimensions: a["AD2.12 Runway Dimensions"] ?? "",
      lat: coord?.lat,
      lon: coord?.lon,
    };
  });
}

function flattenAIP(countryFilter?: string): AIPAirport[] {
  const countries = aipData as AIPCountry[];
  const list: AIPAirport[] = [];
  for (const c of countries) {
    if (isAsecnaCountry(c.country)) continue;
    if (countryFilter && c.country !== countryFilter) continue;
    if (!c.airports || !Array.isArray(c.airports)) continue;
    const gen1_2 = c.GEN_1_2 ?? "";
    const gen1_2_point_4 = c.GEN_1_2_POINT_4 ?? "";
    for (const a of c.airports) {
      const icao = a["Airport Code"] ?? "";
      const coord = coordsMap[icao];
      list.push({
        country: c.country,
        gen1_2,
        gen1_2_point_4,
        icao,
        name: a["Airport Name"] ?? "",
        publicationDate: a["Publication Date"] ?? "",
        trafficPermitted: a["AD2.2 Types of Traffic Permitted"] ?? "",
        trafficRemarks: a["AD2.2 Remarks"] ?? "",
        ad22Operator: a["AD2.2 AD Operator"] ?? "",
        ad22Address: a["AD2.2 Address"] ?? "",
        ad22Telephone: a["AD2.2 Telephone"] ?? "",
        ad22Telefax: a["AD2.2 Telefax"] ?? "",
        ad22Email: a["AD2.2 E-mail"] ?? "",
        ad22Afs: a["AD2.2 AFS"] ?? "",
        ad22Website: a["AD2.2 Website"] ?? "",
        operator: a["AD2.3 AD Operator"] ?? "",
        customsImmigration: a["AD 2.3 Customs and Immigration"] ?? "",
        ats: a["AD2.3 ATS"] ?? "",
        atsRemarks: a["AD2.3 Remarks"] ?? "",
        fireFighting: a["AD2.6 AD category for fire fighting"] ?? "",
        runwayNumber: a["AD2.12 Runway Number"] ?? "",
        runwayDimensions: a["AD2.12 Runway Dimensions"] ?? "",
        lat: coord?.lat,
        lon: coord?.lon,
        sourceType: "STATIC_PORTAL",
        dynamicUpdated: false,
      });
    }
  }
  return list;
}

function flattenRussia(): AIPAirport[] {
  const data = rusAirportsDb as RUSData;
  const airports = Array.isArray(data.airports) ? data.airports : [];
  return airports
    .filter((a) => a?.icao)
    .map((a) => {
      const icao = String(a.icao).toUpperCase();
      const coord = coordsMap[icao];
      return {
        country: "Russia",
        gen1_2: "",
        gen1_2_point_4: "",
        icao,
        name: formatRussiaAirportName(a.airport_name ?? ""),
        publicationDate: "",
        trafficPermitted: "",
        trafficRemarks: "",
        ad22Operator: "",
        ad22Address: "",
        ad22Telephone: "",
        ad22Telefax: "",
        ad22Email: "",
        ad22Afs: "",
        ad22Website: "",
        operator: "",
        customsImmigration: "",
        ats: "",
        atsRemarks: "",
        fireFighting: "",
        runwayNumber: "",
        runwayDimensions: "",
        lat: coord?.lat,
        lon: coord?.lon,
        sourceType: "RUSSIA_DYNAMIC",
        dynamicUpdated: true,
      };
    })
    .sort((a, b) => (a.name || a.icao).localeCompare(b.name || b.icao));
}

let cachedList: AIPAirport[] | null = null;

function getAll(): AIPAirport[] {
  if (!cachedList) cachedList = flattenAIP();
  return cachedList;
}

const EAD_PLACEHOLDER_NAME = "EAD UNDEFINED";

function flattenEadCountry(countryLabel: string, eadData: Record<string, Array<{ icao: string; name: string }>>): AIPAirport[] {
  const airports = eadData[countryLabel];
  if (!airports || !Array.isArray(airports)) return [];
  const list = airports.map((airport) => {
    const icao = airport.icao;
    const coord = coordsMap[icao];
    const name = airport.name || EAD_PLACEHOLDER_NAME;
    return {
      country: countryLabel,
      gen1_2: "",
      gen1_2_point_4: "",
      icao,
      name,
      publicationDate: "",
      trafficPermitted: "",
      trafficRemarks: "",
      ad22Operator: "",
      ad22Address: "",
      ad22Telephone: "",
      ad22Telefax: "",
      ad22Email: "",
      ad22Afs: "",
      ad22Website: "",
      operator: "",
      customsImmigration: "",
      ats: "",
      atsRemarks: "",
      fireFighting: "",
      runwayNumber: "",
      runwayDimensions: "",
      lat: coord?.lat,
      lon: coord?.lon,
      sourceType: "EAD_DYNAMIC",
      dynamicUpdated: true,
    };
  });
  list.sort((a, b) => {
    const aHasName = a.name !== EAD_PLACEHOLDER_NAME ? 1 : 0;
    const bHasName = b.name !== EAD_PLACEHOLDER_NAME ? 1 : 0;
    if (bHasName !== aHasName) return bHasName - aHasName;
    return (a.name || a.icao).localeCompare(b.name || b.icao);
  });
  return list;
}

function flattenAsecnaCountry(countryName: string): AIPAirport[] {
  const normalize = (v: string) =>
    String(v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’]/g, "'")
      .trim()
      .toLowerCase();
  const target = normalize(countryName);
  const out: AIPAirport[] = [];
  for (const icao of getAsecnaAirportsSet()) {
    const row = getAsecnaAirportByIcao(icao);
    if (!row) continue;
    if (normalize(row.countryName) !== target) continue;
    const coord = (typeof row.lat === "number" && typeof row.lon === "number") ? { lat: row.lat, lon: row.lon } : coordsMap[icao];
    out.push({
      country: row.countryName,
      gen1_2: "",
      gen1_2_point_4: "",
      icao,
      name: row.name || `${icao} Airport`,
      publicationDate: "",
      trafficPermitted: "",
      trafficRemarks: "",
      ad22Operator: "",
      ad22Address: "",
      ad22Telephone: "",
      ad22Telefax: "",
      ad22Email: "",
      ad22Afs: "",
      ad22Website: "",
      operator: "",
      customsImmigration: "",
      ats: "",
      atsRemarks: "",
      fireFighting: "",
      runwayNumber: "",
      runwayDimensions: "",
      lat: coord?.lat,
      lon: coord?.lon,
      sourceType: "ASECNA_DYNAMIC",
      dynamicUpdated: true,
      webAipUrl: row.webAipUrl,
    });
  }
  out.sort((a, b) => (a.name || a.icao).localeCompare(b.name || b.icao));
  return out;
}

function flattenDynamicCountry(countryName?: string): AIPAirport[] {
  const payload = dynamicAirportsData as { airports?: Array<any> };
  const rows = Array.isArray(payload.airports) ? payload.airports : [];
  const target = String(countryName || "").trim().toLowerCase();
  const list = rows
    .filter((r) => {
      if (!target) return true;
      return String(r.country || "").trim().toLowerCase() === target;
    })
    .map((r) => ({
      country: String(r.country || ""),
      gen1_2: "",
      gen1_2_point_4: "",
      icao: String(r.icao || "").toUpperCase(),
      name: String(r.name || ""),
      publicationDate: "",
      trafficPermitted: "",
      trafficRemarks: "",
      ad22Operator: "",
      ad22Address: "",
      ad22Telephone: "",
      ad22Telefax: "",
      ad22Email: "",
      ad22Afs: "",
      ad22Website: "",
      operator: "",
      customsImmigration: "",
      ats: "",
      atsRemarks: "",
      fireFighting: "",
      runwayNumber: "",
      runwayDimensions: "",
      lat: typeof r.lat === "number" ? r.lat : undefined,
      lon: typeof r.lon === "number" ? r.lon : undefined,
      sourceType: "SCRAPER_DYNAMIC",
      dynamicUpdated: true,
      webAipUrl: getDynamicWebAipUrl(String(r.country || "")),
    } satisfies AIPAirport))
    .filter((x) => /^[A-Z0-9]{4}$/.test(x.icao));
  list.sort((a, b) => a.icao.localeCompare(b.icao));
  return list;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country")?.trim() || null;
  const state = searchParams.get("state")?.trim() || null;

  const dbResults = await fetchVisibleAirportsFromDb(country, state);
  if (dbResults !== null && (!country || dbResults.length > 0 || !isAsecnaCountry(country))) {
    return NextResponse.json(
      { results: dbResults },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  if (country === "United States of America" && state) {
    const list = flattenUSAByState(state);
    return NextResponse.json({ results: list });
  }

  const eadData = getEadCountryIcaos();
  if (country && country in eadData) {
    const list = flattenEadCountry(country, eadData);
    return NextResponse.json(
      { results: list },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  if (country === "Russia") {
    const list = flattenRussia();
    return NextResponse.json({ results: list });
  }

  if (country && isAsecnaCountry(country)) {
    return NextResponse.json(
      { results: flattenAsecnaCountry(country) },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  if (country) {
    const dynamicCountry = flattenDynamicCountry(country);
    if (dynamicCountry.length > 0) {
      return NextResponse.json(
        { results: dynamicCountry },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }
  }

  if (!country) {
    const byIcao = new Map<string, AIPAirport>();
    for (const row of getAll()) byIcao.set(row.icao.toUpperCase(), row);
    for (const row of flattenDynamicCountry()) {
      const icao = row.icao.toUpperCase();
      if (!byIcao.has(icao)) byIcao.set(icao, row);
    }
    return NextResponse.json({ results: Array.from(byIcao.values()) });
  }

  const list = country ? flattenAIP(country) : getAll();
  return NextResponse.json({ results: list });
}
