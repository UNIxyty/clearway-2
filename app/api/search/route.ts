import { NextRequest, NextResponse } from "next/server";
import aipData from "@/data/aip-data.json";
import airportCoords from "@/data/airport-coords.json";
import eadExtracted from "@/data/ead-aip-extracted.json";

type AIPCountry = {
  country: string;
  GEN_1_2?: string;
  GEN_1_2_POINT_4?: string;
  airports: Array<{
    row_number: number;
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

function flattenAIP(): AIPAirport[] {
  const countries = aipData as AIPCountry[];
  const list: AIPAirport[] = [];
  for (const c of countries) {
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

type EADAirportRow = {
  "Airport Code"?: string;
  "Airport Name"?: string;
  "AD2.2 Types of Traffic Permitted"?: string;
  "AD2.2 Remarks"?: string;
  "AD2.3 AD Operator"?: string;
  "AD 2.3 Customs and Immigration"?: string;
  "AD2.3 ATS"?: string;
  "AD2.3 Remarks"?: string;
  "AD2.6 AD category for fire fighting"?: string;
};

function flattenEAD(): AIPAirport[] {
  const data = eadExtracted as { airports?: EADAirportRow[] };
  const airports = data.airports ?? [];
  return airports.map((a) => {
    const icao = (a["Airport Code"] ?? "").trim();
    const coord = coordsMap[icao];
    return {
      country: "EAD (EU AIP)",
      gen1_2: "",
      gen1_2_point_4: "",
      icao,
      name: (a["Airport Name"] ?? "").trim(),
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

let cachedList: AIPAirport[] | null = null;

function getList(): AIPAirport[] {
  if (!cachedList) {
    const aip = flattenAIP();
    const ead = flattenEAD();
    const byIcao = new Map<string, AIPAirport>();
    for (const a of aip) if (a.icao) byIcao.set(a.icao.toUpperCase(), a);
    for (const a of ead) if (a.icao && !byIcao.has(a.icao.toUpperCase())) byIcao.set(a.icao.toUpperCase(), a);
    cachedList = Array.from(byIcao.values());
  }
  return cachedList;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";
  const qUpper = q.toUpperCase();

  if (!q || q.length < 2) {
    return NextResponse.json(
      { error: "Enter at least 2 characters (airport code or name)" },
      { status: 400 }
    );
  }

  const list = getList();
  const results = list.filter(
    (a) =>
      a.icao.toUpperCase().includes(qUpper) ||
      a.name.toUpperCase().includes(qUpper) ||
      a.country.toUpperCase().includes(qUpper)
  );

  return NextResponse.json({ results });
}
