import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import aipData from "@/data/aip-data.json";
import usaByState from "@/data/usa-aip-icaos-by-state.json";
import airportCoords from "@/data/airport-coords.json";
import eadCountryIcaosBundle from "@/data/ead-country-icaos.json";
import eadAirportNames from "@/data/ead-airport-names.json";

export const dynamic = "force-dynamic";

/** Normalize JSON to Record<string, string[]>. */
function toEadMap(data: Record<string, unknown>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, val] of Object.entries(data)) {
    if (Array.isArray(val)) out[key] = val.map((v) => String(v).toUpperCase());
  }
  return out;
}

/** Base URL for fetching public/ead-country-icaos.json (Vercel has no data/ on disk). Prefer VERCEL_URL so serverless always hits the deployment. */
function getBaseUrl(request: NextRequest): string {
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  try {
    const u = new URL(request.url);
    return u.origin;
  } catch {
    return "";
  }
}

/** Read EAD country→ICAOs at runtime; on Vercel when data/ is missing, fetch from public asset. Merge with bundle and prefer longer list. */
async function getEadCountryIcaos(baseUrl: string): Promise<Record<string, string[]>> {
  const bundle = toEadMap(eadCountryIcaosBundle as Record<string, unknown>);
  const filePath = join(process.cwd(), "data", "ead-country-icaos.json");
  if (existsSync(filePath)) {
    try {
      const raw = readFileSync(filePath, "utf-8");
      const fromDisk = toEadMap(JSON.parse(raw) as Record<string, unknown>);
      return mergeEadMaps(bundle, fromDisk);
    } catch {
      return bundle;
    }
  }
  if (baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/ead-country-icaos.json`, { cache: "no-store" });
      if (res.ok) {
        const fromNet = (await res.json()) as Record<string, unknown>;
        return mergeEadMaps(bundle, toEadMap(fromNet));
      }
    } catch {
      // fall through to bundle
    }
  }
  return bundle;
}

function mergeEadMaps(bundle: Record<string, string[]>, other: Record<string, string[]>): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  const allKeys = new Set([...Object.keys(bundle), ...Object.keys(other)]);
  for (const key of allKeys) {
    const a = bundle[key];
    const b = other[key];
    if (!a && !b) continue;
    if (!a) merged[key] = b!;
    else if (!b) merged[key] = a;
    else merged[key] = a.length >= b.length ? a : b;
  }
  return merged;
}

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
const eadNamesMap = eadAirportNames as Record<string, string>;

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

const EAD_PLACEHOLDER_NAME = "EAD airport (sync to load)";

function flattenEadCountry(countryLabel: string, eadData: Record<string, string[]>): AIPAirport[] {
  const icaos = eadData[countryLabel];
  if (!icaos || !Array.isArray(icaos)) return [];
  const list = icaos.map((icao) => {
    const coord = coordsMap[icao];
    const name = eadNamesMap[icao] ?? EAD_PLACEHOLDER_NAME;
    return {
      country: countryLabel,
      gen1_2: "",
      gen1_2_point_4: "",
      icao,
      name,
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
  list.sort((a, b) => {
    const aHasName = a.name !== EAD_PLACEHOLDER_NAME ? 1 : 0;
    const bHasName = b.name !== EAD_PLACEHOLDER_NAME ? 1 : 0;
    if (bHasName !== aHasName) return bHasName - aHasName;
    return (a.name || a.icao).localeCompare(b.name || b.icao);
  });
  return list;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country")?.trim() || null;
  const state = searchParams.get("state")?.trim() || null;

  if (country === "United States of America" && state) {
    const list = flattenUSAByState(state);
    return NextResponse.json({ results: list });
  }

  const eadData = await getEadCountryIcaos(getBaseUrl(request));
  if (country && country in eadData) {
    const list = flattenEadCountry(country, eadData);
    return NextResponse.json(
      { results: list },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const list = country ? flattenAIP(country) : getAll();
  return NextResponse.json({ results: list });
}
