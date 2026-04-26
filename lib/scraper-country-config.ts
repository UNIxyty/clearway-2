export type ScraperCountryConfig = {
  country: string;
  aliases?: string[];
  prefixes: string[];
  extraIcaos?: string[];
  excludedIcaos?: string[];
  webAipUrl: string;
};

export const SCRAPER_COUNTRIES: ScraperCountryConfig[] = [
  {
    country: "Algeria",
    prefixes: ["DA"],
    webAipUrl: "https://www.sia-enna.dz/aeronautical-information-publication.html",
  },
  {
    country: "Albania",
    prefixes: ["LA"],
    webAipUrl: "https://www.albcontrol.al/aip/",
  },
  {
    country: "Armenia",
    prefixes: ["UD"],
    webAipUrl: "https://armats.am/activities/ais/eaip",
  },
  {
    country: "Austria",
    prefixes: ["LO"],
    webAipUrl: "https://eaip.austrocontrol.at/",
  },
  {
    country: "Bahrain",
    prefixes: ["OB"],
    webAipUrl: "https://aim.mtt.gov.bh/eAIP/history-en-BH.html",
  },
  {
    country: "Belgium",
    prefixes: ["EB"],
    webAipUrl: "https://ops.skeyes.be/htmlAIP/",
  },
  {
    country: "Belarus",
    prefixes: ["UM"],
    webAipUrl: "https://www.ban.by/ru/sbornik-aip/amdt",
  },
  {
    country: "Bhutan",
    prefixes: ["VQ"],
    webAipUrl: "https://www.doat.gov.bt/aip/",
  },
  {
    country: "Bosnia and Herzegovina",
    aliases: ["Bosnia", "Bosnia/Herzeg", "Bosnia/Herzeg."],
    prefixes: ["LQ"],
    webAipUrl: "https://eaip.bhansa.gov.ba",
  },
  {
    country: "Republic of Cabo Verde",
    aliases: ["Cabo Verde", "Cape Verde"],
    prefixes: ["GV"],
    webAipUrl: "https://eaip.asa.cv",
  },
  {
    country: "Chile",
    prefixes: ["SC"],
    webAipUrl: "https://aipchile.dgac.gob.cl/aip/vol1",
  },
  {
    country: "Costa Rica",
    prefixes: ["MR"],
    webAipUrl: "https://www.cocesna.org/aipca/AIPMR/inicio.html",
  },
  {
    country: "Cuba",
    prefixes: ["MU"],
    webAipUrl: "https://aismet.avianet.cu/html/aip.html",
  },
  {
    country: "Czech Republic",
    prefixes: ["LK"],
    webAipUrl: "https://aim.rlp.cz/",
  },
  {
    country: "Denmark",
    prefixes: ["EK"],
    webAipUrl: "https://aim.naviair.dk/",
  },
  {
    country: "Ecuador",
    prefixes: ["SE"],
    webAipUrl: "https://www.ais.aviacioncivil.gob.ec/ifis3/",
  },
  {
    country: "El Salvador",
    prefixes: ["MS"],
    webAipUrl: "https://www.cocesna.org/aipca/AIPMS/history.html",
  },
  {
    country: "Estonia",
    prefixes: ["EE"],
    webAipUrl: "https://aim.eans.ee/et/eaip",
  },
  {
    country: "Finland",
    prefixes: ["EF"],
    webAipUrl: "https://ais.fi/eaip/",
  },
  {
    country: "France",
    prefixes: ["LF"],
    webAipUrl: "https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_16_APR_2026/FRANCE/home.html",
  },
  {
    country: "Germany",
    prefixes: ["ED", "ET"],
    webAipUrl: "https://aip.dfs.de/BasicIFR/2026APR20/chapter/279afdc243b210751d2f9f2401e5e4db.html",
  },
  {
    country: "Georgia",
    prefixes: ["UG"],
    webAipUrl: "https://airnav.ge/eaip/history-en-GB.html",
  },
  {
    country: "Greece",
    prefixes: ["LG"],
    webAipUrl: "https://aisgr.hasp.gov.gr/main.php?rand=0.7276487307378027#publications",
  },
  {
    country: "Guatemala",
    prefixes: ["MG"],
    webAipUrl: "https://www.dgac.gob.gt/home/aip_e/",
  },
  {
    country: "Hungary",
    prefixes: ["LH"],
    webAipUrl: "https://ais-en.hungarocontrol.hu/aip/aip-archive/",
  },
  {
    country: "Iceland",
    prefixes: ["BI"],
    webAipUrl: "https://eaip.isavia.is/",
  },
  {
    country: "Honduras",
    prefixes: ["MH"],
    webAipUrl: "https://www.ahac.gob.hn/eAIP1/inicio.html",
  },
  {
    country: "Hong Kong",
    aliases: ["Hongkong"],
    prefixes: ["VH", "VM"],
    webAipUrl: "https://www.ais.gov.hk/eaip_20260319/VH-history-en-US.html",
  },
  {
    country: "India",
    prefixes: ["VA", "VE", "VI", "VO"],
    webAipUrl: "https://aim-india.aai.aero/aip-supplements?page=1",
  },
  {
    country: "Israel",
    prefixes: ["LL"],
    webAipUrl: "https://e-aip.azurefd.net",
  },
  {
    country: "Ireland",
    prefixes: ["EI"],
    webAipUrl: "https://www.airnav.ie/air-traffic-management/aeronautical-information-management/aip-package",
  },
  {
    country: "South Korea",
    aliases: ["Korea", "Republic of Korea"],
    prefixes: ["RK"],
    webAipUrl: "https://aim.koca.go.kr/eaipPub/Package/history-en-GB.html",
  },
  {
    country: "Kosovo",
    prefixes: ["BK"],
    webAipUrl: "https://www.ashna-ks.org/eAIP/default.html",
  },
  {
    country: "Kazakhstan",
    prefixes: ["UA"],
    webAipUrl: "https://www.ans.kz/en/ais/eaip",
  },
  {
    country: "Latvia",
    prefixes: ["EV"],
    webAipUrl: "https://ais.lgs.lv/aiseaip",
  },
  {
    country: "Lithuania",
    prefixes: ["EY"],
    webAipUrl: "https://www.ans.lt/a1/aip/02_16Apr2026/EY-history-en-US.html",
  },
  {
    country: "Kuwait",
    prefixes: ["OK"],
    webAipUrl: "https://dgca.gov.kw/AIP",
  },
  {
    country: "Libya",
    prefixes: ["HL"],
    webAipUrl: "https://caa.gov.ly/ais/ad/",
  },
  {
    country: "Malaysia",
    prefixes: ["WM", "WB"],
    excludedIcaos: ["WBSB"],
    webAipUrl: "https://aip.caam.gov.my/aip/eAIP/history-en-MS.html",
  },
  {
    country: "Maldives",
    prefixes: ["VR"],
    webAipUrl: "https://www.macl.aero/corporate/services/operational/ans/aip",
  },
  {
    country: "Mongolia",
    prefixes: ["ZM"],
    webAipUrl: "https://ais.mn/files/aip/eAIP/",
  },
  {
    country: "Myanmar",
    prefixes: ["VY"],
    webAipUrl: "https://www.ais.gov.mm/eAIP/2018-02-15/html/index-en-GB.html",
  },
  {
    country: "Nepal",
    prefixes: ["VN"],
    webAipUrl: "https://e-aip.caanepal.gov.np/welcome/listall/1",
  },
  {
    country: "North Macedonia",
    aliases: ["Republic of North Macedonia", "Macedonia"],
    prefixes: ["LW"],
    webAipUrl: "https://ais.m-nav.info/eAIP/Start.htm",
  },
  {
    country: "Netherlands",
    prefixes: ["EH"],
    webAipUrl: "https://eaip.lvnl.nl/web/eaip/default.html",
  },
  {
    country: "Norway",
    prefixes: ["EN"],
    webAipUrl: "https://aim-prod.avinor.no/no/AIP/View/Index/152/history-no-NO.html",
  },
  {
    country: "Pakistan",
    prefixes: ["OP"],
    webAipUrl: "https://paa.gov.pk/aeronautical-information/electronic-aeronautical-information-publication",
  },
  {
    country: "Panama",
    prefixes: ["MP"],
    webAipUrl: "https://www.aeronautica.gob.pa/ais-aip/",
  },
  {
    country: "Poland",
    prefixes: ["EP"],
    webAipUrl: "https://www.ais.pansa.pl/en/publications/aip-poland/",
  },
  {
    country: "Portugal",
    prefixes: ["LP"],
    webAipUrl: "https://aim.nav.pt/Html/IndexAeronauticalInformation",
  },
  {
    country: "Qatar",
    prefixes: ["OT"],
    webAipUrl: "https://www.caa.gov.qa/en/aeronautical-information-management",
  },
  {
    country: "Romania",
    prefixes: ["LR"],
    webAipUrl: "https://www.aisro.ro/",
  },
  {
    country: "Rwanda",
    prefixes: ["HR"],
    webAipUrl: "https://aim.asecna.aero/html/eAIP/FR-menu-fr-FR.html",
  },
  {
    country: "Saudi Arabia",
    prefixes: ["OE"],
    webAipUrl: "https://aimss.sans.com.sa/assets/FileManagerFiles/e65727c9-8414-49dc-9c6a-0b30c956ed33.html",
  },
  {
    country: "Somalia",
    prefixes: ["HC"],
    webAipUrl: "https://aip.scaa.gov.so/history-en-GB.html",
  },
  {
    country: "Slovakia",
    prefixes: ["LZ"],
    webAipUrl: "https://aim.lps.sk/web/index.php?fn=200&lng=en",
  },
  {
    country: "Slovenia",
    prefixes: ["LJ"],
    webAipUrl: "https://aim.sloveniacontrol.si/aim/products/aip/",
  },
  {
    country: "Spain",
    prefixes: ["LE"],
    webAipUrl: "https://aip.enaire.es/AIP/AIP-en.html",
  },
  {
    country: "Sri Lanka",
    prefixes: ["VC"],
    webAipUrl: "https://www.aimibsrilanka.lk/eaip/current/index.html",
  },
  {
    country: "Sweden",
    prefixes: ["ES"],
    webAipUrl: "https://aro.lfv.se/content/eaip/default_offline.html",
  },
  {
    country: "Taiwan",
    prefixes: ["RC"],
    webAipUrl: "https://ais.caa.gov.tw/eaip/",
  },
  {
    country: "Tajikistan",
    prefixes: [],
    extraIcaos: ["UTDD", "UTDK", "UTDL", "UTDT"],
    webAipUrl: "http://www.caica.ru/aiptjk/?lang=en",
  },
  {
    country: "Thailand",
    prefixes: ["VT"],
    webAipUrl: "https://aip.caat.or.th/",
  },
  {
    country: "Turkmenistan",
    prefixes: [],
    extraIcaos: ["UTAA", "UTAE", "UTAK", "UTAM", "UTAN", "UTAT", "UTAV"],
    webAipUrl: "http://www.caica.ru/aiptkm/?lang=en",
  },
  {
    country: "United Arab Emirates",
    aliases: ["UAE"],
    prefixes: ["OM"],
    webAipUrl: "https://www.gcaa.gov.ae/en/ais/AIPHtmlFiles/AIP/Current/AIP.aspx",
  },
  {
    country: "United Kingdom",
    aliases: ["UK", "Great Britain"],
    prefixes: ["EG"],
    webAipUrl: "https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/AIP/",
  },
  {
    country: "Uzbekistan",
    prefixes: ["UZ"],
    webAipUrl: "https://uzaeronavigation.com/ais/#",
  },
  {
    country: "Venezuela",
    prefixes: ["SV"],
    webAipUrl: "https://www.inac.gob.ve/eaip/history-en-GB.html",
  },
  {
    country: "Japan",
    prefixes: ["RJ", "RO"],
    webAipUrl: "https://nagodede.github.io/aip/japan/",
  },
];

