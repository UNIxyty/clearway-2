import { NextRequest, NextResponse } from "next/server";
import aipData from "@/data/aip-data.json";
import usaByState from "@/data/usa-aip-icaos-by-state.json";
import airportCoords from "@/data/airport-coords.json";
import eadIcaosFromDocNames from "@/data/ead-icaos-from-document-names.json";

type AIPCountry = {
  country: string;
  GEN_1_2?: string;
  GEN_1_2_POINT_4?: string;
  airports: Array<{
    "Airport Code": string;
    "Airport Name": string;
    "AD2.2 Types of Traffic Permitted": string;
    "AD2.2 Remarks": string;
    "AD2.3 AD Operator": string;
    "AD 2.3 Customs and Immigration": string;
    "AD2.3 ATS": string;
    "AD2.3 Remarks": string;
    "AD2.6 AD category for fire fighting": string;
  }>;
};

export type AIPAirport = {
  country: string;
  gen1_2: string;
  gen1_2_point_4: string;
  icao: string;
  name: string;
  trafficPermitted: string;
  trafficRemarks: string;
  operator: string;
  customsImmigration: string;
  ats: string;
  atsRemarks: string;
  fireFighting: string;
  lat?: number;
  lon?: number;
};

const coordsMap = airportCoords as Record<string, { lat: number; lon: number }>;

type USAirportRow = {
  "Airport Code": string;
  "Airport Name": string;
  "AD2.2 Types of Traffic Permitted": string;
  "AD2.2 Remarks": string;
  "AD2.3 AD Operator": string;
  "AD 2.3 Customs and Immigration": string;
  "AD2.3 ATS": string;
  "AD2.3 Remarks": string;
  "AD2.6 AD category for fire fighting": string;
};

type USAData = {
  country: string;
  GEN_1_2?: string;
  GEN_1_2_POINT_4?: string;
  by_state?: Record<string, USAirportRow[]>;
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
      trafficPermitted: a["AD2.2 Types of Traffic Permitted"] ?? "",
      trafficRemarks: a["AD2.2 Remarks"] ?? "",
      operator: a["AD2.3 AD Operator"] ?? "",
      customsImmigration: a["AD 2.3 Customs and Immigration"] ?? "",
      ats: a["AD2.3 ATS"] ?? "",
      atsRemarks: a["AD2.3 Remarks"] ?? "",
      fireFighting: a["AD2.6 AD category for fire fighting"] ?? "",
      lat: coord?.lat,
      lon: coord?.lon,
    };
  });
}

function flattenAIP(countryFilter?: string): AIPAirport[] {
  const countries = aipData as AIPCountry[];
  const list: AIPAirport[] = [];
  for (const c of countries) {
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
        trafficPermitted: a["AD2.2 Types of Traffic Permitted"] ?? "",
        trafficRemarks: a["AD2.2 Remarks"] ?? "",
        operator: a["AD2.3 AD Operator"] ?? "",
        customsImmigration: a["AD 2.3 Customs and Immigration"] ?? "",
        ats: a["AD2.3 ATS"] ?? "",
        atsRemarks: a["AD2.3 Remarks"] ?? "",
        fireFighting: a["AD2.6 AD category for fire fighting"] ?? "",
        lat: coord?.lat,
        lon: coord?.lon,
      });
    }
  }
  return list;
}

let cachedList: AIPAirport[] | null = null;

function getAll(): AIPAirport[] {
  if (!cachedList) cachedList = flattenAIP();
  return cachedList;
}

function flattenEadCountry(countryLabel: string): AIPAirport[] {
  const data = eadIcaosFromDocNames as { countries?: Record<string, string[]> };
  const icaos = data.countries?.[countryLabel];
  if (!icaos || !Array.isArray(icaos)) return [];
  return icaos.map((icao) => {
    const coord = coordsMap[icao];
    return {
      country: countryLabel,
      gen1_2: "",
      gen1_2_point_4: "",
      icao,
      name: "EAD airport (sync to load)",
      trafficPermitted: "",
      trafficRemarks: "",
      operator: "",
      customsImmigration: "",
      ats: "",
      atsRemarks: "",
      fireFighting: "",
      lat: coord?.lat,
      lon: coord?.lon,
    };
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country")?.trim() || null;
  const state = searchParams.get("state")?.trim() || null;

  if (country === "United States of America" && state) {
    const list = flattenUSAByState(state);
    return NextResponse.json({ results: list });
  }

  const eadData = eadIcaosFromDocNames as { countries?: Record<string, unknown> };
  if (country && eadData.countries && country in eadData.countries) {
    const list = flattenEadCountry(country);
    return NextResponse.json({ results: list });
  }

  const list = country ? flattenAIP(country) : getAll();
  return NextResponse.json({ results: list });
}
