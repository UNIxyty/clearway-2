import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import aipData from "@/data/aip-data.json";
import usaByState from "@/data/usa-aip-icaos-by-state.json";
import airportCoords from "@/data/airport-coords.json";
import eadCountryIcaos from "@/lib/ead-country-icaos.generated.json";
import rusAirportsDb from "@/data/rus-aip-international-airports.json";
import { formatRussiaAirportName } from "@/lib/russia-airport-name";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { getAsecnaAirportsSet, getAsecnaAirportByIcao, isAsecnaCountry } from "@/lib/asecna-airports";
import { getBahrainMeta } from "@/lib/bahrain-scraper";
import { getEadWebAipUrlByCountry } from "@/lib/ead-web-aip";
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
import { getScraperWebAipUrlByCountryOrIcao, isScraperCountryName } from "@/lib/scraper-country-config";

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
  effectiveDate?: string | null;
};

const coordsMap = airportCoords as Record<string, { lat: number; lon: number }>;

type DbAirportRow = {
  country: string | null;
  state: string | null;
  icao: string | null;
  name: string | null;
  lat: number | null;
  lon: number | null;
  web_aip_url?: string | null;
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
  "republic of cabo verde": ["Republic of Cabo Verde", "Cabo Verde", "Cape Verde"],
  "cabo verde": ["Republic of Cabo Verde", "Cabo Verde", "Cape Verde"],
  "cape verde": ["Republic of Cabo Verde", "Cabo Verde", "Cape Verde"],
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
  "bosnia/herzeg": ["Bosnia", "Bosnia and Herzegovina", "Bosnia/Herzeg", "Bosnia/Herzeg."],
  "bosnia/herzeg.": ["Bosnia", "Bosnia and Herzegovina", "Bosnia/Herzeg", "Bosnia/Herzeg."],
  bosnia: ["Bosnia", "Bosnia and Herzegovina", "Bosnia/Herzeg", "Bosnia/Herzeg."],
  "bosnia and herzegovina": ["Bosnia", "Bosnia and Herzegovina", "Bosnia/Herzeg", "Bosnia/Herzeg."],
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
  const icao = (row.icao ?? "").toUpperCase();
  const country = row.country ?? "";
  const dbWebAip = String(row.web_aip_url || "").trim() || null;
  const scraperWebAip = dbWebAip || getScraperWebAipUrlByCountryOrIcao(country, icao);
  return {
    country,
    gen1_2: "",
    gen1_2_point_4: "",
    icao,
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
    sourceType: scraperWebAip ? "SCRAPER_DYNAMIC" : "DB_DYNAMIC",
    dynamicUpdated: true,
    webAipUrl: scraperWebAip ?? undefined,
    effectiveDate: null,
  };
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

async function getHiddenAirportIcaosForUser(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set<string>();
  const service = createSupabaseServiceRoleClient();
  if (!service) return new Set<string>();

  const { data, error } = await service
    .from("deleted_airports")
    .select("icao")
    .eq("deleted_by", userId)
    .is("restored_at", null)
    .limit(10000);
  if (error) return new Set<string>();

  return new Set((data ?? []).map((row) => String((row as { icao?: string }).icao ?? "").toUpperCase()).filter(Boolean));
}

function applyHiddenAirportFilter(list: AIPAirport[], hiddenAirportIcaos: Set<string>): AIPAirport[] {
  if (hiddenAirportIcaos.size === 0) return list;
  return list.filter((airport) => !hiddenAirportIcaos.has(String(airport.icao || "").toUpperCase()));
}

async function fetchVisibleAirportsFromDb(country?: string | null, state?: string | null): Promise<AIPAirport[] | null> {
  const service = createSupabaseServiceRoleClient();
  if (!service) return null;

  const countryCandidates = buildCountryCandidates(country);
  let query = service
    .from("airports")
    .select("country,state,icao,name,lat,lon,web_aip_url")
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
    if (isScraperCountryName(c.country)) continue;
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
      webAipUrl: getEadWebAipUrlByCountry(countryLabel) ?? undefined,
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

async function flattenBahrainCountry(countryName: string): Promise<AIPAirport[]> {
  if (countryName !== "Bahrain") return [];
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

async function flattenScraperBatchCountry(countryName: string): Promise<AIPAirport[]> {
  const normalized = String(countryName || "")
    .trim()
    .toLowerCase()
    .replace(/[./_-]+/g, " ")
    .replace(/\s+/g, " ");
  const meta =
    normalized.includes("belarus")
      ? await getBelarusMeta()
      : normalized.includes("bhutan")
        ? await getBhutanMeta()
        : normalized.includes("bosnia")
          ? await getBosniaMeta()
          : normalized.includes("cabo verde") || normalized.includes("cape verde")
            ? await getCaboVerdeMeta()
            : normalized.includes("chile")
              ? await getChileMeta()
              : normalized.includes("costa rica")
                ? await getCostaRicaMeta()
                : normalized.includes("cuba")
                  ? await getCubaMeta()
                    : normalized.includes("ecuador")
                      ? await getEcuadorMeta()
                      : normalized.includes("el salvador")
                        ? await getElSalvadorMeta()
                        : normalized.includes("guatemala")
                          ? await getGuatemalaMeta()
                          : normalized.includes("honduras")
                            ? await getHondurasMeta()
                            : normalized.includes("hong kong") || normalized.includes("hongkong")
                              ? await getHongKongMeta()
                              : normalized.includes("india")
                                ? await getIndiaMeta()
                                : normalized.includes("israel")
                                  ? await getIsraelMeta()
                                  : normalized.includes("south korea") || normalized.includes("korea")
                                    ? await getSouthKoreaMeta()
                                    : normalized.includes("kosovo")
                                      ? await getKosovoMeta()
                                      : normalized.includes("kuwait")
                                        ? await getKuwaitMeta()
                                        : normalized.includes("libya")
                                          ? await getLibyaMeta()
                                          : normalized.includes("malaysia")
                                            ? await getMalaysiaMeta()
                                            : normalized.includes("maldives")
                                              ? await getMaldivesMeta()
                                              : normalized.includes("mongolia")
                                                ? await getMongoliaMeta()
                                                : normalized.includes("myanmar")
                                                  ? await getMyanmarMeta()
                                                  : normalized.includes("nepal")
                                                    ? await getNepalMeta()
                                                    : normalized.includes("north macedonia") || normalized.includes("macedonia")
                                                      ? await getNorthMacedoniaMeta()
                                                      : normalized.includes("pakistan")
                                                        ? await getPakistanMeta()
                                                        : normalized.includes("panama")
                                                          ? await getPanamaMeta()
                                                          : normalized.includes("qatar")
                                                            ? await getQatarMeta()
                                                            : normalized.includes("rwanda")
                                                              ? await getRwandaMeta()
                                                              : normalized.includes("saudi arabia")
                                                                ? await getSaudiArabiaMeta()
                                                                : normalized.includes("somalia")
                                                                  ? await getSomaliaMeta()
                                                                  : normalized.includes("sri lanka")
                                                                    ? await getSriLankaMeta()
                                                                    : normalized.includes("taiwan")
                                                                      ? await getTaiwanMeta()
                                                                      : normalized.includes("tajikistan")
                                                                        ? await getTajikistanMeta()
                                                                        : normalized.includes("thailand")
                                                                          ? await getThailandMeta()
                                                                          : normalized.includes("turkmenistan")
                                                                            ? await getTurkmenistanMeta()
                                                                            : normalized.includes("united arab emirates") || normalized === "uae"
                                                                              ? await getUaeMeta()
                                                                              : normalized.includes("uzbekistan")
                                                                                ? await getUzbekistanMeta()
                                                                                : normalized.includes("venezuela")
                                                                                  ? await getVenezuelaMeta()
                                                                                  : normalized.includes("japan")
                                                                                    ? await getJapanMeta()
                                                                                    : null;
  if (!meta) return [];
  return meta.ad2Icaos.map((icao) => {
    const coord = coordsMap[icao];
    return {
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
    };
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country")?.trim() || null;
  const state = searchParams.get("state")?.trim() || null;
  const userId = await getCurrentUserId();
  const hiddenAirportIcaos = await getHiddenAirportIcaosForUser(userId);

  const dbResults = await fetchVisibleAirportsFromDb(country, state);
  if (dbResults !== null) {
    const filteredDbResults = applyHiddenAirportFilter(dbResults, hiddenAirportIcaos);
    const allowEmptyDbResult =
      !country || (!isAsecnaCountry(country) && !isScraperCountryName(country));
    if (filteredDbResults.length > 0 || allowEmptyDbResult) {
      return NextResponse.json(
        { results: filteredDbResults },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }
  }

  if (country === "United States of America" && state) {
    const list = applyHiddenAirportFilter(flattenUSAByState(state), hiddenAirportIcaos);
    return NextResponse.json({ results: list });
  }

  const eadData = getEadCountryIcaos();
  if (country && country in eadData) {
    const list = applyHiddenAirportFilter(flattenEadCountry(country, eadData), hiddenAirportIcaos);
    return NextResponse.json(
      { results: list },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  if (country === "Russia") {
    const list = applyHiddenAirportFilter(flattenRussia(), hiddenAirportIcaos);
    return NextResponse.json({ results: list });
  }

  if (country && isAsecnaCountry(country)) {
    return NextResponse.json(
      { results: applyHiddenAirportFilter(flattenAsecnaCountry(country), hiddenAirportIcaos) },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  if (country === "Bahrain") {
    return NextResponse.json(
      { results: applyHiddenAirportFilter(await flattenBahrainCountry(country), hiddenAirportIcaos) },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  if (country && isScraperCountryName(country) && country !== "Bahrain") {
    return NextResponse.json(
      { results: applyHiddenAirportFilter(await flattenScraperBatchCountry(country), hiddenAirportIcaos) },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const list = applyHiddenAirportFilter(country ? flattenAIP(country) : getAll(), hiddenAirportIcaos);
  return NextResponse.json({ results: list });
}
