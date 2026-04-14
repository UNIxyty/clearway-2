import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import aipData from "@/data/aip-data.json";
import airportCoords from "@/data/airport-coords.json";
import eadCountryIcaos from "@/lib/ead-country-icaos.generated.json";
import rusAirportsDb from "@/data/rus-aip-international-airports.json";
import { formatRussiaAirportName } from "@/lib/russia-airport-name";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { getAsecnaAirportsSet, getAsecnaAirportByIcao, isAsecnaCountry } from "@/lib/asecna-airports";
import { getBahrainMeta } from "@/lib/bahrain-scraper";
import { getEadWebAipUrlByIcaoOrCountry } from "@/lib/ead-web-aip";
import {
  getBelarusMeta,
  getBhutanMeta,
  getBosniaMeta,
  getCaboVerdeMeta,
  getChileMeta,
  getCostaRicaMeta,
  getCubaMeta,
  getEcuadorMeta,
  getElSalvadorMeta,
  getGuatemalaMeta,
  getHondurasMeta,
  getHongKongMeta,
  getIndiaMeta,
  getIsraelMeta,
  getSouthKoreaMeta,
  getKosovoMeta,
  getKuwaitMeta,
  getLibyaMeta,
  getMalaysiaMeta,
  getMaldivesMeta,
  getMongoliaMeta,
  getMyanmarMeta,
  getNepalMeta,
  getNorthMacedoniaMeta,
  getPakistanMeta,
  getPanamaMeta,
  getQatarMeta,
  getRwandaMeta,
  getSaudiArabiaMeta,
  getSomaliaMeta,
  getSriLankaMeta,
  getTaiwanMeta,
  getTajikistanMeta,
  getThailandMeta,
  getTurkmenistanMeta,
  getUaeMeta,
  getUzbekistanMeta,
  getVenezuelaMeta,
  getJapanMeta,
} from "@/lib/scraper-batch-meta";
import { getScraperCountryByIcao, isScraperCountryName } from "@/lib/scraper-country-config";

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
    row_number: number;
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
  effectiveDate?: string | null;
};

type RUSAirportRow = {
  icao: string;
  airport_name: string;
};

type RUSData = {
  airports?: RUSAirportRow[];
};

type DbAirportRow = {
  country: string | null;
  icao: string | null;
  name: string | null;
  lat: number | null;
  lon: number | null;
  web_aip_url?: string | null;
};

const coordsMap = airportCoords as Record<string, { lat: number; lon: number }>;