function normalizeCountry(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .replace(/[./_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function getScraperCountryByIcao(icao: string): ScraperCountryConfig | null {
  const up = String(icao || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(up)) return null;
  for (const cfg of SCRAPER_COUNTRIES) {
    if ((cfg.extraIcaos || []).includes(up) && !(cfg.excludedIcaos || []).includes(up)) return cfg;
  }
  const prefix = up.slice(0, 2);
  return SCRAPER_COUNTRIES.find((cfg) => cfg.prefixes.includes(prefix) && !(cfg.excludedIcaos || []).includes(up)) || null;
}

export function isScraperCountryName(country: string): boolean {
  const target = normalizeCountry(country);
  if (!target) return false;
  return SCRAPER_COUNTRIES.some((cfg) => {
    const names = [cfg.country, ...(cfg.aliases || [])].map(normalizeCountry);
    return names.includes(target);
  });
}

export function getScraperWebAipUrlByCountryOrIcao(country: string | null | undefined, icao: string | null | undefined): string | null {
  const byIcao = icao ? getScraperCountryByIcao(icao) : null;
  if (byIcao?.webAipUrl) return byIcao.webAipUrl;
  const target = normalizeCountry(String(country || ""));
  if (!target) return null;
  const byCountry = SCRAPER_COUNTRIES.find((cfg) => {
    const names = [cfg.country, ...(cfg.aliases || [])].map(normalizeCountry);
    return names.includes(target);
  });
  return byCountry?.webAipUrl || null;
}
