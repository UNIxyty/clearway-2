const EAD_WEB_AIP_DEFAULT_URL = "https://www.ead.eurocontrol.int/cms-eadbasic/opencms/en/login/ead-basic/";

const EAD_PREFIXES = new Set([
  "LA", "UD", "LO", "UB", "EB", "LQ", "LB", "LD", "LC", "LK", "EK", "EE", "XX", "EF",
  "LF", "UG", "ED", "LG", "BG", "LH", "BI", "EI", "LI", "OJ", "BK", "UA", "UC", "EV",
  "EY", "EL", "LM", "LU", "EH", "EN", "RP", "EP", "LP", "LW", "LR", "LY", "LZ", "LJ",
  "LE", "ES", "GC", "LS", "LT", "UK", "EG",
]);

function normalizeCountry(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .trim()
    .toLowerCase();
}

export function getEadWebAipUrlByCountry(country: string | null | undefined): string | null {
  const raw = String(country || "").trim();
  if (!raw) return null;
  return getEadWebAipUrlByPrefixOrCountry("", raw);
}

export function getEadWebAipUrlByIcaoOrCountry(
  icao: string | null | undefined,
  country: string | null | undefined,
): string | null {
  const up = String(icao || "").trim().toUpperCase();
  const prefix = /^[A-Z0-9]{4}$/.test(up) ? up.slice(0, 2) : "";
  const rawCountry = String(country || "").trim();
  return getEadWebAipUrlByPrefixOrCountry(prefix, rawCountry);
}

function getEadWebAipUrlByPrefixOrCountry(prefix: string, rawCountry: string): string | null {
  const raw = String(rawCountry || "").trim();
  if (!raw && !prefix) return null;

  const countrySuffixPrefix = raw.match(/\(([A-Z0-9]{2})\)\s*$/)?.[1]?.toUpperCase() || "";
  const resolvedPrefix = prefix || countrySuffixPrefix;
  const byPrefix: Record<string, string> = {
    LA: "https://www.albcontrol.al/aip/",
    UD: "http://www.armats.am/activities/ais/eaip",
    LO: "https://eaip.austrocontrol.at/",
    EB: "https://ops.skeyes.be/",
    LQ: "https://eaip.bhansa.gov.ba/",
    LB: "https://www.bulatsa.com/en/services/aeronautical-information-services/",
    LD: "https://www.crocontrol.hr/en/services/aeronautical-information-management/",
    LC: "http://www.mcw.gov.cy/mcw/DCA/AIS/ais.nsf/index_en/index_en",
    LK: "http://ais.ans.cz/",
    EK: "https://aim.naviair.dk/",
    XX: "https://aim.naviair.dk/",
    BG: "https://aim.naviair.dk/",
    EE: "https://aim.eans.ee/",
    EF: "https://www.ais.fi/",
    LF: "https://www.sia.aviation-civile.gouv.fr/",
    UG: "https://ais.airnav.ge/en/",
    ED: "https://aip.dfs.de/basicAIP/",
    LG: "https://aisgr.hasp.gov.gr/",
    LH: "https://ais-en.hungarocontrol.hu/aip/",
    BI: "https://www.avians.is/en/c-preflight-information",
    EI: "https://www.airnav.ie/air-traffic-management/aeronautical-information-management",
    LI: "https://www.enav.it/sites/public/en/Servizi/areonautical-information.html",
    OJ: "https://carc.gov.jo/en/directory-flight-information",
    BK: "https://www.ashna-ks.org/en/services/ais/",
    UA: "http://www.ans.kz/en/ais/eaip",
    UC: "https://ansp.kg/aeronautical-information-service",
    EV: "https://ais.lgs.lv/",
    EY: "https://www.ans.lt/en/aim",
    EL: "https://ops.skeyes.be/",
    LM: "https://www.maltats.com/aim/",
    LU: "https://aim.moldatsa.md/",
    EH: "https://www.lvnl.nl/diensten/aip",
    EN: "https://avinor.no/ais",
    RP: "https://ais.caap.gov.ph/home",
    EP: "https://www.ais.pansa.pl/en/publications/ais-products/",
    LP: "https://ais.nav.pt/",
    LW: "http://ais.m-nav.info/eAIP/current/en/index.htm",
    LR: "https://www.aisro.ro/",
    LY: "https://smatsa.rs/upload/aip/published/start_page.html",
    LZ: "https://aim.lps.sk/web/",
    LJ: "https://aim.sloveniacontrol.si/aim/products/",
    LE: "https://aip.enaire.es/aip/aip-en.html",
    GC: "https://aip.enaire.es/aip/aip-en.html",
    ES: "https://aro.lfv.se/Editorial/View/IAIP",
    LS: "https://www.skyguide.ch/en/services/aeronautical-information-management/",
    LT: "https://www.dhmi.gov.tr/Sayfalar/aipturkey.aspx",
    UK: "http://www.aisukraine.net/titul_en.php",
    EG: "https://www.nats.aero/do-it-online/ais/",
  };
  if (resolvedPrefix && byPrefix[resolvedPrefix]) return byPrefix[resolvedPrefix];

  const normalized = normalizeCountry(raw).replace(/\s*\([A-Z0-9]{2}\)\s*$/, "").trim();
  if (normalized === "denmark") return "https://aim.naviair.dk/";

  if (resolvedPrefix && EAD_PREFIXES.has(resolvedPrefix)) return EAD_WEB_AIP_DEFAULT_URL;

  return null;
}