function flattenAIP(): AIPAirport[] {
  const countries = aipData as AIPCountry[];
  const list: AIPAirport[] = [];
  for (const c of countries) {
    if (isAsecnaCountry(c.country)) continue;
    if (isScraperCountryName(c.country)) continue;
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

function flattenEadFromGenerated(): AIPAirport[] {
  const data = getEadCountryIcaos();
  const list: AIPAirport[] = [];
  for (const [country, airports] of Object.entries(data)) {
    if (!Array.isArray(airports)) continue;
    for (const a of airports) {
      const icao = (a.icao ?? "").trim().toUpperCase();
      if (!icao) continue;
      const coord = coordsMap[icao];
      list.push({
        country,
        gen1_2: "",
        gen1_2_point_4: "",
        icao,
        name: a.name || "EAD UNDEFINED",
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
        webAipUrl: getEadWebAipUrlByIcaoOrCountry(icao, country) ?? undefined,
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
    });
}

function flattenAsecna(): AIPAirport[] {
  const list: AIPAirport[] = [];
  for (const icao of getAsecnaAirportsSet()) {
    const row = getAsecnaAirportByIcao(icao);
    if (!row) continue;
    const coord = (typeof row.lat === "number" && typeof row.lon === "number") ? { lat: row.lat, lon: row.lon } : coordsMap[icao];
    list.push({
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
  return list;
}

async function flattenBahrain(): Promise<AIPAirport[]> {
  const meta = await getBahrainMeta();
  return meta.ad2Icaos.map((icao) => {
    const coord = coordsMap[icao];
    return {
      country: "Bahrain",
      gen1_2: "",
      gen1_2_point_4: "",
      icao,
      name: `${icao} Airport`,
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
      sourceType: "SCRAPER_DYNAMIC",
      dynamicUpdated: true,
      webAipUrl: meta.webAipUrl,
      effectiveDate: meta.effectiveDate,
    };
  });
}

async function flattenScraperCountryMeta(): Promise<AIPAirport[]> {
  const [belarus, bhutan, bosnia, caboVerde, chile, costaRica, cuba, ecuador, elSalvador, guatemala, honduras, hongKong, india, israel, southKorea, kosovo, kuwait, libya, malaysia, maldives, mongolia, myanmar, nepal, northMacedonia, pakistan, panama, qatar, rwanda, saudiArabia, somalia, sriLanka, taiwan, tajikistan, thailand, turkmenistan, uae, uzbekistan, venezuela, japan] = await Promise.all([
    getBelarusMeta(),
    getBhutanMeta(),
    getBosniaMeta(),
    getCaboVerdeMeta(),
    getChileMeta(),
    getCostaRicaMeta(),
    getCubaMeta(),
    getEcuadorMeta(),
    getElSalvadorMeta(),
    getGuatemalaMeta(),
    getHondurasMeta(),
    getHongKongMeta(),
    getIndiaMeta(),
    getIsraelMeta(),
    getSouthKoreaMeta(),
    getKosovoMeta(),
    getKuwaitMeta(),
    getLibyaMeta(),
    getMalaysiaMeta(),
    getMaldivesMeta(),
    getMongoliaMeta(),
    getMyanmarMeta(),
    getNepalMeta(),
    getNorthMacedoniaMeta(),
    getPakistanMeta(),
    getPanamaMeta(),
    getQatarMeta(),
    getRwandaMeta(),
    getSaudiArabiaMeta(),
    getSomaliaMeta(),
    getSriLankaMeta(),
    getTaiwanMeta(),
    getTajikistanMeta(),
    getThailandMeta(),
    getTurkmenistanMeta(),
    getUaeMeta(),
    getUzbekistanMeta(),
    getVenezuelaMeta(),
    getJapanMeta(),
  ]);
  const metas = [belarus, bhutan, bosnia, caboVerde, chile, costaRica, cuba, ecuador, elSalvador, guatemala, honduras, hongKong, india, israel, southKorea, kosovo, kuwait, libya, malaysia, maldives, mongolia, myanmar, nepal, northMacedonia, pakistan, panama, qatar, rwanda, saudiArabia, somalia, sriLanka, taiwan, tajikistan, thailand, turkmenistan, uae, uzbekistan, venezuela, japan];
  const out: AIPAirport[] = [];
  for (const meta of metas) {
    for (const icao of meta.ad2Icaos) {
      const coord = coordsMap[icao];
      out.push({
        country: meta.country,
        gen1_2: "",
        gen1_2_point_4: "",
        icao,
        name: `${icao} Airport`,
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
        sourceType: "SCRAPER_DYNAMIC",
        dynamicUpdated: true,
        webAipUrl: meta.webAipUrl,
        effectiveDate: meta.effectiveDate,
      });
    }
  }
  return out;
}

function mergeByIcao(...lists: AIPAirport[][]): AIPAirport[] {
  const byIcao = new Map<string, AIPAirport>();
  for (const list of lists) {
    for (const a of list) {
      if (!a?.icao) continue;
      const key = a.icao.toUpperCase();
      if (!byIcao.has(key)) byIcao.set(key, a);
    }
  }
  return Array.from(byIcao.values());
}

function buildBaseList(): AIPAirport[] {
  const aip = flattenAIP();
  const eadGeneratedList = flattenEadFromGenerated();
  const asecnaList = flattenAsecna();
  const russiaList = flattenRussia();
  return mergeByIcao(aip, eadGeneratedList, asecnaList, russiaList);
}

let cachedList: AIPAirport[] = buildBaseList();
let dynamicRefreshInFlight: Promise<void> | null = null;
let dynamicRefreshedAt = 0;
const DYNAMIC_REFRESH_TTL_MS = 10 * 60 * 1000;

async function refreshDynamicList(): Promise<void> {
  const now = Date.now();
  if (dynamicRefreshInFlight) return dynamicRefreshInFlight;
  if (now - dynamicRefreshedAt < DYNAMIC_REFRESH_TTL_MS) return;

  dynamicRefreshInFlight = (async () => {
    try {
      const [bahrainList, scraperBatchList] = await Promise.all([
        flattenBahrain(),
        flattenScraperCountryMeta(),
      ]);
      cachedList = mergeByIcao(buildBaseList(), bahrainList, scraperBatchList);
      dynamicRefreshedAt = Date.now();
    } catch {
      // Keep search fast even when external scraper metadata sources are slow/down.
    } finally {
      dynamicRefreshInFlight = null;
    }
  })();

  return dynamicRefreshInFlight;
}

async function getCurrentUserId(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const cookieStore = cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function mapDbRowToAirport(row: DbAirportRow): AIPAirport | null {
  const icao = String(row.icao ?? "").toUpperCase();
  if (!icao) return null;
  const coord = coordsMap[icao];
  return {
    country: row.country ?? "",
    gen1_2: "",
    gen1_2_point_4: "",
    icao,
    name: row.name ?? `${icao} Airport`,
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
    lat: row.lat ?? coord?.lat,
    lon: row.lon ?? coord?.lon,
    sourceType: "DB_DYNAMIC",
    dynamicUpdated: true,
    webAipUrl: String(row.web_aip_url ?? "").trim() || undefined,
  };
}

async function searchVisibleAirportsFromDb(q: string, userId: string | null): Promise<AIPAirport[]> {
  const service = createSupabaseServiceRoleClient();
  if (!service) return [];
  const term = String(q || "").trim().replace(/[,%*]/g, "");
  if (!term) return [];
  const qUp = term.toUpperCase();

  let query = service
    .from("airports")
    .select("country,icao,name,lat,lon,web_aip_url")
    .eq("visible", true)
    .order("icao", { ascending: true });

  if (qUp.length === 4) {
    query = query.eq("icao", qUp);
  } else {
    query = query.or(`icao.ilike.%${term}%,name.ilike.%${term}%,country.ilike.%${term}%`);
  }

  const { data, error } = await query.limit(400);
  if (error) return [];
  const rows = ((data ?? []) as DbAirportRow[]).filter((r) => r?.icao);
  if (!rows.length) return [];

  let visibleRows = rows;
  if (userId) {
    const icaos = rows.map((r) => String(r.icao || "").toUpperCase()).filter(Boolean);
    if (icaos.length > 0) {
      const { data: hiddenRows } = await service
        .from("deleted_airports")
        .select("icao")
        .eq("deleted_by", userId)
        .is("restored_at", null)
        .in("icao", icaos);
      const hiddenSet = new Set((hiddenRows ?? []).map((r) => String((r as { icao?: string }).icao ?? "").toUpperCase()));
      visibleRows = rows.filter((r) => !hiddenSet.has(String(r.icao ?? "").toUpperCase()));
    }
  }

  return visibleRows
    .map(mapDbRowToAirport)
    .filter((a): a is AIPAirport => Boolean(a));
}

function getAllEadIcaos(): Set<string> {
  const data = getEadCountryIcaos();
  const set = new Set<string>();
  for (const list of Object.values(data)) {
    if (Array.isArray(list)) for (const airport of list) set.add(airport.icao.toUpperCase());
  }
  return set;
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

  // Fast path: return cached/static list immediately and refresh scraper metadata in background.
  void refreshDynamicList();
  const baseResults = cachedList.filter(
    (a) =>
      a.icao.toUpperCase().includes(qUpper) ||
      a.name.toUpperCase().includes(qUpper) ||
      a.country.toUpperCase().includes(qUpper)
  );

  const userId = await getCurrentUserId();
  const dbResults = await searchVisibleAirportsFromDb(q, userId);
  const mergedByIcao = new Map<string, AIPAirport>();
  for (const airport of baseResults) mergedByIcao.set(airport.icao.toUpperCase(), airport);
  // Prefer DB rows when available so all visible airports are searchable.
  for (const airport of dbResults) mergedByIcao.set(airport.icao.toUpperCase(), airport);
  let results = Array.from(mergedByIcao.values());

  // If 4-letter search matches an EAD ICAO not in stored data, add placeholder so user can sync from server
  if (qUpper.length === 4) {
    const eadData = getEadCountryIcaos();
    let found = false;
    let foundName = "";
    let foundCountry = "";
    
    for (const [country, airports] of Object.entries(eadData)) {
      const match = airports.find(a => a.icao.toUpperCase() === qUpper);
      if (match) {
        found = true;
        foundName = match.name || "EAD UNDEFINED";
        foundCountry = country;
        break;
      }
    }
    
    if (found && !results.some((a) => a.icao.toUpperCase() === qUpper)) {
      results = [
        ...results,
        {
          country: foundCountry || "EAD (EU AIP)",
          gen1_2: "",
          gen1_2_point_4: "",
          icao: qUpper,
          name: foundName || "EAD UNDEFINED",
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
          webAipUrl: getEadWebAipUrlByIcaoOrCountry(qUpper, foundCountry) ?? undefined,
        } as AIPAirport,
      ];
    }

    // Fast fallback for scraper ICAOs (e.g., VMMC) when dynamic meta refresh is still warming up.
    const scraperCfg = getScraperCountryByIcao(qUpper);
    if (scraperCfg && !results.some((a) => a.icao.toUpperCase() === qUpper)) {
      const coord = coordsMap[qUpper];
      results = [
        ...results,
        {
          country: scraperCfg.country,
          gen1_2: "",
          gen1_2_point_4: "",
          icao: qUpper,
          name: `${qUpper} Airport`,
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
          sourceType: "SCRAPER_DYNAMIC",
          dynamicUpdated: true,
          webAipUrl: scraperCfg.webAipUrl,
        } as AIPAirport,
      ];
    }
  }

  const placeholderName = "EAD UNDEFINED";
  results.sort((a, b) => {
    const aHasName = a.name !== placeholderName ? 1 : 0;
    const bHasName = b.name !== placeholderName ? 1 : 0;
    if (bHasName !== aHasName) return bHasName - aHasName;
    return (a.name || a.icao).localeCompare(b.name || b.icao);
  });

  return NextResponse.json({ results });
}
